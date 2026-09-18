/**
 * `tax_years` repository (AT-2.1).
 *
 * Scope for this task: `create`/`list`/`get`/`setExpenseMethod`, plus a test-only
 * `setStatusForTest` helper. Real `close()`/`reopen()` need `calc.computeYear()` to freeze
 * a result and land in P4 (AT-4.3) — see PLAN-0001's re-plan log / ANA-0001 §Close/reopen
 * ordering. `setStatusForTest` exists only so P2 tests can exercise closed-year immutability
 * (INV-2b) before the real close path exists; it deliberately skips `frozen_result_json` and
 * is not audit-logged as a `close`/`reopen` action.
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

import type { ExpenseMethod, TaxYearRow, TaxYearStatus } from '../db/schema';
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
}

const statementCache = new WeakMap<BetterSqlite3.Database, Statements>();

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    insert: sqlite.prepare(
      `INSERT INTO tax_years (year, status) VALUES (?, 'open')`,
    ),
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
export function createTaxYear(sqlite: BetterSqlite3.Database, input: CreateTaxYearInput): TaxYearRow {
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
    return row;
  });
  return run(input.year);
}

/** All tax years, ascending by calendar year. Multiple rows may be `open` at once (AC-7c). */
export function listTaxYears(sqlite: BetterSqlite3.Database): TaxYearRow[] {
  return statementsFor(sqlite)
    .selectAll.all()
    .map(toTaxYearRow);
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
export function setExpenseMethod(sqlite: BetterSqlite3.Database, input: SetExpenseMethodInput): TaxYearRow {
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
export function setStatusForTest(sqlite: BetterSqlite3.Database, id: number, status: TaxYearStatus): TaxYearRow {
  statementsFor(sqlite).updateStatusForTest.run(status, status, id);
  return requireRow(sqlite, id);
}
