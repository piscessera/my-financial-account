---
id: REQ-0009
type: requirement
title: Transaction list UX enhancement and Dashboard financial insights
status: implemented
size: S
created: 2026-09-23
updated: 2026-09-23
links:
  - ANA-0009
  - TC-0009
---

# REQ-0009: Transaction list UX enhancement and Dashboard financial insights

## Problem

1. **Transaction List UX (`Entry.tsx`)**:
   - As transactions accumulate throughout a tax year, the list renders as a very long unbroken table requiring excessive scrolling.
   - Lacks quick month navigation and instant search capabilities (by notes, payer, or tax ID).
   - Inconsistent table structure, date formats, and badge styles between Tax-relevant transactions and General (non-tax) transactions.
2. **Dashboard Visual & Financial Insights (`Dashboard.tsx`)**:
   - Tax income and general expenses are presented in separate silos without a unified **Net Savings / Cashflow** view (`รายรับสุทธิ - รายจ่ายทั่วไป = เงินออมคงเหลือสะสม`).
   - Missing **Tax Bracket (ฐานภาษีปัจจุบัน)** information, marginal rate tier, and distance to the next tax bracket.
   - Passive deduction headroom displays without showing total remaining deduction capacity or potential tax savings.
   - The monthly trend chart lacks interactivity (e.g. clicking a month to drill down directly to the transaction list for that month).

## Users & triggers

- **Single account owner**, triggered when:
  1. Browsing and managing transactions in `Entry.tsx` with quick month filters and real-time search.
  2. Viewing the `Dashboard.tsx` to understand overall financial health (cashflow, savings rate) and tax optimization status (tax bracket, refund status, remaining deduction capacity).
  3. Clicking a month bar on the Dashboard trend chart to inspect transactions for that month.

## In scope

1. **Transaction List Navigation & Search (`Entry.tsx` & `LedgerTable.tsx`)**:
   - Month filter chips (`ทั้งหมด`, `ม.ค.` - `ธ.ค.`) with active styling and instant filtering.
   - Instant search bar filtering by `note`, `sourcePayer`, and `payerTaxId`.
   - Harmonized table structure, Thai short date format (`dd ด.ด. yy`), JetBrains Mono tabular numbers, and category/deduction badges.
   - Helpful empty states when filtering/searching returns no rows.
2. **Dashboard Visual & Financial Insights (`Dashboard.tsx`)**:
   - **Unified Financial KPI Strip**:
     - *Tax Pillar*: Gross Income, WHT withheld, Net Taxable Income, Estimated Tax Refund/Payable, Current Tax Bracket tier (e.g., 0%, 5%), and Headroom to next bracket.
     - *Cashflow & Savings Pillar*: Net Income (after WHT), Total Expenses, Net Savings Balance (`รายรับสุทธิ - รายจ่ายรวม`), and Savings Rate (`% อัตราการออม`).
     - *Deduction Planning Pillar*: Used Deductions vs Total Remaining Headroom available.
   - **Interactive Monthly Trend Chart (`MonthlyTrendChart.tsx`)**:
     - Interactive clickable month bars to navigate to `Entry.tsx` with that month selected.
     - Visual clarity with Net Cashflow comparison.
3. **Design System Adherence (`DESIGN.md`)**:
   - Slate & Amber color tokens, typography hierarchy (Sarabun body, Chakra Petch headings, JetBrains Mono numbers), and smooth micro-interactions.

## Out of scope

- Server-side pagination (in-memory client filtering is instantaneous for local desktop SQLite).
- Multi-currency conversions (THB only).

## Acceptance criteria

- **AC-1**: `Entry.tsx` provides Thai month filter chips (`ทั้งหมด` + 12 months) and real-time search across notes, payers, and tax IDs.
- **AC-2**: Both Tax and General transaction tables share unified layout, Thai date formats (`dd ด.ด. yy`), and tabular number formatting.
- **AC-3**: `Dashboard.tsx` displays unified Cashflow & Net Savings KPI (Net Income, Total Expenses, Net Savings Balance, Savings Rate %).
- **AC-4**: `Dashboard.tsx` displays current Tax Bracket tier and distance to the next tax tier.
- **AC-5**: `Dashboard.tsx` displays remaining deduction headroom and total deduction utilization.
- **AC-6**: Clicking a month on `MonthlyTrendChart` navigates to `Entry.tsx` filtered by that month.
- **AC-7**: All automated unit tests and build pass with 0 errors.

## Size proposal

**S** — Pure renderer UI/UX and calculation presentation enhancement touching `Entry.tsx`, `Dashboard.tsx`, `MonthlyTrendChart.tsx`, and component tests.

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-23 | Combine Transaction List UX enhancements with Dashboard Visual & Financial Insights | user |
| 2026-09-23 | Add month filter chips, quick search, and unified table formatting to Entry | user |
| 2026-09-23 | Add Cashflow/Savings KPI, Tax Bracket Advisor, and Clickable Month Trend Bridge to Dashboard | user |

