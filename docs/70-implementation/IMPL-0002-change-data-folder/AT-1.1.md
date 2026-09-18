# AT-1.1 — DataLocationError + targetHasExistingDb + AuditEntityType

- **Plan:** PLAN-0002 · **Phase:** P1 · **Commit:** `bb03672`
- **TC results:** #4 pass (`src/main/__tests__/dataLocation.test.ts::targetHasExistingDb`)

## What was done
- `DataLocationError` class in `src/main/dataLocation.ts`, same shape as the codebase's other
  domain error classes (`AttachmentError`, `AuditLogError`).
- `targetHasExistingDb(targetFolderPath)`: `existsSync(resolveDbPath(...))`.
- `AuditEntityType` (`src/main/repositories/auditLog.ts`) gains `'data_location'`.
- Two new tests in `dataLocation.test.ts` covering both the empty-folder and existing-DB cases.

## Deviations from design
(none)

## Notes for follow-up tasks
- AT-1.2 (`changeFolder`) uses `DataLocationError` for both its guard conditions (same-folder,
  move-target-already-has-DB) and `targetHasExistingDb` for the move-mode refuse check.
- This worktree needed `npm install` (no `node_modules` yet) before `npm test` would use the
  correct better-sqlite3 build — same one-time setup PLAN-0001 hit for fresh worktrees.
