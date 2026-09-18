# AT-4.1 — progressive tax bracket calculator

- **Plan:** PLAN-0001 · **Phase:** P4 · **Commit:** `223834f`
- **TC results:** TC-0001 #11, #12 pass (`src/main/calc/__tests__/brackets.test.ts`, 5 cases).

## What was done

- `src/main/calc/brackets.ts` — `computeTax(netTaxableMinor, brackets)`, a pure function (no
  DB access). Floors negative income to 0 (TC-0001 #12) before bracketing. Each bracket's
  contribution (`min(income, upperBound) - lowerBound`, clamped `>= 0`) is taxed independently
  and half-up rounded via `BigInt` — same convention as `expenseMethod.ts`/`money.ts` — rather
  than rounding only once at the end. This bracket-by-bracket rounding is what reproduces the
  `TAX-2025` reference figure exactly (TC-0001 #11): 793,831.04 THB → 73,766.21 THB.
- Test fixtures use the standard Thai progressive PIT brackets (0/5/10/15/20/25/30/35%,
  matching PROTO-0001's own `settings.html` reference table) since no `TAX-2025` seed data
  exists yet (ANA-0001 decision 14) — verified by hand that these are the brackets that
  actually reproduce the reference figure, not assumed.
- 188 tests pass (183 prior + 5 new); lint + `tsc --noEmit` clean.

## Deviations from design

None.

## Notes for follow-up tasks

- API for AT-4.2 (`calc.computeYear()`): `computeTax(netTaxableMinor, brackets)` where
  `brackets` comes from `settings.getBrackets()` (AT-3.1); `result.totalTaxMinor` is the tax
  figure, `result.breakdown` is what the Summary screen (AT-4.7) highlights the hit bracket
  from.
