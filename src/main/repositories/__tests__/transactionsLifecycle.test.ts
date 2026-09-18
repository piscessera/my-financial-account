/**
 * AT-2.3 — `transactions.update` / `createReversal` / `getHistory`.
 *
 * Covers TC-0001 #16, #18, #19, #24.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear, setStatusForTest } from '../taxYears';
import {
  TransactionError,
  createReversal,
  createTransaction,
  getTransactionHistory,
  updateTransaction,
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

describe('updateTransaction — TC-0001 #16: edit while year open', () => {
  it('updates the amount and records an audit_log row with before/after', () => {
    const created = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });

    const updated = updateTransaction(temp.sqlite, created.id, { amountMinor: 1_500_000 });

    expect(updated.amountMinor).toBe(1_500_000);
    const history = getTransactionHistory(temp.sqlite, created.id);
    const updateEntry = history.find((entry) => entry.action === 'update');
    expect(updateEntry).toBeDefined();
    expect((updateEntry?.before as { amountMinor: number }).amountMinor).toBe(1_000_000);
    expect((updateEntry?.after as { amountMinor: number }).amountMinor).toBe(1_500_000);
  });
});

describe('updateTransaction — TC-0001 #18: rejected on closed year', () => {
  it('throws and leaves the row unchanged when the tax year is closed', () => {
    const created = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });
    setStatusForTest(temp.sqlite, taxYearId, 'closed');

    expect(() => updateTransaction(temp.sqlite, created.id, { amountMinor: 2_000_000 })).toThrow(
      TransactionError,
    );

    const history = getTransactionHistory(temp.sqlite, created.id);
    expect(history.some((entry) => entry.action === 'update')).toBe(false);
  });
});

describe('createReversal — TC-0001 #19: reversal entry after close', () => {
  it('creates a new transaction with reversal_of_id set; both remain visible', () => {
    const original = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });
    setStatusForTest(temp.sqlite, taxYearId, 'closed');

    const reversal = createReversal(temp.sqlite, original.id, { date: '2026-04-01' });

    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.amountMinor).toBe(-1_000_000);
    expect(reversal.kind).toBe(original.kind);
    expect(reversal.incomeSection).toBe(original.incomeSection);

    // Both rows still exist and are readable — nothing was removed or hidden.
    const all = temp.sqlite.prepare(`SELECT id, status FROM transactions ORDER BY id ASC`).all();
    expect(all).toHaveLength(2);
  });

  it('rejects a reversal when the original transaction\'s tax year is still open', () => {
    const original = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });

    expect(() => createReversal(temp.sqlite, original.id, { date: '2026-04-01' })).toThrow(
      TransactionError,
    );
  });
});

describe('TC-0001 #24: every mutation writes exactly one audit_log row', () => {
  it('covers create, update, and reverse', () => {
    const created = createTransaction(temp.sqlite, {
      taxYearId,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });
    updateTransaction(temp.sqlite, created.id, { amountMinor: 1_200_000 });
    setStatusForTest(temp.sqlite, taxYearId, 'closed');
    createReversal(temp.sqlite, created.id, { date: '2026-04-01' });

    const history = getTransactionHistory(temp.sqlite, created.id);
    expect(history.map((entry) => entry.action)).toEqual(['create', 'update']);
  });
});
