/**
 * `calc.computeYear()` (AT-4.2, ANA-0001 §API/backend changes) — assembles a tax year's
 * income, expenses, deductions, WHT, and bracket calculation into the full result. **Pure
 * function**, no DB access: the caller (IPC handler, AT-4.5) reads the year's transactions/
 * deductions/settings via the repositories and hands them here. No hidden state (INV-3): the
 * same inputs always reproduce the same result, which is what makes a closed year's frozen
 * snapshot verifiable by recomputing.
 *
 * `WHERE tax_relevant = true` (INV-8, TC-0001 #35): every sum below only ever looks at
 * `taxRelevant` transactions. A general (non-tax) transaction never reaches any figure here —
 * not because of a filter bolted on at the end, but because `activeTaxRelevant` is the single
 * base list every other sum derives from.
 */
import { computeTax, type ComputeTaxResult } from './brackets';
import { computeDeductions, type ComputeDeductionsResult } from './deductions';
import { computeExpenseDeduction } from './expenseMethod';
import { assertSatang, type Satang } from './money';
import type {
  DeductionCategoryRow,
  DeductionEntryRow,
  SharedCapRow,
  TaxBracketRow,
  TaxYearRow,
  TransactionRow,
} from '../db/schema';

export interface ComputeYearInput {
  readonly taxYear: TaxYearRow;
  /** Every transaction for this year, any status/tax-relevance — this function does its own filtering. */
  readonly transactions: readonly TransactionRow[];
  readonly deductionCategories: readonly DeductionCategoryRow[];
  readonly deductionEntries: readonly DeductionEntryRow[];
  readonly sharedCaps: readonly SharedCapRow[];
  readonly brackets: readonly TaxBracketRow[];
}

export interface IncomeBySection {
  readonly section40_1Minor: Satang;
  readonly section40_2Minor: Satang;
  readonly section40_5_8Minor: Satang;
}

export interface ComputeYearResult {
  readonly totalIncomeMinor: Satang;
  readonly incomeBySection: IncomeBySection;
  /** Sum of recorded (tax-relevant, active) expense transactions — informational; only
   *  {@link expenseDeductionMinor} actually reduces taxable income (per the expense method). */
  readonly totalExpenseMinor: Satang;
  /** What `expenseMethod.ts` actually deducts from 40(5)-(8) income. 0 if no method is chosen yet. */
  readonly expenseDeductionMinor: Satang;
  readonly deductions: ComputeDeductionsResult;
  readonly totalDeductionsMinor: Satang;
  /** `max(totalIncome - expenseDeduction - totalDeductions, 0)` — never negative (TC-0001 #12). */
  readonly netTaxableMinor: Satang;
  readonly bracket: ComputeTaxResult;
  readonly taxTotalMinor: Satang;
  readonly whtTotalMinor: Satang;
  readonly balance: { readonly direction: 'due' | 'refund'; readonly amountMinor: Satang };
}

function sumWhere(
  transactions: readonly TransactionRow[],
  predicate: (t: TransactionRow) => boolean,
): Satang {
  return transactions.filter(predicate).reduce((sum, t) => sum + t.amountMinor, 0);
}

export function computeYear(input: ComputeYearInput): ComputeYearResult {
  // The one filter every figure below derives from (INV-8): tax-relevant AND active. A voided
  // row (TC-0001 #17's "no hard delete" path) contributes nothing, same as a general
  // transaction contributes nothing — both are excluded here, not specially cased later.
  const activeTaxRelevant = input.transactions.filter(
    (t) => t.taxRelevant && t.status === 'active',
  );

  const incomeBySection: IncomeBySection = {
    section40_1Minor: sumWhere(
      activeTaxRelevant,
      (t) => t.kind === 'income' && t.incomeSection === '40_1',
    ),
    section40_2Minor: sumWhere(
      activeTaxRelevant,
      (t) => t.kind === 'income' && t.incomeSection === '40_2',
    ),
    section40_5_8Minor: sumWhere(
      activeTaxRelevant,
      (t) => t.kind === 'income' && t.incomeSection === '40_5_8',
    ),
  };
  const totalIncomeMinor =
    incomeBySection.section40_1Minor +
    incomeBySection.section40_2Minor +
    incomeBySection.section40_5_8Minor;

  const totalExpenseMinor = sumWhere(activeTaxRelevant, (t) => t.kind === 'expense');
  const whtTotalMinor = activeTaxRelevant.reduce((sum, t) => sum + t.whtMinor, 0);

  const expenseDeductionMinor =
    input.taxYear.expenseMethod === null
      ? 0
      : computeExpenseDeduction({
          method: input.taxYear.expenseMethod,
          incomeMinor: incomeBySection.section40_5_8Minor,
          lumpSumRateBp: input.taxYear.lumpSumRateBp,
          actualExpensesMinor: totalExpenseMinor,
        });

  const deductions = computeDeductions(
    input.deductionCategories,
    input.deductionEntries,
    input.sharedCaps,
  );
  const totalDeductionsMinor = deductions.totalMinor;

  const netTaxableMinor = Math.max(
    totalIncomeMinor - expenseDeductionMinor - totalDeductionsMinor,
    0,
  );
  assertSatang(netTaxableMinor);

  const bracket = computeTax(netTaxableMinor, input.brackets);
  const taxTotalMinor = bracket.totalTaxMinor;

  const balance =
    taxTotalMinor >= whtTotalMinor
      ? { direction: 'due' as const, amountMinor: taxTotalMinor - whtTotalMinor }
      : { direction: 'refund' as const, amountMinor: whtTotalMinor - taxTotalMinor };

  return {
    totalIncomeMinor,
    incomeBySection,
    totalExpenseMinor,
    expenseDeductionMinor,
    deductions,
    totalDeductionsMinor,
    netTaxableMinor,
    bracket,
    taxTotalMinor,
    whtTotalMinor,
    balance,
  };
}
