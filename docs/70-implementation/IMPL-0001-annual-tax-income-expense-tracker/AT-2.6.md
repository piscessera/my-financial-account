# AT-2.6 — Entry screen part 1 (form)

- **Plan:** PLAN-0001 · **Phase:** P2 · **Commit:** `8f2ae71`
- **TC results:** TC-0001 #34 already `pass` at the Unit level (AT-2.2); this task adds the
  matching UI-level behavior, verified manually (see below), not a new TC row.

## What was done

- `TransactionForm.tsx` — one interactive form that reproduces every state PROTO-0001's
  `entry.html` shows as separate static example panels: the filled happy path, the
  missing-`income_section` error (same Thai copy as the mockup: "กรุณาเลือกประเภทเงินได้ก่อนบันทึก",
  TC-0001 #2), and the tax/general toggle (TC-0001 #34). Client-side validation mirrors
  `transactions.ts`'s own shape rules so a bad submission never reaches the IPC call; money
  fields go through `tryParseBahtToSatang` (AT-1.4), the same INV-1 boundary every other
  money-affecting path uses.
- `Entry.tsx` — hosts the form and resolves a working tax year on its own (creates the current
  Buddhist-era year if it doesn't exist yet): no tax-year switcher exists until AT-3.7. On
  submit, calls `transactions.create` then `attachments.add` if a file was chosen.
- `styles.css` (new) — PROTO-0001's accepted design system ported in full (`design/DESIGN.md`,
  "Direction B: Slate & Amber"), plus a small addition at the bottom for real `<input>`/
  `<button>` elements — the mockup only needed to style decorative `<div>`s.
- `App.tsx` — minimal nav shell (brand + links, only "บันทึกรายรับ-รายจ่าย" is a live link) so
  Entry is actually reachable; the other nav items are placeholder text until their own tasks.
- `electron/main.ts`/`preload.ts` — `attachments:chooseFile`, a native "pick one file" dialog,
  the same click-only pattern as `dataLocation:chooseFolder` (AT-1.6) rather than true
  drag-and-drop (which needs `webUtils.getPathForFile` to resolve a dropped `File`'s path).

## Verification

No Electron display server exists in this sandbox (same limitation as AT-1.1/1.6/1.8/2.5), and
the plain Vite dev server alone has no `window.api` (only Electron's preload provides it), so
neither the usual `preview_start` flow nor a raw browser tab could render the real app. Instead:
built the renderer with `vite build`, then loaded the built bundle in the browser pane against a
throwaway stubbed `window.api` (in-memory fakes for every channel this task and AT-2.5 added).
Confirmed against PROTO-0001's `entry.html`:
- Happy-path fill + submit → "บันทึกรายการเรียบร้อยแล้ว", form clears.
- Submitting with no income section selected → the exact error message + red-bordered error
  text the mockup's error-example panel shows.
- Toggling to "รายการทั่วไป — ไม่นับภาษี" → category chips replace the income-section chips, WHT/
  source/payer-tax-ID fields disappear, a note field appears — matches the mockup's general
  example panel field-for-field.
- 145/145 Vitest tests still pass (renderer isn't in `vitest.config.ts`'s test glob); lint +
  `tsc --noEmit` clean; `vite build` (renderer + electron main + preload) all succeed.
- The `dist/preview.html` stub harness and the `.claude/launch.json` `renderer-preview` entry
  used for this are throwaway/dev-tooling — `dist/` is gitignored, nothing from the stub ships.

## Deviations from design

- Added `attachments:chooseFile` IPC channel + `App.tsx`'s nav shell — neither is in this
  task's plan row, but both are small, necessary supports (a way to pick a file, a way to reach
  the screen at all) rather than scope creep into later tasks' actual deliverables (Dashboard,
  routing, etc. are untouched).
- `TransactionForm` already supports an edit mode (`initial` prop) though nothing uses it yet —
  AT-2.7's ledger row "แก้ไข" action is the intended caller, reusing this component rather than
  building a second form.

## Notes for follow-up tasks

- AT-2.7 imports `TransactionForm` for the ledger's edit action (pass `initial={transactionRow}`
  and `onSubmit` that calls `window.api.transactions.update`), and adds `LedgerTable.tsx`/
  `HistoryPanel.tsx` plus the general-transactions section below the form in `Entry.tsx`.
- `useWorkingTaxYear` in `Entry.tsx` is a stand-in for AT-3.7's real tax-year switcher — once
  that lands, replace it rather than layering a second year-selection mechanism on top.
