---
id: ANA-0011
type: analysis
title: Deduction ceiling customization, description editing, and shared cap grouping management — design
status: implemented
size: M
created: 2026-09-27
updated: 2026-09-27
links: [REQ-0011, TC-0011, PLAN-0008]
---

# ANA-0011: Deduction ceiling customization, description editing, and shared cap grouping management — design

## Context & current behavior

- **Category Editing Limitations (`src/main/repositories/deductions.ts`, `src/renderer/pages/Settings.tsx`)**:
  `updateCategory` in [deductions.ts](file:///s:/_puy/project/my-financial-account/src/main/repositories/deductions.ts) only accepts `name` and `capAmountMinor`. The category `description`, `capType`, and `sharedGroupId` cannot be modified once created.
- **Shared Cap Management Gap (`src/main/repositories/settings.ts`, `src/main/ipc/index.ts`)**:
  [settings.ts](file:///s:/_puy/project/my-financial-account/src/main/repositories/settings.ts) provides `getSharedCaps` and `updateSharedCap` (amount only), but lacks functions to create (`createSharedCap`), edit names (`updateSharedCap` with name), or delete (`deleteSharedCap`) shared cap groups. The UI in [Settings.tsx](file:///s:/_puy/project/my-financial-account/src/renderer/pages/Settings.tsx) has no interface to manage shared cap groups.
- **Deduction Calculation Engine (`src/main/calc/deductions.ts`)**:
  [deductions.ts](file:///s:/_puy/project/my-financial-account/src/main/calc/deductions.ts) correctly implements sub-caps and shared group ceilings (`computeDeductions`), but users currently cannot group existing items (like Life Insurance and Health Insurance) into a unified "Insurance" group via Settings.

## Solution overview

### 1. Main Process Repositories Enhancement

1. **`src/main/repositories/settings.ts`**:
   - `createSharedCap(sqlite, input: { taxYearId?: number | null, name: string, capAmountMinor: number }): SharedCapRow`
     - Validates non-empty name, non-negative integer `capAmountMinor`, and open tax year (`assertYearNotClosed`).
     - Inserts record into `shared_caps` and writes audit log (`action: 'create'`).
   - `updateSharedCap(sqlite, id: number, input: { name?: string, capAmountMinor: number }): SharedCapRow`
     - Allows updating `name` alongside `capAmountMinor`.
     - Writes audit log (`action: 'update'`).
   - `deleteSharedCap(sqlite, id: number): void`
     - Enforces referential integrity check: throws `SettingsError` if any `deduction_categories` have `shared_group_id = id`.
     - Deletes from `shared_caps` and writes audit log (`action: 'delete'`).

2. **`src/main/repositories/deductions.ts`**:
   - Expand `UpdateCategoryInput`:
     ```ts
     export interface UpdateCategoryInput {
       readonly name?: string;
       readonly description?: string;
       readonly capType?: CapType;
       readonly capAmountMinor?: number | null;
       readonly sharedGroupId?: number | null;
     }
     ```
   - Update `updateCategory` to apply changes to `name`, `description`, `cap_type`, `cap_amount_minor`, and `shared_group_id`.
   - Validate integrity:
     - If `capType === 'shared_group_member'`, `sharedGroupId` must be provided (and valid).
     - If `capType !== 'shared_group_member'`, `sharedGroupId` is set to `null` and `capAmountMinor` is required (non-negative integer).
     - Validates open tax year (`assertYearNotClosed`).
     - Records mutation in `audit_log`.

### 2. IPC Layer Updates (`src/main/ipc/index.ts` & `src/preload/preload.ts`)

- Expose IPC handlers:
  - `settings:createSharedCap` -> calls `createSharedCap(db, input)`
  - `settings:updateSharedCap` -> calls `updateSharedCap(db, id, input)`
  - `settings:deleteSharedCap` -> calls `deleteSharedCap(db, id)`
  - `settings:updateCategory` -> calls `updateCategory(db, id, input)`

### 3. Renderer Settings UI Updates (`src/renderer/pages/Settings.tsx`)

- **Shared Cap Groups Management Section**:
  - In `Settings.tsx` (under the `deductions` tab), add a dedicated card: "กลุ่มเพดานค่าลดหย่อนร่วม (Shared Cap Groups)".
  - Displays table of shared groups: Name, Cap Amount (THB), Member Count, and Actions (Edit, Delete).
  - Add "+ เพิ่มกลุ่มเพดานใหม่" form.
  - Inline editing panel for modifying group name and ceiling amount.
  - Delete with confirmation and validation alert.
- **Category Edit Form Enhancement**:
  - In `editingCategory` state and panel:
    - `name` text input.
    - `description` text input.
    - `capType` chip selector (`fixed`, `per_count`, `shared_group_member`).
    - When `capType === 'shared_group_member'`: dropdown of shared cap groups + optional sub-cap amount.
    - When `capType !== 'shared_group_member'`: cap amount text input.

## Invariants

| INV | Rule | Enforced by |
|-----|------|-------------|
| INV-1 | Money stored as integer satang `minor` (non-negative integer), never float | DB schema integer columns, repository validations, `money.ts` |
| INV-4 | Every mutation (`create`, `update`, `delete`) leaves an audit trail | `recordMutation` in `auditLog.ts` on all repository mutations |
| INV-6 | Deduction calculations follow cap hierarchy: category sub-cap first, then group cap | `computeDeductions` in `calc/deductions.ts` and automated unit tests |
| INV-7 | Closed tax years (`closed_at != null`) strictly reject modifications | `assertYearNotClosed` in repository write functions and UI disabled states |

## Data model changes

No schema migration required (`shared_caps` and `deduction_categories` tables already support `tax_year_id`, `shared_group_id`, `cap_amount_minor`, `cap_type`, and `description`).

## API / backend changes

1. `settings.createSharedCap({ taxYearId?, name, capAmountMinor })`
2. `settings.updateSharedCap(id, { name?, capAmountMinor })`
3. `settings.deleteSharedCap(id)`
4. `settings.updateCategory(id, { name?, description?, capType?, capAmountMinor?, sharedGroupId? })`

## UI changes

- **Settings (`src/renderer/pages/Settings.tsx`)**:
  - New "Shared Cap Groups" panel under "🛡️ เพดานค่าลดหย่อน" tab.
  - Enhanced category editing modal/panel with description, cap type switcher, shared group selector, and sub-cap input.
  - Consistent Slate & Amber design system tokens from `DESIGN.md`.

## UX decisions (from prototype, filled by dev-prototype)

- Direct settings integration without prototype loop needed since it extends the established `Settings.tsx` sub-tabs and form grids.

## Dependencies & risks

- **Risk**: Deleting a shared group that is referenced by deduction categories.
  - **Mitigation**: Backend query checks for any referencing categories and blocks deletion with a descriptive error message.

## Decisions

| # | Decision | Reason | Date |
|---|----------|--------|------|
| 1 | Add Shared Cap Groups management directly in Settings -> เพดานค่าลดหย่อน | Keeps all deduction configuration co-located in the dedicated settings section | 2026-09-27 |
| 2 | Allow changing `capType` and `description` during category edit | Enables users to reorganize existing categories into shared groups without deleting/recreating entries | 2026-09-27 |
