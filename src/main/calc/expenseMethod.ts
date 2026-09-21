/**
 * 40(5)-(8) expense-method calculator (AT-3.3) — a pure helper the calc engine (AT-4.2) uses
 * to turn a tax year's `expense_method` choice into a deduction from 40(5)-(8) income.
 *
 * `lump_sum`: deducts `income × lumpSumRateBp` (ANA-0001's `tax_years.lump_sum_rate_bp`, the
 * one rate the user configures per year — this app stores no separate statutory ceiling
 * beyond that single rate; TC-0001 #3's "(capped per law)" is real-world flavor for the test
 * scenario, not an additional schema field this repository/calculator tracks).
 * `actual`: deducts the sum of the year's recorded (tax-relevant) expense transactions,
 * instead of any rate.
 *
 * Integer satang × integer basis-point rate, half-up rounded via `BigInt` — same convention as
 * `calc/money.ts`/the bracket calculator (AT-4.1), never a float.
 */
import type { ExpenseMethod } from '../db/schema';
import { assertSatang, type Satang } from './money';

export class ExpenseMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpenseMethodError';
  }
}

/** `income × rateBp / 10000`, half-up rounded to the nearest satang. */
export function computeLumpSumDeduction(incomeMinor: Satang, lumpSumRateBp: number): Satang {
  assertSatang(incomeMinor);
  if (!Number.isSafeInteger(lumpSumRateBp) || lumpSumRateBp < 0 || lumpSumRateBp > 10000) {
    throw new ExpenseMethodError(
      `lumpSumRateBp must be an integer in [0, 10000], got ${String(lumpSumRateBp)}.`,
    );
  }
  if (incomeMinor < 0) {
    throw new ExpenseMethodError(`incomeMinor must be non-negative, got ${incomeMinor}.`);
  }

  const product = BigInt(incomeMinor) * BigInt(lumpSumRateBp);
  const quotient = product / 10_000n;
  const remainder = product % 10_000n;
  const roundedUp = remainder * 2n >= 10_000n; // half-up
  return Number(roundedUp ? quotient + 1n : quotient);
}

export interface ComputeExpenseDeductionInput {
  readonly method: ExpenseMethod;
  /** Total 40(5)-(8) income for the year, satang. */
  readonly incomeMinor: Satang;
  /** Required when `method === 'lump_sum'`. */
  readonly lumpSumRateBp?: number | null;
  /** Sum of the year's recorded expense transactions, satang. Required when `method === 'actual'`. */
  readonly actualExpensesMinor?: number;
}

/**
 * The deduction from 40(5)-(8) income for the year's chosen expense method (TC-0001 #3/#4).
 * A pure dispatch over {@link computeLumpSumDeduction} vs. the already-summed actual expenses
 * — the caller (`calc.computeYear()`, AT-4.2) is responsible for producing `incomeMinor`/
 * `actualExpensesMinor` from the year's transactions.
 */
export function computeExpenseDeduction(input: ComputeExpenseDeductionInput): Satang {
  if (input.method === 'lump_sum') {
    if (input.lumpSumRateBp == null) {
      throw new ExpenseMethodError('lumpSumRateBp is required when method is "lump_sum".');
    }
    return computeLumpSumDeduction(input.incomeMinor, input.lumpSumRateBp);
  }

  const actual = input.actualExpensesMinor ?? 0;
  if (!Number.isSafeInteger(actual) || actual < 0) {
    throw new ExpenseMethodError(
      `actualExpensesMinor must be a non-negative integer, got ${String(actual)}.`,
    );
  }
  return actual;
}
