---
id: PLAN-0002
type: plan
title: Change data folder path after setup
status: active
created: 2026-09-18
updated: 2026-09-18
links: [ANA-0002, TC-0002]
---

# PLAN-0002: Change data folder path after setup

## Stage A — Phases (strategic)

### P1: Core folder-change logic (main process)
- **Goal:** `changeFolder`/`targetHasExistingDb` in `dataLocation.ts`, fully covered by unit
  tests, with zero dependency on Electron/IPC/UI.
- **Deliverables:** `DataLocationError`, `targetHasExistingDb`, `ChangeFolderMode`,
  `ChangeFolderResult`, `changeFolder` (move + switch); `AuditEntityType` gains
  `'data_location'`.
- **Exit criteria:** TC-0002 #3, #3a, #4, #5, #6, #8, #9, #10, #11, #12, #13, #14 pass (Unit).
- **Depends on:** —

### P2: IPC + preload wiring
- **Goal:** the renderer can reach `changeFolder`/`targetHasExistingDb` through the same typed
  `window.api` pattern every other domain surface uses.
- **Deliverables:** `dataLocation:targetHasExistingDb` and `dataLocation:changeFolder` IPC
  handlers (the latter also re-points `appDatabase`'s live connection); preload additions.
- **Exit criteria:** handler-map-level verification (build + type-check clean, same pattern as
  every earlier IPC-wiring task in PLAN-0001, e.g. AT-2.5/AT-3.4); no direct TC (Electron glue
  is not unit-tested elsewhere in this codebase either).
- **Depends on:** P1.

### P3: Settings UI
- **Goal:** the owner can change the folder from the Settings screen end to end.
- **Deliverables:** "เปลี่ยนโฟลเดอร์" button, empty-target confirm step, existing-DB warn step
  (switch/cancel only), success/error feedback — inside the existing "ที่จัดเก็บข้อมูล" panel.
- **Exit criteria:** TC-0002 #1, #2, #7, #15 pass (Manual, verified against a stubbed
  `window.api` the same way every prior screen task in PLAN-0001 was verified in this
  sandbox); `vite build` clean.
- **Depends on:** P2.

## Dependencies & risks

- No new external dependency (`node:fs` only — `copyFileSync`/`cpSync`/`mkdirSync`/`rmSync`,
  already used elsewhere in this codebase).
- Risk: synchronous `cpSync` blocks the main process during a large move — accepted per
  ANA-0002 decision #5, parked, not addressed in this plan.
- Risk: this repo's `.claude/hooks/guard-shared-files.js` bug (PL-0008, open since PLAN-0001)
  blocks sub-agent dispatch from inside `.claude/worktrees/<slug>/` paths — if still open when
  this plan executes, tasks are implemented inline by the orchestrator instead, same adaptation
  used throughout PLAN-0001.

## Hot files

- `src/main/dataLocation.ts` (also touched by onboarding — P1 must not regress `createInFolder`)
- `src/main/repositories/auditLog.ts` (shared `AuditEntityType` union — additive only)
- `electron/main.ts`, `electron/preload.ts` (shared IPC/API surface files)
- `src/renderer/pages/Settings.tsx`
- `src/main/__tests__/dataLocation.test.ts`

## Stage B — Atomic tasks (tactical)

Unit tests are part of each task. `Depends` lists AT ids that must be Done first (— if none);
the executor never starts a blocked task. Each row must be actionable on its own — it is pasted
alone into the implementer's dispatch payload.

| Task | Phase | Description (incl. done-criterion) | Depends | Files touched | TC | Est | Done |
|------|-------|------------------------------------|---------|---------------|----|----|------|
| AT-1.1 | P1 | `DataLocationError` class + `targetHasExistingDb(targetFolderPath)` in `dataLocation.ts`; add `'data_location'` to `AuditEntityType` in `auditLog.ts`. Done: unit tests for both `true`/`false` existing-DB cases pass. | — | `src/main/dataLocation.ts`, `src/main/repositories/auditLog.ts`, `src/main/__tests__/dataLocation.test.ts` | #4 | ~1h | ☑ |
| AT-1.2 | P1 | `changeFolder(configDir, currentFolderPath, targetFolderPath, mode)` per ANA-0002's step ordering — switch (repoint + reuse `openDatabase` migration) and move (copy → verify-open → `recordMutation` audit row → write config → delete old, refusing if target already has a DB; `oldFolderCleanupWarning` on cleanup-only failure); same-folder guard. Done: all listed TC cases pass, including the mid-copy-failure and destination-not-writable failure paths leaving the original config untouched. | AT-1.1 | `src/main/dataLocation.ts`, `src/main/__tests__/dataLocation.test.ts` | #3, #3a, #5, #6, #8, #9, #10, #11, #12, #13, #14 | ~4h | ☐ |
| AT-2.1 | P2 | `dataLocation:targetHasExistingDb` and `dataLocation:changeFolder` IPC handlers in `electron/main.ts`; the `changeFolder` handler calls the existing `openAppDatabase` to re-point the live connection to `result.info.folderPath` on success. Done: `tsc --noEmit` clean, handlers follow the existing `dataLocation:*` handler pattern exactly. | AT-1.2 | `electron/main.ts` | — | ~1h | ☐ |
| AT-2.2 | P2 | `window.api.dataLocation.targetHasExistingDb` / `.changeFolder` in `electron/preload.ts`, typed against `ChangeFolderMode`/`ChangeFolderResult`. Done: `vite build` (renderer+electron) clean with the new preload surface. | AT-2.1 | `electron/preload.ts` | — | ~0.5h | ☐ |
| AT-3.1 | P3 | Settings.tsx: "เปลี่ยนโฟลเดอร์" button next to the read-only path (line ~192 panel); click → `chooseFolder()` → `targetHasExistingDb()` branch → empty-target confirm ("ย้ายข้อมูลไปโฟลเดอร์นี้?") or existing-DB warn (ใช้ไฟล์ที่นั่น / ยกเลิก, exactly two choices) → `changeFolder()`; success updates `dataLocation` state + feedback; failure shows `feedback` error and leaves `dataLocation` unchanged. Done: TC #1/#2/#7/#15 verified against a stubbed `window.api` (happy path, cancel-at-picker, cancel-at-warn, and a rejected `changeFolder` call all produce the states ANA-0002 specifies). | AT-2.2 | `src/renderer/pages/Settings.tsx` | #1, #2, #7, #15 | ~4h | ☐ |

## Re-plan log
| Date | Change | Reason |
|------|--------|--------|
| 2026-09-18 | Plan approval gate: approved | user |
