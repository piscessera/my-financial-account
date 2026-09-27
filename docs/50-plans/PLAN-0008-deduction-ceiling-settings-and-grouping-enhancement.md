---
id: PLAN-0008
type: plan
title: Deduction ceiling customization, description editing, and shared cap grouping management
status: implemented
created: 2026-09-27
updated: 2026-09-27
links: [ANA-0011, TC-0011]
---

# PLAN-0008: Deduction ceiling customization, description editing, and shared cap grouping management

## Stage A — Phases (strategic)

### P1: Backend Repositories & Calculation Engine Enhancement
- **Goal:** Implement full lifecycle for shared cap groups (create, update name/amount, delete with reference guard) and extend deduction category updating (description, cap type, group membership, sub-cap) with closed-year protection and audit logging.
- **Deliverables:**
  - `src/main/repositories/settings.ts` (`createSharedCap`, `updateSharedCap`, `deleteSharedCap`)
  - `src/main/repositories/deductions.ts` (expanded `updateCategory` supporting `description`, `capType`, `sharedGroupId`, `capAmountMinor`)
  - Unit tests in `src/main/repositories/__tests__/settings.test.ts`, `src/main/repositories/__tests__/deductions.test.ts`, and `src/main/calc/__tests__/deductions.test.ts`
- **Exit criteria:** TC cases #1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12 pass.
- **Depends on:** —

### P2: IPC API & Preload Bridge
- **Goal:** Expose the new settings methods and updated category update parameters over the IPC bridge with TypeScript typing.
- **Deliverables:**
  - `src/main/ipc/index.ts`
  - `src/preload/preload.ts`
  - Unit tests in `src/main/ipc/__tests__/index.test.ts`
- **Exit criteria:** IPC tests pass cleanly; `window.api.settings` includes new shared cap operations.
- **Depends on:** P1

### P3: Settings UI — Shared Cap Groups & Category Editing
- **Goal:** Build the Shared Cap Groups management panel and upgrade the category editing form in `Settings.tsx` under the Deduction Caps tab, fully styled according to `DESIGN.md`.
- **Deliverables:**
  - `src/renderer/pages/Settings.tsx`
- **Exit criteria:** TC case #13 passes; users can manage shared cap groups and edit category details/grouping seamlessly.
- **Depends on:** P2

## Dependencies & risks

- **Referential Integrity Risk:** Deleting a shared cap group while categories still reference it could leave orphaned IDs.
  - **Mitigation:** `deleteSharedCap` performs a pre-check query and throws a user-friendly `SettingsError` if any categories reference the group.

## Hot files

- `src/main/repositories/settings.ts`
- `src/main/repositories/deductions.ts`
- `src/main/ipc/index.ts`
- `src/preload/preload.ts`
- `src/renderer/pages/Settings.tsx`

## Stage B — Atomic tasks (tactical)

Unit tests are part of each task. Tag money/ledger tasks `[core]` in the description. `Depends` lists AT ids that must be Done first (— if none).

| Task | Phase | Description (incl. done-criterion) | Depends | Files touched | TC | Est | Done |
|------|-------|------------------------------------|---------|---------------|----|----|------|
| AT-1.1 | P1 | `[core]` Implement `createSharedCap`, `updateSharedCap`, `deleteSharedCap` with FK checks, audit logs, and unit tests in `src/main/repositories/settings.ts` and `settings.test.ts` | — | `src/main/repositories/settings.ts`, `src/main/repositories/__tests__/settings.test.ts` | #4, #5, #6, #7, #10, #11, #12 | ~2h | ☑ |
| AT-1.2 | P1 | `[core]` Expand `updateCategory` in `deductions.ts` to support editing `description`, `capType`, `sharedGroupId`, `capAmountMinor` with validations, audit logs, and tests in `deductions.test.ts` (calc & repo) | AT-1.1 | `src/main/repositories/deductions.ts`, `src/main/repositories/__tests__/deductions.test.ts`, `src/main/calc/__tests__/deductions.test.ts` | #1, #2, #3, #8, #9, #10, #11, #12 | ~2h | ☑ |
| AT-2.1 | P2 | Expose `createSharedCap`, `updateSharedCap`, `deleteSharedCap`, and updated `updateCategory` in IPC layer and `preload.ts` with test coverage | AT-1.2 | `src/main/ipc/index.ts`, `src/preload/preload.ts`, `src/main/ipc/__tests__/index.test.ts` | #1, #4, #5, #6 | ~1.5h | ☑ |
| AT-3.1 | P3 | Add Shared Cap Groups panel and upgrade Category edit form in `Settings.tsx` (description, capType, group dropdown, sub-cap) with error handling | AT-2.1 | `src/renderer/pages/Settings.tsx` | #13 | ~2.5h | ☑ |

## Re-plan log
| Date | Change | Reason |
|------|--------|--------|
