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
  listCategories,
  setCategoryActive,
  setEntry,
  updateCategory,
} from '../deductions';

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
    createCategory(temp.sqlite, { code: 'b', name: 'B', capType: 'per_count', capAmountMinor: 50_00 });
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
    const entry = setEntry(temp.sqlite, { taxYearId: year2568, categoryId: category.id, amountMinor: 5_000_00 });

    const archived = setCategoryActive(temp.sqlite, category.id, false);

    expect(archived.isActive).toBe(false);
    // "hidden from the add-a-category list" is a UI-level filter on isActive — the
    // repository's job is only to make that filterable correctly.
    expect(listCategories(temp.sqlite).find((c) => c.id === category.id)?.isActive).toBe(false);
    // The entry itself, and its category's cap/name, are exactly as before.
    expect(entry.amountMinor).toBe(5_000_00);
    const stillThere = temp.sqlite.prepare(`SELECT * FROM deduction_entries WHERE id = ?`).get(entry.id);
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
      .prepare(`SELECT amount_minor FROM deduction_entries WHERE tax_year_id = ? AND category_id = ?`)
      .get(year, category.id) as { amount_minor: number };
    expect(entryAfter.amount_minor).toBe(20_000_00);
  });

  it('can also change a fixed/per_count category\'s cap amount', () => {
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

    const first = setEntry(temp.sqlite, { taxYearId: year, categoryId: category.id, amountMinor: 1_000_00 });
    const second = setEntry(temp.sqlite, { taxYearId: year, categoryId: category.id, amountMinor: 2_000_00 });

    expect(first.id).toBe(second.id);
    expect(second.amountMinor).toBe(2_000_00);
    const count = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM deduction_entries`).get() as { n: number };
    expect(count.n).toBe(1);
  });
});
