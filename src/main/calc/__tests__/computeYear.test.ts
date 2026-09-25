/**
 * AT-4.2 — `calc.computeYear()`.
 *
 * Covers TC-0001 #13, #14, #35, plus general-transaction exclusion (INV-8) and the
 * negative-taxable-income floor (shares TC-0001 #12's rule, exercised end-to-end here).
 */
import { describe, expect, it } from 'vitest';

import type {
  DeductionCategoryRow,
  DeductionEntryRow,
  SharedCapRow,
  TaxBracketRow,
  TaxYearRow,
  TransactionRow,
} from '../../db/schema';
import { parseBahtToSatang } from '../money';
import { computeYear } from '../computeYear';

const TAX_2025_BRACKETS: TaxBracketRow[] = [
  { id: 1, taxYearId: null, lowerBoundMinor: 0, upperBoundMinor: 150_000_00, rateBp: 0, sortOrder: 1 },
  { id: 2, taxYearId: null, lowerBoundMinor: 150_000_00, upperBoundMinor: 300_000_00, rateBp: 500, sortOrder: 2 },
  { id: 3, taxYearId: null, lowerBoundMinor: 300_000_00, upperBoundMinor: 500_000_00, rateBp: 1000, sortOrder: 3 },
  { id: 4, taxYearId: null, lowerBoundMinor: 500_000_00, upperBoundMinor: 750_000_00, rateBp: 1500, sortOrder: 4 },
  { id: 5, taxYearId: null, lowerBoundMinor: 750_000_00, upperBoundMinor: 1_000_000_00, rateBp: 2000, sortOrder: 5 },
  {
    id: 6,
    taxYearId: null,
    lowerBoundMinor: 1_000_000_00,
    upperBoundMinor: 2_000_000_00,
    rateBp: 2500,
    sortOrder: 6,
  },
  {
    id: 7,
    taxYearId: null,
    lowerBoundMinor: 2_000_000_00,
    upperBoundMinor: 5_000_000_00,
    rateBp: 3000,
    sortOrder: 7,
  },
  { id: 8, taxYearId: null, lowerBoundMinor: 5_000_000_00, upperBoundMinor: null, rateBp: 3500, sortOrder: 8 },
];

const YEAR_NO_METHOD: TaxYearRow = {
  id: 1,
  year: 2569,
  status: 'open',
  expenseMethod: null,
  lumpSumRateBp: null,
  closedAt: null,
  frozenResultJson: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let nextTxId = 1;

function tx(overrides: Partial<TransactionRow> & Pick<TransactionRow, 'kind'>): TransactionRow {
  return {
    id: nextTxId++,
    taxYearId: 1,
    taxRelevant: true,
    incomeSection: null,
    generalCategory: null,
    date: '2026-03-15',
    amountMinor: 0,
    currency: 'THB',
    whtMinor: 0,
    sourcePayer: null,
    payerTaxId: null,
    note: null,
    status: 'active',
    reversalOfId: null,
    deductionCategoryId: null,
    deductionAmountMinor: null,
    source: 'manual',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

const NO_DEDUCTIONS: {
  categories: DeductionCategoryRow[];
  entries: DeductionEntryRow[];
  sharedCaps: SharedCapRow[];
} = {
  categories: [],
  entries: [],
  sharedCaps: [],
};

describe('TC-0001 #13: WHT exceeds computed tax -> refund', () => {
  it('reproduces the TAX-2025 reference: tax 73,766.21, WHT 93,963.71 -> refund 20,197.50', () => {
    const income = tx({
      kind: 'income',
      incomeSection: '40_1',
      amountMinor: 793_831_04,
      whtMinor: 93_963_71,
    });

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [income],
      deductionCategories: NO_DEDUCTIONS.categories,
      deductionEntries: NO_DEDUCTIONS.entries,
      sharedCaps: NO_DEDUCTIONS.sharedCaps,
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.taxTotalMinor).toBe(73_766_21);
    expect(result.whtTotalMinor).toBe(93_963_71);
    expect(result.balance).toEqual({ direction: 'refund', amountMinor: 20_197_50 });
  });
});

describe('TC-0001 #14: computed tax exceeds WHT -> additional due', () => {
  it('shows the exact difference as due', () => {
    const income = tx({
      kind: 'income',
      incomeSection: '40_1',
      amountMinor: 793_831_04,
      whtMinor: 10_000_00,
    });

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [income],
      deductionCategories: NO_DEDUCTIONS.categories,
      deductionEntries: NO_DEDUCTIONS.entries,
      sharedCaps: NO_DEDUCTIONS.sharedCaps,
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.balance).toEqual({ direction: 'due', amountMinor: 73_766_21 - 10_000_00 });
  });
});

describe('TC-0001 #35 / INV-8: general transactions excluded from tax calculation', () => {
  it('never lets a general transaction affect income, WHT, or tax total', () => {
    const taxIncome = tx({ kind: 'income', incomeSection: '40_1', amountMinor: 100_000_00 });
    const general = tx({
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'food',
      amountMinor: 999_999_99,
    });

    const withGeneral = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [taxIncome, general],
      deductionCategories: [],
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });
    const withoutGeneral = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [taxIncome],
      deductionCategories: [],
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    expect(withGeneral.totalIncomeMinor).toBe(withoutGeneral.totalIncomeMinor);
    expect(withGeneral.taxTotalMinor).toBe(withoutGeneral.taxTotalMinor);
    expect(withGeneral.totalIncomeMinor).toBe(100_000_00);
  });
});

describe('voided transactions contribute nothing', () => {
  it('excludes a voided income row from every total', () => {
    const active = tx({ kind: 'income', incomeSection: '40_1', amountMinor: 100_000_00 });
    const voided = tx({
      kind: 'income',
      incomeSection: '40_1',
      amountMinor: 500_000_00,
      status: 'voided',
    });

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [active, voided],
      deductionCategories: [],
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.totalIncomeMinor).toBe(100_000_00);
  });
});

describe('negative net taxable income floors to 0 (shares TC-0001 #12s rule)', () => {
  it('floors to 0 when deductions exceed income', () => {
    const income = tx({ kind: 'income', incomeSection: '40_1', amountMinor: 50_000_00 });
    const category: DeductionCategoryRow = {
      id: 1,
      taxYearId: null,
      code: 'donation',
      name: 'Donation',
      capType: 'fixed',
      capAmountMinor: 200_000_00,
      sharedGroupId: null,
      sortOrder: 0,
      description: '',
      isActive: true,
      isBuiltin: false,
    };
    const entry: DeductionEntryRow = {
      id: 1,
      taxYearId: 1,
      categoryId: 1,
      amountMinor: 100_000_00,
      count: null,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [income],
      deductionCategories: [category],
      deductionEntries: [entry],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.netTaxableMinor).toBe(0);
    expect(result.taxTotalMinor).toBe(0);
    expect(result.balance).toEqual({ direction: 'due', amountMinor: 0 });
  });
});

describe('expense method integration', () => {
  it('applies the lump-sum deduction to 40(5)-(8) income only', () => {
    const year: TaxYearRow = { ...YEAR_NO_METHOD, expenseMethod: 'lump_sum', lumpSumRateBp: 6000 };
    const income40_5_8 = tx({ kind: 'income', incomeSection: '40_5_8', amountMinor: 100_000_00 });
    const income40_1 = tx({ kind: 'income', incomeSection: '40_1', amountMinor: 50_000_00 });

    const result = computeYear({
      taxYear: year,
      transactions: [income40_5_8, income40_1],
      deductionCategories: [],
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.totalIncomeMinor).toBe(150_000_00);
    expect(result.expenseDeductionMinor).toBe(60_000_00); // 100,000 x 60%
    expect(result.netTaxableMinor).toBe(90_000_00); // 150,000 - 60,000
  });

  it('deducts nothing when no expense method has been chosen yet', () => {
    const income40_5_8 = tx({ kind: 'income', incomeSection: '40_5_8', amountMinor: 100_000_00 });

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [income40_5_8],
      deductionCategories: [],
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.expenseDeductionMinor).toBe(0);
  });
});

describe('TC-0001 #23: exact decimal summation, no float drift', () => {
  it('sums many 2-decimal baht transactions to the exact expected satang total', () => {
    // A run of amounts chosen specifically because naive float summation
    // (0.1 + 0.2 style accumulation) drifts on values like these.
    const amounts = ['1234.56', '0.10', '0.20', '999.99', '10000.01', '0.07', '333.33', '1.11'];
    const transactions = amounts.map((a) =>
      tx({ kind: 'income', incomeSection: '40_1', amountMinor: parseBahtToSatang(a) }),
    );
    const expectedTotal = amounts.reduce((sum, a) => sum + parseBahtToSatang(a), 0);

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions,
      deductionCategories: [],
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.totalIncomeMinor).toBe(expectedTotal);
    expect(result.totalIncomeMinor).toBe(12_569_37); // hand-verified exact sum, in satang
  });
});

describe('TC-0007 #10, #11, #13: linked expense deductions & statutory cap enforcement in computeYear', () => {
  it('aggregates linked expenses, caps at statutory limit, and calculates net taxable income', () => {
    const income = tx({ kind: 'income', incomeSection: '40_1', amountMinor: 600_000_00 });
    // Life insurance expense: 120,000 THB (cap: 100,000 THB)
    const lifeInsuranceExpense = tx({
      kind: 'expense',
      taxRelevant: false,
      amountMinor: 120_000_00,
      deductionCategoryId: 10,
    });

    const category: DeductionCategoryRow = {
      id: 10,
      taxYearId: 1,
      code: 'life_insurance',
      name: 'เบี้ยประกันชีวิต',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
      sharedGroupId: null,
      sortOrder: 1,
      description: '',
      isActive: true,
      isBuiltin: true,
    };

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [income, lifeInsuranceExpense],
      deductionCategories: [category],
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    expect(result.totalIncomeMinor).toBe(600_000_00);
    expect(result.totalDeductionsMinor).toBe(100_000_00); // capped at 100k
    expect(result.netTaxableMinor).toBe(500_000_00); // 600k - 100k
    // On 500k net taxable: 0-150k @ 0% (0), 150k-300k @ 5% (7,500), 300k-500k @ 10% (20,000) = 27,500 THB
    expect(result.taxTotalMinor).toBe(27_500_00);
  });

  it('enforces shared group caps when combining life + health insurance linked expenses', () => {
    const income = tx({ kind: 'income', incomeSection: '40_1', amountMinor: 600_000_00 });
    const lifeExp = tx({
      kind: 'expense',
      taxRelevant: false,
      amountMinor: 90_000_00,
      deductionCategoryId: 1,
    });
    const healthExp = tx({
      kind: 'expense',
      taxRelevant: false,
      amountMinor: 25_000_00,
      deductionCategoryId: 2,
    });

    const sharedGroup: SharedCapRow = {
      id: 100,
      taxYearId: 1,
      name: 'Life+Health',
      capAmountMinor: 100_000_00,
    };

    const categories: DeductionCategoryRow[] = [
      {
        id: 1,
        taxYearId: 1,
        code: 'life',
        name: 'Life',
        capType: 'shared_group_member',
        capAmountMinor: null,
        sharedGroupId: 100,
        sortOrder: 1,
        description: '',
        isActive: true,
        isBuiltin: true,
      },
      {
        id: 2,
        taxYearId: 1,
        code: 'health',
        name: 'Health',
        capType: 'shared_group_member',
        capAmountMinor: 25_000_00,
        sharedGroupId: 100,
        sortOrder: 2,
        description: '',
        isActive: true,
        isBuiltin: true,
      },
    ];

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [income, lifeExp, healthExp],
      deductionCategories: categories,
      deductionEntries: [],
      sharedCaps: [sharedGroup],
      brackets: TAX_2025_BRACKETS,
    });

    // 90k + 25k = 115k -> capped at shared group cap 100k
    expect(result.totalDeductionsMinor).toBe(100_000_00);
    expect(result.netTaxableMinor).toBe(500_000_00);
  });

  it('aggregates custom deductionAmountMinor on income and expense (REQ-0008, TC-0008 #7)', () => {
    const income = tx({
      kind: 'income',
      incomeSection: '40_1',
      amountMinor: 600_000_00,
      deductionCategoryId: 1,
      deductionAmountMinor: 10_000_00, // custom deductible 10k from salary
    });

    const expense = tx({
      kind: 'expense',
      amountMinor: 30_000_00,
      deductionCategoryId: 1,
      deductionAmountMinor: 20_000_00, // custom deductible 20k from 30k expense
    });

    const categories: DeductionCategoryRow[] = [
      {
        id: 1,
        taxYearId: 1,
        code: 'donation',
        name: 'Donation',
        capType: 'fixed',
        capAmountMinor: 100_000_00,
        sharedGroupId: null,
        sortOrder: 1,
        description: '',
        isActive: true,
        isBuiltin: true,
      },
    ];

    const result = computeYear({
      taxYear: YEAR_NO_METHOD,
      transactions: [income, expense],
      deductionCategories: categories,
      deductionEntries: [],
      sharedCaps: [],
      brackets: TAX_2025_BRACKETS,
    });

    // 10k (income partial) + 20k (expense partial) = 30k total deductions
    expect(result.totalDeductionsMinor).toBe(30_000_00);
    expect(result.netTaxableMinor).toBe(570_000_00);
  });
});


