/**
 * AT-3.2 — deduction cap-shape calculator.
 *
 * Covers TC-0001 #6, #7, #8, #9, #10.
 */
import { describe, expect, it } from 'vitest';

import type { DeductionCategoryRow, DeductionEntryRow, SharedCapRow } from '../../db/schema';
import { computeDeductions } from '../deductions';

let nextEntryId = 1;

function category(overrides: Partial<DeductionCategoryRow> & Pick<DeductionCategoryRow, 'id' | 'capType'>): DeductionCategoryRow {
  return {
    code: `cat-${overrides.id}`,
    name: `Category ${overrides.id}`,
    capAmountMinor: null,
    sharedGroupId: null,
    sortOrder: 0,
    description: '',
    isActive: true,
    isBuiltin: false,
    ...overrides,
  };
}

function entry(categoryId: number, amountMinor: number, count: number | null = null): DeductionEntryRow {
  return { id: nextEntryId++, taxYearId: 1, categoryId, amountMinor, count, updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('TC-0001 #6: fixed cap, at or below', () => {
  it('uses the full entered amount when at or below the cap', () => {
    const donation = category({ id: 1, capType: 'fixed', capAmountMinor: 100_000_00 });
    const result = computeDeductions([donation], [entry(1, 60_000_00)], []);

    expect(result.perCategory[0].effectiveMinor).toBe(60_000_00);
    expect(result.perCategory[0].cappedByOwnCap).toBe(false);
    expect(result.totalMinor).toBe(60_000_00);
  });
});

describe('TC-0001 #7: fixed cap, exceeding', () => {
  it('uses only the cap amount and flags it as capped', () => {
    const donation = category({ id: 1, capType: 'fixed', capAmountMinor: 100_000_00 });
    const result = computeDeductions([donation], [entry(1, 150_000_00)], []);

    expect(result.perCategory[0].effectiveMinor).toBe(100_000_00);
    expect(result.perCategory[0].cappedByOwnCap).toBe(true);
    expect(result.totalMinor).toBe(100_000_00);
  });
});

describe('TC-0001 #8: per-count cap scales with count', () => {
  it('multiplies the per-unit cap by count, not the flat per-unit amount', () => {
    const children = category({ id: 1, capType: 'per_count', capAmountMinor: 30_000_00 });
    const result = computeDeductions([children], [entry(1, 70_000_00, 2)], []);

    // effective cap = 30,000 * 2 = 60,000, not 30,000.
    expect(result.perCategory[0].effectiveMinor).toBe(60_000_00);
    expect(result.perCategory[0].cappedByOwnCap).toBe(true);
  });
});

describe('TC-0001 #9: shared-group cap sums across categories', () => {
  it('caps the combined contribution at the group total, once it is exceeded', () => {
    const group: SharedCapRow = { id: 1, name: 'Life+Health', capAmountMinor: 100_000_00 };
    const life = category({ id: 1, capType: 'shared_group_member', sharedGroupId: 1 });
    const health = category({ id: 2, capType: 'shared_group_member', sharedGroupId: 1 });

    const result = computeDeductions(
      [life, health],
      [entry(1, 60_000_00), entry(2, 70_000_00)],
      [group],
    );

    expect(result.sharedGroups[0].rawTotalMinor).toBe(130_000_00);
    expect(result.sharedGroups[0].cappedTotalMinor).toBe(100_000_00);
    expect(result.totalMinor).toBe(100_000_00);
  });
});

describe('TC-0001 #10: a shared-group member\'s own sub-cap still applies', () => {
  it('limits that member to its own sub-cap even while the group total is still under its cap', () => {
    const group: SharedCapRow = { id: 1, name: 'Life+Health', capAmountMinor: 100_000_00 };
    const life = category({ id: 1, capType: 'shared_group_member', sharedGroupId: 1 });
    const healthSelf = category({
      id: 2,
      capType: 'shared_group_member',
      sharedGroupId: 1,
      capAmountMinor: 25_000_00,
    });

    const result = computeDeductions(
      [life, healthSelf],
      [entry(1, 20_000_00), entry(2, 30_000_00)],
      [group],
    );

    const healthEntry = result.perCategory.find((p) => p.categoryId === 2);
    expect(healthEntry?.effectiveMinor).toBe(25_000_00); // capped by its own 25,000 sub-cap
    expect(healthEntry?.cappedByOwnCap).toBe(true);
    // Group total after sub-caps: 20,000 + 25,000 = 45,000 -- still under the 100,000 group cap.
    expect(result.sharedGroups[0].rawTotalMinor).toBe(45_000_00);
    expect(result.sharedGroups[0].cappedTotalMinor).toBe(45_000_00);
    expect(result.totalMinor).toBe(45_000_00);
  });
});

describe('mixed categories', () => {
  it('sums non-grouped categories and grouped categories together', () => {
    const donation = category({ id: 1, capType: 'fixed', capAmountMinor: 100_000_00 });
    const group: SharedCapRow = { id: 1, name: 'Life+Health', capAmountMinor: 100_000_00 };
    const life = category({ id: 2, capType: 'shared_group_member', sharedGroupId: 1 });

    const result = computeDeductions(
      [donation, life],
      [entry(1, 50_000_00), entry(2, 20_000_00)],
      [group],
    );

    expect(result.totalMinor).toBe(70_000_00);
  });
});
