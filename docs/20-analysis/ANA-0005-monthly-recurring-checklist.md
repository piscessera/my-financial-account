---
id: ANA-0005
type: analysis
title: Monthly recurring checklist for general transactions — design
status: active
size: M
created: 2026-09-21
updated: 2026-09-21
links: [REQ-0005]
---

# ANA-0005: Monthly recurring checklist for general transactions — design

## Problem restatement & scope

Users frequently deal with repetitive monthly non-tax expenses or income (such as rent, utilities, internet, streaming subscriptions, and regular allowances). Manually re-entering these transactions every month is error-prone, and users lack a dedicated checklist to track which recurring items have been paid/recorded, skipped, or are still pending for a given month.

## Target architecture

1. **Database Schema (Migration 003 — `003-recurring-checklist.ts`)**:
   - `recurring_templates`:
     - `id INTEGER PRIMARY KEY AUTOINCREMENT`
     - `name TEXT NOT NULL` (e.g. "ค่าเช่าคอนโด", "ค่าเน็ตบ้าน")
     - `kind TEXT NOT NULL CHECK (kind IN ('income', 'expense'))`
     - `general_category TEXT NOT NULL CHECK (general_category IN ('food', 'shopping', 'housing', 'other'))`
     - `due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31)`
     - `default_amount_minor INTEGER CHECK (default_amount_minor IS NULL OR (typeof(default_amount_minor) = 'integer' AND default_amount_minor >= 0))`
     - `default_note TEXT NOT NULL DEFAULT ''`
     - `is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))`
     - `sort_order INTEGER NOT NULL DEFAULT 0`
   - `recurring_monthly_logs`:
     - `id INTEGER PRIMARY KEY AUTOINCREMENT`
     - `template_id INTEGER NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE`
     - `year_month TEXT NOT NULL CHECK (length(year_month) = 7)` (e.g. '2026-03')
     - `status TEXT NOT NULL CHECK (status IN ('completed', 'skipped'))`
     - `transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL`
     - `recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
     - `CONSTRAINT recurring_logs_unique_template_month UNIQUE (template_id, year_month)`

2. **Repository Layer (`src/main/repositories/recurring.ts`)**:
   - `listTemplates(sqlite, includeInactive?: boolean): RecurringTemplateRow[]`
   - `createTemplate(sqlite, input): RecurringTemplateRow`
   - `updateTemplate(sqlite, id, input): RecurringTemplateRow`
   - `setTemplateActive(sqlite, id, isActive): RecurringTemplateRow`
   - `deleteTemplate(sqlite, id): void`
   - `getMonthlyChecklist(sqlite, yearMonth: string): MonthlyChecklistItem[]`
     - Merges active templates with any logs for `yearMonth`.
   - `recordRecurringItem(sqlite, input: RecordRecurringInput): { log: RecurringMonthlyLogRow, transaction: TransactionRow }`
     - Creates the general non-tax transaction (`tax_relevant = false`, `kind = template.kind`, `general_category = template.general_category`) and creates the `completed` monthly log.
   - `skipRecurringItem(sqlite, templateId: number, yearMonth: string): RecurringMonthlyLogRow`
   - `undoRecurringItem(sqlite, templateId: number, yearMonth: string): void`
     - Removes monthly log, and optionally voids/deletes the created transaction.

3. **IPC Channels & Preload API**:
   - `recurring:listTemplates`: `(includeInactive?: boolean) => Promise<RecurringTemplateRow[]>`
   - `recurring:createTemplate`: `(input: CreateRecurringTemplateInput) => Promise<RecurringTemplateRow>`
   - `recurring:updateTemplate`: `(id: number, input: UpdateRecurringTemplateInput) => Promise<RecurringTemplateRow>`
   - `recurring:setTemplateActive`: `(id: number, isActive: boolean) => Promise<RecurringTemplateRow>`
   - `recurring:deleteTemplate`: `(id: number) => Promise<void>`
   - `recurring:getMonthlyChecklist`: `(yearMonth: string) => Promise<MonthlyChecklistItem[]>`
   - `recurring:record`: `(input: RecordRecurringInput) => Promise<RecordRecurringResult>`
   - `recurring:skip`: `(templateId: number, yearMonth: string) => Promise<RecurringMonthlyLogRow>`
   - `recurring:undo`: `(templateId: number, yearMonth: string) => Promise<void>`

4. **UI Components (`src/renderer/components/RecurringChecklist.tsx` & `ManageRecurringModal.tsx`)**:
   - Integrated as a collapsible/expandable widget inside `src/renderer/pages/Entry.tsx` or above the entry form.
   - Shows progress: `X / Y รายการบันทึกแล้ว` with clean color badges (🟢 บันทึกแล้ว, ⏭️ ข้าม, ⏳ รอทำรายการ).
   - Quick action buttons: "บันทึก" (triggers transaction creation with optional prompt for amount if default is null), "ข้าม", "ยกเลิก (Undo)".
   - "⚙️ จัดการรายการประจำ" button opening the template manager modal.

## Invariants & Compliance

- General recurring transactions are always non-tax-relevant (`tax_relevant = false`, `income_section = null`, `tax_deductible = false`).
- Money amounts are integer satang minor units.
- Every created transaction audit-logs as `create` under entity type `transaction`.
