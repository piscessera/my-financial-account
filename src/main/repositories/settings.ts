/**
 * `shared_caps` + `tax_brackets` repository (AT-3.1) — the other half of the Settings screen's
 * data (`deduction_categories`/`deduction_entries` are `deductions.ts`'s job).
 *
 * Both tables are small, statutory reference data: a `shared_caps` group's total ceiling, and
 * the progressive tax brackets (seeded by AT-1.5, currently an *empty* built-in set per
 * ANA-0001 decision 14 — real figures land later with no loader change). Neither table has a
 * `create`, matching ANA-0001 §API/backend changes' `settings` surface exactly: existing rows
 * are edited in place, not added to, through this UI.
 *
 * Follows the rest of `repositories/`'s conventions: raw connection, cached prepared
 * statements, caller-owned `sqlite.transaction()` + `recordMutation` (INV-4).
 */
import type BetterSqlite3 from 'better-sqlite3';

import type { SharedCapRow, TaxBracketRow } from '../db/schema';
import { recordMutation } from './auditLog';

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

interface Statements {
  readonly selectAllSharedCaps: BetterSqlite3.Statement;
  readonly selectSharedCapById: BetterSqlite3.Statement;
  readonly updateSharedCapAmount: BetterSqlite3.Statement;
  readonly selectAllBrackets: BetterSqlite3.Statement;
  readonly selectBracketById: BetterSqlite3.Statement;
  readonly updateBracketFields: BetterSqlite3.Statement;
}

const statementCache = new WeakMap<BetterSqlite3.Database, Statements>();

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    selectAllSharedCaps: sqlite.prepare(`SELECT * FROM shared_caps ORDER BY name ASC`),
    selectSharedCapById: sqlite.prepare(`SELECT * FROM shared_caps WHERE id = ?`),
    updateSharedCapAmount: sqlite.prepare(`UPDATE shared_caps SET cap_amount_minor = ? WHERE id = ?`),
    selectAllBrackets: sqlite.prepare(`SELECT * FROM tax_brackets ORDER BY sort_order ASC`),
    selectBracketById: sqlite.prepare(`SELECT * FROM tax_brackets WHERE id = ?`),
    updateBracketFields: sqlite.prepare(
      `UPDATE tax_brackets SET rate_bp = ?, lower_bound_minor = ?, upper_bound_minor = ? WHERE id = ?`,
    ),
  };
  statementCache.set(sqlite, statements);
  return statements;
}

interface RawSharedCapRow {
  id: number;
  name: string;
  cap_amount_minor: number;
}

function toSharedCapRow(raw: unknown): SharedCapRow {
  const row = raw as RawSharedCapRow;
  return { id: row.id, name: row.name, capAmountMinor: row.cap_amount_minor };
}

function requireSharedCap(sqlite: BetterSqlite3.Database, id: number): SharedCapRow {
  const raw = statementsFor(sqlite).selectSharedCapById.get(id);
  if (raw === undefined) throw new SettingsError(`shared_caps row ${id} not found.`);
  return toSharedCapRow(raw);
}

export function getSharedCaps(sqlite: BetterSqlite3.Database): SharedCapRow[] {
  return statementsFor(sqlite)
    .selectAllSharedCaps.all()
    .map(toSharedCapRow);
}

/** Edit a shared group's total ceiling (e.g. life + health insurance's combined 100,000 cap). */
export function updateSharedCap(
  sqlite: BetterSqlite3.Database,
  id: number,
  newCapAmountMinor: number,
): SharedCapRow {
  if (!Number.isSafeInteger(newCapAmountMinor) || newCapAmountMinor < 0) {
    throw new SettingsError(`newCapAmountMinor must be a non-negative integer, got ${String(newCapAmountMinor)}.`);
  }

  const run = sqlite.transaction(() => {
    const before = requireSharedCap(sqlite, id);
    statementsFor(sqlite).updateSharedCapAmount.run(newCapAmountMinor, id);
    const after = requireSharedCap(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'setting',
      entityId: id,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

interface RawTaxBracketRow {
  id: number;
  lower_bound_minor: number;
  upper_bound_minor: number | null;
  rate_bp: number;
  sort_order: number;
}

function toBracketRow(raw: unknown): TaxBracketRow {
  const row = raw as RawTaxBracketRow;
  return {
    id: row.id,
    lowerBoundMinor: row.lower_bound_minor,
    upperBoundMinor: row.upper_bound_minor,
    rateBp: row.rate_bp,
    sortOrder: row.sort_order,
  };
}

function requireBracket(sqlite: BetterSqlite3.Database, id: number): TaxBracketRow {
  const raw = statementsFor(sqlite).selectBracketById.get(id);
  if (raw === undefined) throw new SettingsError(`tax_brackets row ${id} not found.`);
  return toBracketRow(raw);
}

/** All tax brackets, ascending. Empty until real `TAX-2025` figures are seeded (ANA-0001 decision 14). */
export function getBrackets(sqlite: BetterSqlite3.Database): TaxBracketRow[] {
  return statementsFor(sqlite)
    .selectAllBrackets.all()
    .map(toBracketRow);
}

export interface UpdateBracketBounds {
  readonly lowerBoundMinor?: number;
  /** `null` marks the open-ended top bracket. */
  readonly upperBoundMinor?: number | null;
}

/**
 * Edit one bracket's rate and/or bounds (AC-11). Bounds default to the row's current values
 * when omitted, and are re-validated against `tax_brackets_upper_above_lower` in code so a
 * bad edit gets a `SettingsError`, not an opaque CHECK failure.
 */
export function updateBracket(
  sqlite: BetterSqlite3.Database,
  id: number,
  rateBp: number,
  bounds: UpdateBracketBounds = {},
): TaxBracketRow {
  if (!Number.isSafeInteger(rateBp) || rateBp < 0 || rateBp > 10000) {
    throw new SettingsError(`rateBp must be an integer in [0, 10000] basis points, got ${String(rateBp)}.`);
  }

  const run = sqlite.transaction(() => {
    const before = requireBracket(sqlite, id);
    const lowerBoundMinor = bounds.lowerBoundMinor ?? before.lowerBoundMinor;
    const upperBoundMinor = bounds.upperBoundMinor !== undefined ? bounds.upperBoundMinor : before.upperBoundMinor;

    if (!Number.isSafeInteger(lowerBoundMinor) || lowerBoundMinor < 0) {
      throw new SettingsError(`lowerBoundMinor must be a non-negative integer, got ${String(lowerBoundMinor)}.`);
    }
    if (upperBoundMinor != null && upperBoundMinor <= lowerBoundMinor) {
      throw new SettingsError('upperBoundMinor must be greater than lowerBoundMinor (or null for the top bracket).');
    }

    statementsFor(sqlite).updateBracketFields.run(rateBp, lowerBoundMinor, upperBoundMinor, id);
    const after = requireBracket(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'setting',
      entityId: id,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}
