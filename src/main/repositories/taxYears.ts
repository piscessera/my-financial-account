/**
 * `tax_years` repository (AT-2.1: `create`/`list`/`get`/`setExpenseMethod`; AT-4.3:
 * `close`/`reopen`, once `calc.computeYear()` existed to freeze a result — see PLAN-0001's
 * re-plan log / ANA-0001 §Close/reopen ordering).
 *
 * `setStatusForTest` (AT-2.1) still exists alongside the real `close`/`reopen`: it's what P2's
 * tests use to exercise closed-year immutability (INV-2b) without needing a full
 * `CloseTaxYearInput` (transactions/deductions/settings data) just to flip a status bit for a
 * test fixture. It deliberately skips `frozen_result_json` and is not audit-logged as
 * `close`/`reopen` — production code should never call it.
 *
 * A `tax_years` row is "the record-keeping bucket for a year" (ANA-0001 §Tax-year
 * lifecycle) — multiple rows can be `open` simultaneously (AC-7c / TC-0001 #22); there is no
 * "current year" singleton anywhere in the schema.
 *
 * Follows `auditLog.ts`'s conventions: raw `better-sqlite3` connection (money/ledger-affecting
 * repositories use explicit SQL per CLAUDE.md §Project), prepared statements cached per
 * connection, `recordMutation` called from inside the same transaction as the row write so a
 * mutation and its audit row commit or roll back together (INV-4).
 */
import type BetterSqlite3 from 'better-sqlite3';

import { computeYear, type ComputeYearResult } from '../calc/computeYear';
import type {
  DeductionCategoryRow,
  DeductionEntryRow,
  ExpenseMethod,
  SharedCapRow,
  TaxBracketRow,
  TaxYearRow,
  TaxYearStatus,
  TransactionRow,
} from '../db/schema';
import { recordMutation } from './auditLog';

/** Thrown when a caller hands this repository invalid input. */
export class TaxYearError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxYearError';
  }
}

export interface CreateTaxYearInput {
  readonly year: number;
}

export interface SetExpenseMethodInput {
  readonly id: number;
  readonly expenseMethod: ExpenseMethod;
  /** Required and in `[0, 10000]` basis points when `expenseMethod` is `lump_sum`; must be omitted/null otherwise — mirrors the `tax_years_lump_sum_rate_requires_method` CHECK. */
  readonly lumpSumRateBp?: number | null;
}

interface Statements {
  readonly insert: BetterSqlite3.Statement;
  readonly selectById: BetterSqlite3.Statement;
  readonly selectByYear: BetterSqlite3.Statement;
  readonly selectAll: BetterSqlite3.Statement;
  readonly updateExpenseMethod: BetterSqlite3.Statement;
  readonly updateStatusForTest: BetterSqlite3.Statement;
  readonly updateClose: BetterSqlite3.Statement;
  readonly updateReopen: BetterSqlite3.Statement;
}

const statementCache = new WeakMap<BetterSqlite3.Database, Statements>();

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    insert: sqlite.prepare(`INSERT INTO tax_years (year, status) VALUES (?, 'open')`),
    selectById: sqlite.prepare(`SELECT * FROM tax_years WHERE id = ?`),
    selectByYear: sqlite.prepare(`SELECT * FROM tax_years WHERE year = ?`),
    selectAll: sqlite.prepare(`SELECT * FROM tax_years ORDER BY year ASC`),
    updateExpenseMethod: sqlite.prepare(
      `UPDATE tax_years
       SET expense_method = ?, lump_sum_rate_bp = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ),
    updateStatusForTest: sqlite.prepare(
      `UPDATE tax_years
       SET status = ?,
           closed_at = CASE WHEN ? = 'closed' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ),
    updateClose: sqlite.prepare(
      `UPDATE tax_years
       SET status = 'closed', closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           frozen_result_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ),
    updateReopen: sqlite.prepare(
      `UPDATE tax_years
       SET status = 'open', closed_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ),
  };
  statementCache.set(sqlite, statements);
  return statements;
}

interface RawTaxYearRow {
  id: number;
  year: number;
  status: TaxYearStatus;
  expense_method: ExpenseMethod | null;
  lump_sum_rate_bp: number | null;
  closed_at: string | null;
  frozen_result_json: string | null;
  created_at: string;
  updated_at: string;
}

function toTaxYearRow(raw: unknown): TaxYearRow {
  const row = raw as RawTaxYearRow;
  return {
    id: row.id,
    year: row.year,
    status: row.status,
    expenseMethod: row.expense_method,
    lumpSumRateBp: row.lump_sum_rate_bp,
    closedAt: row.closed_at,
    frozenResultJson: row.frozen_result_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireRow(sqlite: BetterSqlite3.Database, id: number): TaxYearRow {
  const found = getTaxYear(sqlite, id);
  if (!found) throw new TaxYearError(`tax_years row ${id} not found.`);
  return found;
}

/** Create a new tax year, `open`, with no expense method set yet. */
export function createTaxYear(
  sqlite: BetterSqlite3.Database,
  input: CreateTaxYearInput,
): TaxYearRow {
  if (!Number.isSafeInteger(input.year)) {
    throw new TaxYearError(`tax_years.year must be an integer, got ${String(input.year)}.`);
  }
  const existing = statementsFor(sqlite).selectByYear.get(input.year);
  if (existing) {
    throw new TaxYearError(`A tax year for ${input.year} already exists.`);
  }

  const run = sqlite.transaction((year: number) => {
    const info = statementsFor(sqlite).insert.run(year);
    const row = toTaxYearRow(statementsFor(sqlite).selectById.get(Number(info.lastInsertRowid)));
    recordMutation(sqlite, {
      entityType: 'tax_year',
      entityId: row.id,
      action: 'create',
      after: row as unknown as Record<string, unknown>,
    });

    // 1. Clone baseline shared_caps
    const baselineSharedCaps = sqlite
      .prepare(`SELECT * FROM shared_caps WHERE tax_year_id IS NULL ORDER BY name ASC`)
      .all() as { id: number; name: string; cap_amount_minor: number }[];
    const sharedGroupMap = new Map<number, number>();
    const insertSharedCap = sqlite.prepare(
      `INSERT INTO shared_caps (tax_year_id, name, cap_amount_minor) VALUES (?, ?, ?)`,
    );
    for (const cap of baselineSharedCaps) {
      const res = insertSharedCap.run(row.id, cap.name, cap.cap_amount_minor);
      sharedGroupMap.set(cap.id, Number(res.lastInsertRowid));
    }

    // 2. Clone baseline deduction_categories
    const baselineCategories = sqlite
      .prepare(`SELECT * FROM deduction_categories WHERE tax_year_id IS NULL ORDER BY sort_order ASC`)
      .all() as {
      id: number;
      code: string;
      name: string;
      cap_type: string;
      cap_amount_minor: number | null;
      shared_group_id: number | null;
      sort_order: number;
      description: string;
      is_active: number;
      is_builtin: number;
    }[];
    const insertCategory = sqlite.prepare(
      `INSERT INTO deduction_categories (tax_year_id, code, name, cap_type, cap_amount_minor, shared_group_id, sort_order, description, is_active, is_builtin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const cat of baselineCategories) {
      const newGroupId =
        cat.shared_group_id != null ? (sharedGroupMap.get(cat.shared_group_id) ?? null) : null;
      insertCategory.run(
        row.id,
        cat.code,
        cat.name,
        cat.cap_type,
        cat.cap_amount_minor,
        newGroupId,
        cat.sort_order,
        cat.description,
        cat.is_active,
        cat.is_builtin,
      );
    }

    // 3. Clone baseline tax_brackets
    const baselineBrackets = sqlite
      .prepare(`SELECT * FROM tax_brackets WHERE tax_year_id IS NULL ORDER BY sort_order ASC`)
      .all() as {
      id: number;
      lower_bound_minor: number;
      upper_bound_minor: number | null;
      rate_bp: number;
      sort_order: number;
    }[];
    const insertBracket = sqlite.prepare(
      `INSERT INTO tax_brackets (tax_year_id, lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const b of baselineBrackets) {
      insertBracket.run(row.id, b.lower_bound_minor, b.upper_bound_minor, b.rate_bp, b.sort_order);
    }

    return row;
  });
  return run(input.year);
}

/** All tax years, ascending by calendar year. Multiple rows may be `open` at once (AC-7c). */
export function listTaxYears(sqlite: BetterSqlite3.Database): TaxYearRow[] {
  return statementsFor(sqlite).selectAll.all().map(toTaxYearRow);
}

/** One tax year by id, or `undefined` if it doesn't exist. */
export function getTaxYear(sqlite: BetterSqlite3.Database, id: number): TaxYearRow | undefined {
  const raw = statementsFor(sqlite).selectById.get(id);
  return raw === undefined ? undefined : toTaxYearRow(raw);
}

/**
 * Set (or clear) a tax year's expense method for 40(5)-(8) income (ANA-0001 §Data model).
 * `lump_sum` requires a `lumpSumRateBp` in `[0, 10000]`; `actual` requires it be omitted —
 * validated here so the caller gets a `TaxYearError`, not an opaque SQLite CHECK failure.
 * Audit-logged as an `update` (INV-4): this changes a live entity's state, unlike `create`.
 */
export function setExpenseMethod(
  sqlite: BetterSqlite3.Database,
  input: SetExpenseMethodInput,
): TaxYearRow {
  const { id, expenseMethod, lumpSumRateBp = null } = input;

  if (expenseMethod === 'lump_sum') {
    if (lumpSumRateBp === null || lumpSumRateBp === undefined) {
      throw new TaxYearError('lumpSumRateBp is required when expenseMethod is "lump_sum".');
    }
    if (!Number.isSafeInteger(lumpSumRateBp) || lumpSumRateBp < 0 || lumpSumRateBp > 10000) {
      throw new TaxYearError(
        `lumpSumRateBp must be an integer in [0, 10000] basis points, got ${String(lumpSumRateBp)}.`,
      );
    }
  } else if (lumpSumRateBp !== null && lumpSumRateBp !== undefined) {
    throw new TaxYearError('lumpSumRateBp must be omitted when expenseMethod is "actual".');
  }

  const run = sqlite.transaction(() => {
    const before = requireRow(sqlite, id);
    statementsFor(sqlite).updateExpenseMethod.run(expenseMethod, lumpSumRateBp, id);
    const after = requireRow(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'tax_year',
      entityId: id,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

/**
 * Test-only: force a tax year's `status` (and matching `closed_at`) without going through the
 * real close/reopen flow (AT-4.3, which needs `calc.computeYear()` to populate
 * `frozen_result_json`). Not audit-logged as `close`/`reopen` — those actions belong to the
 * real lifecycle methods once they exist. Exists so P2's closed-year immutability tests
 * (INV-2b) don't have to wait on P4.
 */
export function setStatusForTest(
  sqlite: BetterSqlite3.Database,
  id: number,
  status: TaxYearStatus,
): TaxYearRow {
  statementsFor(sqlite).updateStatusForTest.run(status, status, id);
  return requireRow(sqlite, id);
}

/** Everything `close()` needs beyond the `sqlite` connection and `id` — gathered by the caller
 *  (the IPC handler, AT-4.5) from the other repositories, not by this module. Keeping
 *  `taxYears.ts` free of imports from `transactions.ts`/`deductions.ts`/`settings.ts` avoids a
 *  circular dependency (`transactions.ts` already imports `getTaxYear` from here for its own
 *  closed-year checks). */
export interface CloseTaxYearInput {
  readonly transactions: readonly TransactionRow[];
  readonly deductionCategories: readonly DeductionCategoryRow[];
  readonly deductionEntries: readonly DeductionEntryRow[];
  readonly sharedCaps: readonly SharedCapRow[];
  readonly brackets: readonly TaxBracketRow[];
}

export interface CloseTaxYearResult {
  readonly taxYear: TaxYearRow;
  readonly frozenResult: ComputeYearResult;
}

/**
 * Close a tax year (AC-7b, TC-0001 #20): computes the full result via `calc.computeYear()`
 * (AT-4.2, pure — no hidden state, so a later recompute against the same stored rows always
 * reproduces this exact result, INV-3) and freezes it as `frozen_result_json`. From here on,
 * `transactions.updateTransaction`/`taxYears.setExpenseMethod`, etc. against this year are
 * rejected (INV-2b) and its read path serves this snapshot, not a live recompute (INV-7,
 * AT-4.4). Audit-logs as `close` (INV-4).
 */
export function close(
  sqlite: BetterSqlite3.Database,
  id: number,
  input: CloseTaxYearInput,
): CloseTaxYearResult {
  const run = sqlite.transaction(() => {
    const before = requireRow(sqlite, id);
    if (before.status === 'closed') {
      throw new TaxYearError(`tax_years row ${id} is already closed.`);
    }

    const frozenResult = computeYear({
      taxYear: before,
      transactions: input.transactions,
      deductionCategories: input.deductionCategories,
      deductionEntries: input.deductionEntries,
      sharedCaps: input.sharedCaps,
      brackets: input.brackets,
    });

    statementsFor(sqlite).updateClose.run(JSON.stringify(frozenResult), id);
    const after = requireRow(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'tax_year',
      entityId: id,
      action: 'close',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return { taxYear: after, frozenResult };
  });
  return run();
}

/**
 * Reopen a closed tax year (ANA-0001 §Tax-year lifecycle): clears `closed_at` and flips
 * `status` back to `open`; **keeps** `frozen_result_json` as-is until the year is closed again
 * (so a reopen-without-re-close doesn't leave the row with no snapshot at all). Audit-logs as
 * `reopen` (INV-4).
 */
/**
 * The read path every screen (Dashboard, Summary) should call instead of `calc.computeYear()`
 * directly (AT-4.4, INV-7, TC-0001 #27): a **closed** year always serves its
 * `frozen_result_json` snapshot, verbatim, no matter what `liveInputs` says — a deduction cap
 * or bracket rate edited in Settings *after* close must never change what a closed year
 * displays. An **open** year has no snapshot yet, so this computes it live from `liveInputs`.
 */
export function getYearResult(
  taxYear: TaxYearRow,
  liveInputs: CloseTaxYearInput,
): ComputeYearResult {
  if (taxYear.status === 'closed') {
    if (taxYear.frozenResultJson === null) {
      throw new TaxYearError(
        `tax_years row ${taxYear.id} is closed but has no frozen_result_json.`,
      );
    }
    return JSON.parse(taxYear.frozenResultJson) as ComputeYearResult;
  }
  return computeYear({
    taxYear,
    transactions: liveInputs.transactions,
    deductionCategories: liveInputs.deductionCategories,
    deductionEntries: liveInputs.deductionEntries,
    sharedCaps: liveInputs.sharedCaps,
    brackets: liveInputs.brackets,
  });
}

export function reopen(sqlite: BetterSqlite3.Database, id: number): TaxYearRow {
  const run = sqlite.transaction(() => {
    const before = requireRow(sqlite, id);
    if (before.status === 'open') {
      throw new TaxYearError(`tax_years row ${id} is already open.`);
    }
    statementsFor(sqlite).updateReopen.run(id);
    const after = requireRow(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'tax_year',
      entityId: id,
      action: 'reopen',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}
