---
id: TC-0002
type: test-cases
title: Change data folder path after setup — test cases
status: active
created: 2026-09-18
updated: 2026-09-18
links: [ANA-0002, PLAN-0002]
---

# TC-0002: Change data folder path after setup — test cases

Rule: every AC (or GAP fix) **and every ANA invariant (INV-n)** has ≥ 1 case; `Level = Unit` cases must be implementable in
the project test runners — coding fills the `Result` and `Test ref` columns (dev-implement).

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | Settings shows the change-folder control | Given the data location panel is loaded, When rendered, Then a "เปลี่ยนโฟลเดอร์" button is present next to the read-only path | Manual | AC-1 | | |
| 2 | Click opens native folder picker | Given the button is clicked, When `dataLocation.chooseFolder()` resolves a path, Then the change flow continues with that path; cancel (`null`) is a no-op | Manual | AC-2 | | |
| 3 | Move into an empty target folder | Given a configured folder with a DB, target folder has no DB file (`targetHasExistingDb` false), When `changeFolder(target, 'move')`, Then the DB file (and `attachments/` if present) exists at target, config now points at target, source DB file is removed | Unit | AC-3 | | |
| 3a | Move creates the target folder if missing | Given target folder doesn't exist yet, When `changeFolder(target, 'move')`, Then target folder is created and the DB is copied into it | Unit | AC-3 | | |
| 4 | Existing DB at target — warn, offer switch or cancel | Given target folder already has a DB file, When the renderer calls `targetHasExistingDb(target)`, Then it returns `true` and the UI offers exactly "ใช้ไฟล์ที่นั่น" (switch) / "ยกเลิก" (cancel), no third option | Unit | AC-4 | pass (main-process part; UI part covered by manual TC #1/#2/#7) | `src/main/__tests__/dataLocation.test.ts::targetHasExistingDb` |
| 5 | Switch to an existing valid DB | Given target folder has a valid DB file, When `changeFolder(target, 'switch')`, Then no file copy occurs, config now points at target, target DB opens (migrated if needed) | Unit | AC-4 | | |
| 6 | `move` refuses to overwrite an existing DB at target | Given target folder already has a DB file, When `changeFolder(target, 'move')` is called directly (bypassing the UI's switch offer), Then it throws `DataLocationError` and neither the config nor any file at target/source is modified | Unit | AC-4, INV-7 | | |
| 7 | Cancel leaves state untouched | Given the existing-DB warning is shown, When the user picks "ยกเลิก", Then no IPC call is made, `dataLocation.get()` still returns the original folder, no files changed | Manual | AC-5 | | |
| 8 | Audit row recorded on move | Given a successful `changeFolder(target, 'move')`, When the target DB's `audit_log` is queried, Then one row exists with `entity_type='data_location'`, `action='update'`, `before.folderPath` = old, `after.folderPath` = new, `after.mode='move'` | Unit | AC-6, INV-4 | | |
| 9 | Audit row recorded on switch | Given a successful `changeFolder(target, 'switch')`, When the target DB's `audit_log` is queried, Then one row exists with `entity_type='data_location'`, `after.mode='switch'` | Unit | AC-6, INV-4 | | |
| 10 | Destination not writable fails safely | Given a target path that cannot be written (e.g. read-only), When `changeFolder(target, 'move')` is called, Then it throws, and `readDataLocationConfig` still returns the original folder (config untouched) | Unit | AC-7, INV-6 | | |
| 11 | Copy verified before source is touched | Given a move where the post-copy `openDatabase` on the target would fail (simulate a corrupt/incomplete copy), When `changeFolder` runs, Then the source DB file at the original folder is never deleted and the config is never rewritten | Unit | AC-7, INV-6 | | |
| 12 | Old-folder cleanup failure doesn't fail the move | Given a successful copy+verify+config-write, but deleting the original DB file at the source afterward throws (e.g. locked file), When `changeFolder(target, 'move')` completes, Then it still returns a success result (with `oldFolderCleanupWarning` set) and the config points at the new, working folder | Unit | AC-7 | | |
| 13 | Change persists across restart | Given a successful folder change, When the app's data-location config is read again (simulating relaunch — `readDataLocationConfig(configDir)`), Then it returns the new folder path | Unit | AC-8 | | |
| 14 | Changing to the same folder is a no-op guard | Given target folder resolves to the same path as the current folder, When `changeFolder` is called, Then it throws a clear `DataLocationError` rather than performing a pointless copy/switch | Unit | INV-7 (defensive) | | |
| 15 | IPC failure surfaces without clobbering Settings state | Given `dataLocation:changeFolder` rejects, When the renderer's handler catches it, Then the existing `feedback` error state shows the message and `dataLocation` (the displayed folder) is left unchanged | Manual | AC-7 | | |

## Coverage summary
- ACs covered: 8 / 8 (AC-1..AC-8)
- Unit cases: 11 · Manual cases: 4
- Invariants covered: INV-4, INV-6, INV-7 (all new/relevant invariants for this REQ) — INV-1 n/a (no money fields touched, noted in ANA)
