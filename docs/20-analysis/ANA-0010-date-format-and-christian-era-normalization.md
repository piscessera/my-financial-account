---
id: ANA-0010
type: analysis
title: Date format consistency and Christian Era (CE) normalization — design
status: implemented
size: S
created: 2026-09-27
updated: 2026-09-27
links: [REQ-0010, TC-0010]
---

# ANA-0010: Date format consistency and Christian Era (CE) normalization — design

## Context & current behavior

- In `src/renderer/pages/Entry.tsx`, `RecurringChecklist` was passed `yearMonth` computed from `yearState.year.year` (Buddhist Era 2569 $\rightarrow$ `"2569-09"`).
- `RecurringChecklist.tsx` concatenated `yearMonth` with day of month to construct transaction date strings (`"2569-09-15"`).
- `formatShortDate` and `formatThaiMonthYear` added 543 to convert CE to BE, resulting in $2569 + 543 = 3112$ (`กันยายน 3112` / `15 ก.ย. 12`).
- Editing transactions with `"2569-09-15"` in `TransactionForm.tsx` passed year 2569 to HTML5 `<input type="date">`, causing the browser's date picker to corrupt or double-convert.

## Solution overview

1. **Centralized Date Utility (`src/renderer/lib/dateUtils.ts`)**:
   - `normalizeDateToCe(dateStr: string)`: If year $\ge 2400$, converts to `(year - 543)-MM-DD`.
   - `normalizeYearMonthToCe(yearMonth: string)`: If year $\ge 2400$, converts to `(year - 543)-MM`.
   - `ceYearFromTaxYear(taxYear: number)`: Converts BE tax year (2569) to CE (2026).
   - Safe `formatThaiMonthYear` and `formatShortDate`: Guard against double conversion if year $\ge 2400$.
2. **UI Updates (`Entry.tsx`, `TransactionForm.tsx`, `RecurringChecklist.tsx`, `LedgerTable.tsx`, `Summary.tsx`)**:
   - `Entry.tsx`: Uses `ceYearFromTaxYear` when constructing `yearMonth` for `RecurringChecklist`.
   - `TransactionForm.tsx`: Initializes and validates dates using `normalizeDateToCe`.
   - `RecurringChecklist.tsx`: Displays Thai Buddhist month header (`รายการประจำเดือน (กันยายน 2569)`).
3. **Backend Repositories Defense-in-Depth (`transactions.ts`, `recurring.ts`, `csv.ts`)**:
   - `createTransaction`, `updateTransaction`, `recordRecurringItem`, and `validateRow` normalize incoming dates $\ge 2400$ to CE.
4. **Database Migration (`006-normalize-transaction-dates.ts`)**:
   - Updates existing records in `transactions` and `recurring_monthly_logs` to standard CE ISO format.

## Invariants

| INV | Rule | Enforced by (code / DB constraint / test) |
|-----|------|--------------------------------------------|
| INV-1 | Amounts are integer minor units (`satang`), never float. | SQLite `INTEGER`, `tryParseBahtToSatang`, unit tests |
| INV-2 | Posted transactions in closed tax years are locked against edits. | Repository guard `assertYearNotClosed` |
| INV-4 | Every mutation is audit-logged (`recordMutation` before/after). | Repository transaction wrapper, `audit_log` table |
| INV-9 | All transaction dates in SQLite are stored as standard ISO Christian Era `YYYY-MM-DD`. | Repository normalizer, Migration 006, and unit tests |

## Data model changes

### Migration `006-normalize-transaction-dates.ts`

```sql
UPDATE transactions
SET date = printf('%04d', CAST(substr(date, 1, 4) AS INTEGER) - 543) || substr(date, 5)
WHERE CAST(substr(date, 1, 4) AS INTEGER) >= 2400;

UPDATE recurring_monthly_logs
SET year_month = printf('%04d', CAST(substr(year_month, 1, 4) AS INTEGER) - 543) || substr(year_month, 5)
WHERE CAST(substr(year_month, 1, 4) AS INTEGER) >= 2400;
```
