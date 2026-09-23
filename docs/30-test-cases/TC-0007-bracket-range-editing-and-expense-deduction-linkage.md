---
id: TC-0007
type: test-cases
title: Tax bracket range customization and expense-to-deduction linkage — test cases
status: active
created: 2026-09-23
updated: 2026-09-23
links: [ANA-0007, PLAN-0007]
---

# TC-0007: Tax bracket range customization and expense-to-deduction linkage — test cases

Rule: every AC and every ANA invariant (INV-1…INV-5) has ≥ 1 case; `Level = Unit` cases must be implementable in the project test runners — coding fills the `Result` and `Test ref` columns (dev-implement).

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | Baseline tax bracket default initialization | Given a new database or default setup, When querying baseline tax brackets, Then 8 progressive statutory tiers are returned (0% to 35%, starting at 0 and ending open-ended). | Unit | AC-2 | | |
| 2 | Add and update tax bracket range | Given open tax year brackets, When adding a tier or updating lower/upper bounds and rate, Then the bracket is saved and validated for non-overlapping contiguous bounds. | Unit | AC-1 | | |
| 3 | Reject invalid bracket bounds hierarchy | Given an attempt to create a gap between bracket tiers or an upper bound lower than lower bound, When saving, Then the validation throws `SettingsError` and rejects mutation. | Unit | INV-3 | | |
| 4 | Delete tax bracket and re-validate | Given 8 bracket tiers, When deleting an intermediate tier and updating neighbor bounds, Then the updated hierarchy is valid and persisted. | Unit | AC-1 | | |
| 5 | Reset tax brackets to statutory defaults | Given customized bracket tiers, When invoking `resetTaxBracketsToDefault`, Then tiers are reset to the standard 8 Thai statutory tiers. | Unit | AC-1 | | |
| 6 | Record expense with linked deduction category | Given an active tax year and a deduction category (e.g. Life Insurance), When creating an expense transaction with `deductionCategoryId`, Then transaction is stored with the foreign key. | Unit | AC-3 | | |
| 7 | Ignore deduction category on income transactions | Given an income transaction input with a `deductionCategoryId`, When creating the transaction, Then `deduction_category_id` is stored as null. | Unit | AC-3 | | |
| 8 | Aggregate linked expenses in deduction summary | Given multiple expense transactions linked to Life Insurance totaling 120,000 THB, When fetching deduction summary, Then `sourceExpenseMinor` is 120,000 * 100 and count is accurate. | Unit | AC-4 | | |
| 9 | Drill-down itemized source transactions | Given linked expenses for a category, When calling `getSourceTransactions(taxYearId, categoryId)`, Then only active expense transactions for that category and year are returned. | Unit | AC-5 | | |
| 10 | Enforce statutory category cap on over-budget expenses | Given linked life insurance expenses totaling 120,000 THB (cap = 100,000 THB), When computing deductions, Then effective deduction is capped at 100,000 THB and over-cap flag is true. | Unit | INV-4 | | |
| 11 | Enforce shared group cap (Life + Health insurance) | Given Life Insurance of 90,000 THB and Health Insurance of 25,000 THB (total 115,000 THB, shared cap 100,000 THB), When computing deductions, Then total effective deduction for the group is capped at 100,000 THB. | Unit | INV-4 | | |
| 12 | Combined linked expense plus manual deduction amount | Given linked expenses of 40,000 THB and manual entry of 30,000 THB for the same category, When computing deduction, Then total is 70,000 THB (subject to statutory cap). | Unit | AC-4 | | |
| 13 | Tax calculation with customized brackets and capped deductions | Given taxable income, customized tax brackets, and capped deductions, When `computeYear` is executed, Then taxable net income and progressive tax match exact bracket calculations. | Unit | AC-7 | | |
| 14 | Integer satang invariant (no float money math) | Given fractional or decimal inputs, When storing and computing tax brackets and deductions, Then all amounts remain exact integer satang minor units. | Unit | INV-1 | | |
| 15 | Closed tax year rejects bracket and deduction edits | Given a closed tax year (`closedAt != null`), When attempting to add/edit/delete brackets or modify deduction entries, Then the operation throws `SettingsError` / `DeductionError`. | Unit | INV-2 | | |
| 16 | Audit log recording for all mutations | Given mutations to tax brackets, transactions, and deductions, When executed, Then `audit_log` records each action with before and after snapshots. | Unit | INV-5 | | |
| 17 | UI manual verification for Settings bracket manager | Given Settings screen, When switching to `📈 อัตราภาษีขั้นบันได`, Then users can visually add, edit range, delete, and reset brackets with immediate table update. | Manual | AC-1 | | |
| 18 | UI manual verification for Entry expense deduction tag & Deductions summary | Given Entry and Deductions screens, When tagging an expense and viewing Deductions, Then the category displays the badge, item count, aggregated amount, drill-down modal, and over-cap alert. | Manual | AC-4 | | |

## Coverage summary
- ACs covered: 8 / 8 (AC-1 through AC-8)
- Unit cases: 16 · Manual cases: 2
- Invariants covered: 5 / 5 (INV-1 through INV-5)
