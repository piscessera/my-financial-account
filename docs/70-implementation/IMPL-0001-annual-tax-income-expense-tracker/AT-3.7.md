# AT-3.7 — tax-year switcher component

- **Plan:** PLAN-0001 · **Phase:** P3 · **Commit:** `90cba3f`
- **TC results:** TC-0001 #5 pass (verified manually, see below).

## What was done

- `TaxYearSwitcher.tsx` — lists every tax year (open/closed status dot), creates a new year,
  sets the 40(5)-(8) expense method (`lump_sum` + a percent-rate field, or `actual`). Detects a
  mid-year switch by checking `selectedYear.expenseMethod !== null && !== newMethod` **and**
  the year already having an active 40(5)-(8) income transaction
  (`transactions.listByYear` filtered client-side) — only then shows the confirm-modal warning
  (TC-0001 #5), with method-specific copy (switching to `actual` warns expenses must now be
  recorded; switching to `lump_sum` warns previously-recorded expenses stop counting).
- `App.tsx` gained a "ปีภาษี" tab hosting the component so it's reachable and manually
  verifiable.

## Verification

Same sandbox limitation as every renderer task this phase (no Electron display server): built
the renderer, loaded it against a stubbed `window.api` seeded with an open 2569 (`lump_sum`,
existing 40(5)-(8) income) and a closed 2568. Confirmed via `get_page_text`: both years list
with correct open/closed labels; selecting 2569 reveals the expense-method chips; clicking
"ตามจริง (actual)" on the already-`lump_sum` year with existing income shows the warning modal
with the exact expected copy, rather than silently switching. 183/183 Vitest tests unaffected;
lint, `tsc --noEmit`, `vite build` all clean.

## Deviations from design

- **Not wired as the single source of truth for "the current year"** across Entry/Deductions —
  those screens still resolve their own working year independently via
  `useWorkingTaxYear` (AT-2.6). Lifting a shared selected-year into `App.tsx` and threading it
  through already-built screens is a real refactor of completed work, out of this task's
  literal scope (`TaxYearSwitcher.tsx` only, per the plan row). The component works fully
  standalone and is reachable/verifiable via its own nav tab.
- The percent-rate field reuses `tryParseBahtToSatang` for its strict decimal parsing (rejecting
  garbage input, half-up rounding) even though the value isn't money — a percent's x100 scaling
  happens to match satang's x100 scaling, so `"60"` parses to `6000`, which is exactly
  `lumpSumRateBp`. Documented inline in the component; not worth a second parser for identical
  arithmetic.

## Notes for follow-up tasks

- If/when a shared "current tax year" becomes a real requirement (e.g. once Dashboard, AT-4.6,
  needs one too), that's the point to lift `TaxYearSwitcher`'s selection into `App.tsx` state
  and have Entry/Deductions/Settings/Dashboard all consume it instead of resolving their own —
  a REQ/GAP-level decision given how many already-built screens it touches, not a silent
  addition to this task.
