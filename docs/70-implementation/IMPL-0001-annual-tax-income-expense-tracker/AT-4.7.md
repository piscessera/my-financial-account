# AT-4.7 — Year Summary/Close screen

- **Plan:** PLAN-0001 · **Phase:** P4 · **Commit:** `5a5d4ce`
- **TC results:** TC-0001 #15, #20, #21, #28 pass (see below). **P4 complete.**

## What was done

- `Summary.tsx` — an **open** year shows a live breakdown (income/expenses+deductions/net
  taxable/tax), the full bracket table with the hit bracket(s) highlighted (`.hit` class, any
  bracket with `amountInBracketMinor > 0`), the due/refund result strip, and a "ปิดปีภาษี" button
  that opens a confirm-modal listing every lock consequence verbatim from PROTO-0001's mockup
  (TC-0001 #21). A **closed** year shows a 🔒 locked banner with the close date, the frozen
  tiles/bracket table (from `frozen_result_json` via `calc.computeYear()`'s already-established
  closed-year path, AT-4.4), a reversal-example table when the year has one (original row +
  `pill reversal` row), and a "เปิดปีภาษีนี้อีกครั้ง" reopen button.
- Added two unit tests to `src/main/ipc/__tests__/index.test.ts` (natural home — same file that
  already tests `calc:computeYear`, AT-4.5): TC-0001 #15 (two years' `calc:computeYear` results
  stay independent) and #28 (an open year's `calc:computeYear` reflects a bracket rate edit on
  the very next call — no caching to invalidate). TC-0001 #20 was already proven at the
  repository level in AT-4.3; this screen just exercises the same `taxYears:close` channel from
  the UI, not a new assertion.

## Verification

Same sandbox limitation as every renderer task this phase: built the renderer, loaded it against
a stubbed `window.api`. Two passes: (1) an open year seeded with the exact `TAX-2025` reference
transaction — confirmed the tiles, full bracket table, and result strip reproduce 73,766.21 tax
/ 20,197.50 refund exactly, then clicked "ปิดปีภาษี" and confirmed the modal lists all four lock
consequences verbatim; (2) a closed year (seeded via `frozenResultJson`, with a reversal pair) —
confirmed the locked banner, frozen tiles, hit-bracket-only tax breakdown, and the reversal table
with correct `active`/`reversal` pills, matching PROTO-0001's closed-year example panel exactly.
208/208 Vitest tests pass (206 prior + 2 new); lint, `tsc --noEmit`, `vite build` all clean.

## Deviations from design

None beyond the phase's already-established pattern (own `useWorkingTaxYear`, no shared
selected-year state).

## Notes for follow-up tasks

- **P4 is now complete** (AT-4.1 through AT-4.7). Next phase-boundary step: the mechanical gate
  for P4, then a qa-reviewer dispatch decision — this phase touched no schema changes, but it is
  the plan's financial-correctness core ([core]-tagged AT-4.1/4.2), worth weighing against the
  dev-review cadence rule even though it isn't the plan's *last* phase.
- P5 (CSV import/export) depends on P2 (`transactions.create`) and P4 (`computeYear`, for the
  summary export) — both satisfied, P5 can start immediately.
