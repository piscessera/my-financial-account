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

import type { CapType, DeductionCategoryRow, DeductionEntryRow } from '../db/schema';
import { recordMutation } from './auditLog';

export class DeductionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeductionError';
  }
}

export interface CreateCategoryInput {
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

function assertCreateInput(input: CreateCategoryInput): void {
  if (input.code.trim().length === 0) throw new DeductionError('code is required.');
  if (input.name.trim().length === 0) throw new DeductionError('name is required.');

  if (input.capType === 'shared_group_member') {
    if (input.sharedGroupId == null) {
      throw new DeductionError('sharedGroupId is required when capType is "shared_group_member".');
    }
  } else {
    if (input.sharedGroupId != null) {
      throw new DeductionError('sharedGroupId must be omitted unless capType is "shared_group_member".');
    }
    if (input.capAmountMinor == null) {
      throw new DeductionError(`capAmountMinor is required when capType is "${input.capType}".`);
    }
  }
  if (input.capAmountMinor != null && (!Number.isSafeInteger(input.capAmountMinor) || input.capAmountMinor < 0)) {
    throw new DeductionError(`capAmountMinor must be a non-negative integer, got ${String(input.capAmountMinor)}.`);
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
  'code, name, cap_type, cap_amount_minor, shared_group_id, sort_order, description, is_builtin';

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    insertCategory: sqlite.prepare(
      `INSERT INTO deduction_categories (${CATEGORY_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    selectCategoryById: sqlite.prepare(`SELECT * FROM deduction_categories WHERE id = ?`),
    selectAllCategories: sqlite.prepare(`SELECT * FROM deduction_categories ORDER BY sort_order ASC, id ASC`),
    updateCategoryFields: sqlite.prepare(
      `UPDATE deduction_categories SET name = ?, cap_amount_minor = ? WHERE id = ?`,
    ),
    updateCategoryActive: sqlite.prepare(`UPDATE deduction_categories SET is_active = ? WHERE id = ?`),
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
 * Create a new deduction category (AC-16) — how a one-off government measure gets added
 * without a code change. Audit-logs as `create` (INV-4).
 */
export function createCategory(
  sqlite: BetterSqlite3.Database,
  input: CreateCategoryInput,
): DeductionCategoryRow {
  assertCreateInput(input);

  const run = sqlite.transaction(() => {
    const info = statementsFor(sqlite).insertCategory.run(
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

/** Every category, including archived ones — callers filter `isActive` for the "add" picker (AC-17). */
export function listCategories(sqlite: BetterSqlite3.Database): DeductionCategoryRow[] {
  return statementsFor(sqlite)
    .selectAllCategories.all()
    .map(toCategoryRow);
}

export function getCategory(sqlite: BetterSqlite3.Database, id: number): DeductionCategoryRow | undefined {
  const raw = statementsFor(sqlite).selectCategoryById.get(id);
  return raw === undefined ? undefined : toCategoryRow(raw);
}

/**
 * Archive (`isActive: false`) or reactivate (`true`) a category (AC-17). Archiving only
 * affects discoverability for *new* entries — existing `deduction_entries` rows referencing
 * it are untouched (TC-0001 #38); reactivating restores it unchanged (TC-0001 #39).
 * Audit-logs as `update` (INV-4).
 */
export function setCategoryActive(
  sqlite: BetterSqlite3.Database,
  id: number,
  isActive: boolean,
): DeductionCategoryRow {
  const run = sqlite.transaction(() => {
    const before = requireCategory(sqlite, id);
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

/**
 * Rename a category and/or change its cap amount (AC-11, TC-0001 #40) — the cap and existing
 * entries otherwise unaffected; shown everywhere the category appears since there is only one
 * row. **Not** for a `shared_group_member`'s sub-cap change of shape (`capType`/
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
    const name = input.name !== undefined && input.name.trim().length > 0 ? input.name : before.name;
    const capAmountMinor = input.capAmountMinor !== undefined ? input.capAmountMinor : before.capAmountMinor;

    if (capAmountMinor != null && (!Number.isSafeInteger(capAmountMinor) || capAmountMinor < 0)) {
      throw new DeductionError(`capAmountMinor must be a non-negative integer, got ${String(capAmountMinor)}.`);
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
    throw new DeductionError(`amountMinor must be a non-negative integer, got ${String(input.amountMinor)}.`);
  }
  if (input.count != null && (!Number.isSafeInteger(input.count) || input.count < 0)) {
    throw new DeductionError(`count must be a non-negative integer, got ${String(input.count)}.`);
  }

  const run = sqlite.transaction(() => {
    const beforeRaw = statementsFor(sqlite).selectEntry.get(input.taxYearId, input.categoryId);
    const before = beforeRaw === undefined ? null : toEntryRow(beforeRaw);
    statementsFor(sqlite).upsertEntry.run(input.taxYearId, input.categoryId, input.amountMinor, input.count ?? null);
    const after = toEntryRow(statementsFor(sqlite).selectEntry.get(input.taxYearId, input.categoryId));
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
export function listEntries(sqlite: BetterSqlite3.Database, taxYearId: number): DeductionEntryRow[] {
  return statementsFor(sqlite)
    .selectEntriesByYear.all(taxYearId)
    .map(toEntryRow);
}
