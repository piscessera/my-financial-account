---
id: REQ-0003
type: requirement
title: Add remark field and net amount column to income and expense
status: active
size: S
created: 2026-09-21
updated: 2026-09-21
links: [ANA-0003, TC-0003]
---

# REQ-0003: Add remark field and net amount column to income and expense

## Problem

Currently, the transaction entry form only exposes the "หมายเหตุ" (note/remark) field for general (non-tax-relevant) transactions, preventing users from recording notes or remarks on tax-relevant income and expense entries, even though the database schema already supports a `note` column on `transactions`. Furthermore, in the tax ledger table (`LedgerTable`), users can only view gross amount and WHT separately, making it difficult to immediately view the net income received (gross amount minus WHT) per transaction and in the annual summary header.

## Users & triggers

Single account owner, triggered whenever creating, editing, or viewing income and expense transactions on the Entry page (`Entry.tsx`).

## In scope

- **Remark field in transaction form (`TransactionForm.tsx`)**:
  - Expose the "หมายเหตุ (ถ้ามี) / Remark" input field for all transactions: tax-relevant income, tax-relevant expense, and general transactions.
  - Map this input directly to the existing `note` field in `TransactionFormValues` and `transactions` repository.
- **Remark column in tax ledger table (`LedgerTable.tsx`)**:
  - Add a "หมายเหตุ" (Remark) column to display the transaction note.
- **Net Amount column in tax ledger table (`LedgerTable.tsx`)**:
  - Add a "ยอดสุทธิ" (Net Amount) column in the table:
    - For income: `Net Amount = amountMinor - whtMinor` (gross amount minus WHT).
    - For expense: `Net Amount = amountMinor`.
- **Annual summary tile**:
  - Display an annual Net Income summary tile (`รวมทั้งปี — ยอดรับสุทธิ`) in the header tiles strip alongside gross income and WHT.
- **Automated tests**:
  - Component and unit tests verifying the form captures remarks for tax transactions and the ledger table displays remarks and net amounts correctly.

## Out of scope

- DB schema changes (the existing `transactions.note`, `amount_minor`, and `wht_minor` columns are already present and sufficient).
- CSV export/import schema changes (the `note` and `wht` columns are already part of `LEDGER_CSV_COLUMNS`).

## Acceptance criteria

- AC-1: `TransactionForm` renders a "หมายเหตุ (ถ้ามี)" input field when creating or editing tax-relevant income and expense transactions as well as general transactions.
- AC-2: Submitting a tax-relevant transaction with a remark persists the text into `transactions.note` and preserves it on updates.
- AC-3: `LedgerTable` renders a "หมายเหตุ" column displaying the transaction note (or "—" if empty).
- AC-4: `LedgerTable` renders a "ยอดสุทธิ" column computing `amountMinor - whtMinor` for income transactions and `amountMinor` for expense transactions.
- AC-5: `LedgerTable` summary tile strip displays "รวมทั้งปี — ยอดรับสุทธิ" computing `totalIncome - totalWht`.
- AC-6: All existing tests and new test cases pass.

## Constraints & assumptions

- Domain invariants from `AGENTS.md` apply (money as integer satang `minor`, THB currency, audit logging on mutations).
- No database migrations required.

## Size proposal

**S** — UI and presentation layer enhancement with no DB schema changes, modifying 2-3 renderer components and tests. Fits within a single phase / merged analyze-implement path.

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-21 | Scope defined: reuse existing `note` column for remark across all transactions; add Net Amount column (`amount - wht` for income) and Net Income summary tile; proposed size S | user (in intake interview) |
| 2026-09-21 | Scope & size gate approved (size S confirmed) | user |

