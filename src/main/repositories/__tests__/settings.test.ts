/**
 * AT-3.1, AT-1.2 — `shared_caps`/`tax_brackets` repository.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import {
  SettingsError,
  addTaxBracket,
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

  it('updateSharedCap edits the group total and audit-logs it', () => {
    const id = insertSharedCap('Life+Health Insurance', 100_000_00);
    const updated = updateSharedCap(temp.sqlite, id, 120_000_00);

    expect(updated.capAmountMinor).toBe(120_000_00);
    const row = temp.sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'setting' AND entity_id = ?`,
      )
      .get(id) as { n: number };
    expect(row.n).toBe(1);
  });

  it('rejects a negative cap', () => {
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
