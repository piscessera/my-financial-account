/**
 * Reference-data seed loader (AT-1.5).
 *
 * Optional by design (ANA-0001 decision 14): with no `TAX-2025` figures available, the default
 * data set (`seedData/taxYear2025.ts`) is empty, so `seedDatabase` inserts zero rows and the app
 * starts with empty `shared_caps`/`deduction_categories`/`tax_brackets` tables — a supported
 * state the user fills in later via Settings (AT-3.1/AT-3.6). When real figures are dropped into
 * that data module, this loader seeds them the same way, unchanged.
 *
 * Takes the raw better-sqlite3 connection, same convention as `db/client.ts`/`repositories/
 * auditLog.ts` — seeding is plain inserts against known-shape tables, no need for Drizzle's
 * query builder. Runs once: if any of the three tables already has rows (a second launch, or a
 * DB that was seeded before), it skips rather than inserting duplicates.
 */
import type BetterSqlite3 from 'better-sqlite3';

export interface SharedCapSeed {
  readonly name: string;
  readonly capAmountMinor: number;
}

export interface DeductionCategorySeed {
  readonly code: string;
  readonly name: string;
  readonly capType: 'fixed' | 'per_count' | 'shared_group_member';
  /** Required for `fixed`/`per_count`, omitted for `shared_group_member` (INV-6). */
  readonly capAmountMinor?: number;
  /** Required for `shared_group_member` — must match a `name` in `sharedCaps` (INV-6). */
  readonly sharedGroupName?: string;
  readonly sortOrder?: number;
  readonly description?: string;
  readonly isBuiltin?: boolean;
}

export interface TaxBracketSeed {
  readonly lowerBoundMinor: number;
  /** `null`/omitted = the open-ended top bracket. */
  readonly upperBoundMinor?: number | null;
  readonly rateBp: number;
  readonly sortOrder: number;
}

export interface SeedDataSet {
  /** Human-readable source label for the seeded rows (e.g. `'TAX-2025'`). */
  readonly label: string;
  readonly sharedCaps: readonly SharedCapSeed[];
  readonly deductionCategories: readonly DeductionCategorySeed[];
  readonly taxBrackets: readonly TaxBracketSeed[];
}

export interface SeedResult {
  readonly skipped: boolean;
  readonly sharedCapsInserted: number;
  readonly deductionCategoriesInserted: number;
  readonly taxBracketsInserted: number;
}

function countRows(sqlite: BetterSqlite3.Database, table: string): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

/**
 * Seeds `shared_caps`, `deduction_categories` and `tax_brackets` from `dataSet` inside one
 * transaction. Skips (returns `{ skipped: true }`) if any of the three tables is non-empty,
 * so re-opening an already-seeded (or user-populated) database never inserts duplicates.
 */
export function seedDatabase(
  sqlite: BetterSqlite3.Database,
  dataSet: SeedDataSet,
): SeedResult {
  const alreadySeeded =
    countRows(sqlite, 'shared_caps') > 0 ||
    countRows(sqlite, 'deduction_categories') > 0 ||
    countRows(sqlite, 'tax_brackets') > 0;
  if (alreadySeeded) {
    return {
      skipped: true,
      sharedCapsInserted: 0,
      deductionCategoriesInserted: 0,
      taxBracketsInserted: 0,
    };
  }

  const insertSharedCap = sqlite.prepare(
    `INSERT INTO shared_caps (name, cap_amount_minor) VALUES (@name, @capAmountMinor)`,
  );
  const insertCategory = sqlite.prepare(
    `INSERT INTO deduction_categories
       (code, name, cap_type, cap_amount_minor, shared_group_id, sort_order, description, is_builtin)
     VALUES (@code, @name, @capType, @capAmountMinor, @sharedGroupId, @sortOrder, @description, @isBuiltin)`,
  );
  const insertBracket = sqlite.prepare(
    `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
     VALUES (@lowerBoundMinor, @upperBoundMinor, @rateBp, @sortOrder)`,
  );

  const run = sqlite.transaction((data: SeedDataSet): SeedResult => {
    const sharedGroupIdByName = new Map<string, number>();
    for (const cap of data.sharedCaps) {
      const info = insertSharedCap.run({ name: cap.name, capAmountMinor: cap.capAmountMinor });
      sharedGroupIdByName.set(cap.name, Number(info.lastInsertRowid));
    }

    for (const [sortOrder, category] of data.deductionCategories.entries()) {
      const sharedGroupId =
        category.sharedGroupName === undefined
          ? null
          : (sharedGroupIdByName.get(category.sharedGroupName) ?? null);
      if (category.sharedGroupName !== undefined && sharedGroupId === null) {
        throw new Error(
          `seedDatabase: category "${category.code}" references unknown sharedGroupName ` +
            `"${category.sharedGroupName}".`,
        );
      }
      insertCategory.run({
        code: category.code,
        name: category.name,
        capType: category.capType,
        capAmountMinor: category.capAmountMinor ?? null,
        sharedGroupId,
        sortOrder: category.sortOrder ?? sortOrder,
        description: category.description ?? '',
        isBuiltin: (category.isBuiltin ?? true) ? 1 : 0,
      });
    }

    for (const bracket of data.taxBrackets) {
      insertBracket.run({
        lowerBoundMinor: bracket.lowerBoundMinor,
        upperBoundMinor: bracket.upperBoundMinor ?? null,
        rateBp: bracket.rateBp,
        sortOrder: bracket.sortOrder,
      });
    }

    return {
      skipped: false,
      sharedCapsInserted: data.sharedCaps.length,
      deductionCategoriesInserted: data.deductionCategories.length,
      taxBracketsInserted: data.taxBrackets.length,
    };
  });

  return run(dataSet);
}
