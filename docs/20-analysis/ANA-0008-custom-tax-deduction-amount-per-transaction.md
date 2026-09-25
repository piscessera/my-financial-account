---
id: ANA-0008
type: analysis
title: Custom tax deductible amount per transaction — design
status: implemented
size: S
created: 2026-09-23
updated: 2026-09-23
links: [REQ-0008, TC-0008]
---

# ANA-0008: Custom tax deductible amount per transaction — design

## Context & current behavior

- In `src/main/db/schema.ts` and migration `004-expense-deduction-linkage.ts`, transactions have `deductionCategoryId` referencing `deduction_categories.id`.
- In `src/renderer/components/TransactionForm.tsx`, the deduction category dropdown is only visible for `kind === 'expense' || !taxRelevant`. When selected, no custom deductible amount input exists.
- In `src/main/repositories/deductions.ts` and `src/main/calc/computeYear.ts`, linked transactions contribute 100% of their gross amount (`amountMinor`) to the deduction category aggregate sum:
  `sum(amount_minor) WHERE tax_year_id = ? AND deduction_category_id = ?`.
- In real-world accounting, receipts/invoices often contain non-deductible portions (e.g. Life Insurance with non-deductible riders, or mixed expense/income items). Users cannot specify a partial deduction amount, forcing either over-reporting or manual outside-the-app arithmetic.

## Solution overview

1. **Schema Migration (`005-custom-deduction-amount.ts`)**:
   - Add column `deduction_amount_minor INTEGER` (nullable integer satang) to the `transactions` table.
2. **Repository & Backend (`transactions.ts`, `deductions.ts`, `computeYear.ts`)**:
   - Add `deductionAmountMinor` to `CreateTransactionInput`, `UpdateTransactionInput`, and `TransactionRow`.
   - Invariant guard: if `deductionAmountMinor` is non-null, assert `0 < deductionAmountMinor <= amountMinor`.
   - Aggregation queries in `deductions.ts` and `computeYear.ts` use `COALESCE(deduction_amount_minor, amount_minor)`.
   - `getSourceTransactions` query returns both `amount_minor` and `deduction_amount_minor`.
3. **Renderer UI (`TransactionForm.tsx`, `LedgerTable.tsx`, `Deductions.tsx`)**:
   - Make deduction tagging available for all transaction kinds (Income & Expense, Tax & General).
   - Display "จำนวนเงินที่ลดหย่อนภาษีได้ (บาท)" field whenever a deduction category is selected.
   - Default deductible amount to the gross amount (`amountText`), keeping in sync until user manually edits.
   - Real-time form validation: assert `0 < deductionAmount <= itemAmount`, showing `"จำนวนเงินลดหย่อนภาษีต้องไม่เกินจำนวนเงินของรายการ"`.
   - In `LedgerTable.tsx`, show deduction tag and badge indicating deductible amount when partial (e.g. `[ลดหย่อน ฿10,000.00]`).
   - In `Deductions.tsx` itemized drill-down modal, display both gross amount and deductible amount.

## Invariants

| INV | Rule | Enforced by (code / DB constraint / test) |
|-----|------|--------------------------------------------|
| INV-1 | Amounts are integer minor units (`satang`), never float. | SQLite `INTEGER`, `tryParseBahtToSatang`, unit tests |
| INV-2 | Posted transactions in closed tax years are locked against edits. | Repository guard `assertYearNotClosed` |
| INV-4 | Every mutation is audit-logged (`recordMutation` before/after). | Repository transaction wrapper, `audit_log` table |
| INV-8 | Deductible amount invariant: `0 < deduction_amount_minor <= amount_minor` when tagged. | Repository guard, form validation, and unit tests |

## Data model changes

### Migration `005-custom-deduction-amount.ts`

```sql
ALTER TABLE transactions ADD COLUMN deduction_amount_minor INTEGER;
```

### Drizzle Schema (`src/main/db/schema.ts`)

```typescript
export const transactions = sqliteTable(
  'transactions',
  {
    // ...
    deductionCategoryId: integer('deduction_category_id').references(
      () => deductionCategories.id,
      { onDelete: 'set null' },
    ),
    deductionAmountMinor: integer('deduction_amount_minor'),
    // ...
  },
);
```

## API / backend changes

1. **`src/main/repositories/transactions.ts`**:
   - `CreateTransactionInput`: add `deductionAmountMinor?: number | null`.
   - `UpdateTransactionInput`: add `deductionAmountMinor?: number | null`.
   - Validate invariant INV-8: if `deductionAmountMinor !== null && deductionAmountMinor !== undefined`, ensure `deductionAmountMinor > 0 && deductionAmountMinor <= amountMinor`.
2. **`src/main/repositories/deductions.ts`**:
   - In `computeDeductionsSummary`, calculate linked transactions sum using:
     `SELECT COALESCE(SUM(COALESCE(deduction_amount_minor, amount_minor)), 0) AS total_minor FROM transactions WHERE tax_year_id = ? AND deduction_category_id = ? AND status = 'active'`
   - In `getSourceTransactions`, select `id, date, note, general_category, income_section, kind, amount_minor, deduction_amount_minor`.
3. **`src/main/calc/computeYear.ts`**:
   - Ensure linked transactions in year calculation aggregate with `COALESCE(tx.deductionAmountMinor, tx.amountMinor)`.

## UI changes

1. **`TransactionForm.tsx`**:
   - Remove restriction hiding deduction category selector on income items; render deduction category selector for all transaction types.
   - When `deductionCategoryId` is selected:
     - Render `field` for "จำนวนเงินที่ลดหย่อนภาษีได้ (บาท)".
     - Sync default value with `amountText` until user overrides.
     - Validate `deductionAmountSatang`: if selected, require `0 < deductionAmountSatang <= amountSatang`.
2. **`LedgerTable.tsx`**:
   - Update tag chip: if `tx.deductionCategoryId` is present, display category name and if `tx.deductionAmountMinor && tx.deductionAmountMinor < tx.amountMinor`, display `(ลดหย่อน ฿X.XX)`.
3. **`Deductions.tsx`**:
   - In source transactions modal table, show columns: "วันที่", "ประเภท/หมวดหมู่", "บันทึกช่วยจำ", "ยอดรายการ (บาท)", and "ยอดลดหย่อน (บาท)".

## Dependencies & risks

- **Backward compatibility**: existing records have `deduction_amount_minor = null`. Using `COALESCE(deduction_amount_minor, amount_minor)` preserves 100% deduction behavior for pre-existing linked items.
- **Form State sync**: When user edits gross amount, if deduction amount was equal to previous gross amount, auto-update it to the new gross amount to avoid tedious duplicate typing.

## Decisions

| # | Decision | Reason | Date |
|---|----------|--------|------|
| 1 | Allow deduction tagging on both Income and Expense transactions | User requirement; covers both salary deductions / donations and expense invoices | 2026-09-23 |
| 2 | Auto-fill full item amount as initial default deductible amount | Streamlines entry when 100% is deductible while enabling custom partial reduction | 2026-09-23 |
| 3 | Reject submission if `deductionAmount > itemAmount` | Prevents invalid tax over-deductions at source | 2026-09-23 |
| 4 | Display both gross and deductible amounts in LedgerTable and drill-down | Transparency and clear auditability for tax preparation | 2026-09-23 |

## Task list (size S)

- [x] **T-1**: Add migration `005-custom-deduction-amount.ts`, update `schema.ts` and `migrate.ts`.
- [x] **T-2**: Update `transactions.ts`, `deductions.ts`, and `computeYear.ts` with `deductionAmountMinor`, invariant checks (INV-8), and `COALESCE` aggregation. Add unit tests.
- [x] **T-3**: Update `TransactionForm.tsx` to support income/expense deduction tagging, deductible amount field, auto-sync, and validation.
- [x] **T-4**: Update `LedgerTable.tsx` and `Deductions.tsx` source transactions drill-down modal to display custom deductible amounts. Add component tests.
- [x] **T-5**: Run full test suites, TypeScript build, and documentation update.
