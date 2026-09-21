# AT-2.1 — IPC handlers: targetHasExistingDb + changeFolder

- **Plan:** PLAN-0002 · **Phase:** P2 · **Commit:** `7a178fd`
- **TC results:** none directly (Electron glue, verified by `vite build`, matching every prior
  IPC-wiring task in PLAN-0001)

## What was done
- `dataLocation:targetHasExistingDb` and `dataLocation:changeFolder` handlers in
  `electron/main.ts`, following the existing `dataLocation:*` pattern exactly.
- The `changeFolder` handler calls `currentDataFolderPath()` (existing helper) and
  `openAppDatabase(result.info.folderPath)` on success, re-pointing the live connection the
  same way `dataLocation:createInFolder` already does for onboarding.
- `tsc --noEmit -p tsconfig.json` clean, `vite build` (renderer+electron+preload) clean.
  `tsconfig.electron.json`'s standalone tsc run still fails on unrelated pre-existing rootDir
  errors — PL-0006, not a regression (confirmed unchanged from PLAN-0001's close).

## Deviations from design
(none)

## Notes for follow-up tasks
- AT-2.2 (preload) types against `ChangeFolderMode`/`ChangeFolderResult`, already exported from
  `dataLocation.ts`.
