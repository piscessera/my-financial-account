# AT-5.5 — IPC wiring for `csv.*`

- **Plan:** PLAN-0001 · **Phase:** P5 · **Commit:** `637bb8e`
- **TC results:** none linked. Done-criterion is a manual smoke test (see below).

## What was done

- `src/main/ipc/index.ts` — `csv:exportLedger`/`csv:exportSummary`/`csv:parseForPreview`/
  `csv:commitImport`. `csv:exportSummary` calls `getTaxYear` + `getYearResult` (reusing
  `gatherYearInputs`, AT-4.5) before formatting — never a bare `computeYear()` call, so a closed
  year's exported summary matches its frozen snapshot, same guarantee `calc:computeYear` already
  has.
- `electron/main.ts` — `csv:chooseSavePath` (native save dialog, `.csv` filter) and
  `csv:chooseImportFile` (native open dialog, `.csv` filter) — same click-only pattern as
  `dataLocation:chooseFolder`/`attachments:chooseFile`.
- `electron/preload.ts` — `window.api.csv.*`.
- **Done-criterion ("manual smoke test")**: `src/main/ipc/__tests__/index.test.ts` (2 new cases)
  — exports a ledger, previews it back in for a *different* target year, commits the full
  preview, and confirms the imported row has `source: 'import'`; a second case exports a summary
  and confirms it reproduces the exact `TAX-2025` reference balance. `vite build` succeeds with
  the new preload surface.
- 225 tests pass (223 prior + 2 new); lint + `tsc --noEmit` clean.

## Deviations from design

None.

## Notes for follow-up tasks

- AT-5.6 (Import/Export screen) calls `window.api.csv.chooseSavePath`/`chooseImportFile` for
  file pickers, then `exportLedger`/`exportSummary`/`parseForPreview`/`commitImport` for the
  actual flow.
