# AT-4.2 — `calc.computeYear()`

- **Plan:** PLAN-0001 · **Phase:** P4 · **Commit:** `ef2a9a9`
- **TC results:** TC-0001 #13, #14, #30, #35 pass (`src/main/calc/__tests__/computeYear.test.ts`,
  7 cases; `src/main/calc/__tests__/deductions.test.ts`, 3 new cases for #30).

## What was done

- `src/main/calc/computeYear.ts` — `computeYear(input)`, a pure function assembling income,
  expenses, deductions, WHT, and the bracket calculation into the full result. `activeTaxRelevant`
  (`taxRelevant === true && status === 'active'`) is computed once and is the single base list
  every sum derives from (INV-8, TC-0001 #35): general transactions and voided rows never enter
  any figure, structurally, not via a filter re-applied per sum.
- Income is summed per `income_section` (40(1)/40(2)/40(5)-(8)) and totaled; expense-kind
  transactions are summed for `expenseMethod.ts`'s `actual` path; WHT is summed across every
  active tax-relevant row. The 40(5)-(8) expense deduction (AT-3.3) only reduces total income
  when a method is actually chosen (`null` → 0 deduction, not an error — a year that hasn't set
  one yet just gets no deduction).
- `netTaxableMinor = max(totalIncome - expenseDeduction - totalDeductions, 0)` — floored before
  bracketing (though `computeTax`, AT-4.1, floors again defensively; belt-and-suspenders on the
  one number every subsequent figure depends on).
- `balance`: `due` when `taxTotal >= whtTotal`, `refund` otherwise — reproduces the exact
  `TAX-2025` reference (tax 73,766.21, WHT 93,963.71 → refund 20,197.50, TC-0001 #13).
- **Extended `calc/deductions.ts`** (AT-3.2) with `headroomMinor` on each `PerCategoryDeduction`
  (`max(ownCap - entered, 0)`, or `null` for a `shared_group_member` with no sub-cap of its
  own) — AT-4.2's plan row is the one assigned TC-0001 #30 ("headroom never negative"), and this
  is where that number naturally belongs (the cap-shape calculator already computes each
  category's effective cap internally); duplicating that logic in `computeYear.ts` instead
  would have been worse.
- 198 tests pass (188 prior + 10 new); lint + `tsc --noEmit` clean.

## Deviations from design

None from ANA-0001's `calc.computeYear(yearId) → {...}` shape — field names here are the satang
equivalents (`totalIncomeMinor` etc.) since this app's convention is always explicit `*Minor`
naming for money fields, matching every repository/calculator built so far.

## Notes for follow-up tasks

- API for AT-4.3 (`tax_years.close()`): call `computeYear(...)` and store the result (or a
  serialization of it) as `frozen_result_json`; the same call against a closed year's stored
  transactions must reproduce the identical result (INV-3, TC-0001 #32) since nothing here reads
  the DB or carries state between calls.
- API for AT-4.5 (IPC wiring) / AT-4.6 (Dashboard) / AT-4.7 (Summary): the IPC handler assembles
  `ComputeYearInput` from `transactions.listByYear`, `deductions.listCategories`/`listEntries`,
  `settings.getSharedCaps`/`getBrackets`, and the `TaxYearRow` itself — none of those calls are
  new, all exist since P2/P3.
- `result.deductions.perCategory[].headroomMinor` is what AT-4.6's Dashboard headroom bars (and
  AT-3.5's Deductions screen, if it's later updated to show headroom) should read.
