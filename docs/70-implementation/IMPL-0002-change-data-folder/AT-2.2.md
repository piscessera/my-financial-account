# AT-2.2 — preload: window.api.dataLocation additions

- **Plan:** PLAN-0002 · **Phase:** P2 · **Commit:** `0b1ac54`
- **TC results:** none directly (Electron glue, verified by `vite build`)

## What was done
- `window.api.dataLocation.targetHasExistingDb(targetFolderPath): Promise<boolean>` and
  `.changeFolder(targetFolderPath, mode): Promise<ChangeFolderResult>` in
  `electron/preload.ts`, typed against `ChangeFolderMode`/`ChangeFolderResult` from
  `dataLocation.ts`.
- `vite build` (renderer + electron main + preload) clean with the new surface.

## Deviations from design
(none)

## Notes for follow-up tasks
- AT-3.1 (Settings UI) is now unblocked: `window.api.dataLocation.chooseFolder()` (existing) →
  `.targetHasExistingDb(picked)` → `.changeFolder(picked, mode)`, per ANA-0002's UI flow.
