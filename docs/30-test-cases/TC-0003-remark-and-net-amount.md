---
id: TC-0003
type: test-cases
title: Add remark field and net amount column to income and expense — test cases
status: active
created: 2026-09-21
updated: 2026-09-21
links: [ANA-0003, REQ-0003]
---

# TC-0003: Add remark field and net amount column to income and expense — test cases

Rule: every AC and every ANA invariant (INV-n) has ≥ 1 case; `Level = Unit` cases must be implementable in the project test runners.

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | TransactionForm renders remark input for tax-relevant income | Given form mode is tax-relevant income, When rendered, Then remark input field "หมายเหตุ (ถ้ามี)" is present and editable | Unit | AC-1 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 2 | TransactionForm renders remark input for tax-relevant expense | Given form mode is tax-relevant expense, When rendered, Then remark input field "หมายเหตุ (ถ้ามี)" is present and editable | Unit | AC-1 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 3 | TransactionForm submit includes note in values | Given user enters text into remark input and submits, When submitted, Then onSubmit callback receives note string | Unit | AC-2 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 4 | LedgerTable renders remark column | Given transactions with and without notes, When LedgerTable renders, Then note text or "—" is displayed in the Remark column | Unit | AC-3 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 5 | LedgerTable renders net amount column for income | Given income transaction with amount 10,000 THB and WHT 300 THB, When rendered, Then Net Amount column displays 9,700.00 THB | Unit | AC-4, INV-1 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 6 | LedgerTable renders net amount column for expense | Given expense transaction with amount 2,000 THB, When rendered, Then Net Amount column displays 2,000.00 THB | Unit | AC-4, INV-1 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 7 | LedgerTable summary tiles show annual net income | Given active income transactions totaling 100,000 THB and total WHT 3,000 THB, When rendered, Then "รวมทั้งปี — ยอดรับสุทธิ" tile displays 97,000.00 THB | Unit | AC-5, INV-1 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 8 | Transaction note edit audit logging | Given existing transaction updated with new note, When updateTransaction executed, Then audit log entry captures before/after note value | Unit | INV-4 | PASS | `src/main/repositories/__tests__/transactionsLifecycle.test.ts` |

## Coverage summary
- ACs covered: 6 / 6
- Unit cases: 8 · Manual cases: 0
- Invariants covered: 2 / 2 (INV-1, INV-4)
