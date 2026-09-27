/**
 * AT-3.1, AT-1.2 — `shared_caps`/`tax_brackets` repository.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import {
  SettingsError,
  addTaxBracket,
  createSharedCap,
  deleteSharedCap,
  deleteTaxBracket,
  getBrackets,
  getSharedCaps,
  resetTaxBracketsToDefault,
  updateBracket,
  updateSharedCap,
  validateBracketHierarchy,
} from '../settings';

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

function insertBracket(
  lower: number,
  upper: number | null,
  rateBp: number,
  sortOrder: number,
): number {
  const info = temp.sqlite
    .prepare(
      `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order) VALUES (?, ?, ?, ?)`,
    )
    .run(lower, upper, rateBp, sortOrder);
  return Number(info.lastInsertRowid);
}

describe('shared caps', () => {
  it('getSharedCaps lists every group', () => {
    insertSharedCap('Life+Health Insurance', 100_000_00);
    insertSharedCap('RMF/SSF', 500_000_00);
    expect(getSharedCaps(temp.sqlite).map((c) => c.name)).toEqual([
      'Life+Health Insurance',
      'RMF/SSF',
    ]);
  });

  it('createSharedCap creates a group and audit-logs it (TC #4, #10)', () => {
    const created = createSharedCap(temp.sqlite, {
      name: 'ประกัน (รวม)',
      capAmountMinor: 100_000_00,
    });
    expect(created.id).toBeGreaterThan(0);
    expect(created.name).toBe('ประกัน (รวม)');
    expect(created.capAmountMinor).toBe(100_000_00);

    const log = temp.sqlite
      .prepare(`SELECT * FROM audit_log WHERE entity_type = 'setting' AND action = 'create' AND entity_id = ?`)
      .get(created.id) as { entity_id: number };
    expect(log.entity_id).toBe(created.id);
  });

  it('createSharedCap supports year-specific groups (TC #4)', () => {
    const yearId = Number(
      temp.sqlite.prepare(`INSERT INTO tax_years (year, status) VALUES (2025, 'open')`).run().lastInsertRowid,
    );
    const created = createSharedCap(temp.sqlite, {
      taxYearId: yearId,
      name: 'ปี 2025 ประกัน',
      capAmountMinor: 150_000_00,
    });
    expect(created.taxYearId).toBe(yearId);
    const yearCaps = getSharedCaps(temp.sqlite, yearId);
    expect(yearCaps.some((c) => c.name === 'ปี 2025 ประกัน')).toBe(true);
  });

  it('createSharedCap rejects empty name or negative cap (TC #12)', () => {
    expect(() =>
      createSharedCap(temp.sqlite, { name: '   ', capAmountMinor: 100_00 }),
    ).toThrow(SettingsError);
    expect(() =>
      createSharedCap(temp.sqlite, { name: 'Valid', capAmountMinor: -1 }),
    ).toThrow(SettingsError);
  });

  it('updateSharedCap edits both name and cap total and audit-logs it (TC #5, #10)', () => {
    const id = insertSharedCap('Life+Health Insurance', 100_000_00);
    const updated = updateSharedCap(temp.sqlite, id, {
      name: 'ประกันชีวิตและสุขภาพ',
      capAmountMinor: 120_000_00,
    });

    expect(updated.name).toBe('ประกันชีวิตและสุขภาพ');
    expect(updated.capAmountMinor).toBe(120_000_00);
    const row = temp.sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'setting' AND entity_id = ?`,
      )
      .get(id) as { n: number };
    expect(row.n).toBe(1);
  });

  it('updateSharedCap supports number argument for backwards compatibility', () => {
    const id = insertSharedCap('Group', 100_000_00);
    const updated = updateSharedCap(temp.sqlite, id, 150_000_00);
    expect(updated.capAmountMinor).toBe(150_000_00);
  });

  it('deleteSharedCap deletes unreferenced group and audit-logs it (TC #6, #10)', () => {
    const id = insertSharedCap('Unused Group', 50_000_00);
    deleteSharedCap(temp.sqlite, id);
    expect(getSharedCaps(temp.sqlite).some((c) => c.id === id)).toBe(false);

    const log = temp.sqlite
      .prepare(`SELECT * FROM audit_log WHERE entity_type = 'setting' AND action = 'delete' AND entity_id = ?`)
      .get(id) as { entity_id: number };
    expect(log.entity_id).toBe(id);
  });

  it('deleteSharedCap blocks deleting a group when categories reference it (TC #7)', () => {
    const groupId = insertSharedCap('Insurance Group', 100_000_00);
    temp.sqlite.prepare(`
      INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, shared_group_id, sort_order, description, is_builtin)
      VALUES ('life', 'ประกันชีวิต', 'shared_group_member', 10000000, ?, 1, '', 0)
    `).run(groupId);

    expect(() => deleteSharedCap(temp.sqlite, groupId)).toThrow(/ยังมีหมวดหมู่ค่าลดหย่อน/);
    expect(getSharedCaps(temp.sqlite).some((c) => c.id === groupId)).toBe(true);
  });

  it('closed tax year rejects shared cap mutations (TC #11)', () => {
    const yearId = Number(
      temp.sqlite
        .prepare(`INSERT INTO tax_years (year, status, closed_at) VALUES (2024, 'closed', '2025-03-31T00:00:00.000Z')`)
        .run().lastInsertRowid,
    );
    const capId = Number(
      temp.sqlite.prepare(`INSERT INTO shared_caps (tax_year_id, name, cap_amount_minor) VALUES (?, 'Closed Group', 10000)`).run(yearId).lastInsertRowid,
    );

    expect(() =>
      createSharedCap(temp.sqlite, { taxYearId: yearId, name: 'New Group', capAmountMinor: 10000 }),
    ).toThrow(/closed tax year/);
    expect(() =>
      updateSharedCap(temp.sqlite, capId, { capAmountMinor: 20000 }),
    ).toThrow(/closed tax year/);
    expect(() => deleteSharedCap(temp.sqlite, capId)).toThrow(/closed tax year/);
  });

  it('rejects a negative cap (TC #12)', () => {
    const id = insertSharedCap('Group', 100_00);
    expect(() => updateSharedCap(temp.sqlite, id, -1)).toThrow(SettingsError);
  });
});

describe('tax brackets', () => {
  it('getBrackets is empty until seeded (ANA-0001 decision 14)', () => {
    expect(getBrackets(temp.sqlite)).toEqual([]);
  });

  it('updateBracket edits the rate and defaults bounds to the current row', () => {
    const id = insertBracket(0, 15_000_00, 500, 1);
    const updated = updateBracket(temp.sqlite, id, 700);

    expect(updated.rateBp).toBe(700);
    expect(updated.lowerBoundMinor).toBe(0);
    expect(updated.upperBoundMinor).toBe(15_000_00);
  });

  it('updateBracket can also change the bounds', () => {
    const id = insertBracket(0, 15_000_00, 500, 1);
    const updated = updateBracket(temp.sqlite, id, 500, { upperBoundMinor: 20_000_00 });
    expect(updated.upperBoundMinor).toBe(20_000_00);
  });

  it('rejects upperBoundMinor <= lowerBoundMinor', () => {
    const id = insertBracket(10_000_00, 15_000_00, 500, 1);
    expect(() => updateBracket(temp.sqlite, id, 500, { upperBoundMinor: 5_000_00 })).toThrow(
      SettingsError,
    );
  });

  it('resetTaxBracketsToDefault populates standard 8 Thai statutory tiers (TC #1, #5)', () => {
    const brackets = resetTaxBracketsToDefault(temp.sqlite);
    expect(brackets).toHaveLength(8);
    expect(brackets[0].lowerBoundMinor).toBe(0);
    expect(brackets[0].upperBoundMinor).toBe(15_000_000);
    expect(brackets[0].rateBp).toBe(0);
    expect(brackets[7].lowerBoundMinor).toBe(500_000_000);
    expect(brackets[7].upperBoundMinor).toBeNull();
    expect(brackets[7].rateBp).toBe(3500);
  });

  it('addTaxBracket adds a new tier and logs mutation (TC #2, #16)', () => {
    const created = addTaxBracket(temp.sqlite, {
      lowerBoundMinor: 0,
      upperBoundMinor: 20_000_000,
      rateBp: 500,
      sortOrder: 1,
    });
    expect(created.id).toBeGreaterThan(0);
    expect(created.upperBoundMinor).toBe(20_000_000);

    const log = temp.sqlite
      .prepare(`SELECT * FROM audit_log WHERE entity_type = 'setting' AND action = 'create'`)
      .get() as { entity_id: number };
    expect(log.entity_id).toBe(created.id);
  });

  it('deleteTaxBracket removes tier and logs mutation (TC #4, #16)', () => {
    const id = insertBracket(0, 15_000_00, 500, 1);
    deleteTaxBracket(temp.sqlite, id);
    expect(getBrackets(temp.sqlite)).toHaveLength(0);

    const log = temp.sqlite
      .prepare(`SELECT * FROM audit_log WHERE entity_type = 'setting' AND action = 'delete'`)
      .get() as { entity_id: number };
    expect(log.entity_id).toBe(id);
  });

  it('validateBracketHierarchy checks contiguous non-overlapping bounds (TC #3)', () => {
    const valid = resetTaxBracketsToDefault(temp.sqlite);
    expect(() => validateBracketHierarchy(valid)).not.toThrow();

    const invalidFirst = [{ ...valid[0], lowerBoundMinor: 1000 }];
    expect(() => validateBracketHierarchy(invalidFirst)).toThrow(/must start at 0/);

    const gap = [
      { id: 1, taxYearId: null, lowerBoundMinor: 0, upperBoundMinor: 15_000_000, rateBp: 0, sortOrder: 1 },
      { id: 2, taxYearId: null, lowerBoundMinor: 20_000_000, upperBoundMinor: null, rateBp: 500, sortOrder: 2 },
    ];
    expect(() => validateBracketHierarchy(gap)).toThrow(/Gap or overlap/);
  });

  it('closed tax year rejects bracket modifications (TC #15)', () => {
    const yearId = Number(
      temp.sqlite
        .prepare(`INSERT INTO tax_years (year, status, closed_at) VALUES (2024, 'closed', '2025-03-31T00:00:00.000Z')`)
        .run().lastInsertRowid,
    );
    expect(() =>
      addTaxBracket(temp.sqlite, {
        taxYearId: yearId,
        lowerBoundMinor: 0,
        upperBoundMinor: null,
        rateBp: 0,
        sortOrder: 1,
      }),
    ).toThrow(/closed tax year/);
  });

  it('rejects an out-of-range rate', () => {
    const id = insertBracket(0, 15_000_00, 500, 1);
    expect(() => updateBracket(temp.sqlite, id, 10001)).toThrow(SettingsError);
  });
});
