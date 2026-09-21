---
id: PLAN-0005
type: plan
title: Monthly recurring checklist for general transactions
status: implemented
created: 2026-09-21
updated: 2026-09-21
links: [ANA-0005, TC-0005, REQ-0005]
---

# PLAN-0005: Monthly recurring checklist for general transactions

## Stage A — Phases (strategic)

### P1: Schema Migration & Data Model
- **Goal:** Add `recurring_templates` and `recurring_monthly_logs` tables.
- **Deliverables:** Migration `003-recurring-checklist.ts`, updated `schema.ts` and `migrate.ts`.
- **Exit criteria:** TC-0005 #1 passes.
- **Depends on:** —

### P2: Recurring Repository & IPC Channels
- **Goal:** Implement template CRUD, checklist query, record/skip/undo actions, and IPC wiring.
- **Deliverables:** `src/main/repositories/recurring.ts`, IPC endpoints in `src/main/ipc/index.ts`, typed API in `electron/preload.ts`.
- **Exit criteria:** TC-0005 #2, #3, #4, #5, #6, #7 pass.
- **Depends on:** P1

### P3: UI Components & Entry Page Integration
- **Goal:** Build `RecurringChecklist.tsx` and `ManageRecurringModal.tsx`, integrate into `Entry.tsx`.
- **Deliverables:** Checklist widget, template manager modal, unit tests in `src/renderer/components/__tests__/RecurringChecklist.test.tsx`.
- **Exit criteria:** TC-0005 #8 passes; full build and test suite pass.
- **Depends on:** P2

## Dependencies & risks

- Low risk: Recurring templates only generate non-tax general transactions (`tax_relevant = false`), preserving tax calculation isolation.

## Hot files

- `src/main/db/schema.ts`
- `src/main/db/migrations/003-recurring-checklist.ts`
- `src/main/repositories/recurring.ts`
- `src/main/ipc/index.ts`
- `electron/preload.ts`
- `src/renderer/components/RecurringChecklist.tsx`
- `src/renderer/components/ManageRecurringModal.tsx`
- `src/renderer/pages/Entry.tsx`

## Stage B — Atomic tasks (tactical)

| Task | Phase | Description (incl. done-criterion) | Depends | Files touched | TC | Est | Done |
|------|-------|------------------------------------|---------|---------------|----|----|------|
| AT-1.1 | P1 | [core] Add migration `003-recurring-checklist.ts` and update `schema.ts` with `recurring_templates` and `recurring_monthly_logs` | — | `src/main/db/schema.ts`, `src/main/db/migrations/003-recurring-checklist.ts`, `src/main/db/migrate.ts` | #1 | ~1h | ☑ |
| AT-2.1 | P2 | [core] Implement `src/main/repositories/recurring.ts` for template CRUD, checklist status resolver, and record/skip/undo actions | AT-1.1 | `src/main/repositories/recurring.ts` | #2, #3, #4, #5, #6, #7 | ~1.5h | ☑ |
| AT-2.2 | P2 | Wire recurring IPC handlers and expose typed methods in `electron/preload.ts` | AT-2.1 | `src/main/ipc/index.ts`, `electron/preload.ts` | #2, #4 | ~1h | ☑ |
| AT-3.1 | P3 | Implement `ManageRecurringModal.tsx` template management dialog | AT-2.2 | `src/renderer/components/ManageRecurringModal.tsx` | #8 | ~1.5h | ☑ |
| AT-3.2 | P3 | Implement `RecurringChecklist.tsx` widget with quick record, skip, and undo actions, and integrate into `src/renderer/pages/Entry.tsx` | AT-3.1 | `src/renderer/components/RecurringChecklist.tsx`, `src/renderer/pages/Entry.tsx` | #8 | ~1.5h | ☑ |

## Re-plan log
| Date | Change | Reason |
|------|--------|--------|
