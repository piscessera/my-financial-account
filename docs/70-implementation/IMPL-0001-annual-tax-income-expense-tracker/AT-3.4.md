# AT-3.4 — IPC wiring for `deductions`/`settings`

- **Plan:** PLAN-0001 · **Phase:** P3 · **Commit:** `825baa9`
- **TC results:** none linked. Done-criterion is a manual smoke test (see below).

## What was done

- Extended `src/main/ipc/index.ts`'s `createDomainIpcHandlers` with `deductions:listCategories`/
  `deductions:setEntry` and `settings:getCaps`/`createCategory`/`updateCategory`/
  `setCategoryActive`/`getSharedCaps`/`updateSharedCap`/`getBrackets`/`updateBracket`. The
  namespace split follows ANA-0001 §API/backend changes exactly, not the repository-file split:
  category CRUD (`createCategory`/`updateCategory`/`setCategoryActive`) is under `settings`,
  even though it lives in `deductions.ts` at the repository layer — `deductions:listCategories`
  is entry-time only (filters to `isActive`, AC-17), `settings:getCaps` returns every category
  including archived ones (so Settings can reactivate them).
- `electron/preload.ts` — matching `window.api.deductions`/`window.api.settings` namespaces.
- **Done-criterion ("manual smoke test round-trips a category edit")**: exercised via the same
  handler-map-level test approach as AT-2.5 (`src/main/ipc/__tests__/index.test.ts`, 5 new
  cases) — create a category, list it, archive it (confirms it drops out of
  `deductions:listCategories` but stays in `settings:getCaps`), rename it, and shared-cap/
  bracket round-trips. `vite build` (renderer + electron main + preload) all succeed with the
  new preload surface.
- 183 tests pass (178 prior + 5 new); lint + `tsc --noEmit` clean.

## Deviations from design

None. The `deductions` vs `settings` namespace split above is a literal read of ANA-0001's own
API list, not a new decision.

## Notes for follow-up tasks

- AT-3.5 (Deductions screen) calls `window.api.deductions.listCategories()` +
  `window.api.deductions.setEntry(...)`.
- AT-3.6 (Settings screen) calls `window.api.settings.getCaps()` + `createCategory`/
  `updateCategory`/`setCategoryActive` + `getSharedCaps`/`updateSharedCap` +
  `getBrackets`/`updateBracket`.
