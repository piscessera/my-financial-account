# AT-3.3 — 40(5)-(8) expense-method calculator

- **Plan:** PLAN-0001 · **Phase:** P3 · **Commit:** `cd4b5e4`
- **TC results:** TC-0001 #3, #4 pass (`src/main/calc/__tests__/expenseMethod.test.ts`, 8 cases).

## What was done

- `src/main/calc/expenseMethod.ts` — `computeLumpSumDeduction(incomeMinor, lumpSumRateBp)`
  (integer satang × basis-point rate, half-up rounded via `BigInt`, same convention as
  `calc/money.ts`) and `computeExpenseDeduction(input)`, which dispatches on
  `tax_years.expense_method`: `lump_sum` → the rate calculation; `actual` → the already-summed
  recorded expenses passed in (this module does no DB/transaction filtering itself — pure
  calc-module convention, same split as `calc/deductions.ts`).
- 178 tests pass (170 prior + 8 new); lint + `tsc --noEmit` clean.

## Deviations from design

TC-0001 #3 says the lump-sum deduction is "`income × rate` (capped per law)" — the schema
(`tax_years.lump_sum_rate_bp`) has no separate statutory-ceiling field beyond the single rate
the user configures per year (ANA-0001's own decision), so this calculator implements exactly
that: no additional hardcoded cap. Read the "(capped per law)" clause as real-world context for
the test scenario, not an unimplemented requirement — flagged here rather than silently
dropped, in case a future requirement wants a separate ceiling field.

## Notes for follow-up tasks

- API for AT-4.2 (`calc.computeYear()`): call `computeExpenseDeduction({method, incomeMinor,
  lumpSumRateBp, actualExpensesMinor})` once per year with 40(5)-(8) income summed and (for
  `actual`) that year's tax-relevant expense transactions summed.
