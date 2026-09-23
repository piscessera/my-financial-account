---
id: PLAN-0007
type: plan
title: Tax bracket range customization and expense-to-deduction linkage
status: implemented
size: M
created: 2026-09-23
updated: 2026-09-23
links: [ANA-0007, TC-0007]
---

# PLAN-0007: Tax bracket range customization and expense-to-deduction linkage

## Stage A — Phases (strategic)

### P1: Schema, Repositories, and Tax Engine
- **Goal:** Establish DB schema migration for expense deduction foreign key, bracket CRUD operations with validation, and calculation engine aggregation respecting statutory caps.
- **Deliverables:**
  - Migration `migrations/004-expense-deduction-linkage.ts` and updated Drizzle schema in `schema.ts`.
  - Bracket repository functions (`addTaxBracket`, `deleteTaxBracket`, `updateBracket`, `resetTaxBracketsToDefault`, `validateBracketHierarchy`) in `src/main/repositories/settings.ts`.
  - Deduction summary aggregation and drill-down repository queries in `src/main/repositories/deductions.ts`.
  - Updated `calc/deductions.ts` and `calc/computeYear.ts` for capped deduction calculation.
- **Exit criteria:** TC cases #1–#16 pass unit tests cleanly.
- **Depends on:** —

### P2: IPC Channels & Preload API
- **Goal:** Expose typed IPC endpoints in main process and preload bridge for bracket management and deduction source transactions.
- **Deliverables:**
  - Main IPC handlers in `src/main/ipc/settingsIpc.ts` / `src/main/ipc/deductionsIpc.ts`.
  - Type definitions and contextBridge in `src/preload.ts`.
- **Exit criteria:** All IPC channels invoked cleanly in automated unit and contract tests.
- **Depends on:** P1

### P3: Renderer UI Implementation
- **Goal:** Upgrade `Entry.tsx`, `Deductions.tsx`, and `Settings.tsx` to provide rich visual feedback, drill-down modals, and bracket management adhering to `DESIGN.md`.
- **Deliverables:**
  - `Entry.tsx`: Expense deduction category dropdown and ledger category badges.
  - `Deductions.tsx`: Auto-aggregated linked amounts, source count badges, drill-down breakdown modal, manual inputs, and over-cap visual feedback.
  - `Settings.tsx`: Interactive bracket manager (Add/Edit bounds/Delete/Reset to statutory defaults).
  - Verification on `Summary.tsx` and `Dashboard.tsx`.
- **Exit criteria:** TC cases #17–#18 pass manual verification; test suite passes with 0 regressions.
- **Depends on:** P2

## Dependencies & risks

- **Database Migration Safety**: Migration `004` adds a nullable column `deduction_category_id` to `transactions`. It must preserve all existing data and pass `schema.test.ts`.
- **Foreign Key Consistency**: Deleting a deduction category must set `deduction_category_id` to `NULL` without crashing or deleting transaction entries (`ON DELETE SET NULL`).

## Hot files

- `src/main/db/schema.ts`
- `src/main/db/migrations/004-expense-deduction-linkage.ts`
- `src/main/repositories/settings.ts`
- `src/main/repositories/deductions.ts`
- `src/main/repositories/transactions.ts`
- `src/main/calc/deductions.ts`
- `src/main/calc/computeYear.ts`
- `src/preload.ts`
- `src/renderer/pages/Entry.tsx`
- `src/renderer/pages/Deductions.tsx`
- `src/renderer/pages/Settings.tsx`

## Stage B — Atomic tasks (tactical)

| Task | Phase | Description (incl. done-criterion) | Depends | Files touched | TC | Est | Done |
|------|-------|------------------------------------|---------|---------------|----|----|------|
| AT-1.1 | P1 | [core] Create migration `004-expense-deduction-linkage.ts`, update `src/main/db/schema.ts`, index, and migration runner. Verify schema tests pass. | — | `src/main/db/migrations/004-expense-deduction-linkage.ts`, `src/main/db/schema.ts`, `src/main/db/__tests__/schema.test.ts` | #6, #7, #14 | ~1.5h | ☑ |
| AT-1.2 | P1 | [core] Implement bracket CRUD (`addTaxBracket`, `deleteTaxBracket`, `updateBracket`, `resetTaxBracketsToDefault`, `validateBracketHierarchy`) with closed-year guard and audit logging in `settings.ts`. | AT-1.1 | `src/main/repositories/settings.ts`, `src/main/repositories/__tests__/settings.test.ts` | #1, #2, #3, #4, #5, #15, #16 | ~2h | ☑ |
| AT-1.3 | P1 | [core] Update `transactions.ts` to persist `deductionCategoryId`, and `deductions.ts` / `calc/deductions.ts` / `calc/computeYear.ts` to aggregate linked expenses and enforce statutory & shared caps. | AT-1.1 | `src/main/repositories/transactions.ts`, `src/main/repositories/deductions.ts`, `src/main/calc/deductions.ts`, `src/main/calc/computeYear.ts` | #8, #9, #10, #11, #12, #13, #14 | ~2.5h | ☑ |
| AT-2.1 | P2 | Expose typed IPC endpoints for bracket CRUD/reset and deduction drill-down in main IPC and `src/preload.ts`. | AT-1.2, AT-1.3 | `src/main/ipc/*.ts`, `src/preload.ts` | #1, #2, #5, #6, #8, #9 | ~1.5h | ☑ |
| AT-3.1 | P3 | In `Entry.tsx`, add deduction category dropdown selector for expenses in `TransactionFormModal` and render deduction category badges in `LedgerTable`. | AT-2.1 | `src/renderer/pages/Entry.tsx`, `src/renderer/components/TransactionFormModal.tsx` | #6, #7, #18 | ~2h | ☑ |
| AT-3.2 | P3 | In `Deductions.tsx`, display linked expense totals, source transaction count badges, itemized drill-down modal, manual inputs, and statutory over-cap warnings. | AT-2.1 | `src/renderer/pages/Deductions.tsx`, `src/renderer/components/DeductionBreakdownModal.tsx` | #8, #9, #10, #11, #12, #18 | ~2h | ☑ |
| AT-3.3 | P3 | In `Settings.tsx`, upgrade tax brackets manager with Add tier, Edit bounds/rate, Delete tier, and Reset to Statutory Defaults (8 tiers). | AT-2.1 | `src/renderer/pages/Settings.tsx` | #1, #2, #3, #4, #5, #17 | ~2h | ☑ |
| AT-3.4 | P3 | Integration verification: verify end-to-end calculation across Entry, Deductions, Summary, and Dashboard with full test suite pass. | AT-3.1, AT-3.2, AT-3.3 | `src/renderer/pages/Summary.tsx`, `src/renderer/pages/Dashboard.tsx` | #13, #17, #18 | ~1h | ☑ |

## Re-plan log
| Date | Change | Reason |
|------|--------|--------|
| 2026-09-23 | Completed all Phase 1, 2, and 3 tasks | Full implementation and verification of REQ-0007 |
