---
id: REQ-0008
type: requirement
title: Custom tax deductible amount per transaction
status: implemented
size: S
created: 2026-09-23
updated: 2026-09-23
links: [ANA-0008, TC-0008]
---

# REQ-0008: Custom tax deductible amount per transaction

## Problem

When recording transactions (income or expenses), a user often has items that are only **partially eligible** for tax deductions:
1. **Partial Eligibility**: For example, an insurance premium invoice of 15,000 THB might contain a 10,000 THB deductible life insurance portion and a 5,000 THB non-deductible rider portion. Currently, tagging an item with a tax deduction category automatically treats 100% of the item's total amount (`amountMinor`) as the deduction amount.
2. **Income & Expense Deductions**: In addition to expenses, certain income transactions (e.g. salary with statutory/pension deductions or donation pass-throughs) or general transactions may need deduction tagging with specific deductible amounts.
3. **Accuracy & Visibility**: Users need to specify the exact deductible portion (`deduction_amount`), enforce that it cannot exceed the transaction's gross amount, and clearly inspect both the gross amount and the deductible amount in transaction lists and the Deductions screen.

## Users & triggers

- **Single account owner**, triggered when:
  1. Creating or editing an income or expense transaction (both Tax-relevant and General) and tagging it with a tax deduction category.
  2. Specifying a custom deductible amount that is less than or equal to the total transaction amount.
  3. Reviewing transaction ledgers (`LedgerTable`) and the Deductions summary page to see exact deductible contributions.

## In scope

1. **Transaction Form Deduction Amount Input**:
   - Enable tax deduction tagging across both **Income** and **Expense** transaction kinds (Tax-relevant and General).
   - When a deduction category is selected, display an explicit **"จำนวนเงินที่ลดหย่อนภาษีได้ (บาท)" (Tax Deductible Amount)** field.
   - **Auto-default**: Pre-fill the deductible amount with the total transaction amount when a category is selected or when the total amount is entered.
   - **Editing**: Allow the user to edit and reduce the deductible amount.
2. **Validation Rules**:
   - Deductible amount must be greater than 0 and **cannot exceed the transaction item's total amount** (`0 < deductionAmountMinor <= amountMinor`).
   - If the user specifies a deductible amount greater than the item amount, display a clear form validation error (`"จำนวนเงินลดหย่อนภาษีต้องไม่เกินจำนวนเงินของรายการ"`).
   - If the deduction category is cleared / unselected, clear the deductible amount.
3. **Database Schema & Persistence**:
   - Add `deduction_amount_minor` (nullable integer satang) column to the `transactions` table.
   - Persist `deduction_amount_minor` on create/update and audit-log mutations.
   - For existing transactions with `deduction_category_id` where `deduction_amount_minor` is null, treat the deduction amount as equal to `amount_minor` for backward compatibility.
4. **Aggregation & Calculation Engine**:
   - Update `deductions.ts` and `computeYear.ts` to aggregate linked transaction deduction amounts using `coalesce(deduction_amount_minor, amount_minor)`.
   - Update `getSourceTransactions` to return `deduction_amount_minor` so itemized drill-downs in `Deductions.tsx` show the deductible portion.
5. **Ledger & UI Visibility**:
   - In `LedgerTable.tsx`, when an item has a linked deduction category:
     - If the deductible amount is less than the item amount, display both clearly (e.g., `฿15,000.00 [ลดหย่อน ฿10,000.00]`).
     - If the deductible amount equals the item amount, display the deduction tag badge.

## Out of scope

- Multi-category splitting on a single transaction (e.g. splitting one transaction across two different deduction categories — user can enter two separate transactions if needed).
- Auto-calculation of tax brackets/rates (already handled in REQ-0007).

## Acceptance criteria

- **AC-1**: In `TransactionForm`, selecting a tax deduction category is available for both income and expense transactions.
- **AC-2**: When a deduction category is selected, a "Tax Deductible Amount" field is displayed and defaults to the transaction's total amount.
- **AC-3**: Users can edit the deductible amount to any value where `0 < deductionAmount <= itemAmount`.
- **AC-4**: Form validation blocks submission and displays an error message if the deductible amount exceeds the transaction amount.
- **AC-5**: Database migration adds `deduction_amount_minor` to `transactions` table and repository persists the value with audit logging.
- **AC-6**: `Deductions.tsx` and `computeYear.ts` aggregate linked deductions using the custom deductible amount rather than the full transaction amount when specified.
- **AC-7**: `LedgerTable` and itemized source transaction drill-downs display the deductible amount alongside the gross amount.
- **AC-8**: All database migration tests, repository unit tests, calculation tests, and UI component tests pass cleanly.

## Constraints & assumptions

- Follows domain invariants from `AGENTS.md` (money as integer satang `minor`, audit logging for all mutations, closed tax years locked against edits).
- Backward compatibility: existing transactions with `deduction_category_id` without explicit `deduction_amount_minor` continue to deduct 100% of their `amount_minor`.

## Size proposal

**S** — Bounded, high-value enhancement with clear scope: adding an optional column `deduction_amount_minor`, updating transaction repository and calculation aggregation, and adding the amount field with validation in `TransactionForm` and `LedgerTable`. Propose S-path (merging analyze/TC and implementation in stream).

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-23 | Allow tax deduction tagging and custom deductible amount on both Income and Expense transactions | user |
| 2026-09-23 | Default deductible amount to full item amount with ability to edit/reduce | user |
| 2026-09-23 | Enforce strict form validation error if deductible amount exceeds gross item amount | user |
| 2026-09-23 | Display both item gross amount and deductible amount in LedgerTable and drill-downs | user |
