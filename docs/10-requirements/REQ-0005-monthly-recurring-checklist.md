---
id: REQ-0005
type: requirement
title: Monthly recurring checklist for general transactions
status: active
size: M
created: 2026-09-21
updated: 2026-09-21
links: []
---

# REQ-0005: Monthly recurring checklist for general transactions

## Problem

Users frequently have fixed recurring non-tax expenses or incomes each month (such as rent, internet/utility bills, streaming subscriptions, or regular monthly allowances). Currently, users must manually re-type these repetitive entries every month and have no built-in checklist to track whether each recurring item has already been recorded, skipped, or is still pending for the month.

## Users & triggers

Single account owner, triggered when managing monthly budget templates or checking off recurring items in the Entry screen (`Entry.tsx`).

## In scope

- **Recurring Templates Management**:
  - Define recurring general transaction templates with:
    - Item title/name (e.g., "ค่าเช่าคอนโด", "ค่าเน็ตบ้าน")
    - General category (`food`, `shopping`, `housing`, `other`)
    - Day of month (1–31)
    - Default amount (in satang / minor units, optional)
    - Default remark / note (optional)
    - Active status (`is_active: boolean`)
  - Full CRUD management via a "จัดการรายการประจำ (Manage Templates)" modal/panel.
- **Monthly Checklist in Entry Screen (`Entry.tsx`)**:
  - Render a "📋 รายการประจำเดือน (Monthly Checklist)" panel for the active/selected month.
  - Display all active templates with their monthly status:
    - **Pending (รอจ่าย / ยังไม่บันทึก)**: Shows due day, expected amount, category, with quick actions:
      - **"บันทึก (Record)"**: One-click or modal confirmation to create the general transaction into `transactions` and mark the item completed for that month.
      - **"ข้าม (Skip)"**: Marks the item skipped for this specific month without creating a transaction.
    - **Completed (บันทึกแล้ว)**: Shows green checkmark, actual recorded amount, and link/view of the created transaction.
    - **Skipped (ข้ามแล้ว)**: Shows skipped badge with an option to undo / un-skip.
- **Data Model & Invariants**:
  - `recurring_templates` table storing the recurring schedule definitions.
  - `recurring_monthly_logs` table tracking completion / skip status per `(template_id, year_month)`.
  - Creating a transaction from a recurring item records normal transaction audit trails.

## Out of scope

- Background automated auto-pay/cron deductions (the desktop app is a manual accounting ledger; transactions are created on user confirmation).
- Complex recurrence intervals beyond monthly (e.g., bi-weekly, quarterly).

## Acceptance criteria

- AC-1: Users can create, edit, deactivate, and view recurring templates with title, category, day of month (1-31), default amount, and remark.
- AC-2: `Entry.tsx` renders a monthly checklist showing all active templates for the currently viewed month.
- AC-3: Clicking "บันทึก" on a pending recurring item creates a general transaction in `transactions` and marks the item completed for that month.
- AC-4: Clicking "ข้าม" on a pending recurring item marks it as skipped for that month without creating any transaction.
- AC-5: Users can undo a skipped or completed item, restoring it to pending state (and removing or unlinking the created transaction if undone).
- AC-6: Deactivating a template stops it from appearing in subsequent months while retaining historical log records.
- AC-7: All automated tests (schema, repositories, and UI components) pass.

## Constraints & assumptions

- Domain invariants from `AGENTS.md` apply (money as integer satang `minor`, audit trail on mutations).
- General transactions remain non-tax-relevant (`tax_relevant = false`) and are excluded from tax calculations.

## Size proposal

**M** — Adds database tables (`recurring_templates`, `recurring_monthly_logs`), IPC endpoints, repository methods, and an interactive checklist component with modal management inside `Entry.tsx`.

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-21 | Defined monthly recurring checklist with template management, quick record, skip this month, and embedded widget in Entry page; sized M | user (in intake interview) |
| 2026-09-21 | Scope & size gate approved (size M confirmed) | user |
