---
id: ANA-0002
type: analysis
title: Change data folder path after setup — design
status: active
size: M
created: 2026-09-18
updated: 2026-09-18
links: [REQ-0002]
---

# ANA-0002: Change data folder path after setup — design

## Context & current behavior

The data folder is chosen exactly once, at first-run onboarding:

- [`src/main/dataLocation.ts`](../../src/main/dataLocation.ts) is the only module that reads/
  writes the remembered folder. `readDataLocationConfig`/`writeDataLocationConfig` persist a
  small `data-location.json` in `configDir` (Electron's `userData` dir — deliberately outside
  the Drive-synced data folder, per the file's own header comment). `resolveDbPath(folderPath)`
  is the single place that knows the DB filename (`my-financial-account.db`).
  `createInFolder(configDir, folderPath)` is explicitly documented "First-run only": it
  `mkdirSync`s the folder, opens+migrates+seeds a DB there via `openDatabase`
  ([`src/main/db/client.ts`](../../src/main/db/client.ts)), then writes the config. There is no
  sibling function that repoints an *already-configured* install.
- [`electron/main.ts`](../../electron/main.ts) wires three `dataLocation:*` IPC channels
  (`get`, `chooseFolder`, `createInFolder`) and owns the single long-lived DB connection via
  [`src/main/db/appDatabase.ts`](../../src/main/db/appDatabase.ts) (`openAppDatabase`/
  `getAppDatabase`/`closeAppDatabase`) — opened once at startup if a folder is already
  configured, or right after `createInFolder` on first run. There is no channel to re-open the
  connection at a *different* path after startup.
- [`electron/preload.ts`](../../electron/preload.ts) exposes exactly those three methods on
  `window.api.dataLocation`; the renderer has no way to trigger a change.
- [`src/renderer/pages/Settings.tsx`](../../src/renderer/pages/Settings.tsx) (lines 192-213)
  renders the "ที่จัดเก็บข้อมูล" (AC-19) panel showing `dataLocation.dbFilePath`,
  `lastModified`, `sizeBytes` — read-only, no action.
- [`src/main/lockFile.ts`](../../src/main/lockFile.ts): a soft `.lock` file written into the
  data folder at launch (hostname+timestamp, `checkAndClaimLock`), used to warn if another
  instance might still be running against the same folder. It is per-folder and regenerated on
  every claim — not something that should be copied when relocating data.
- [`src/main/repositories/attachments.ts`](../../src/main/repositories/attachments.ts):
  attachment files are copied into `<dataFolderPath>/attachments/<transactionId>/` — this is
  the only other on-disk data that lives beside the DB file and must move with it.
- [`src/main/repositories/auditLog.ts`](../../src/main/repositories/auditLog.ts): the single
  writer of `audit_log` (INV-4). `AuditEntityType` is a closed TS union (no DB-level `CHECK`
  on the column — confirmed in `src/main/db/schema.ts`, `entityType`/`action` are plain `text`
  columns), so adding a new entity type is a code-only change, no migration.
- [`src/main/db/schema.ts`](../../src/main/db/schema.ts): confirms `audit_log.entity_type` /
  `audit_log.action` have no `CHECK` constraint restricting their values.

## Solution overview

Stack: Electron main process (Node `fs`), same pattern as `createInFolder`. Two new
`dataLocation.ts` exports, one new IPC channel, one new Settings UI flow. No schema migration.

### `src/main/dataLocation.ts` — new functions

```ts
export type ChangeFolderMode = 'move' | 'switch';

export interface ChangeFolderResult {
  readonly info: DataLocationInfo;
  readonly mode: ChangeFolderMode;
}

/** True if `targetFolderPath` already has a DB file at it (AC-4's warn condition). */
export function targetHasExistingDb(targetFolderPath: string): boolean {
  return existsSync(resolveDbPath(targetFolderPath));
}

export function changeFolder(
  configDir: string,
  currentFolderPath: string,
  targetFolderPath: string,
  mode: ChangeFolderMode,
): ChangeFolderResult
```

`changeFolder` behavior:

- **Guard (both modes):** resolve `path.resolve()` on both folders; if they are the same
  directory, throw (`DataLocationError`, "already using this folder") — no-op, not an error the
  UI needs a modal for, but a defensive check.
- **`mode: 'switch'`:** requires `targetHasExistingDb(targetFolderPath)` to be `true` (caller —
  the IPC handler — enforces this precondition; `changeFolder` re-checks and throws if false, so
  the invariant holds even if a future caller skips the UI flow). Opens the target DB via
  `openDatabase` (this also brings it to the latest schema — AC-8's "closing and reopening the
  app reads from the new folder" implies the target DB must be schema-compatible, and
  `openDatabase`'s existing `migrateToLatest` already handles an older-schema file safely, the
  same as any existing install being reopened). No file copy. On success, writes the config to
  `targetFolderPath` and records the audit row (see below) in the **target** DB, then returns.
- **`mode: 'move'`:**
  1. If `targetHasExistingDb(targetFolderPath)` is `true`, throw (`DataLocationError`) — a move
     never silently overwrites an existing DB at the destination (AC-4/AC-5); the caller must
     have already resolved that conflict (offer switch instead, or cancel) before calling move.
  2. `mkdirSync(targetFolderPath, { recursive: true })`.
  3. Copy (never move-in-place) `resolveDbPath(currentFolderPath)` →
     `resolveDbPath(targetFolderPath)` via `copyFileSync`. If the source data folder has an
     `attachments/` subdirectory, recursively copy it too (`cpSync(..., { recursive: true })`).
     The `.lock` file is **not** copied — the destination gets a fresh lock on next launch,
     same as any other folder.
  4. Open the copied DB at the target path (`openDatabase`) to confirm it is readable/valid
     before committing to the switch — this is the "verify" step of copy-then-verify-then-
     delete, so a corrupt copy never leaves the app pointing at broken data (AC-7).
  5. Record the audit row (below) in the **target** DB (now open), close it.
  6. Write the config to `targetFolderPath`.
  7. Only now delete the original DB file (and `attachments/` dir) at `currentFolderPath` — a
     failure at any earlier step leaves the original untouched and the config still pointing at
     it (AC-7). Deletion failure itself (e.g. the old file is on a locked/read-only removable
     drive) is caught and swallowed with a warning-level return field rather than thrown — the
     move already succeeded (config points at the new, verified folder); the app must not report
     failure for a step that only affects cleanup, and must not leave the config pointed at the
     stale location for that reason (`ChangeFolderResult` gains an optional
     `readonly oldFolderCleanupWarning?: string`).
- **Audit row** (both modes, INV-4): `recordMutation(sqlite, { entityType: 'data_location',
  entityId: 1, action: 'update', before: { folderPath: currentFolderPath }, after: {
  folderPath: targetFolderPath, mode } })`, inside the *target* DB's connection. `entityId: 1`
  is a fixed sentinel — the data-location config is a singleton, there is no DB row to key off
  (unlike every other audited entity). `AuditEntityType` gains a `'data_location'` member.
- **Failure handling required by AC-7** (destination not writable, source file locked, disk
  full mid-copy): every `fs` call above is synchronous and throws natively on these conditions;
  `changeFolder` does not catch them — it lets them propagate. Because the config file is only
  written in the *last* step (step 6 for move; after target-open succeeds for switch), any
  throw before that point leaves `data-location.json` — and therefore `getDataLocationInfo`,
  and therefore the whole app — pointed at the original, still-working folder. This is why the
  step ordering above (copy → verify-open → audit → config write → delete-old) is load-bearing,
  not incidental.

### IPC (`electron/main.ts`)

One new channel, following the existing `dataLocation:*` pattern exactly:

```ts
ipcMain.handle(
  'dataLocation:changeFolder',
  (_event, targetFolderPath: string, mode: ChangeFolderMode) => {
    const current = currentDataFolderPath(); // existing helper, throws if unconfigured
    const result = changeFolder(configDir(), current, targetFolderPath, mode);
    openAppDatabase(result.info.folderPath); // re-point the live connection (AT-2.5 singleton)
    return result;
  },
);
```

`dataLocation:chooseFolder` (existing) is reused unchanged for picking the target folder — no
new dialog needed. A second reuse of `targetHasExistingDb` is exposed as its own channel so the
renderer can decide which confirmation copy to show *before* calling `changeFolder`:

```ts
ipcMain.handle('dataLocation:targetHasExistingDb', (_event, targetFolderPath: string) =>
  targetHasExistingDb(targetFolderPath),
);
```

### `electron/preload.ts` — `window.api.dataLocation` additions

```ts
targetHasExistingDb: (targetFolderPath: string): Promise<boolean> =>
  ipcRenderer.invoke('dataLocation:targetHasExistingDb', targetFolderPath),
changeFolder: (targetFolderPath: string, mode: ChangeFolderMode): Promise<ChangeFolderResult> =>
  ipcRenderer.invoke('dataLocation:changeFolder', targetFolderPath, mode),
```

### UI changes — `src/renderer/pages/Settings.tsx`

In the existing "ที่จัดเก็บข้อมูล" panel (line ~192), add a "เปลี่ยนโฟลเดอร์" button next to the
read-only path display. Flow, driven by local component state (no new page/route):

1. Click → `window.api.dataLocation.chooseFolder()`. `null` (cancel) → no-op.
2. A folder was picked → `window.api.dataLocation.targetHasExistingDb(picked)`.
   - `false` → show a confirm step: "ย้ายข้อมูลไปโฟลเดอร์นี้?" with the picked path, Confirm/
     Cancel. Confirm → `changeFolder(picked, 'move')`.
   - `true` → show the warn step (AC-4): "พบไฟล์ข้อมูลอยู่แล้วในโฟลเดอร์นี้" with exactly two
     choices — "ใช้ไฟล์ที่นั่น" (→ `changeFolder(picked, 'switch')`) or "ยกเลิก" (→ close, no
     call made at all, satisfying AC-5's "no partial move" trivially).
3. On success: `setDataLocation(result.info)`, success feedback message (existing `feedback`
   state pattern in this file), done — no reload/restart required, `openAppDatabase` already
   repointed the main-process connection so the next IPC call already reads/writes the new
   folder.
4. On failure (thrown IPC error, same `catch` pattern already used by every handler in this
   file): show the error via the existing `feedback` state; `dataLocation` state is left
   untouched (still shows the old, working folder) because `reload()`/`setDataLocation` is only
   called on the success path — satisfying AC-7 at the UI layer to match `changeFolder`'s own
   guarantee at the main-process layer.

No new component; this is additional state + JSX inside the existing `Settings` function
component, mirroring the existing `editingCategory`/`addingCategory` local-modal-state pattern
already used in the same file.

## Invariants

| INV | Rule | Enforced by (code / DB constraint / test) |
|-----|------|--------------------------------------------|
| INV-1 | Amounts are integer minor units, never float | unaffected — this feature touches no money field |
| INV-4 | Every mutation is audit-logged (who / when / before → after) | `changeFolder` calls `recordMutation` with `entityType: 'data_location'` in the target DB before the config file is switched over |
| INV-6 (new, this REQ) | A folder change never leaves the app pointed at a folder whose DB is missing/unverified — `data-location.json` is written only after the target DB is confirmed open (and, for move, copied) | `changeFolder`'s step ordering (copy → verify-open → audit → write-config → delete-old); TC #6/#7 |
| INV-7 (new, this REQ) | A folder change never silently overwrites an existing DB at the destination | `changeFolder` throws before any write if `mode: 'move'` targets a folder where `targetHasExistingDb` is already `true` | TC #4 |

## Data model changes

None — no migration. `audit_log.entity_type` gains a new *value* (`'data_location'`), not a new
column; `AuditEntityType` (TS union in `auditLog.ts`) gains that member.

## API / backend changes

- `src/main/dataLocation.ts`: new `ChangeFolderMode`, `ChangeFolderResult`,
  `DataLocationError` (new error class, same shape as `AttachmentError`/`AuditLogError`),
  `targetHasExistingDb`, `changeFolder`.
- `src/main/repositories/auditLog.ts`: `AuditEntityType` gains `'data_location'`.
- `electron/main.ts`: `dataLocation:targetHasExistingDb`, `dataLocation:changeFolder` handlers;
  `changeFolder`'s handler also calls the existing `openAppDatabase` to re-point the singleton
  connection (AT-2.5).
- `electron/preload.ts`: `window.api.dataLocation.targetHasExistingDb`,
  `window.api.dataLocation.changeFolder`.

## UI changes

- `src/renderer/pages/Settings.tsx`: "เปลี่ยนโฟลเดอร์" button + picked-folder confirm modal +
  existing-DB-found warn modal (two choices only), inside the current "ที่จัดเก็บข้อมูล" panel.
  Reuses the file's existing `feedback`/`busy` state pattern; no new page/route/component file.

## Dependencies & risks

- **No new external dependency** — `node:fs`'s `copyFileSync`/`cpSync`/`mkdirSync`/`rmSync` and
  the existing `openDatabase`/`recordMutation` cover everything.
- **Risk — mid-copy failure on very large attachment sets:** `cpSync` is synchronous and blocks
  the main process for the duration; for a single-user local app with typically small
  attachment folders this is acceptable (same tradeoff already made by `attachments.ts`'s
  synchronous `copyFileSync`), but a very large data folder would freeze the UI during a move.
  No progress indicator in this REQ's scope — parked (see below). A large mid-move failure
  surfaces as a single alert with no partial-progress detail, matching every other IPC handler
  in this codebase. Acceptable given INV-6 guarantees no partial *state* corruption, only a
  less informative *error message*. Not addressed further here.

## Decisions

| # | Decision | Reason | Date |
|---|----------|--------|------|
| 1 | `changeFolder` never deletes the source folder's data before the target is copy-verified-open | AC-7 (no partial/lost state on failure) requires an atomic-looking switch from the config's point of view | 2026-09-18 |
| 2 | Old-folder cleanup failure (post-move) is reported as a soft warning field, not a thrown error | The move itself already succeeded and the config already points at the verified new folder; failing the whole operation over cleanup would contradict AC-7's own "app is left usable" requirement | 2026-09-18 |
| 3 | Audit row for the change is written into the resulting (new) DB, entityType `'data_location'`, sentinel `entityId: 1` | The location config is a singleton with no DB row of its own; writing into the DB that becomes authoritative going forward keeps the audit trail with the data it describes | 2026-09-18 |
| 4 | `switch` mode always runs the copied/target DB through `openDatabase`'s existing migration path | Reuses the exact same schema-compatibility guarantee every other reopen already relies on — no new migration-detection logic needed | 2026-09-18 |
| 5 | No progress/cancel UI for a large move; synchronous `cpSync` blocking accepted | Matches existing synchronous-fs precedent in `attachments.ts`; out of REQ-0002's scope, parked | 2026-09-18 |
| 6 | Design+TC gate: approved | user | 2026-09-18 |
