import { dirname } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createDomainIpcHandlers } from '../../ipc';
import { openTempDatabase } from '../../db/__tests__/helpers';
import { seedDatabase } from '../../db/seed';
import { TAX_YEAR_2025_SEED } from '../../db/seedData/taxYear2025';
import {
  getBrackets,
  getSharedCaps,
  updateBracket,
  updateSharedCap,
} from '../settings';
import {
  createCategory,
  listCategories,
  updateCategory,
} from '../deductions';
import { createTaxYear } from '../taxYears';

describe('REQ-0004 / TC-0004: Year-Scoped Cloned Config & Baseline Templates', () => {
  it('TC-0004 #1 & #2: seeds baseline templates and auto-clones them into newly created tax years', () => {
    const db = openTempDatabase();
    try {
      seedDatabase(db.sqlite, TAX_YEAR_2025_SEED);

      // Baseline templates (tax_year_id IS NULL)
      const baselineBrackets = getBrackets(db.sqlite, null);
      const baselineCaps = listCategories(db.sqlite, null);
      const baselineGroups = getSharedCaps(db.sqlite, null);

      expect(baselineBrackets).toHaveLength(8);
      expect(baselineCaps).toHaveLength(5);
      expect(baselineGroups).toHaveLength(1);

      // Creating year 2025 auto-clones config
      const year2025 = createTaxYear(db.sqlite, { year: 2025 });
      const year2025Brackets = getBrackets(db.sqlite, year2025.id);
      const year2025Caps = listCategories(db.sqlite, year2025.id);
      const year2025Groups = getSharedCaps(db.sqlite, year2025.id);

      expect(year2025Brackets).toHaveLength(8);
      expect(year2025Caps).toHaveLength(5);
      expect(year2025Groups).toHaveLength(1);

      // All cloned rows have tax_year_id = year2025.id
      for (const b of year2025Brackets) {
        expect(b.taxYearId).toBe(year2025.id);
      }
      for (const c of year2025Caps) {
        expect(c.taxYearId).toBe(year2025.id);
      }
      for (const g of year2025Groups) {
        expect(g.taxYearId).toBe(year2025.id);
      }
    } finally {
      db.dispose();
    }
  });

  it('TC-0004 #3 & #4: editing year-scoped config does not affect baseline or other years, and vice-versa', () => {
    const db = openTempDatabase();
    try {
      seedDatabase(db.sqlite, TAX_YEAR_2025_SEED);

      const year2025 = createTaxYear(db.sqlite, { year: 2025 });
      const year2026 = createTaxYear(db.sqlite, { year: 2026 });

      const year2025Bracket2 = getBrackets(db.sqlite, year2025.id).find((b) => b.sortOrder === 2)!;
      // Change 2025 bracket 2 rate from 5% (500) to 8% (800)
      updateBracket(db.sqlite, year2025Bracket2.id, 800);

      // Baseline remains 500
      const baselineBracket2 = getBrackets(db.sqlite, null).find((b) => b.sortOrder === 2)!;
      expect(baselineBracket2.rateBp).toBe(500);

      // Year 2026 remains 500
      const year2026Bracket2 = getBrackets(db.sqlite, year2026.id).find((b) => b.sortOrder === 2)!;
      expect(year2026Bracket2.rateBp).toBe(500);

      // Year 2025 is now 800
      const updated2025Bracket2 = getBrackets(db.sqlite, year2025.id).find((b) => b.sortOrder === 2)!;
      expect(updated2025Bracket2.rateBp).toBe(800);

      // Editing baseline now does not mutate 2025 or 2026
      updateBracket(db.sqlite, baselineBracket2.id, 700);
      expect(getBrackets(db.sqlite, year2025.id).find((b) => b.sortOrder === 2)!.rateBp).toBe(800);
      expect(getBrackets(db.sqlite, year2026.id).find((b) => b.sortOrder === 2)!.rateBp).toBe(500);
    } finally {
      db.dispose();
    }
  });

  it('TC-0004 #8: correctly remaps shared_group_id foreign keys during cloning', () => {
    const db = openTempDatabase();
    try {
      seedDatabase(db.sqlite, TAX_YEAR_2025_SEED);

      const year2025 = createTaxYear(db.sqlite, { year: 2025 });
      const year2025Groups = getSharedCaps(db.sqlite, year2025.id);
      const year2025InsuranceGroup = year2025Groups.find((g) => g.name === 'กลุ่มประกันชีวิตและสุขภาพ')!;

      const year2025Caps = listCategories(db.sqlite, year2025.id);
      const lifeInsurance = year2025Caps.find((c) => c.code === 'life_insurance')!;
      const healthInsurance = year2025Caps.find((c) => c.code === 'health_insurance')!;

      expect(lifeInsurance.sharedGroupId).toBe(year2025InsuranceGroup.id);
      expect(healthInsurance.sharedGroupId).toBe(year2025InsuranceGroup.id);

      // Ensure it does not point to the baseline shared group
      const baselineGroup = getSharedCaps(db.sqlite, null).find((g) => g.name === 'กลุ่มประกันชีวิตและสุขภาพ')!;
      expect(year2025InsuranceGroup.id).not.toBe(baselineGroup.id);
    } finally {
      db.dispose();
    }
  });

  it('TC-0004 #7: enforces INV-7 by rejecting mutations on closed tax years', () => {
    const db = openTempDatabase();
    try {
      seedDatabase(db.sqlite, TAX_YEAR_2025_SEED);

      const year = createTaxYear(db.sqlite, { year: 2025 });
      const handlers = createDomainIpcHandlers({
        getSqlite: () => db.sqlite,
        getDataFolderPath: () => dirname(db.sqlite.name),
      });

      // Close the year
      handlers['taxYears:close'](year.id);

      const yearBrackets = getBrackets(db.sqlite, year.id);
      const yearCaps = listCategories(db.sqlite, year.id);
      const yearGroups = getSharedCaps(db.sqlite, year.id);

      // Updating bracket should fail
      expect(() => updateBracket(db.sqlite, yearBrackets[0].id, 1000)).toThrow(/closed tax year/i);

      // Updating category should fail
      expect(() => updateCategory(db.sqlite, yearCaps[0].id, { name: 'New Name' })).toThrow(/closed tax year/i);

      // Updating shared cap should fail
      expect(() => updateSharedCap(db.sqlite, yearGroups[0].id, 200_000_00)).toThrow(/closed tax year/i);

      // Creating category under closed year should fail
      expect(() =>
        createCategory(db.sqlite, {
          taxYearId: year.id,
          code: 'new_deduction',
          name: 'New Deduction',
          capType: 'fixed',
          capAmountMinor: 10_000_00,
        }),
      ).toThrow(/closed tax year/i);
    } finally {
      db.dispose();
    }
  });
});
