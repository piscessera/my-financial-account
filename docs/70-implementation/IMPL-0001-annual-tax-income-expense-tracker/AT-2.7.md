# AT-2.7 — Entry screen part 2 (ledger/history/general section)

- **Plan:** PLAN-0001 · **Phase:** P2 · **Commit:** `fe9f936`
- **TC results:** TC-0001 #25, #48, #49 pass (verified manually, see below).

## What was done

- `LedgerTable.tsx` — tax-relevant transactions grouped by `YYYY-MM`, newest month first, a
  subtotal header row per month, and an annual totals strip (income, WHT, transaction count)
  above (TC-0001 #48). Voided rows collapse their action column to a single "ปรับเป็นศูนย์แล้ว —
  ดูประวัติ" link instead of แก้ไข/Void, matching PROTO-0001; a reversal row (`reversalOfId !==
  null`) shows a `pill reversal` badge instead of an income-section tag.
- `HistoryPanel.tsx` — renders one transaction's `audit_log` entries oldest-first
  (`auditLog.listEntityHistory`, already built in AT-1.7); `create`/`update` entries describe
  the amount change in the same style as PROTO-0001's mockup ("แก้ไขจำนวนเงิน: X → Y"), other
  actions (`void`/`reverse`) fall back to a fixed label (TC-0001 #25).
- `Entry.tsx` — now fetches `transactions.listByYear` on load and after every mutation; wires
  the ledger's edit action to `TransactionForm`'s existing `initial` prop (built in AT-2.6 for
  exactly this), void to `transactions.void`, history to `transactions.getHistory`. Adds the
  general-transactions panel below the ledger: `border-color: var(--amber)` and amber-tinted
  category tags, kept visually and structurally separate from the tax section — its own tiles
  (one per category), its own table, never merged into the ledger's totals (TC-0001 #49, AC-14).

## Verification

Same sandbox limitation as AT-2.5/2.6 (no Electron display server; plain Vite has no
`window.api`): built the renderer (`vite build`), loaded the bundle against a stubbed
`window.api` pre-seeded with PROTO-0001's own example figures (68,870.00/15,000.00/reversed-out
1,000.00 income rows across two months, 450.00/1,290.00 general rows, a two-entry edit history).
Read back via `get_page_text` (screenshots intermittently timed out in this session but text
extraction is authoritative for content/structure) and confirmed:
- Ledger: annual tiles "83,870.00 / 450.00 / 3", "กันยายน 2569 — 2 รายการ · รวม 83,870.00" and
  "สิงหาคม 2569 — 1 รายการ · รวม 0.00" subtotal rows, the voided row's collapsed action text —
  all matching PROTO-0001 field-for-field (the mockup's own count differs only because it seeds
  one more example row than this check did).
- General section: อาหาร 450.00 / ช้อปปิ้ง 1,290.00 tiles, table rows with amber category tags —
  matches the mockup exactly.
- History panel: "ประวัติการแก้ไข — รายการ "บจก. ไฮเลเวล" (AC-9a)" heading, two entries
  ("สร้างรายการ — จำนวนเงิน 65,000.00" then "แก้ไขจำนวนเงิน: 65,000.00 → 68,870.00"), oldest first
  — matches the mockup's `#history` panel.
- 145/145 Vitest tests (unaffected), lint, `tsc --noEmit`, `vite build` all clean.

## Deviations from design

None beyond AT-2.6's already-noted ones. `TransactionForm`'s edit mode (built ahead of need in
AT-2.6) is what makes this task's edit action a one-line wire-up rather than a second form.

## Notes for follow-up tasks

- **P2 is now complete** (AT-2.1 through AT-2.7). Next phase-boundary step: the mechanical gate
  (`bash .claude/scripts/gate.sh --plan PLAN-0001 --phase P2`), then a qa-reviewer dispatch
  decision per `dev-execute`'s phase-boundary rule.
- P3 (AT-3.1 deductions/shared-caps/tax-brackets repositories) doesn't depend on the Entry
  screen; it can start immediately once P2's gate passes.
- The `#general` general-transactions section and `LedgerTable`'s reversal-pill rendering are
  both ready for P4's `createReversal`-driven UI flows once a closed-year reversal actually
  happens through the real app (currently only exercised via `transactions.ts`'s own unit
  tests, AT-2.3).
