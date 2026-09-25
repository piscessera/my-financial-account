---
id: TC-0009
type: test-cases
title: Transaction list UX enhancement and Dashboard financial insights — test cases
status: implemented
created: 2026-09-23
updated: 2026-09-23
links:
  - REQ-0009
  - ANA-0009
---

# TC-0009: Transaction list UX enhancement and Dashboard financial insights — test cases

## Test Cases

| Case ID | Title | Description | Expected Result | Status |
|---------|-------|-------------|-----------------|--------|
| TC-0009-01 | Month chip filter in Entry | Select a month chip (e.g. `ม.ค.` or `พ.ค.`) in `Entry.tsx` | Only transactions occurring in that month are rendered; clicking `ทั้งหมด` resets to all transactions. | Pass |
| TC-0009-02 | Quick search filter in Entry | Type query in search bar (e.g. note or payer text) in `Entry.tsx` | Rows matching note, source/payer, or tax ID remain visible; non-matching rows are excluded. | Pass |
| TC-0009-03 | Empty search state in Entry | Search for a non-existent string in `Entry.tsx` | Displays empty state message (`ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา`) without breaking table layout. | Pass |
| TC-0009-04 | Harmonized General transaction layout | View General transactions table in `Entry.tsx` | Follows consistent header columns, Thai short date format (`dd ด.ด. yy`), category badges, and JetBrains Mono tabular numbers. | Pass |
| TC-0009-05 | Dashboard Cashflow & Net Savings KPIs | Open `Dashboard.tsx` with transactions | Displays Net Income, Total Expenses, Net Savings Balance (`รายรับสุทธิ - รายจ่ายรวม`), and Savings Rate %. | Pass |
| TC-0009-06 | Dashboard Tax Bracket Advisor | Open `Dashboard.tsx` with taxable income | Displays current tax bracket tier (e.g., 0% or 5%) and remaining distance to the next tax bracket tier. | Pass |
| TC-0009-07 | Dashboard Deduction Headroom Summary | Open `Dashboard.tsx` with deductions | Displays total remaining headroom across all deduction categories. | Pass |
| TC-0009-08 | Dashboard Monthly Trend Click Bridge | Click a month bar on `MonthlyTrendChart` | Navigates to `Entry` view with that month pre-selected. | Pass |
| TC-0009-09 | Full test suite and build verification | Run `vitest run` and `npm run build` | All test suites pass with 0 errors; production build succeeds. | Pass |
