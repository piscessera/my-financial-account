/**
 * AT-2.1 — `tax_years` repository.
 *
 * Done-criterion: unit tests incl. two years open simultaneously (TC-0001 #22 / AC-7c).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import {
  TaxYearError,
  createTaxYear,
  getTaxYear,
  listTaxYears,
  setExpenseMethod,
  setStatusForTest,
} from '../taxYears';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;

beforeEach(() => {
  temp = openTempDatabase();
});

afterEach(() => {
  temp.dispose();
});

function countAuditRows(entityType: string, action: string): number {
  const row = temp.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = ? AND action = ?`)
    .get(entityType, action) as { n: number };
  return row.n;
}

describe('createTaxYear', () => {
  it('creates an open tax year with no expense method, and audit-logs the create', () => {
    const row = createTaxYear(temp.sqlite, { year: 2569 });

    expect(row.year).toBe(2569);
    expect(row.status).toBe('open');
    expect(row.expenseMethod).toBeNull();
    expect(row.closedAt).toBeNull();
    expect(countAuditRows('tax_year', 'create')).toBe(1);
  });

  it('rejects a duplicate year', () => {
    createTaxYear(temp.sqlite, { year: 2569 });
    expect(() => createTaxYear(temp.sqlite, { year: 2569 })).toThrow(TaxYearError);
  });
});

describe('multiple open tax years (TC-0001 #22 / AC-7c)', () => {
  it('lets two years be open simultaneously, each independently scoped', () => {
    const y2569 = createTaxYear(temp.sqlite, { year: 2569 });
    const y2570 = createTaxYear(temp.sqlite, { year: 2570 });

    expect(getTaxYear(temp.sqlite, y2569.id)?.status).toBe('open');
    expect(getTaxYear(temp.sqlite, y2570.id)?.status).toBe('open');

    // Changing one year's expense method never touches the other's row.
    setExpenseMethod(temp.sqlite, { id: y2570.id, expenseMethod: 'actual' });

    const refreshed2569 = getTaxYear(temp.sqlite, y2569.id);
    const refreshed2570 = getTaxYear(temp.sqlite, y2570.id);
    expect(refreshed2569?.expenseMethod).toBeNull();
    expect(refreshed2570?.expenseMethod).toBe('actual');

    const all = listTaxYears(temp.sqlite);
    expect(all.map((r) => r.year)).toEqual([2569, 2570]);
  });
});

describe('setExpenseMethod', () => {
  it('sets lump_sum with a rate, and audit-logs the update', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const updated = setExpenseMethod(temp.sqlite, {
      id: year.id,
      expenseMethod: 'lump_sum',
      lumpSumRateBp: 6000,
    });

    expect(updated.expenseMethod).toBe('lump_sum');
    expect(updated.lumpSumRateBp).toBe(6000);
    expect(countAuditRows('tax_year', 'update')).toBe(1);
  });

  it('sets actual with no rate', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const updated = setExpenseMethod(temp.sqlite, { id: year.id, expenseMethod: 'actual' });

    expect(updated.expenseMethod).toBe('actual');
    expect(updated.lumpSumRateBp).toBeNull();
  });

  it('rejects lump_sum without a rate', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    expect(() =>
      setExpenseMethod(temp.sqlite, { id: year.id, expenseMethod: 'lump_sum' }),
    ).toThrow(TaxYearError);
  });

  it('rejects a rate outside [0, 10000] bp', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    expect(() =>
      setExpenseMethod(temp.sqlite, { id: year.id, expenseMethod: 'lump_sum', lumpSumRateBp: 10001 }),
    ).toThrow(TaxYearError);
  });

  it('rejects a rate given alongside actual', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    expect(() =>
      setExpenseMethod(temp.sqlite, { id: year.id, expenseMethod: 'actual', lumpSumRateBp: 100 }),
    ).toThrow(TaxYearError);
  });
});

describe('setStatusForTest', () => {
  it('forces status to closed and sets closed_at, without an audit row', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const before = countAuditRows('tax_year', 'close');

    const closed = setStatusForTest(temp.sqlite, year.id, 'closed');

    expect(closed.status).toBe('closed');
    expect(closed.closedAt).not.toBeNull();
    expect(countAuditRows('tax_year', 'close')).toBe(before);
  });

  it('forces status back to open and clears closed_at', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    setStatusForTest(temp.sqlite, year.id, 'closed');

    const reopened = setStatusForTest(temp.sqlite, year.id, 'open');

    expect(reopened.status).toBe('open');
    expect(reopened.closedAt).toBeNull();
  });
});
