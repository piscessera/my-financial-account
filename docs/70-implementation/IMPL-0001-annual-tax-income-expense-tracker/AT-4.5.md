# AT-4.5 — IPC wiring for `calc`/close/reopen

- **Plan:** PLAN-0001 · **Phase:** P4 · **Commit:** `108b645`
- **TC results:** none linked. Done-criterion is a manual smoke test (see below).

## What was done

- `src/main/ipc/index.ts` — `gatherYearInputs(sqlite, yearId)`: assembles a `CloseTaxYearInput`
  by calling `transactions.listByYear`, `deductions.listCategories`/`listEntries`,
  `settings.getSharedCaps`/`getBrackets` — the cross-repository orchestration `taxYears.ts`
  deliberately doesn't do itself (AT-4.3's circular-import note). Shared by two new channels:
  `taxYears:close` and `calc:computeYear`.
- `taxYears:close`/`taxYears:reopen` — thin wrappers over the AT-4.3 repository functions.
- `calc:computeYear` — always calls `taxYears.getYearResult(taxYear, gatherYearInputs(...))`
  (AT-4.4), **never** `computeYear()` directly. This is deliberate: it makes "accidentally
  live-recomputing a closed year" structurally impossible from the IPC layer, not just a
  convention to remember.
- `electron/preload.ts` — `taxYears.close`/`reopen`, `calc.computeYear` on `window.api`.
- **Done-criterion ("manual smoke test")**: `src/main/ipc/__tests__/index.test.ts` (2 new cases)
  — creates a year, records the exact `TAX-2025` reference transaction, closes it, confirms
  `calc:computeYear` returns the frozen 20,197.50 refund, reopens it; a second case confirms
  `calc:computeYear` computes live for an open year. `vite build` (renderer + electron main +
  preload) succeeds with the new preload surface.
- 206 tests pass (204 prior + 2 new); lint + `tsc --noEmit` clean.

## Deviations from design

None.

## Notes for follow-up tasks

- AT-4.6 (Dashboard) and AT-4.7 (Summary/Close screen) call `window.api.calc.computeYear(yearId)`
  for the live/frozen result and `window.api.taxYears.close`/`reopen` for the lifecycle actions.
