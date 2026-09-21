/**
 * `shared_caps` + `tax_brackets` repository (AT-3.1, REQ-0004).
 *
 * Supports querying and updating both:
 * - Baseline defaults (`tax_year_id IS NULL`)
 * - Year-specific configurations (`tax_year_id = <id>`) with closed-year edit protection (INV-7).
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

interface RawSharedCapRow {
  id: number;
  tax_year_id: number | null;
  name: string;
  cap_amount_minor: number;
}

function toSharedCapRow(raw: unknown): SharedCapRow {
  const row = raw as RawSharedCapRow;
  return {
    id: row.id,
    taxYearId: row.tax_year_id,
    name: row.name,
    capAmountMinor: row.cap_amount_minor,
  };
}

function assertYearNotClosed(sqlite: BetterSqlite3.Database, taxYearId: number | null): void {
  if (taxYearId === null || taxYearId === undefined) return;
  const yearRow = sqlite.prepare(`SELECT closed_at FROM tax_years WHERE id = ?`).get(taxYearId) as
    | { closed_at: string | null }
    | undefined;
  if (yearRow && yearRow.closed_at !== null) {
    throw new SettingsError('Cannot edit settings for a closed tax year (INV-7).');
  }
}

export function getSharedCaps(
  sqlite: BetterSqlite3.Database,
  taxYearId?: number | null,
): SharedCapRow[] {
  if (typeof taxYearId === 'number') {
    const yearCaps = sqlite
      .prepare(`SELECT * FROM shared_caps WHERE tax_year_id = ? ORDER BY name ASC`)
      .all(taxYearId)
      .map(toSharedCapRow);
    if (yearCaps.length > 0) return yearCaps;
  }
  // Baseline (tax_year_id IS NULL)
  return sqlite
    .prepare(`SELECT * FROM shared_caps WHERE tax_year_id IS NULL ORDER BY name ASC`)
    .all()
    .map(toSharedCapRow);
}

function requireSharedCap(sqlite: BetterSqlite3.Database, id: number): SharedCapRow {
  const raw = sqlite.prepare(`SELECT * FROM shared_caps WHERE id = ?`).get(id);
  if (raw === undefined) throw new SettingsError(`shared_caps row ${id} not found.`);
  return toSharedCapRow(raw);
}

/** Edit a shared group's total ceiling (e.g. life + health insurance's combined 100,000 cap). */
export function updateSharedCap(
  sqlite: BetterSqlite3.Database,
  id: number,
  newCapAmountMinor: number,
): SharedCapRow {
  if (!Number.isSafeInteger(newCapAmountMinor) || newCapAmountMinor < 0) {
    throw new SettingsError(
      `newCapAmountMinor must be a non-negative integer, got ${String(newCapAmountMinor)}.`,
    );
  }

  const run = sqlite.transaction(() => {
    const before = requireSharedCap(sqlite, id);
    assertYearNotClosed(sqlite, before.taxYearId);

    sqlite
      .prepare(`UPDATE shared_caps SET cap_amount_minor = ? WHERE id = ?`)
      .run(newCapAmountMinor, id);

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
  tax_year_id: number | null;
  lower_bound_minor: number;
  upper_bound_minor: number | null;
  rate_bp: number;
  sort_order: number;
}

function toBracketRow(raw: unknown): TaxBracketRow {
  const row = raw as RawTaxBracketRow;
  return {
    id: row.id,
    taxYearId: row.tax_year_id,
    lowerBoundMinor: row.lower_bound_minor,
    upperBoundMinor: row.upper_bound_minor,
    rateBp: row.rate_bp,
    sortOrder: row.sort_order,
  };
}

function requireBracket(sqlite: BetterSqlite3.Database, id: number): TaxBracketRow {
  const raw = sqlite.prepare(`SELECT * FROM tax_brackets WHERE id = ?`).get(id);
  if (raw === undefined) throw new SettingsError(`tax_brackets row ${id} not found.`);
  return toBracketRow(raw);
}

/** Get tax brackets for a specific tax year, or baseline defaults if omitted/null. */
export function getBrackets(
  sqlite: BetterSqlite3.Database,
  taxYearId?: number | null,
): TaxBracketRow[] {
  if (typeof taxYearId === 'number') {
    const yearBrackets = sqlite
      .prepare(`SELECT * FROM tax_brackets WHERE tax_year_id = ? ORDER BY sort_order ASC`)
      .all(taxYearId)
      .map(toBracketRow);
    if (yearBrackets.length > 0) return yearBrackets;
  }
  return sqlite
    .prepare(`SELECT * FROM tax_brackets WHERE tax_year_id IS NULL ORDER BY sort_order ASC`)
    .all()
    .map(toBracketRow);
}

export interface UpdateBracketBounds {
  readonly lowerBoundMinor?: number;
  /** `null` marks the open-ended top bracket. */
  readonly upperBoundMinor?: number | null;
}

/**
 * Edit one bracket's rate and/or bounds (AC-11).
 */
export function updateBracket(
  sqlite: BetterSqlite3.Database,
  id: number,
  rateBp: number,
  bounds: UpdateBracketBounds = {},
): TaxBracketRow {
  if (!Number.isSafeInteger(rateBp) || rateBp < 0 || rateBp > 10000) {
    throw new SettingsError(
      `rateBp must be an integer in [0, 10000] basis points, got ${String(rateBp)}.`,
    );
  }

  const run = sqlite.transaction(() => {
    const before = requireBracket(sqlite, id);
    assertYearNotClosed(sqlite, before.taxYearId);

    const lowerBoundMinor = bounds.lowerBoundMinor ?? before.lowerBoundMinor;
    const upperBoundMinor =
      bounds.upperBoundMinor !== undefined ? bounds.upperBoundMinor : before.upperBoundMinor;

    if (!Number.isSafeInteger(lowerBoundMinor) || lowerBoundMinor < 0) {
      throw new SettingsError(
        `lowerBoundMinor must be a non-negative integer, got ${String(lowerBoundMinor)}.`,
      );
    }
    if (upperBoundMinor != null && upperBoundMinor <= lowerBoundMinor) {
      throw new SettingsError(
        'upperBoundMinor must be greater than lowerBoundMinor (or null for the top bracket).',
      );
    }

    sqlite
      .prepare(
        `UPDATE tax_brackets SET rate_bp = ?, lower_bound_minor = ?, upper_bound_minor = ? WHERE id = ?`,
      )
      .run(rateBp, lowerBoundMinor, upperBoundMinor, id);

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
