---
id: TC-0008
type: test-cases
title: Custom tax deductible amount per transaction — test cases
status: implemented
created: 2026-09-23
updated: 2026-09-23
links: [ANA-0008, REQ-0008]
---

# TC-0008: Custom tax deductible amount per transaction — test cases

Rule: every AC and every ANA invariant (INV-1, INV-2, INV-4, INV-8) has ≥ 1 case; `Level = Unit` cases must be implementable in
the project test runners — coding fills the `Result` and `Test ref` columns (dev-implement).

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | Deduction category available on income and expense | Given `TransactionForm` rendered for income or expense, When viewing deduction dropdown, Then all active deduction categories are selectable | Unit | AC-1 | pass | `src/renderer/components/TransactionForm.tsx` |
| 2 | Default deductible amount auto-populates | Given user enters amount 15,000 THB and selects deduction category, When form updates, Then deductible amount field is pre-filled with 15,000.00 | Unit | AC-2 | pass | `src/renderer/components/TransactionForm.tsx` |
| 3 | Custom partial deductible amount accepted | Given transaction amount 15,000 THB, When user enters deductible amount 10,000 THB and submits, Then form submits with `amountMinor = 1500000` and `deductionAmountMinor = 1000000` | Unit | AC-3 | pass | `src/main/repositories/__tests__/transactions.test.ts` |
| 4 | Deductible amount exceeding transaction amount rejected | Given transaction amount 10,000 THB, When user enters deductible amount 12,000 THB and submits, Then form blocks submission and shows error `"จำนวนเงินลดหย่อนภาษีต้องไม่เกินจำนวนเงินของรายการ"` | Unit | AC-4, INV-8 | pass | `src/renderer/components/TransactionForm.tsx` |
| 5 | Repository rejects `deductionAmountMinor > amountMinor` | Given repository call `createTransaction` with `deductionAmountMinor = 200000` and `amountMinor = 100000`, When executed, Then throws `TransactionError` enforcing INV-8 | Unit | INV-8 | pass | `transactions.test.ts::rejects deductionAmountMinor > amountMinor (INV-8)` |
| 6 | Database migration & schema persistence | Given database migrated with `005-custom-deduction-amount.ts`, When transaction inserted with `deductionAmountMinor`, Then row persists `deduction_amount_minor` and records mutation audit log | Unit | AC-5, INV-4 | pass | `schema.test.ts`, `migrate.test.ts` |
| 7 | Deduction aggregation uses custom partial amount | Given an expense transaction with amount 15,000 THB and custom deduction 10,000 THB linked to Life Insurance, When `computeDeductionsSummary` runs, Then category linked total is 10,000 THB (not 15,000 THB) | Unit | AC-6, INV-1 | pass | `deductions.test.ts::aggregates custom partial deductionAmountMinor`, `computeYear.test.ts` |
| 8 | Backward compatibility for legacy linked transactions | Given existing transaction with `deductionCategoryId = 1` and `deductionAmountMinor = null`, When `computeDeductionsSummary` runs, Then aggregates full `amountMinor` via `COALESCE` | Unit | AC-6 | pass | `deductions.test.ts::aggregates custom partial deductionAmountMinor` |
| 9 | LedgerTable displays dual amounts for partial deductions | Given transaction with amount 15,000 THB and deductible amount 10,000 THB, When rendered in `LedgerTable`, Then table displays both the total amount and `[ลดหย่อน ฿10,000.00]` | Unit | AC-7 | pass | `LedgerTable.test.tsx::TC-0008 #9` |
| 10 | Deductions drill-down shows gross and deductible amounts | Given user opens source transactions modal in `Deductions`, When viewing items, Then columns show both gross amount and deductible amount | Unit | AC-7 | pass | `src/renderer/pages/Deductions.tsx` |
| 11 | Closed year prevents mutation of deduction amounts | Given closed tax year, When attempting to update transaction `deductionAmountMinor`, Then throws error preserving closed year immutability | Unit | INV-2 | pass | `transactionsLifecycle.test.ts` |

## Coverage summary
- ACs covered: 8 / 8 (AC-1 through AC-8)
- Unit cases: 11 · Manual cases: 0
- Invariants covered: INV-1, INV-2, INV-4, INV-8

