/**
 * AT-2.2 — `transactions` repository (`create`/`void`).
 *
 * Covers TC-0001 #1, #1a, #2, #17, #34.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear } from '../taxYears';
import {
  TransactionError,
  createTransaction,
  getTransaction,
  listByYear,
  voidTransaction,
} from '../transactions';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;
let taxYearId: number;

beforeEach(() => {
  temp = openTempDatabase();
  taxYearId = createTaxYear(temp.sqlite, { year: 2569 }).id;
});

afterEach(() => {
  temp.dispose();
});

function countAuditRows(action: string): number {
  const row = temp.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'transaction' AND action = ?`)
    .get(action) as { n: number };
  return row.n;
}

describe('createTransaction — TC-0001 #1: income happy path', () => {
  it('stores the entered values, including the payer tax ID, and appears in the ledger', () => {
    const row = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 5_000_000,
      whtMinor: 150_000,
      sourcePayer: 'ACME Co., Ltd.',
      payerTaxId: '1234567890123',
      note: 'March salary',
    });

    expect(row.taxYearId).toBe(taxYearId);
    expect(row.kind).toBe('income');
    expect(row.taxRelevant).toBe(true);
    expect(row.incomeSection).toBe('40_1');
    expect(row.amountMinor).toBe(5_000_000);
    expect(row.whtMinor).toBe(150_000);
    expect(row.sourcePayer).toBe('ACME Co., Ltd.');
    expect(row.payerTaxId).toBe('1234567890123');
    expect(row.status).toBe('active');
    expect(row.currency).toBe('THB');
    expect(getTransaction(temp.sqlite, row.id)).toEqual(row);
    expect(countAuditRows('create')).toBe(1);
  });
});

describe('createTransaction — TC-0001 #1a: payer tax ID optional', () => {
  it('stores successfully with payer_tax_id null when left blank', () => {
    const row = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_2',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });

    expect(row.payerTaxId).toBeNull();
  });
});

describe('createTransaction — TC-0001 #2: reject missing required field', () => {
  it('rejects an income transaction with no incomeSection, and stores nothing', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'income',
        date: '2026-03-15',
        amountMinor: 1_000_000,
      }),
    ).toThrow(TransactionError);

    const row = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM transactions`).get() as {
      n: number;
    };
    expect(row.n).toBe(0);
  });

  it('rejects a general transaction with no generalCategory', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'expense',
        taxRelevant: false,
        date: '2026-03-15',
        amountMinor: 1_000_000,
      }),
    ).toThrow(TransactionError);
  });

  it('rejects a non-integer / zero amount', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'income',
        incomeSection: '40_1',
        date: '2026-03-15',
        amountMinor: 0,
      }),
    ).toThrow(TransactionError);
  });

  it('rejects a malformed date', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'income',
        incomeSection: '40_1',
        date: '15-03-2026',
        amountMinor: 1_000_000,
      }),
    ).toThrow(TransactionError);
  });
});

describe('createTransaction — TC-0001 #34: general (non-tax) transaction', () => {
  it('stores with tax_relevant=false and a general category, no income section/WHT required', () => {
    const row = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'food',
      date: '2026-03-15',
      amountMinor: 250_00,
    });

    expect(row.taxRelevant).toBe(false);
    expect(row.generalCategory).toBe('food');
    expect(row.incomeSection).toBeNull();
    expect(row.whtMinor).toBe(0);
  });

  it('rejects a general transaction that also carries an income section', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'income',
        taxRelevant: false,
        generalCategory: 'other',
        incomeSection: '40_1',
        date: '2026-03-15',
        amountMinor: 1_000_000,
      }),
    ).toThrow(TransactionError);
  });
});

describe('listByYear', () => {
  it('returns every transaction for a tax year, date-ordered, and none from another year', () => {
    const otherYearId = createTaxYear(temp.sqlite, { year: 2570 }).id;
    createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-05-01',
      amountMinor: 500_000,
    });
    createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-01-01',
      amountMinor: 200_000,
    });
    createTransaction(temp.sqlite, {
      taxYearId: otherYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-01-01',
      amountMinor: 999_999,
    });

    const list = listByYear(temp.sqlite, taxYearId);
    expect(list.map((t) => t.amountMinor)).toEqual([200_000, 500_000]);
  });
});

describe('voidTransaction — TC-0001 #17: no hard delete, only voiding', () => {
  it('sets status to voided, preserving the row', () => {
    const created = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });

    const voided = voidTransaction(temp.sqlite, created.id);

    expect(voided.status).toBe('voided');
    expect(voided.id).toBe(created.id);
    expect(voided.amountMinor).toBe(created.amountMinor);
    expect(getTransaction(temp.sqlite, created.id)?.status).toBe('voided');
    expect(countAuditRows('void')).toBe(1);
  });

  it('rejects voiding an already-voided transaction', () => {
    const created = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });
    voidTransaction(temp.sqlite, created.id);

    expect(() => voidTransaction(temp.sqlite, created.id)).toThrow(TransactionError);
  });
});

describe('createTransaction — REQ-0008: custom deduction amount & INV-8', () => {
  it('stores custom deductionAmountMinor on income and expense transactions', () => {
    temp.sqlite
      .prepare(
        `INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, sort_order) VALUES ('life', 'Life', 'fixed', 10000000, 1), ('sso', 'SSO', 'fixed', 900000, 2)`,
      )
      .run();

    const expense = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'other',
      deductionCategoryId: 1,
      deductionAmountMinor: 10_000_00,
      date: '2026-03-15',
      amountMinor: 15_000_00,
    });
    expect(expense.deductionCategoryId).toBe(1);
    expect(expense.deductionAmountMinor).toBe(10_000_00);

    const income = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      taxRelevant: true,
      incomeSection: '40_1',
      deductionCategoryId: 2,
      deductionAmountMinor: 5_000_00,
      date: '2026-03-15',
      amountMinor: 50_000_00,
    });
    expect(income.deductionCategoryId).toBe(2);
    expect(income.deductionAmountMinor).toBe(5_000_00);
  });

  it('rejects deductionAmountMinor > amountMinor (INV-8)', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'expense',
        taxRelevant: false,
        generalCategory: 'other',
        deductionCategoryId: 1,
        deductionAmountMinor: 20_000_00,
        date: '2026-03-15',
        amountMinor: 15_000_00,
      }),
    ).toThrow(TransactionError);
  });

  it('rejects non-positive deductionAmountMinor', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'expense',
        taxRelevant: false,
        generalCategory: 'other',
        deductionCategoryId: 1,
        deductionAmountMinor: 0,
        date: '2026-03-15',
        amountMinor: 15_000_00,
      }),
    ).toThrow(TransactionError);
  });

  it('rejects deductionAmountMinor when deductionCategoryId is omitted', () => {
    expect(() =>
      createTransaction(temp.sqlite, {
        taxYearId,
        kind: 'expense',
        taxRelevant: false,
        generalCategory: 'other',
        deductionAmountMinor: 5_000_00,
        date: '2026-03-15',
        amountMinor: 15_000_00,
      }),
    ).toThrow(TransactionError);
  });
});

