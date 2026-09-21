# AT-1.2 — changeFolder (move + switch)

- **Plan:** PLAN-0002 · **Phase:** P1 · **Commit:** `52ac507`
- **TC results:** #3, #3a, #5, #6, #8, #9, #10, #11, #12, #13, #14 all pass
  (`src/main/__tests__/dataLocation.test.ts::changeFolder`)

## What was done
- `changeFolder(configDir, currentFolderPath, targetFolderPath, mode)` in `dataLocation.ts`,
  per ANA-0002's step ordering: switch = repoint + reuse `openDatabase`'s migration; move =
  copy DB (+`attachments/` if present) -> verify-open -> `recordMutation` audit row -> write
  config -> delete original. Move refuses if the target already has a DB (`DataLocationError`).
  Same-folder guard on both modes.
- `attachments.ts` now exports `ATTACHMENTS_DIRNAME` (was a private const) so the move path can
  reuse it instead of duplicating the string.
- 14 new tests, incl. two failure-path tests requiring `node:fs` mocking (`vi.mock`, partial —
  only `rmSync` is swapped, everything else passes through to the real module): a corrupt
  source DB (post-copy open fails) and a simulated locked old-folder file (cleanup warning,
  not a thrown error).

## Deviations from design
(none)

## Notes for follow-up tasks
- AT-2.1's IPC handler must call `changeFolder(configDir(), currentDataFolderPath(), target,
  mode)` then `openAppDatabase(result.info.folderPath)` to re-point the live connection —
  `changeFolder` itself never touches `appDatabase.ts`.
- `ChangeFolderResult.oldFolderCleanupWarning` (optional) should be surfaced to the user if
  present, even on an otherwise-successful move.
