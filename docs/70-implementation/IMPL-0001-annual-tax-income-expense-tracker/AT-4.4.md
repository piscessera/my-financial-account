# AT-4.4 — closed-year read path

- **Plan:** PLAN-0001 · **Phase:** P4 · **Commit:** `26f7491`
- **TC results:** TC-0001 #27 pass (`src/main/repositories/__tests__/taxYearsReadPath.test.ts`,
  1 case).

## What was done

- `taxYears.ts` gained `getYearResult(taxYear, liveInputs)`: for a **closed** year it returns
  `JSON.parse(taxYear.frozenResultJson)` verbatim — it never even looks at `liveInputs` — for an
  **open** year it calls `calc.computeYear()` (AT-4.2) over `liveInputs`. This is the one
  function AT-4.5's IPC layer and AT-4.6/4.7's screens should call instead of choosing between
  `computeYear()` and `frozenResultJson` themselves.
- The test edits a deduction category's cap *after* closing a year that used the old cap, then
  calls `getYearResult` for both the closed year (with the edited category passed in as
  `liveInputs`) and an equivalent open year (same edit). The closed year's `totalDeductionsMinor`
  stays at its frozen 80,000; the open year's drops to the new, lower cap — proving the frozen
  path genuinely ignores its inputs rather than merely happening to match by coincidence.
- 204 tests pass (203 prior + 1 new); lint + `tsc --noEmit` clean.

## Deviations from design

None. The plan's files-touched list already anticipated `calc/computeYear.ts` alongside
`taxYears.ts`; in the end only `taxYears.ts` needed a change — `computeYear()` itself didn't need
modification, since "ignore live inputs for a closed year" is a branch that belongs in the read
path, not in the pure calculator.

## Notes for follow-up tasks

- API for AT-4.5/4.6/4.7: always call `taxYears.getYearResult(taxYear, liveInputs)`, never
  `computeYear()` directly from a screen or IPC handler — that's exactly the mistake this
  function exists to make structurally impossible.
