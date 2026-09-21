/**
 * AT-4.4 — closed-year read path (`getYearResult`).
 *
 * Covers TC-0001 #27.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { close, createTaxYear, getYearResult, type CloseTaxYearInput } from '../taxYears';
import { createTransaction } from '../transactions';
import type { DeductionCategoryRow, DeductionEntryRow } from '../../db/schema';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;

beforeEach(() => {
  temp = openTempDatabase();
});

afterEach(() => {
  temp.dispose();
});

const donation: DeductionCategoryRow = {
  id: 1,
  taxYearId: null,
  code: 'donation',
  name: 'Donation',
  capType: 'fixed',
  capAmountMinor: 100_000_00,
  sharedGroupId: null,
  sortOrder: 0,
  description: '',
  isActive: true,
  isBuiltin: false,
};

function entryFor(taxYearId: number): DeductionEntryRow {
  return {
    id: 1,
    taxYearId,
    categoryId: 1,
    amountMinor: 80_000_00,
    count: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('TC-0001 #27: setting change applies to open years only going forward', () => {
  it("a closed year's served result ignores a cap edit made after close; an open year's does not", () => {
    const closedYear = createTaxYear(temp.sqlite, { year: 2568 });
    const openYear = createTaxYear(temp.sqlite, { year: 2569 });
    const closedIncome = createTransaction(temp.sqlite, {
      taxYearId: closedYear.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2025-03-15',
      amountMinor: 300_000_00,
    });
    const openIncome = createTransaction(temp.sqlite, {
      taxYearId: openYear.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 300_000_00,
    });

    const closeInput: CloseTaxYearInput = {
      transactions: [closedIncome],
      deductionCategories: [donation],
      deductionEntries: [entryFor(closedYear.id)],
      sharedCaps: [],
      brackets: [],
    };
    const { taxYear: closedAfter } = close(temp.sqlite, closedYear.id, closeInput);
    const frozenTotalDeductions = closedAfter.frozenResultJson
      ? (JSON.parse(closedAfter.frozenResultJson) as { totalDeductionsMinor: number })
          .totalDeductionsMinor
      : NaN;
    expect(frozenTotalDeductions).toBe(80_000_00);

    // The cap is edited *after* close: 100,000 -> 50,000. The closed year's served result must
    // still show its original 80,000 deduction (never re-evaluated against the new cap).
    const editedDonation: DeductionCategoryRow = { ...donation, capAmountMinor: 50_000_00 };

    const closedResult = getYearResult(closedAfter, {
      transactions: [closedIncome],
      deductionCategories: [editedDonation],
      deductionEntries: [entryFor(closedYear.id)],
      sharedCaps: [],
      brackets: [],
    });
    expect(closedResult.totalDeductionsMinor).toBe(80_000_00); // unchanged, frozen

    // The open year, by contrast, is a live recompute -- it DOES reflect the new (lower) cap.
    const openResult = getYearResult(openYear, {
      transactions: [openIncome],
      deductionCategories: [editedDonation],
      deductionEntries: [entryFor(openYear.id)],
      sharedCaps: [],
      brackets: [],
    });
    expect(openResult.totalDeductionsMinor).toBe(50_000_00); // capped at the new, lower amount
  });
});
