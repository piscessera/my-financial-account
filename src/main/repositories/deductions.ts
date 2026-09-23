/**
 * `deduction_categories` + `deduction_entries` repository (AT-3.1).
 *
 * `deduction_categories.cap_type` is one of three shapes (ANA-0001 §Deduction cap shapes,
 * INV-6): `fixed` (cap_amount_minor is the ceiling), `per_count` (cap_amount_minor is the
 * *per-unit* ceiling, multiplied by the entry's `count`), `shared_group_member` (belongs to a
 * `shared_caps` group; its own `cap_amount_minor` is an *optional* sub-cap on top of the
 * group total — this repository doesn't apply any of these caps, it only stores the shape;
 * the cap-shape calculator (AT-3.2) reads them at calc time).
 *
 * Follows `taxYears.ts`/`transactions.ts`'s conventions: raw connection, cached prepared
 * statements, caller-owned `sqlite.transaction()` wrapping the row write + `recordMutation`
 * (INV-4). `setCategoryActive`/`updateCategory`/`createCategory` are all in AT-3.1's scope
 * (per PLAN-0001); `shared_caps`/`tax_brackets` are `settings.ts`'s job.
 */
import type BetterSqlite3 from 'better-sqlite3';

import type {
  CapType,
  DeductionCategoryRow,
  DeductionEntryRow,
  TransactionRow,
} from '../db/schema';
import { computeDeductions } from '../calc/deductions';
import { recordMutation } from './auditLog';

export class DeductionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeductionError';
  }
}

export interface CreateCategoryInput {
  readonly taxYearId?: number | null;
  readonly code: string;
  readonly name: string;
  readonly capType: CapType;
  /** Required for `fixed`/`per_count`; optional sub-cap for `shared_group_member`. */
  readonly capAmountMinor?: number | null;
  /** Required iff `capType === 'shared_group_member'`; must be omitted otherwise. */
  readonly sharedGroupId?: number | null;
  readonly sortOrder?: number;
  readonly description?: string;
  /** Built-in (seeded) vs. user-added (AC-16). Defaults to `false`. */
  readonly isBuiltin?: boolean;
}

export interface UpdateCategoryInput {
  readonly name?: string;
  /** Ignored (never sent to the DB) for `shared_group_member` sub-caps — see note below. */
  readonly capAmountMinor?: number | null;
}

function assertYearNotClosed(sqlite: BetterSqlite3.Database, taxYearId: number | null | undefined): void {
  if (taxYearId === null || taxYearId === undefined) return;
  const yearRow = sqlite.prepare(`SELECT closed_at FROM tax_years WHERE id = ?`).get(taxYearId) as
    | { closed_at: string | null }
    | undefined;
  if (yearRow && yearRow.closed_at !== null) {
    throw new DeductionError('Cannot edit categories for a closed tax year (INV-7).');
  }
}

function assertCreateInput(input: CreateCategoryInput): void {
  if (input.code.trim().length === 0) throw new DeductionError('code is required.');
  if (input.name.trim().length === 0) throw new DeductionError('name is required.');

  if (input.capType === 'shared_group_member') {
    if (input.sharedGroupId == null) {
      throw new DeductionError('sharedGroupId is required when capType is "shared_group_member".');
    }
  } else {
    if (input.sharedGroupId != null) {
      throw new DeductionError(
        'sharedGroupId must be omitted unless capType is "shared_group_member".',
      );
    }
    if (input.capAmountMinor == null) {
      throw new DeductionError(`capAmountMinor is required when capType is "${input.capType}".`);
    }
  }
  if (
    input.capAmountMinor != null &&
    (!Number.isSafeInteger(input.capAmountMinor) || input.capAmountMinor < 0)
  ) {
    throw new DeductionError(
      `capAmountMinor must be a non-negative integer, got ${String(input.capAmountMinor)}.`,
    );
  }
}

interface Statements {
  readonly insertCategory: BetterSqlite3.Statement;
  readonly selectCategoryById: BetterSqlite3.Statement;
  readonly selectAllCategories: BetterSqlite3.Statement;
  readonly updateCategoryFields: BetterSqlite3.Statement;
  readonly updateCategoryActive: BetterSqlite3.Statement;
  readonly upsertEntry: BetterSqlite3.Statement;
  readonly selectEntry: BetterSqlite3.Statement;
  readonly selectEntriesByYear: BetterSqlite3.Statement;
}

const statementCache = new WeakMap<BetterSqlite3.Database, Statements>();

const CATEGORY_COLUMNS =
  'tax_year_id, code, name, cap_type, cap_amount_minor, shared_group_id, sort_order, description, is_builtin';

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    insertCategory: sqlite.prepare(
      `INSERT INTO deduction_categories (${CATEGORY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    selectCategoryById: sqlite.prepare(`SELECT * FROM deduction_categories WHERE id = ?`),
    selectAllCategories: sqlite.prepare(
      `SELECT * FROM deduction_categories ORDER BY sort_order ASC, id ASC`,
    ),
    updateCategoryFields: sqlite.prepare(
      `UPDATE deduction_categories SET name = ?, cap_amount_minor = ? WHERE id = ?`,
    ),
    updateCategoryActive: sqlite.prepare(
      `UPDATE deduction_categories SET is_active = ? WHERE id = ?`,
    ),
    upsertEntry: sqlite.prepare(
      `INSERT INTO deduction_entries (tax_year_id, category_id, amount_minor, count)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tax_year_id, category_id)
       DO UPDATE SET amount_minor = excluded.amount_minor, count = excluded.count,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ),
    selectEntry: sqlite.prepare(
      `SELECT * FROM deduction_entries WHERE tax_year_id = ? AND category_id = ?`,
    ),
    selectEntriesByYear: sqlite.prepare(`SELECT * FROM deduction_entries WHERE tax_year_id = ?`),
  };
  statementCache.set(sqlite, statements);
  return statements;
}

interface RawCategoryRow {
  id: number;
  tax_year_id: number | null;
  code: string;
  name: string;
  cap_type: CapType;
  cap_amount_minor: number | null;
  shared_group_id: number | null;
  sort_order: number;
  description: string;
  is_active: number;
  is_builtin: number;
}

function toCategoryRow(raw: unknown): DeductionCategoryRow {
  const row = raw as RawCategoryRow;
  return {
    id: row.id,
    taxYearId: row.tax_year_id,
    code: row.code,
    name: row.name,
    capType: row.cap_type,
    capAmountMinor: row.cap_amount_minor,
    sharedGroupId: row.shared_group_id,
    sortOrder: row.sort_order,
    description: row.description,
    isActive: row.is_active === 1,
    isBuiltin: row.is_builtin === 1,
  };
}

function requireCategory(sqlite: BetterSqlite3.Database, id: number): DeductionCategoryRow {
  const raw = statementsFor(sqlite).selectCategoryById.get(id);
  if (raw === undefined) throw new DeductionError(`deduction_categories row ${id} not found.`);
  return toCategoryRow(raw);
}

/**
 * Create a new deduction category (AC-16).
 */
export function createCategory(
  sqlite: BetterSqlite3.Database,
  input: CreateCategoryInput,
): DeductionCategoryRow {
  assertCreateInput(input);
  assertYearNotClosed(sqlite, input.taxYearId);

  const run = sqlite.transaction(() => {
    const info = sqlite
      .prepare(
        `INSERT INTO deduction_categories (tax_year_id, code, name, cap_type, cap_amount_minor, shared_group_id, sort_order, description, is_builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.taxYearId ?? null,
        input.code,
        input.name,
        input.capType,
        input.capAmountMinor ?? null,
        input.sharedGroupId ?? null,
        input.sortOrder ?? 0,
        input.description ?? '',
        input.isBuiltin ? 1 : 0,
      );
    const row = requireCategory(sqlite, Number(info.lastInsertRowid));
    recordMutation(sqlite, {
      entityType: 'deduction_category',
      entityId: row.id,
      action: 'create',
      after: row as unknown as Record<string, unknown>,
    });
    return row;
  });
  return run();
}

/** Every category for a specific tax year, or baseline defaults if omitted/null. */
export function listCategories(
  sqlite: BetterSqlite3.Database,
  taxYearId?: number | null,
): DeductionCategoryRow[] {
  if (typeof taxYearId === 'number') {
    const yearCategories = sqlite
      .prepare(
        `SELECT * FROM deduction_categories WHERE tax_year_id = ? ORDER BY sort_order ASC, id ASC`,
      )
      .all(taxYearId)
      .map(toCategoryRow);
    if (yearCategories.length > 0) return yearCategories;
  }
  return sqlite
    .prepare(
      `SELECT * FROM deduction_categories WHERE tax_year_id IS NULL ORDER BY sort_order ASC, id ASC`,
    )
    .all()
    .map(toCategoryRow);
}

export function getCategory(
  sqlite: BetterSqlite3.Database,
  id: number,
): DeductionCategoryRow | undefined {
  const raw = sqlite.prepare(`SELECT * FROM deduction_categories WHERE id = ?`).get(id);
  return raw === undefined ? undefined : toCategoryRow(raw);
}

/**
 * `sharedGroupId` never change here — that would be a different category, not an edit) — its
 * `capAmountMinor` sub-cap *can* still be adjusted through this same field. Audit-logs as
 * `update` (INV-4).
 */
export function updateCategory(
  sqlite: BetterSqlite3.Database,
  id: number,
  input: UpdateCategoryInput,
): DeductionCategoryRow {
  const run = sqlite.transaction(() => {
    const before = requireCategory(sqlite, id);
    assertYearNotClosed(sqlite, before.taxYearId);

    const name =
      input.name !== undefined && input.name.trim().length > 0 ? input.name : before.name;
    const capAmountMinor =
      input.capAmountMinor !== undefined ? input.capAmountMinor : before.capAmountMinor;

    if (capAmountMinor != null && (!Number.isSafeInteger(capAmountMinor) || capAmountMinor < 0)) {
      throw new DeductionError(
        `capAmountMinor must be a non-negative integer, got ${String(capAmountMinor)}.`,
      );
    }
    if (before.capType !== 'shared_group_member' && capAmountMinor == null) {
      throw new DeductionError(`capAmountMinor is required for capType "${before.capType}".`);
    }

    statementsFor(sqlite).updateCategoryFields.run(name, capAmountMinor, id);
    const after = requireCategory(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'deduction_category',
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
 * Archive or reactivate a category (AC-17). An archived category stays in the database and in
 * existing entries, but doesn't appear in listCategories() (the new-entry picker). Audit-logs
 * as `update` (INV-4).
 */
export function setCategoryActive(
  sqlite: BetterSqlite3.Database,
  id: number,
  isActive: boolean,
): DeductionCategoryRow {
  const run = sqlite.transaction(() => {
    const before = requireCategory(sqlite, id);
    assertYearNotClosed(sqlite, before.taxYearId);

    statementsFor(sqlite).updateCategoryActive.run(isActive ? 1 : 0, id);
    const after = requireCategory(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'deduction_category',
      entityId: id,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

interface RawEntryRow {
  id: number;
  tax_year_id: number;
  category_id: number;
  amount_minor: number;
  count: number | null;
  updated_at: string;
}

function toEntryRow(raw: unknown): DeductionEntryRow {
  const row = raw as RawEntryRow;
  return {
    id: row.id,
    taxYearId: row.tax_year_id,
    categoryId: row.category_id,
    amountMinor: row.amount_minor,
    count: row.count,
    updatedAt: row.updated_at,
  };
}

export interface SetEntryInput {
  readonly taxYearId: number;
  readonly categoryId: number;
  readonly amountMinor: number;
  readonly count?: number | null;
}

/**
 * Create or replace a tax year's deduction entry for one category (one row per
 * `(tax_year_id, category_id)` pair — the schema's unique index enforces this, so "set" is an
 * upsert, not an append). Audit-logs as `update` (INV-4); the before side is `null` on first
 * creation, matching `recordMutation`'s create/update convention.
 */
export function setEntry(sqlite: BetterSqlite3.Database, input: SetEntryInput): DeductionEntryRow {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) {
    throw new DeductionError(
      `amountMinor must be a non-negative integer, got ${String(input.amountMinor)}.`,
    );
  }
  if (input.count != null && (!Number.isSafeInteger(input.count) || input.count < 0)) {
    throw new DeductionError(`count must be a non-negative integer, got ${String(input.count)}.`);
  }

  const run = sqlite.transaction(() => {
    const beforeRaw = statementsFor(sqlite).selectEntry.get(input.taxYearId, input.categoryId);
    const before = beforeRaw === undefined ? null : toEntryRow(beforeRaw);
    statementsFor(sqlite).upsertEntry.run(
      input.taxYearId,
      input.categoryId,
      input.amountMinor,
      input.count ?? null,
    );
    const after = toEntryRow(
      statementsFor(sqlite).selectEntry.get(input.taxYearId, input.categoryId),
    );
    recordMutation(sqlite, {
      entityType: 'deduction_entry',
      entityId: after.id,
      action: before === null ? 'create' : 'update',
      before: before as unknown as Record<string, unknown> | null,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

/** Every deduction entry for one tax year — the calc engine's (AT-4.2) raw input. */
export function listEntries(
  sqlite: BetterSqlite3.Database,
  taxYearId: number,
): DeductionEntryRow[] {
  return statementsFor(sqlite).selectEntriesByYear.all(taxYearId).map(toEntryRow);
}

/**
 * Retrieve active expense transactions contributing to a specific deduction category for a tax year (AT-1.3, TC #9).
 */
export function getSourceTransactions(
  sqlite: BetterSqlite3.Database,
  taxYearId: number,
  categoryId: number,
): TransactionRow[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM transactions
       WHERE tax_year_id = ? AND kind = 'expense' AND status = 'active' AND deduction_category_id = ?
       ORDER BY date DESC, id DESC`,
    )
    .all(taxYearId, categoryId);

  return rows.map((raw: any) => ({
    id: raw.id,
    taxYearId: raw.tax_year_id,
    kind: raw.kind,
    taxRelevant: raw.tax_relevant === 1,
    incomeSection: raw.income_section,
    generalCategory: raw.general_category,
    date: raw.date,
    amountMinor: raw.amount_minor,
    currency: raw.currency,
    whtMinor: raw.wht_minor,
    sourcePayer: raw.source_payer,
    payerTaxId: raw.payer_tax_id,
    note: raw.note,
    status: raw.status,
    reversalOfId: raw.reversal_of_id,
    source: raw.source,
    deductionCategoryId: raw.deduction_category_id,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }));
}

export interface CategorySummaryItem {
  readonly category: DeductionCategoryRow;
  readonly manualAmountMinor: number;
  readonly sourceExpenseMinor: number;
  readonly sourceExpenseCount: number;
  readonly totalGrossMinor: number;
  readonly effectiveMinor: number;
  readonly isOverCap: boolean;
  readonly overCapMinor: number;
  readonly count: number | null;
}

export interface DeductionSummaryResult {
  readonly taxYearId: number;
  readonly items: CategorySummaryItem[];
  readonly totalGrossMinor: number;
  readonly totalEffectiveMinor: number;
  readonly totalOverCapMinor: number;
}

/**
 * Retrieve comprehensive deduction summary with auto-aggregated expenses, manual entries, and cap calculations (AT-1.3, TC #8, #10, #11, #12).
 */
export function getDeductionSummary(
  sqlite: BetterSqlite3.Database,
  taxYearId: number,
): DeductionSummaryResult {
  const categories = listCategories(sqlite, taxYearId);
  const entries = listEntries(sqlite, taxYearId);

  // Fetch all active linked expenses for this year
  const linkedExpenseRows = sqlite
    .prepare(
      `SELECT deduction_category_id, COUNT(*) AS cnt, SUM(amount_minor) AS total_minor
       FROM transactions
       WHERE tax_year_id = ? AND kind = 'expense' AND status = 'active' AND deduction_category_id IS NOT NULL
       GROUP BY deduction_category_id`,
    )
    .all(taxYearId) as { deduction_category_id: number; cnt: number; total_minor: number }[];

  const linkedMap = new Map<number, { count: number; totalMinor: number }>();
  for (const row of linkedExpenseRows) {
    linkedMap.set(row.deduction_category_id, {
      count: row.cnt,
      totalMinor: row.total_minor,
    });
  }

  const entryMap = new Map<number, DeductionEntryRow>();
  for (const entry of entries) {
    entryMap.set(entry.categoryId, entry);
  }

  // Build merged entries for calculation
  const mergedEntries: DeductionEntryRow[] = [];
  for (const cat of categories) {
    const manualEntry = entryMap.get(cat.id);
    const linked = linkedMap.get(cat.id);
    const manualMinor = manualEntry?.amountMinor ?? 0;
    const linkedMinor = linked?.totalMinor ?? 0;
    const totalMinor = manualMinor + linkedMinor;

    if (totalMinor > 0 || manualEntry !== undefined) {
      mergedEntries.push({
        id: manualEntry?.id ?? 0,
        taxYearId,
        categoryId: cat.id,
        amountMinor: totalMinor,
        count: manualEntry?.count ?? null,
        updatedAt: manualEntry?.updatedAt ?? new Date().toISOString(),
      });
    }
  }

  // Query shared caps for this year
  const sharedCaps = sqlite
    .prepare(`SELECT * FROM shared_caps WHERE tax_year_id = ? OR tax_year_id IS NULL ORDER BY name ASC`)
    .all(taxYearId)
    .map((r: any) => ({
      id: r.id,
      taxYearId: r.tax_year_id,
      name: r.name,
      capAmountMinor: r.cap_amount_minor,
    }));

  const calcResult = computeDeductions(categories, mergedEntries, sharedCaps);
  const perCatCalc = new Map(calcResult.perCategory.map((p) => [p.categoryId, p]));

  const items: CategorySummaryItem[] = categories.map((cat) => {
    const manualEntry = entryMap.get(cat.id);
    const linked = linkedMap.get(cat.id);
    const manualAmountMinor = manualEntry?.amountMinor ?? 0;
    const sourceExpenseMinor = linked?.totalMinor ?? 0;
    const sourceExpenseCount = linked?.count ?? 0;
    const totalGrossMinor = manualAmountMinor + sourceExpenseMinor;

    const calc = perCatCalc.get(cat.id);
    const effectiveMinor = calc?.effectiveMinor ?? 0;
    const isOverCap = totalGrossMinor > effectiveMinor;
    const overCapMinor = isOverCap ? totalGrossMinor - effectiveMinor : 0;

    return {
      category: cat,
      manualAmountMinor,
      sourceExpenseMinor,
      sourceExpenseCount,
      totalGrossMinor,
      effectiveMinor,
      isOverCap,
      overCapMinor,
      count: manualEntry?.count ?? null,
    };
  });

  const totalGrossMinor = items.reduce((sum, item) => sum + item.totalGrossMinor, 0);
  const totalEffectiveMinor = calcResult.totalMinor;
  const totalOverCapMinor = items.reduce((sum, item) => sum + item.overCapMinor, 0);

  return {
    taxYearId,
    items,
    totalGrossMinor,
    totalEffectiveMinor,
    totalOverCapMinor,
  };
}

