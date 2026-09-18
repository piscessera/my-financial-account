# AT-4.6 — Dashboard screen

- **Plan:** PLAN-0001 · **Phase:** P4 · **Commit:** `97584c4`
- **TC results:** TC-0001 #29, #36 pass (see below).

## What was done

- `Dashboard.tsx` — calls `window.api.calc.computeYear(yearId)` on load, which is always live
  for an open year (TC-0001 #29, already proven at the IPC layer in AT-4.5's tests — this screen
  just consumes that guarantee, it doesn't re-verify it). Renders four tax tiles (income/WHT/net
  taxable/balance, red `bad` styling for a due amount vs. green `good` for a refund), a deduction
  headroom list, a fully separate general-transactions panel (TC-0001 #36, AC-15 — its own tiles,
  never summed into the tax figures above), and an empty state when the year has no transactions
  at all (matching the mockup's "just-opened year" example panel).
- **Headroom list collapses `shared_group_member` categories into one row per group** (summed
  `rawTotalMinor` vs. the group's cap), rather than one row per member — this is what
  PROTO-0001's `dashboard.html` shows ("ประกันชีวิต + สุขภาพตนเอง (กลุ่มรวม)" as a single row),
  and it's also the more useful number: a member's own sub-cap headroom is a *different* question
  (already shown on the Deductions screen, AT-3.5) from "how much room is left in the group."
- Set as `App.tsx`'s default screen (previously Entry was default).

## Verification

Same sandbox limitation as every renderer task this session (no Electron display server): built
the renderer, loaded it against a stubbed `window.api` (including a hand-rolled `calc:computeYear`
stub reproducing the real shared-group-capping arithmetic, since the Dashboard is the first
screen to actually call that channel). Confirmed via `get_page_text`: all four tiles render with
correct labels/values, the shared-group row correctly shows the *capped* combined total (not the
raw sum of both members' full entries), the general section renders as a visually and
structurally separate panel with its own per-category tiles. 206/206 Vitest tests unaffected;
lint, `tsc --noEmit`, `vite build` all clean.

## Deviations from design

None beyond the already-established pattern (per-screen `useWorkingTaxYear`, no shared
selected-year state — same as every prior renderer task this phase).

## Notes for follow-up tasks

- AT-4.7 (Summary/Close screen) is the natural next consumer of `calc.computeYear()` —
  reuse `ComputeYearResult`'s `bracket.breakdown` for the bracket table's "hit bracket"
  highlight, which Dashboard doesn't need but Summary does.
