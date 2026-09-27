---
id: REQ-0011
type: requirement
title: Deduction ceiling customization, description editing, and shared cap grouping management
status: implemented
size: M
created: 2026-09-27
updated: 2026-09-27
links: [ANA-0011, TC-0011, PLAN-0008]
---

# REQ-0011: Deduction ceiling customization, description editing, and shared cap grouping management

## Problem

In the current Settings screen (**ตั้งค่า -> เพดานค่าลดหย่อน**), users face two main limitations:
1. **Description and Cap Type Editing**: When editing an existing deduction category, users can only modify the category name and cap amount. The legal description / notes cannot be updated, and the cap type cannot be altered once created.
2. **Shared Cap Group Management & Grouping**: Users cannot create new shared cap groups (เพดานกลุ่มที่ใช้ร่วมกัน), edit group names/ceilings, or delete unused groups in the Settings interface. Furthermore, users cannot reconfigure or group existing deduction categories (e.g., grouping "ประกันชีวิต" with max 100,000 and "ประกันสุขภาพ" with max 25,000 into a combined "ประกัน" group with a shared cap of 100,000). When both items are fully utilized, the combined total should automatically enforce the group ceiling (100,000 THB) rather than exceeding it.

## Users & triggers

- **User**: Single account owner managing tax configurations.
- **Triggers**:
  1. Updating the description/notes of statutory deduction categories (e.g., updating law reference or terms).
  2. Creating a new shared deduction cap group (for baseline defaults or a specific tax year).
  3. Grouping existing individual categories into a shared cap group (or converting a grouped category back to a standalone fixed/per-count category).
  4. Adjusting group ceiling amounts or category sub-caps.

## In scope

1. **Category Editing Enhancement**:
   - Allow editing `name`, `description`, `capType` (`fixed`, `per_count`, `shared_group_member`), `capAmountMinor` (standalone cap or sub-cap), and `sharedGroupId` for existing deduction categories.
   - Support both Baseline Defaults and Year-Specific configurations.
2. **Shared Cap Groups (เพดานกลุ่มร่วม) Management in Settings**:
   - Provide a dedicated management section/card in Settings under **เพดานค่าลดหย่อน** to view, create, edit (name, cap amount), and delete shared cap groups.
   - Support creating and managing shared caps for both System Baseline Defaults (`tax_year_id IS NULL`) and specific tax years (`tax_year_id = <id>`).
   - Validate that shared groups cannot be deleted if there are still active deduction categories referencing them.
3. **Category Grouping & Sub-cap Application**:
   - Allow reassigning existing categories into a shared cap group as `shared_group_member` with an optional category-level sub-cap.
   - Maintain calculation integrity (`computeDeductions`) where each member's deduction is first capped by its sub-cap (if defined), and the aggregate sum of all members within the group is capped by the group's `capAmountMinor`.
4. **Closed Tax Year Protection (INV-7) & Audit Logging (INV-4)**:
   - Closed tax years strictly disallow modifying categories or shared groups.
   - All creates, updates, and deletes are recorded in the `audit_log` with before/after state.

## Out of scope

- Changing database schema structure for `shared_caps` or `deduction_categories` (existing schema already supports year-scoped shared groups, sub-caps, and foreign keys).
- Hierarchical multi-level nested groups (group inside another group). Only single-level shared cap groups are supported.

## Acceptance criteria

- **AC-1**: When editing any deduction category in Settings, the modal/form displays and allows updating `name`, `description`, `capType`, `capAmount` (standalone cap or sub-cap), and `sharedGroupId`.
- **AC-2**: Settings -> เพดานค่าลดหย่อน displays a Shared Cap Groups section showing all existing shared groups (name, total cap, member count) for the selected scope (Baseline or Year-specific).
- **AC-3**: Users can create a new Shared Cap group with a custom name and ceiling amount (in THB/satang).
- **AC-4**: Users can edit an existing Shared Cap group's name and ceiling amount.
- **AC-5**: Users can delete an existing Shared Cap group if no categories belong to it; attempting to delete a group with assigned categories displays a clear validation error.
- **AC-6**: When existing categories (e.g. Life Insurance 100,000 and Health Insurance 25,000) are grouped into a shared group (e.g. Insurance Group with cap 100,000), `computeDeductions` correctly caps the individual items by their sub-caps and caps the total group contribution to the group cap (100,000).
- **AC-7**: All modifications to categories and shared cap groups create corresponding `audit_log` records with accurate before and after payloads.
- **AC-8**: Closed tax years prevent any creation, modification, or deletion of categories or shared groups (INV-7).
- **AC-9**: Automated unit tests and IPC repository test suites pass cleanly.

## Constraints & assumptions

- Domain invariants from `AGENTS.md` apply (money as integer satang `minor`, audit logging on mutations, closed year immutability).
- Uses existing `shared_caps` and `deduction_categories` database tables; backend calculation engine (`computeDeductions`) already supports shared group calculations and needs verification with new test cases.

## Size proposal

**M** — Touches main process repositories (`deductions.ts`, `settings.ts`), IPC handlers (`src/main/ipc/`), renderer Settings UI (`Settings.tsx`), and automated test suites. Sized as **M** following the full document-driven lifecycle (Analyze + Test Cases -> Plan -> Implement -> Review).

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-27 | Approved intake questions: (1) Added Shared Cap Groups management section in Settings, (2) Category editing supports all fields including description and grouping assignment, (3) Deductions page preserves current group summary layout | user / Pair programming |
