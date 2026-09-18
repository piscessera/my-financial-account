# AT-3.1 — Settings UI: change-data-folder flow

- **Plan:** PLAN-0002 · **Phase:** P3 · **Commit:** `ecb44b3`
- **TC results:** #1, #2, #7, #15 all pass (manual, browser-pane verification)

## What was done
- `Settings.tsx`: "เปลี่ยนโฟลเดอร์" button in the existing data-location panel;
  `handleChooseFolder`/`handleConfirmFolderChange` handlers and a `FolderChangeState` local
  union (`confirmMove` | `warnExisting`), mirroring the file's existing
  `editingCategory`/`addingCategory` local-modal-state pattern.
- Flow: `chooseFolder()` → `targetHasExistingDb()` branch → empty-target confirm step or
  existing-DB warn step (exactly two choices: ใช้ไฟล์ที่นั่น/switch, ยกเลิก) → `changeFolder()`.
  Success updates `dataLocation` + `feedback`; failure shows `feedback` error and leaves both
  `dataLocation` and the open modal untouched (same pattern as `handleSaveCategoryEdit`).
- **Verification**: no display server in this sandbox, so built the renderer (`vite build`),
  served `dist/` via the existing `renderer-preview` launch config, and loaded a temporary
  `dist/verify.html` (gitignored `dist/`, not committed) that stubs `window.api` before the
  bundle's module script runs. Confirmed in the browser pane: happy-path move (folder updates,
  success message), existing-DB warn showing exactly two choices, cancel (call log unchanged,
  folder unchanged), and a rejected `changeFolder` (error shown, folder unchanged, modal stays
  open for retry).

## Deviations from design
(none)

## Notes for follow-up tasks
- This was PLAN-0002's last task. All 8 ACs / 15 TC cases now have a recorded pass result.
