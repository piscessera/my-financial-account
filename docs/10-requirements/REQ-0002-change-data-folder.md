---
id: REQ-0002
type: requirement
title: Change data folder path after setup
status: active
size: M
created: 2026-09-18
updated: 2026-09-18
links: [ANA-0002, TC-0002, PLAN-0002]
---

# REQ-0002: Change data folder path after setup

## Problem

The data folder (where the SQLite DB file lives) is currently chosen once, during first-run
onboarding (`dataLocation.createInFolder`, [dataLocation.ts](../../src/main/dataLocation.ts)),
and is then fixed for the life of the install — there is no way to change it afterward. The
owner may need to relocate their data (e.g. moving the Google Drive-synced folder, switching
to a different Drive account/folder, reorganizing local disk layout, or pointing the app at
data that already exists on this machine from another source such as a restored Drive folder).
Settings currently only displays the current folder path read-only
([Settings.tsx:192-213](../../src/renderer/pages/Settings.tsx)).

## Users & triggers

Single account owner, triggered from the Settings screen ("ที่จัดเก็บข้อมูล" panel) when they
want to relocate where the app stores/reads its data. Infrequent, deliberate action — not a
startup-flow step.

## In scope

- A "เปลี่ยนโฟลเดอร์" (change folder) action in Settings, next to the existing read-only
  folder-path display.
- Folder picker dialog (reuse the same native dialog pattern as onboarding) to choose a new
  folder.
- Two supported modes, user chooses at the point of change:
  - **Move**: relocate the existing DB file (and any co-located app data) from the current
    folder to the newly selected folder, then point the app at the new folder. Old folder no
    longer used afterward.
  - **Switch/Link**: point the app at a new folder that already contains a valid DB file of its
    own (e.g. synced down from Drive on this machine) — no file copy, just repoint the config.
- If the newly selected folder already contains a DB file
  (`resolveDbPath` → `my-financial-account.db` exists):
  - Warn the user and let them choose: use the existing file found there (switch/link), or
    cancel the change entirely.
  - This applies regardless of which mode (move/switch) they initially picked — an existing DB
    at the destination always stops a silent overwrite.
- If the newly selected folder does **not** contain a DB file:
  - Move mode proceeds (copy/move the current DB file there).
  - Switch mode is not applicable (nothing to switch to) — treated as a move, or the user is
    told to pick a folder that already has data.
- Update `data-location.json` (the config file in Electron's userData dir) to the new
  `folderPath` only after the target DB file is confirmed present/written successfully.
- Every change appends to the app's existing audit-log mechanism (CLAUDE.md invariant: every
  mutation audit-logged) — record old path, new path, mode (move/switch), timestamp.
- Basic failure handling: destination not writable, source file locked/in use, disk full during
  copy — surface a clear error, leave the config pointing at the original (working) folder.

## Out of scope

- Any Google Drive API/OAuth integration to move data remotely — this feature only touches the
  local filesystem the same way onboarding already does.
- Merging/reconciling two *different* non-empty DBs (current data + a distinct existing DB found
  in the new folder) — out of scope; the user picks one or the other, not a merge. → parked in
  `docs/PARKING-LOT.md`.
- Automatic re-detection/repair if the configured folder later becomes unreachable (e.g. Drive
  unsynced) — existing lock/missing-folder handling in `dataLocation.ts`/`lockFile.ts` is
  unchanged; this REQ only adds the deliberate user-initiated change flow. → parked.
- Changing the folder while a tax year is locked/closed — no interaction expected (folder change
  is orthogonal to year-lock), but explicitly not tested beyond normal operation.

## Acceptance criteria

- AC-1: Settings shows a "เปลี่ยนโฟลเดอร์" control next to the current folder-path display.
- AC-2: Clicking it opens a native folder picker.
- AC-3: If the picked folder has no existing DB file, the app moves the current DB file (and
  any co-located data) into it, updates the config, and Settings reflects the new path
  immediately.
- AC-4: If the picked folder already has a DB file, the app warns the user and offers exactly
  two choices: use the existing file there (switch, no copy) or cancel (nothing changes).
- AC-5: On cancel, the app's data location and running state are unchanged — no partial move.
- AC-6: On success (move or switch), an audit-log entry is recorded with old path, new path,
  mode, and timestamp.
- AC-7: If the move fails partway (write error, disk full, locked file), the app reports the
  error and the config still points at the original, working folder — the app is left usable.
- AC-8: After a successful change, closing and reopening the app reads data from the new
  folder (config persisted correctly).

## Constraints & assumptions

- Storage stays local-file-based; no Drive API calls (CLAUDE.md §Project — Storage).
- Business logic/invariant enforcement stays in the main process; renderer only calls the typed
  `window.api` IPC surface (CLAUDE.md — IPC).
- Money/audit invariants from CLAUDE.md (`INV-n` in ANA) apply: every mutation audit-logged.
- Reuses existing `dataLocation.ts` primitives (`resolveDbPath`, `readDataLocationConfig`,
  `getDataLocationInfo`) rather than duplicating folder/DB resolution logic.
- Windows desktop app — folder picker is Electron's native `dialog.showOpenDialog`, same as
  onboarding.

## Size proposal

**M** — touches main-process file-move logic, IPC surface, and a new Settings UI flow, with
several real edge cases (existing DB at destination, mid-move failure, locked files). Not S
(more than a path re-point — involves an actual file move + conflict handling); not L (single
module, no schema change, no new cross-cutting concern). Full pipeline: gates after analyze and
plan, mechanical gate per phase, model review at feature close. User confirmed M.

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-18 | Support both move and switch/link modes; existing-DB-at-destination always warns with use/cancel choice; sized M | user (in intake interview) |
| 2026-09-18 | Scope+size gate: approved | user |
