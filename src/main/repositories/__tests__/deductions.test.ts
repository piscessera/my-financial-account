/**
 * AT-3.1 — `deduction_categories`/`deduction_entries` repository.
 *
 * Covers TC-0001 #37, #38, #39, #40.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear } from '../taxYears';
import {
  DeductionError,
  createCategory,
  getDeductionSummary,
  getSourceTransactions,
  listCategories,
  setCategoryActive,
  setEntry,
  updateCategory,
} from '../deductions';
import { createTransaction } from '../transactions';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;

beforeEach(() => {
  temp = openTempDatabase();
});

afterEach(() => {
  temp.dispose();
});

function insertSharedCap(name: string, capAmountMinor: number): number {
  const info = temp.sqlite
    .prepare(`INSERT INTO shared_caps (name, cap_amount_minor) VALUES (?, ?)`)
    .run(name, capAmountMinor);
  return Number(info.lastInsertRowid);
}

describe('createCategory — TC-0001 #37: each cap shape', () => {
  it('creates a fixed category', () => {
    const row = createCategory(temp.sqlite, {
      code: 'donation',
      name: 'เงินบริจาคทั่วไป',
      capType: 'fixed',
      capAmountMinor: 1_000_000_00,
    });
    expect(row.capType).toBe('fixed');
    expect(row.capAmountMinor).toBe(1_000_000_00);
    expect(row.isActive).toBe(true);
  });

  it('creates a per_count category', () => {
    const row = createCategory(temp.sqlite, {
      code: 'children',
      name: 'บุตร',
      capType: 'per_count',
      capAmountMinor: 30_000_00,
    });
    expect(row.capType).toBe('per_count');
    expect(row.capAmountMinor).toBe(30_000_00);
  });

  it('creates a shared_group_member category, optionally with its own sub-cap', () => {
    const groupId = insertSharedCap('Life+Health Insurance', 100_000_00);
    const row = createCategory(temp.sqlite, {
      code: 'health_insurance_self',
      name: 'ประกันสุขภาพ (ตนเอง)',
      capType: 'shared_group_member',
      sharedGroupId: groupId,
      capAmountMinor: 25_000_00,
    });
    expect(row.capType).toBe('shared_group_member');
    expect(row.sharedGroupId).toBe(groupId);
    expect(row.capAmountMinor).toBe(25_000_00);
  });

  it('all three are immediately available via listCategories', () => {
    const groupId = insertSharedCap('Group', 100_00);
    createCategory(temp.sqlite, { code: 'a', name: 'A', capType: 'fixed', capAmountMinor: 100_00 });
    createCategory(temp.sqlite, {
      code: 'b',
      name: 'B',
      capType: 'per_count',
      capAmountMinor: 50_00,
    });
    createCategory(temp.sqlite, {
      code: 'c',
      name: 'C',
      capType: 'shared_group_member',
      sharedGroupId: groupId,
    });

    expect(listCategories(temp.sqlite).map((c) => c.code)).toEqual(['a', 'b', 'c']);
  });

  it('rejects shared_group_member without a sharedGroupId', () => {
    expect(() =>
      createCategory(temp.sqlite, { code: 'x', name: 'X', capType: 'shared_group_member' }),
    ).toThrow(DeductionError);
  });

  it('rejects fixed/per_count without a capAmountMinor', () => {
    expect(() => createCategory(temp.sqlite, { code: 'x', name: 'X', capType: 'fixed' })).toThrow(
      DeductionError,
    );
  });
});

describe('setCategoryActive — TC-0001 #38/#39: archive and reactivate', () => {
  it('archiving hides it from new-entry discovery but leaves existing entries untouched', () => {
    const category = createCategory(temp.sqlite, {
      code: 'donation',
      name: 'เงินบริจาค',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    const year2568 = createTaxYear(temp.sqlite, { year: 2568 }).id;
    const entry = setEntry(temp.sqlite, {
      taxYearId: year2568,
      categoryId: category.id,
      amountMinor: 5_000_00,
    });

    const archived = setCategoryActive(temp.sqlite, category.id, false);

    expect(archived.isActive).toBe(false);
    // "hidden from the add-a-category list" is a UI-level filter on isActive — the
    // repository's job is only to make that filterable correctly.
    expect(listCategories(temp.sqlite).find((c) => c.id === category.id)?.isActive).toBe(false);
    // The entry itself, and its category's cap/name, are exactly as before.
    expect(entry.amountMinor).toBe(5_000_00);
    const stillThere = temp.sqlite
      .prepare(`SELECT * FROM deduction_entries WHERE id = ?`)
      .get(entry.id);
    expect(stillThere).toBeDefined();
  });

  it('reactivating restores it unchanged', () => {
    const category = createCategory(temp.sqlite, {
      code: 'donation',
      name: 'เงินบริจาค',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    setCategoryActive(temp.sqlite, category.id, false);

    const reactivated = setCategoryActive(temp.sqlite, category.id, true);

    expect(reactivated.isActive).toBe(true);
    expect(reactivated.name).toBe(category.name);
    expect(reactivated.capAmountMinor).toBe(category.capAmountMinor);
  });
});

describe('updateCategory — TC-0001 #40: rename', () => {
  it('renames a category; cap and existing entries are unaffected', () => {
    const category = createCategory(temp.sqlite, {
      code: 'donation',
      name: 'เงินบริจาคทั่วไป',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    const year = createTaxYear(temp.sqlite, { year: 2569 }).id;
    setEntry(temp.sqlite, { taxYearId: year, categoryId: category.id, amountMinor: 20_000_00 });

    const renamed = updateCategory(temp.sqlite, category.id, { name: 'เงินบริจาคการศึกษา' });

    expect(renamed.name).toBe('เงินบริจาคการศึกษา');
    expect(renamed.capAmountMinor).toBe(100_000_00);
    const entryAfter = temp.sqlite
      .prepare(
        `SELECT amount_minor FROM deduction_entries WHERE tax_year_id = ? AND category_id = ?`,
      )
      .get(year, category.id) as { amount_minor: number };
    expect(entryAfter.amount_minor).toBe(20_000_00);
  });

  it("can also change a fixed/per_count category's cap amount", () => {
    const category = createCategory(temp.sqlite, {
      code: 'donation',
      name: 'เงินบริจาค',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    const updated = updateCategory(temp.sqlite, category.id, { capAmountMinor: 150_000_00 });
    expect(updated.capAmountMinor).toBe(150_000_00);
  });
});

describe('setEntry', () => {
  it('creates on first call and replaces (upserts) on a second call for the same year+category', () => {
    const category = createCategory(temp.sqlite, {
      code: 'donation',
      name: 'เงินบริจาค',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    const year = createTaxYear(temp.sqlite, { year: 2569 }).id;

    const first = setEntry(temp.sqlite, {
      taxYearId: year,
      categoryId: category.id,
      amountMinor: 1_000_00,
    });
    const second = setEntry(temp.sqlite, {
      taxYearId: year,
      categoryId: category.id,
      amountMinor: 2_000_00,
    });

    expect(first.id).toBe(second.id);
    expect(second.amountMinor).toBe(2_000_00);
    const count = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM deduction_entries`).get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });
});

describe('getDeductionSummary & getSourceTransactions (REQ-0007, AT-1.3)', () => {
  it('aggregates linked expense transactions per category (TC #8, #9)', () => {
    const year = createTaxYear(temp.sqlite, { year: 2568 }).id;
    const cat = createCategory(temp.sqlite, {
      taxYearId: year,
      code: 'life_insurance',
      name: 'เบี้ยประกันชีวิต',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });

    // Create 2 linked expense transactions
    createTransaction(temp.sqlite, {
      taxYearId: year,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'other',
      deductionCategoryId: cat.id,
      date: '2025-05-10',
      amountMinor: 50_000_00,
      note: 'AIA Life Insurance Q1',
    });
    createTransaction(temp.sqlite, {
      taxYearId: year,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'other',
      deductionCategoryId: cat.id,
      date: '2025-08-10',
      amountMinor: 70_000_00,
      note: 'AIA Life Insurance Q2',
    });

    // Drill-down source items
    const sourceTx = getSourceTransactions(temp.sqlite, year, cat.id);
    expect(sourceTx).toHaveLength(2);
    expect(sourceTx[0].note).toBe('AIA Life Insurance Q2');
    expect(sourceTx[1].note).toBe('AIA Life Insurance Q1');

    // Summary calculation
    const summary = getDeductionSummary(temp.sqlite, year);
    const item = summary.items.find((i) => i.category.id === cat.id);
    expect(item).toBeDefined();
    expect(item?.sourceExpenseMinor).toBe(120_000_00);
    expect(item?.sourceExpenseCount).toBe(2);
    expect(item?.totalGrossMinor).toBe(120_000_00);
    expect(item?.effectiveMinor).toBe(100_000_00); // capped at 100,000 THB
    expect(item?.isOverCap).toBe(true);
    expect(item?.overCapMinor).toBe(20_000_00);
  });

  it('combines linked expenses with manual deduction entries (TC #12)', () => {
    const year = createTaxYear(temp.sqlite, { year: 2568 }).id;
    const cat = createCategory(temp.sqlite, {
      taxYearId: year,
      code: 'home_loan',
      name: 'ดอกเบี้ยกู้บ้าน',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });

    // Linked expense: 40,000 THB
    createTransaction(temp.sqlite, {
      taxYearId: year,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'housing',
      deductionCategoryId: cat.id,
      date: '2025-03-15',
      amountMinor: 40_000_00,
    });

    // Manual entry: 30,000 THB
    setEntry(temp.sqlite, {
      taxYearId: year,
      categoryId: cat.id,
      amountMinor: 30_000_00,
    });

    const summary = getDeductionSummary(temp.sqlite, year);
    const item = summary.items.find((i) => i.category.id === cat.id);
    expect(item?.sourceExpenseMinor).toBe(40_000_00);
    expect(item?.manualAmountMinor).toBe(30_000_00);
    expect(item?.totalGrossMinor).toBe(70_000_00);
    expect(item?.effectiveMinor).toBe(70_000_00);
    expect(item?.isOverCap).toBe(false);
  });

  it('aggregates custom partial deductionAmountMinor on income and expense (REQ-0008, TC-0008 #7, #8)', () => {
    const year = createTaxYear(temp.sqlite, { year: 2568 }).id;
    const cat = createCategory(temp.sqlite, {
      taxYearId: year,
      code: 'life_insurance',
      name: 'เบี้ยประกันชีวิต',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });

    // Expense with partial deduction: total 15,000 THB, deductible 10,000 THB
    createTransaction(temp.sqlite, {
      taxYearId: year,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'other',
      deductionCategoryId: cat.id,
      deductionAmountMinor: 10_000_00,
      date: '2025-05-10',
      amountMinor: 15_000_00,
      note: 'Life Insurance with Rider',
    });

    // Legacy/full transaction where deductionAmountMinor is null: total 20,000 THB
    createTransaction(temp.sqlite, {
      taxYearId: year,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'other',
      deductionCategoryId: cat.id,
      date: '2025-06-10',
      amountMinor: 20_000_00,
      note: 'Life Insurance Full',
    });

    // Income with partial deduction: total 50,000 THB, deductible 5,000 THB
    createTransaction(temp.sqlite, {
      taxYearId: year,
      kind: 'income',
      taxRelevant: true,
      incomeSection: '40_1',
      deductionCategoryId: cat.id,
      deductionAmountMinor: 5_000_00,
      date: '2025-07-10',
      amountMinor: 50_000_00,
      note: 'Salary with Insurance Benefit',
    });

    const sourceTx = getSourceTransactions(temp.sqlite, year, cat.id);
    expect(sourceTx).toHaveLength(3);
    expect(sourceTx.map((t) => t.deductionAmountMinor)).toEqual([5_000_00, null, 10_000_00]);

    const summary = getDeductionSummary(temp.sqlite, year);
    const item = summary.items.find((i) => i.category.id === cat.id);
    expect(item).toBeDefined();
    // 10,000 (custom) + 20,000 (full fallback) + 5,000 (income custom) = 35,000 THB
    expect(item?.sourceExpenseMinor).toBe(35_000_00);
    expect(item?.sourceExpenseCount).toBe(3);
    expect(item?.effectiveMinor).toBe(35_000_00);
  });
});


