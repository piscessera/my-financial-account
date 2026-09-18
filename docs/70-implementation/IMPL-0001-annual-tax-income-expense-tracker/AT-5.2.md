# AT-5.2 — `exportSummary`

- **Plan:** PLAN-0001 · **Phase:** P5 · **Commit:** `3629629`
- **TC results:** TC-0001 #44 pass (`src/main/repositories/__tests__/csv.test.ts`, 1 case).

## What was done

- `exportSummary(destPath, year, result: ComputeYearResult)` — a pure formatter, not a
  `sqlite`/`yearId`-taking repository function like `exportLedger`. The caller is responsible
  for getting `result` via `taxYears.getYearResult()`, not `calc.computeYear()` directly, so a
  closed year's exported summary matches its frozen snapshot rather than a live recompute —
  same principle AT-4.4 already established for the read path, applied here rather than
  re-derived.
- Output is `field,value` rows (tax_year, total_income, total_expense, expense_deduction,
  total_deductions, net_taxable, tax_total, wht_total, balance_direction, balance_amount) —
  structurally distinct from `LEDGER_CSV_COLUMNS`'s header, so `parseForPreview` (AT-5.3) can
  never mistake a summary export for a ledger one even without extra guard logic.
- 212 tests pass (211 prior + 1 new); lint + `tsc --noEmit` clean.

## Deviations from design

None.

## Notes for follow-up tasks

- API for AT-5.5 (IPC wiring): the `csv:exportSummary` handler must call
  `taxYears.getYearResult(taxYear, gatherYearInputs(...))` (the same helper `calc:computeYear`
  already uses, AT-4.5) before calling `exportSummary(destPath, year, result)` — never pass a
  bare `computeYear()` call.
