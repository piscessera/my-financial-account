---
id: ANA-0007
type: analysis
title: Tax bracket range customization and expense-to-deduction linkage — design
status: active
size: M
created: 2026-09-23
updated: 2026-09-23
links: [REQ-0007, TC-0007, PLAN-0007]
---

# ANA-0007: Tax bracket range customization and expense-to-deduction linkage — design

## Context & current behavior

1. **Tax Brackets (`src/main/db/schema.ts`, `src/main/repositories/settings.ts`, `src/renderer/pages/Settings.tsx`)**:
   - Brackets are stored in `tax_brackets` with `tax_year_id` (nullable for baseline defaults), `lower_bound_minor`, `upper_bound_minor`, `rate_bp`, and `sort_order`.
   - `Settings.tsx` only offers an inline input to update the percentage `rate_bp` of existing rows. It lacks capabilities to add new tiers, delete tiers, or modify `lower_bound_minor` and `upper_bound_minor`.
2. **Transactions & Deductions Disconnect (`src/main/repositories/transactions.ts`, `src/main/repositories/deductions.ts`)**:
   - `transactions` stores financial entries (`kind = 'income' | 'expense'`). There is currently no `deduction_category_id` foreign key.
   - `deductions` and `deduction_entries` rely purely on manual user entry per category per tax year. Users must calculate cumulative annual totals for life/health insurance, home loan interest, SSO, and donations outside the application.
3. **Deductions UI (`src/renderer/pages/Deductions.tsx`)**:
   - Allows typing manual baht amounts, but does not display or aggregate from transactions, nor does it provide drill-down itemization.

## Solution overview

### 1. Database Migration (`migrations/004-expense-deduction-linkage.ts`)
- Add nullable foreign key column `deduction_category_id` to table `transactions` referencing `deduction_categories.id` (`ON DELETE SET NULL`).
- Add index `idx_transactions_deduction_category` on `(tax_year_id, deduction_category_id)`.
- Update Drizzle schema in `src/main/db/schema.ts`.

### 2. Tax Bracket Range Management (`src/main/repositories/settings.ts`, `src/main/ipc/`)
- Add repository functions:
  - `addTaxBracket(sqlite, { taxYearId, lowerBoundMinor, upperBoundMinor, rateBp, sortOrder })`
  - `deleteTaxBracket(sqlite, id)`
  - `resetTaxBracketsToDefault(sqlite, taxYearId)` — restores standard 8 Thai statutory tiers.
  - `validateBracketHierarchy(brackets)` — enforces contiguous non-overlapping tiers starting at 0 minor and ending with null upper bound.
- Expose IPC endpoints: `settings.brackets.add`, `settings.brackets.delete`, `settings.brackets.resetDefault`, `settings.brackets.update`.

### 3. Expense-to-Deduction Linkage (`src/main/repositories/transactions.ts`, `src/main/repositories/deductions.ts`)
- `createTransaction` and `updateTransaction` accept optional `deductionCategoryId?: number | null`.
- When `kind !== 'expense'`, `deductionCategoryId` is set to `null` or ignored.
- `getDeductionSummary(sqlite, taxYearId)`:
  - Queries `deduction_categories` and `shared_caps` for the year.
  - Sums `amount_minor` from `transactions WHERE tax_year_id = ? AND kind = 'expense' AND status = 'active' AND deduction_category_id = category.id` as `sourceExpenseMinor`.
  - Retrieves manual `amount_minor` from `deduction_entries` as `manualAmountMinor`.
  - Calculates `totalGrossMinor = sourceExpenseMinor + manualAmountMinor`.
  - Calculates `effectiveDeductionMinor` respecting category cap and shared group caps.
  - Returns `sourceExpenseCount` and itemized source transaction summary.
- Add IPC endpoint: `deductions.getSourceTransactions(taxYearId, categoryId)` for drill-down item inspection.

### 4. Calculation Engine Updates (`src/main/calc/deductions.ts`, `src/main/calc/computeYear.ts`)
- Tax computation uses effective deductions calculated from combined linked expenses and manual inputs.
- Deductions reduce taxable net income.
- Withholding tax (WHT) and tax credits (e.g. dividend tax credits) offset the final computed tax payable directly.

### 5. UI Enhancements
- **`src/renderer/pages/Entry.tsx`**:
  - In `TransactionFormModal`, if `kind === 'expense'`, display a dropdown "🏷️ ใช้เป็นค่าลดหย่อนภาษี" populated with active deduction categories for the working tax year.
  - In `LedgerTable`, display a category badge (e.g. `[🛡️ เบี้ยประกันชีวิต]`) on linked expense rows.
- **`src/renderer/pages/Deductions.tsx`**:
  - Display linked expense total (e.g. `120,000 ฿ (3 รายการ)`) alongside the manual amount input.
  - Provide a modal / expandable row to inspect the source transactions (date, description/note, amount).
  - Highlight over-cap warnings (e.g. `⚠️ รายการรวมเกินเพดาน 20,000 บาท — ระบบคำนวณลดหย่อนตามเพดาน 100,000 บาท`).
- **`src/renderer/pages/Settings.tsx`**:
  - Support adding, editing (range and rate), and deleting bracket tiers.
  - Add button "🔄 คืนค่าอัตราภาษีมาตรฐานสรรพากร (8 ขั้น)" to quickly restore defaults.

## Invariants

| INV | Rule | Enforced by |
|-----|------|-------------|
| INV-1 | Money stored as integer minor units (satang), never float; division/rates use basis points (`rateBp`). | DB schema (`*_minor`), calculation engine. |
| INV-2 | Closed tax year immutability: closed tax years reject bracket modifications, deduction changes, and transaction mutations. | `assertYearNotClosed` in repositories. |
| INV-3 | Tax bracket tiers must be contiguous, sorted, and non-overlapping: tier 0 starts at 0, tier $i$ upper + 1 = tier $i+1$ lower, top tier upper is null. | `validateBracketHierarchy` in `settings.ts`. |
| INV-4 | Statutory deduction cap: effective deduction for any category cannot exceed statutory cap; shared groups cannot exceed group cap. | `calc/deductions.ts` and `calc/computeYear.ts`. |
| INV-5 | Every mutation is audit-logged with before and after JSON snapshots. | `recordMutation` in `auditLog.ts`. |

## Data model changes

```sql
-- Migration 004-expense-deduction-linkage.ts
ALTER TABLE transactions ADD COLUMN deduction_category_id INTEGER REFERENCES deduction_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_deduction_category ON transactions(tax_year_id, deduction_category_id);
```

## API / backend changes

- **IPC `settings.brackets`**:
  - `settings.brackets.get(taxYearId?)`: returns brackets list.
  - `settings.brackets.update(id, rateBp, bounds)`: updates rate and/or lower/upper bounds.
  - `settings.brackets.add(payload)`: adds a new bracket tier.
  - `settings.brackets.delete(id)`: deletes a bracket tier.
  - `settings.brackets.resetDefault(taxYearId?)`: resets brackets to 8 statutory tiers.
- **IPC `transactions`**:
  - `transactions.create` & `transactions.update`: accept `deductionCategoryId?: number | null`.
- **IPC `deductions`**:
  - `deductions.getSummary(taxYearId)`: returns category summaries with `sourceExpenseMinor`, `sourceExpenseCount`, `manualAmountMinor`, `effectiveMinor`, and cap warnings.
  - `deductions.getSourceTransactions(taxYearId, categoryId)`: returns array of linked active expense transactions.

## UI changes

- **`Settings.tsx`**: Bracket table displays full range `0 – 150,000`, `150,001 – 300,000` ... with `+ เพิ่มขั้นภาษี`, `✏️ แก้ไขช่วง/อัตรา`, `🗑️ ลบ`, and `🔄 รีเซ็ตค่ามาตรฐาน`.
- **`Entry.tsx`**: Transaction modal shows deduction category selector on expense transactions; ledger table shows badge for tagged items.
- **`Deductions.tsx`**: High-contrast cards with source transaction count/amount badge, drill-down modal, manual adjustment field, and over-cap alert badge.
- **`Summary.tsx` & `Dashboard.tsx`**: Display verified calculation breakdown.

## UX decisions (from prototype, filled by dev-prototype)
*(N/A — standard component design matching DESIGN.md Direction B "Slate & Amber")*

## Dependencies & risks

- **Migration Risk**: Existing SQLite databases must cleanly apply `ALTER TABLE transactions ADD COLUMN deduction_category_id` without data loss. Handled by schema migration runner `src/main/db/migrate.ts`.
- **Foreign Key Cascade**: If a deduction category is deleted, transactions should have `deduction_category_id` set to `NULL` rather than failing or deleting transactions (`ON DELETE SET NULL`).

## Decisions

| # | Decision | Reason | Date |
|---|----------|--------|------|
| 1 | Tagging via optional dropdown on general expense entries | Most natural workflow for users recording insurance/home loan/donations as expenses | 2026-09-23 |
| 2 | Auto-aggregation with manual override/additive support | Flexibility for users who have both itemized expenses and ad-hoc lump sums | 2026-09-23 |
| 3 | Automated statutory cap enforcement in calc engine | Prevents illegal tax calculations and protects user from filing errors | 2026-09-23 |
| 4 | Support full CRUD on tax bracket ranges with validation | Accommodates tax law amendments and custom tax planning | 2026-09-23 |
