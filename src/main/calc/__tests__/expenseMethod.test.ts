/**
 * AT-3.3 — 40(5)-(8) expense-method calculator.
 *
 * Covers TC-0001 #3, #4.
 */
import { describe, expect, it } from 'vitest';

import {
  ExpenseMethodError,
  computeExpenseDeduction,
  computeLumpSumDeduction,
} from '../expenseMethod';

describe('computeLumpSumDeduction', () => {
  it('deducts income x rate, half-up rounded', () => {
    // 1,000,000.00 baht income x 60% = 600,000.00 baht deduction.
    expect(computeLumpSumDeduction(100_000_000, 6000)).toBe(60_000_000);
  });

  it('rounds half-up at the satang', () => {
    // 333 satang x 3333bp / 10000 = 110.9889 -> rounds to 111.
    expect(computeLumpSumDeduction(333, 3333)).toBe(111);
  });

  it('rejects a rate outside [0, 10000]', () => {
    expect(() => computeLumpSumDeduction(100_000_00, 10001)).toThrow(ExpenseMethodError);
  });

  it('rejects negative income', () => {
    expect(() => computeLumpSumDeduction(-1, 6000)).toThrow(ExpenseMethodError);
  });
});

describe('computeExpenseDeduction — TC-0001 #3: lump-sum method', () => {
  it('deducts income x rate instead of any recorded expenses', () => {
    const deduction = computeExpenseDeduction({
      method: 'lump_sum',
      incomeMinor: 100_000_000,
      lumpSumRateBp: 6000,
      actualExpensesMinor: 999_999_99, // must be ignored under lump_sum
    });
    expect(deduction).toBe(60_000_000);
  });

  it('rejects lump_sum without a rate', () => {
    expect(() => computeExpenseDeduction({ method: 'lump_sum', incomeMinor: 100_000_00 })).toThrow(
      ExpenseMethodError,
    );
  });
});

describe('computeExpenseDeduction — TC-0001 #4: actual-expense method', () => {
  it('deducts the total recorded expenses, not any rate', () => {
    const deduction = computeExpenseDeduction({
      method: 'actual',
      incomeMinor: 100_000_000,
      actualExpensesMinor: 42_000_00,
    });
    expect(deduction).toBe(42_000_00);
  });

  it('defaults to 0 when no expenses were recorded', () => {
    expect(computeExpenseDeduction({ method: 'actual', incomeMinor: 100_000_00 })).toBe(0);
  });
});
