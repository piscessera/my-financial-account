# AT-5.6 — Import/Export screen

- **Plan:** PLAN-0001 · **Phase:** P5 · **Commit:** `054efd7`
- **TC results:** none newly linked — TC-0001 #43/#44/#45/#46/#47 are all already `pass` at the
  repository level (AT-5.1–5.4); this screen is the presentation layer over those same
  functions, not a new assertion. **P5 and PLAN-0001 are now complete.**

## What was done

- `ImportExport.tsx` — export section (current working year, two buttons calling
  `window.api.csv.chooseSavePath` then `exportLedger`/`exportSummary`); import section (native
  file picker via `chooseImportFile`, a target-year input defaulting to the current Buddhist
  year, "ตรวจสอบไฟล์" → `parseForPreview`). The preview table auto-checks every valid row and
  disables+unchecks invalid ones (unlike Deductions/Settings' manual entry, there's no reason
  to make the user re-check rows the backend already validated); the row count line
  ("เลือกไว้ N จาก M แถว") and confirm button label ("ยืนยันนำเข้า N รายการที่เลือก") both derive
  from the live `checkedRows` set. Confirming calls `commitImport` with exactly the checked
  rows' data and the correct `skippedCount`.
- Wired into `App.tsx`'s nav as the final tab — **every PLAN-0001 screen is now reachable.**

## Verification

Same sandbox limitation as every renderer task this session: built the renderer, loaded it
against a stubbed `window.api` seeded with a 5-row preview result (3 valid rows matching
PROTO-0001's own example figures, 1 row with a missing amount, 1 row targeting an already-closed
year — the two distinct error reasons TC-0001 #45/#46 describe). Confirmed via `get_page_text`:
the export section matches the mockup's copy exactly; choosing a file and checking it produces
"เลือกไว้ 3 จาก 5 แถว" with the correct per-row status pills and error text; confirming produces
"นำเข้าเรียบร้อยแล้ว: 3 รายการ" and resets the preview/file-selection state. 225/225 Vitest tests
unaffected (renderer isn't in the Vitest glob); lint, `tsc --noEmit`, `vite build` all clean.

## Deviations from design

None beyond the phase's already-established pattern (own `useWorkingTaxYear`, no shared
selected-year state).

## Notes for follow-up tasks

- **PLAN-0001 is now fully implemented** (AT-1.1 through AT-5.6, 36/36 tasks). Next
  phase-boundary step: the mechanical gate for P5, then — since this is the plan's **last
  phase** — a qa-reviewer dispatch is called for per `dev-execute`'s phase-boundary rule,
  followed by the plan's completion steps (INDEX update, PARKING-LOT rows from every REV,
  final report).
- Parked items still open and worth surfacing at close: **PL-0004** (a real first-run
  click-through is still owed), **PL-0005** (the no-network lint guard needs widening now that
  real renderer screens exist), **PL-0006** (`npm run build`'s electron-tsc step still fails,
  pre-existing), **PL-0007** ((partially addressed by IPC-layer validation, but the underlying
  path-validation gap was never directly closed), **PL-0008** (the guard-shared-files.js bug
  that forced this entire plan's execution inline instead of via sub-agent dispatch — still
  open), **PL-0010** (every "manual smoke test" this plan used a stubbed `window.api`; a real
  Electron click-through covering the whole app is still owed before release).
