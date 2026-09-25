---
id: ANA-0009
type: analysis
title: Transaction list UX enhancement and Dashboard financial insights — design
status: implemented
size: S
created: 2026-09-23
updated: 2026-09-23
links:
  - REQ-0009
  - TC-0009
---

# ANA-0009: Transaction list UX enhancement and Dashboard financial insights — design

## Overview & Architecture

This enhancement improves two critical user-facing views:
1. **Income & Expense Ledger (`Entry.tsx` & `LedgerTable.tsx`)**:
   - Introduces **Thai Month Filter Chips** (`ทั้งหมด`, `ม.ค.` through `ธ.ค.`) with active states and transaction count indicators.
   - Introduces an **Instant Search Bar** filtering by `note` (หมายเหตุ), `sourcePayer` (ผู้จ่าย/แหล่งที่มา), and `payerTaxId`.
   - Harmonizes the table structure and date formatting (`dd ด.ด. yy`) between Tax Transactions and General Transactions.
   - Adds smooth empty state handling when search/month filters match 0 rows.
2. **Dashboard Overview (`Dashboard.tsx` & `MonthlyTrendChart.tsx`)**:
   - Introduces a **Unified Financial Health & Cashflow KPI Section**:
     - Net Income (after WHT), Total General Expenses, Net Savings Balance (`รายรับสุทธิ - รายจ่ายรวม`), and Savings Rate (`% อัตราการออม`).
   - Introduces a **Tax Optimization & Tax Bracket Advisor**:
     - Active Tax Bracket Tier (e.g. `0%` หรือ `5%` หรือ `10%`), Net Taxable Income, and distance to the next tax bracket tier (`ระยะห่างถึงฐานภาษีถัดไป`).
     - Total available deduction headroom remaining.
   - Connects the **Monthly Trend Chart** directly to the Entry ledger via clickable month bars, setting the active month filter on the ledger.

## Data Structures & Component Interfaces

### 1. Month Filter & Search Filter in `Entry.tsx`
- State:
  - `selectedMonth: number | null` (null = all months, 0 = Jan, 11 = Dec).
  - `searchQuery: string`.
- Filtering Logic:
  ```ts
  const matchesMonth = selectedMonth === null || (new Date(t.date).getMonth() === selectedMonth);
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = !q || (
    t.note?.toLowerCase().includes(q) ||
    t.sourcePayer?.toLowerCase().includes(q) ||
    t.payerTaxId?.toLowerCase().includes(q)
  );
  ```

### 2. Dashboard KPIs & Bracket Calculation
- Cashflow calculations:
  - `netIncomeMinor = result.totalIncomeMinor - result.whtTotalMinor`
  - `totalExpenseMinor = generalTransactions.reduce((acc, t) => acc + t.amountMinor, 0)`
  - `netSavingsMinor = netIncomeMinor - totalExpenseMinor`
  - `savingsRatePercent = netIncomeMinor > 0 ? (netSavingsMinor / netIncomeMinor) * 100 : 0`
- Current Tax Bracket & Headroom Calculation:
  - Find matching bracket tier in `result.brackets` where `netTaxableMinor` falls between `lowerMinor` and `upperMinor`.
  - Calculate distance to next tier: `upperMinor !== null ? upperMinor - result.netTaxableMinor : null`.

### 3. Chart Navigation Bridge
- In `MonthlyTrendChart.tsx`:
  - `onSelectMonth?: (monthIndex: number) => void;`
  - Clicking on a bar invokes `onSelectMonth(monthIndex)` which can navigate to `Entry` with `selectedMonth`.

## UI Design & Token Compliance (`DESIGN.md`)
- Month Chips: `chip` / `chip.active` classes with smooth transitions.
- Search Input: standard themed input with clear search button (`✕`).
- Font Pairing: Chakra Petch for titles, Sarabun for body text, JetBrains Mono with `tabular-nums` for amounts.
- Badges: `status-badge`, `category-tag`, and `accent-badge` for deduction categories.

## Traceability to Requirements

- `AC-1` -> Month filter chips and search bar in `Entry.tsx`.
- `AC-2` -> Unified table layouts in `Entry.tsx` and `LedgerTable.tsx`.
- `AC-3` -> Cashflow & Net Savings KPI card in `Dashboard.tsx`.
- `AC-4` -> Current Tax Bracket and distance to next tier in `Dashboard.tsx`.
- `AC-5` -> Remaining deduction headroom overview in `Dashboard.tsx`.
- `AC-6` -> Clickable month bars on `MonthlyTrendChart.tsx`.
- `AC-7` -> Automated tests passing.
