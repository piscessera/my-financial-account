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

export const DEFAULT_STATUTORY_BRACKETS = [
  { lowerBoundMinor: 0, upperBoundMinor: 15_000_000, rateBp: 0, sortOrder: 1 },
  { lowerBoundMinor: 15_000_000, upperBoundMinor: 30_000_000, rateBp: 500, sortOrder: 2 },
  { lowerBoundMinor: 30_000_000, upperBoundMinor: 50_000_000, rateBp: 1000, sortOrder: 3 },
  { lowerBoundMinor: 50_000_000, upperBoundMinor: 75_000_000, rateBp: 1500, sortOrder: 4 },
  { lowerBoundMinor: 75_000_000, upperBoundMinor: 100_000_000, rateBp: 2000, sortOrder: 5 },
  { lowerBoundMinor: 100_000_000, upperBoundMinor: 200_000_000, rateBp: 2500, sortOrder: 6 },
  { lowerBoundMinor: 200_000_000, upperBoundMinor: 500_000_000, rateBp: 3000, sortOrder: 7 },
  { lowerBoundMinor: 500_000_000, upperBoundMinor: null, rateBp: 3500, sortOrder: 8 },
] as const;

export function validateBracketHierarchy(brackets: TaxBracketRow[]): void {
  if (brackets.length === 0) {
    throw new SettingsError('Tax brackets cannot be empty.');
  }
  const sorted = [...brackets].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sorted[0].lowerBoundMinor !== 0) {
    throw new SettingsError(
      `First tax bracket tier must start at 0 satang, got ${sorted[0].lowerBoundMinor}.`,
    );
  }
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (b.upperBoundMinor !== null && b.upperBoundMinor <= b.lowerBoundMinor) {
      throw new SettingsError(
        `Bracket tier ${b.sortOrder} upperBoundMinor must be greater than lowerBoundMinor.`,
      );
    }
    if (i < sorted.length - 1) {
      if (b.upperBoundMinor === null) {
        throw new SettingsError(
          `Only the last tax bracket tier can have an open-ended (null) upper bound.`,
        );
      }
      const next = sorted[i + 1];
      if (next.lowerBoundMinor !== b.upperBoundMinor) {
        throw new SettingsError(
          `Gap or overlap between bracket tier ${b.sortOrder} and tier ${next.sortOrder}: ${b.upperBoundMinor} vs ${next.lowerBoundMinor}.`,
        );
      }
    } else {
      if (b.upperBoundMinor !== null) {
        throw new SettingsError(`The final tax bracket tier must be open-ended (upper bound null).`);
      }
    }
  }
}

export interface UpdateBracketBounds {
  readonly lowerBoundMinor?: number;
  /** `null` marks the open-ended top bracket. */
  readonly upperBoundMinor?: number | null;
}

/**
 * Edit one bracket's rate and/or bounds (AC-1, AC-7).
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

export interface NewTaxBracketInput {
  readonly taxYearId?: number | null;
  readonly lowerBoundMinor: number;
  readonly upperBoundMinor?: number | null;
  readonly rateBp: number;
  readonly sortOrder?: number;
}

/**
 * Add a new tax bracket tier (AT-1.2, TC #2).
 */
export function addTaxBracket(
  sqlite: BetterSqlite3.Database,
  input: NewTaxBracketInput,
): TaxBracketRow {
  const targetYearId = typeof input.taxYearId === 'number' ? input.taxYearId : null;
  assertYearNotClosed(sqlite, targetYearId);

  if (!Number.isSafeInteger(input.rateBp) || input.rateBp < 0 || input.rateBp > 10000) {
    throw new SettingsError(`rateBp must be an integer in [0, 10000] basis points.`);
  }
  if (!Number.isSafeInteger(input.lowerBoundMinor) || input.lowerBoundMinor < 0) {
    throw new SettingsError(`lowerBoundMinor must be a non-negative integer.`);
  }
  if (input.upperBoundMinor != null && input.upperBoundMinor <= input.lowerBoundMinor) {
    throw new SettingsError(`upperBoundMinor must be greater than lowerBoundMinor.`);
  }

  const run = sqlite.transaction(() => {
    let sortOrder = input.sortOrder;
    if (sortOrder === undefined) {
      const existing = getBrackets(sqlite, targetYearId);
      sortOrder = existing.length + 1;
    }

    const info = sqlite
      .prepare(
        `INSERT INTO tax_brackets (tax_year_id, lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        targetYearId,
        input.lowerBoundMinor,
        input.upperBoundMinor ?? null,
        input.rateBp,
        sortOrder,
      );

    const created = requireBracket(sqlite, Number(info.lastInsertRowid));
    recordMutation(sqlite, {
      entityType: 'setting',
      entityId: created.id,
      action: 'create',
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
    return created;
  });
  return run();
}

/**
 * Delete a tax bracket tier (AT-1.2, TC #4).
 */
export function deleteTaxBracket(sqlite: BetterSqlite3.Database, id: number): void {
  const run = sqlite.transaction(() => {
    const before = requireBracket(sqlite, id);
    assertYearNotClosed(sqlite, before.taxYearId);

    sqlite.prepare(`DELETE FROM tax_brackets WHERE id = ?`).run(id);

    recordMutation(sqlite, {
      entityType: 'setting',
      entityId: id,
      action: 'delete',
      before: before as unknown as Record<string, unknown>,
      after: null,
    });
  });
  run();
}

/**
 * Reset tax brackets to standard statutory 8 tiers (AT-1.2, TC #5).
 */
export function resetTaxBracketsToDefault(
  sqlite: BetterSqlite3.Database,
  taxYearId?: number | null,
): TaxBracketRow[] {
  const targetYearId = typeof taxYearId === 'number' ? taxYearId : null;
  assertYearNotClosed(sqlite, targetYearId);

  const run = sqlite.transaction(() => {
    const existing = getBrackets(sqlite, targetYearId);
    if (targetYearId !== null) {
      sqlite.prepare(`DELETE FROM tax_brackets WHERE tax_year_id = ?`).run(targetYearId);
    } else {
      sqlite.prepare(`DELETE FROM tax_brackets WHERE tax_year_id IS NULL`).run();
    }

    const insertStmt = sqlite.prepare(`
      INSERT INTO tax_brackets (tax_year_id, lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const b of DEFAULT_STATUTORY_BRACKETS) {
      insertStmt.run(targetYearId, b.lowerBoundMinor, b.upperBoundMinor, b.rateBp, b.sortOrder);
    }

    const after = getBrackets(sqlite, targetYearId);
    recordMutation(sqlite, {
      entityType: 'setting',
      entityId: targetYearId ?? 0,
      action: 'reset_brackets',
      before: { brackets: existing },
      after: { brackets: after },
    });
    return after;
  });
  return run();
}
