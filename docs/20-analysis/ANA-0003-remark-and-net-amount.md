---
id: ANA-0003
type: analysis
title: Add remark field and net amount column to income and expense — design
status: active
size: S
created: 2026-09-21
updated: 2026-09-21
links: [REQ-0003, TC-0003]
---

# ANA-0003: Add remark field and net amount column to income and expense — design

## Context & current behavior

Currently, in `TransactionForm.tsx`, the note input ("หมายเหตุ (ถ้ามี)") is wrapped in `{!taxRelevant && ...}` (lines 290-295), meaning users can only supply notes when entering general transactions. The backend `transactions` table and repository functions (`createTransaction`, `updateTransaction`) already support the `note` column (`text('note')` in [schema.ts](../../src/main/db/schema.ts:61) and [transactions.ts](../../src/main/repositories/transactions.ts)), but the UI restricts input.

In `LedgerTable.tsx`, columns rendered are: วันที่, ประเภท, แหล่งที่มา, จำนวนเงิน, WHT, สถานะ, การจัดการ (7 columns). The table lacks:
1. A column displaying the note / remark.
2. A column displaying the net amount received (`amountMinor - whtMinor` for income, `amountMinor` for expense).
3. An annual net income summary tile (`รวมทั้งปี — ยอดรับสุทธิ`) in the header tiles summary strip.

## Solution overview

### 1. Form Enhancement (`TransactionForm.tsx`)
Render the "หมายเหตุ (ถ้ามี)" input field unconditionally in `TransactionForm.tsx` so that users can enter and edit remarks for:
- Tax-relevant income (`kind === 'income'`)
- Tax-relevant expense (`kind === 'expense'`)
- General non-tax transactions (`!taxRelevant`)

The state `note` is already bound to `values.note` and passed to IPC `transactions.create` and `transactions.update`.

### 2. Tax Ledger Table Enhancement (`LedgerTable.tsx`)
- Update table headers to include:
  1. วันที่
  2. ประเภท
  3. แหล่งที่มา
  4. หมายเหตุ (displays `row.note ?? '—'`)
  5. จำนวนเงิน (`formatSatangAsBaht(row.amountMinor)`)
  6. WHT (`formatSatangAsBaht(row.whtMinor)`)
  7. ยอดสุทธิ (`formatSatangAsBaht(row.kind === 'income' ? row.amountMinor - row.whtMinor : row.amountMinor)`)
  8. สถานะ
  9. การจัดการ
- Update month subtotal header row `colSpan` from 7 to 9.
- In the summary tiles strip above the ledger, add an annual Net Income tile:
  - `รวมทั้งปี — ยอดรับสุทธิ` displaying `formatSatangAsBaht(totalIncome - totalWht)`.
  - Adjust CSS grid columns to `repeat(4, 1fr)` (or responsive layout).

## Invariants

| INV | Rule | Enforced by (code / DB constraint / test) |
|-----|------|--------------------------------------------|
| INV-1 | Amounts are integer minor units (satang), never float; net calculations `amountMinor - whtMinor` are exact integer operations before formatting. | `LedgerTable.tsx` / Unit test |
| INV-4 | Every mutation is audit-logged (including changes to the `note` field). | `src/main/repositories/transactions.ts` / audit log tests |

## Data model changes

None. The database schema already contains `transactions.note`, `amount_minor`, and `wht_minor`.

## API / backend changes

None. The existing IPC handlers and repositories already accept and store `note`.

## UI changes

- `src/renderer/components/TransactionForm.tsx`: Always render the `note` input.
- `src/renderer/components/LedgerTable.tsx`: Add "หมายเหตุ" and "ยอดสุทธิ" columns and "รวมทั้งปี — ยอดรับสุทธิ" header tile.

## UX decisions (from prototype, filled by dev-prototype)

N/A — Size S task, mockup reviewed and accepted during REQ intake.

## Dependencies & risks

Low risk. UI-only change with full backward compatibility.

## Decisions

| # | Decision | Reason | Date |
|---|----------|--------|------|
| 1 | Reuse `transactions.note` for Remark | Avoid schema migrations and leverage existing audit trail | 2026-09-21 |
| 2 | Compute Net Amount on client display | Net amount is a derived view representation (`amount - WHT` for income); DB stays normalized | 2026-09-21 |

## Task list (size S only)

- [x] AT-3.1: Update `TransactionForm.tsx` to render note/remark for all transaction types.
- [x] AT-3.2: Update `LedgerTable.tsx` to display Remark column, Net Amount column, and Net Income annual summary tile.
- [x] AT-3.3: Add / update component tests to verify form submission with remarks and table rendering of remarks and net amounts.
