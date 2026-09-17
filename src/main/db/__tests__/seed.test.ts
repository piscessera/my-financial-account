import { describe, expect, it } from 'vitest';

import { seedDatabase, type SeedDataSet } from '../seed';
import { TAX_YEAR_2025_SEED } from '../seedData/taxYear2025';
import { openTempDatabase } from './helpers';

function countRows(sqlite: import('better-sqlite3').Database, table: string): number {
  return (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

// A small made-up fixture — not real Thai tax figures — exercising every cap shape and a
// two-bracket table, all money as integer satang (INV-1).
const FIXTURE_SEED: SeedDataSet = {
  label: 'test-fixture',
  sharedCaps: [{ name: 'insurance_group', capAmountMinor: 10_000_00 }],
  deductionCategories: [
    { code: 'personal', name: 'Personal allowance', capType: 'fixed', capAmountMinor: 6_000_00 },
    { code: 'child', name: 'Child', capType: 'per_count', capAmountMinor: 3_000_00 },
    {
      code: 'life_insurance',
      name: 'Life insurance',
      capType: 'shared_group_member',
      sharedGroupName: 'insurance_group',
    },
  ],
  taxBrackets: [
    { lowerBoundMinor: 0, upperBoundMinor: 15_000_00, rateBp: 0, sortOrder: 1 },
    { lowerBoundMinor: 15_000_00, upperBoundMinor: null, rateBp: 1000, sortOrder: 2 },
  ],
};

describe('seedDatabase', () => {
  it('seeds the built-in (currently empty) TAX-2025 set without error', () => {
    const db = openTempDatabase();
    try {
      const result = seedDatabase(db.sqlite, TAX_YEAR_2025_SEED);
      expect(result).toEqual({
        skipped: false,
        sharedCapsInserted: 0,
        deductionCategoriesInserted: 0,
        taxBracketsInserted: 0,
      });
      expect(countRows(db.sqlite, 'shared_caps')).toBe(0);
      expect(countRows(db.sqlite, 'deduction_categories')).toBe(0);
      expect(countRows(db.sqlite, 'tax_brackets')).toBe(0);
    } finally {
      db.dispose();
    }
  });

  it('seeds a non-empty fixture set correctly, resolving the shared-group FK', () => {
    const db = openTempDatabase();
    try {
      const result = seedDatabase(db.sqlite, FIXTURE_SEED);
      expect(result).toEqual({
        skipped: false,
        sharedCapsInserted: 1,
        deductionCategoriesInserted: 3,
        taxBracketsInserted: 2,
      });

      const lifeInsurance = db.sqlite
        .prepare(`SELECT cap_type, shared_group_id, cap_amount_minor FROM deduction_categories WHERE code = 'life_insurance'`)
        .get() as { cap_type: string; shared_group_id: number; cap_amount_minor: number | null };
      const sharedCap = db.sqlite
        .prepare(`SELECT id, cap_amount_minor FROM shared_caps WHERE name = 'insurance_group'`)
        .get() as { id: number; cap_amount_minor: number };

      expect(lifeInsurance.cap_type).toBe('shared_group_member');
      expect(lifeInsurance.shared_group_id).toBe(sharedCap.id);
      expect(lifeInsurance.cap_amount_minor).toBeNull();
      expect(sharedCap.cap_amount_minor).toBe(10_000_00);
      expect(Number.isInteger(sharedCap.cap_amount_minor)).toBe(true);
    } finally {
      db.dispose();
    }
  });

  it('skips without inserting when the tables already have rows', () => {
    const db = openTempDatabase();
    try {
      seedDatabase(db.sqlite, FIXTURE_SEED);
      const second = seedDatabase(db.sqlite, FIXTURE_SEED);
      expect(second.skipped).toBe(true);
      expect(countRows(db.sqlite, 'deduction_categories')).toBe(3);
    } finally {
      db.dispose();
    }
  });

  it('rolls back the whole batch if a category references an unknown shared group', () => {
    const db = openTempDatabase();
    try {
      const badSeed: SeedDataSet = {
        label: 'bad-fixture',
        sharedCaps: [],
        deductionCategories: [
          {
            code: 'broken',
            name: 'Broken',
            capType: 'shared_group_member',
            sharedGroupName: 'does_not_exist',
          },
        ],
        taxBrackets: [],
      };
      expect(() => seedDatabase(db.sqlite, badSeed)).toThrow(/unknown sharedGroupName/);
      expect(countRows(db.sqlite, 'deduction_categories')).toBe(0);
    } finally {
      db.dispose();
    }
  });
});
