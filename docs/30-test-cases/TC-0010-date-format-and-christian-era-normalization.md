---
id: TC-0010
type: test-cases
title: Date format consistency and Christian Era (CE) normalization — test cases
status: implemented
created: 2026-09-27
updated: 2026-09-27
links: [ANA-0010, REQ-0010]
---

# TC-0010: Date format consistency and Christian Era (CE) normalization — test cases

## Test matrix

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | `normalizeDateToCe` normalizes BE date strings to CE | Given date string `2569-09-15`, When `normalizeDateToCe` is called, Then returns `2026-09-15` | Unit | AC-1, INV-9 | pass | `src/renderer/lib/__tests__/dateUtils.test.ts` |
| 2 | `normalizeYearMonthToCe` normalizes BE year-month strings | Given year-month `2569-09`, When `normalizeYearMonthToCe` is called, Then returns `2026-09` | Unit | AC-1, INV-9 | pass | `src/renderer/lib/__tests__/dateUtils.test.ts` |
| 3 | `formatThaiMonthYear` guards against double BE conversion | Given year-month `2569-09` or `2026-09`, When `formatThaiMonthYear` is called, Then returns `กันยายน 2569` (never `3112`) | Unit | AC-2 | pass | `src/renderer/lib/__tests__/dateUtils.test.ts` |
| 4 | `formatShortDate` guards against double BE conversion | Given date string `2569-09-15` or `2026-09-15`, When `formatShortDate` is called, Then returns `15 ก.ย. 69` (never `12` / `3112`) | Unit | AC-2 | pass | `src/renderer/lib/__tests__/dateUtils.test.ts` |
| 5 | `createTransaction` normalizes BE dates on insertion | Given input with `date = '2569-09-15'`, When `createTransaction` is called, Then persisted row has `date = '2026-09-15'` | Unit | AC-1, INV-9 | pass | `src/main/repositories/__tests__/transactions.test.ts` |
| 6 | `updateTransaction` normalizes BE dates on update | Given input with `date = '2569-09-20'`, When `updateTransaction` is called, Then updated row has `date = '2026-09-20'` | Unit | AC-1, AC-3 | pass | `src/main/repositories/__tests__/transactions.test.ts` |
| 7 | Migration 006 converts existing BE records in database | Given database with transactions and logs containing year $\ge 2400$, When migration 006 executes, Then dates are converted to CE | Unit | AC-4, INV-9 | pass | `src/main/db/__tests__/migrate.test.ts` |
| 8 | Recurring checklist renders Thai BE month in header | Given `RecurringChecklist` with `yearMonth = "2026-03"`, When rendered, Then displays `รายการประจำเดือน (มีนาคม 2569)` | Unit | AC-2 | pass | `src/renderer/components/__tests__/RecurringChecklist.test.tsx` |

## Coverage summary
- ACs covered: AC-1 through AC-4
- Invariants covered: INV-1, INV-2, INV-4, INV-9
