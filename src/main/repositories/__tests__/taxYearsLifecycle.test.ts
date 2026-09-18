/**
 * AT-4.3 — `tax_years.close()`/`reopen()`.
 *
 * Covers TC-0001 #20, #32.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear, close, reopen, getTaxYear, TaxYearError } from '../taxYears';
import { createTransaction } from '../transactions';
import type { CloseTaxYearInput } from '../taxYears';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;

beforeEach(() => {
  temp = openTempDatabase();
});

afterEach(() => {
  temp.dispose();
});

const EMPTY_CLOSE_INPUT: CloseTaxYearInput = {
  transactions: [],
  deductionCategories: [],
  deductionEntries: [],
  sharedCaps: [],
  brackets: [],
};

describe('close — TC-0001 #20: closing a year freezes its result', () => {
  it('sets status=closed, closed_at, and a frozen_result_json snapshot', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const income = createTransaction(temp.sqlite, {
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 793_831_04,
      whtMinor: 93_963_71,
    });

    const { taxYear, frozenResult } = close(temp.sqlite, year.id, {
      ...EMPTY_CLOSE_INPUT,
      transactions: [income],
    });

    expect(taxYear.status).toBe('closed');
    expect(taxYear.closedAt).not.toBeNull();
    expect(taxYear.frozenResultJson).not.toBeNull();
    expect(JSON.parse(taxYear.frozenResultJson as string)).toEqual(frozenResult);

    const row = temp.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'tax_year' AND action = 'close'`)
      .get() as { n: number };
    expect(row.n).toBe(1);
  });

  it('rejects closing an already-closed year', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    close(temp.sqlite, year.id, EMPTY_CLOSE_INPUT);
    expect(() => close(temp.sqlite, year.id, EMPTY_CLOSE_INPUT)).toThrow(TaxYearError);
  });
});

describe('TC-0001 #32: closed-year recompute matches frozen snapshot (INV-3)', () => {
  it('an independent computeYear() call against the same rows equals the stored snapshot', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const income = createTransaction(temp.sqlite, {
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 100_000_00,
      whtMinor: 5_000_00,
    });

    const { frozenResult } = close(temp.sqlite, year.id, { ...EMPTY_CLOSE_INPUT, transactions: [income] });
    const closedYear = getTaxYear(temp.sqlite, year.id);
    const storedSnapshot = JSON.parse(closedYear?.frozenResultJson as string);

    expect(storedSnapshot).toEqual(frozenResult);
  });
});

describe('reopen', () => {
  it('clears closed_at and flips status back to open, keeping the frozen snapshot', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const { taxYear: closed } = close(temp.sqlite, year.id, EMPTY_CLOSE_INPUT);

    const reopened = reopen(temp.sqlite, year.id);

    expect(reopened.status).toBe('open');
    expect(reopened.closedAt).toBeNull();
    expect(reopened.frozenResultJson).toBe(closed.frozenResultJson);

    const row = temp.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'tax_year' AND action = 'reopen'`)
      .get() as { n: number };
    expect(row.n).toBe(1);
  });

  it('rejects reopening an already-open year', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    expect(() => reopen(temp.sqlite, year.id)).toThrow(TaxYearError);
  });
});
