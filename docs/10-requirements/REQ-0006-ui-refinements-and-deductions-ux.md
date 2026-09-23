---
id: REQ-0006
type: requirement
title: UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX
status: implemented
size: S
created: 2026-09-23
updated: 2026-09-23
links: [ANA-0006, TC-0006]
---

# REQ-0006: UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX

## Problem

Several UI/UX presentation discrepancies were reported across the application:
1. Thai month abbreviations in the transaction ledger were generated using simple 3-character slicing (e.g. `มกร.`), which does not follow official Thai short month abbreviations (`ม.ค.`, `ก.พ.`, `มี.ค.`, etc.).
2. Table column headers (`thead th`) across all data tables (Tax Ledger, General Transactions, Recurring Checklist, Import/Export, Summary) were misaligned with their respective data cells due to global right-alignment rules.
3. The Settings screen placed progressive tax bracket rates at the very bottom of the screen (underneath 15+ deduction categories), making them difficult to locate without scrolling.
4. The Deductions screen displayed a flat, unstructured list with heavy dark-gray row backgrounds, lacked visual category grouping, and had no real-time live calculation summary or cap exceeded warnings.

## Users & triggers

Single account owner, triggered when navigating through the Entry, Deductions, and Settings pages to record transactions, configure statutory rules, and compute tax deductions.

## In scope

- **Thai month abbreviation correction**:
  - Replace naive sliced month names with standard official abbreviations: `ม.ค.`, `ก.พ.`, `มี.ค.`, `เม.ย.`, `พ.ค.`, `มิ.ย.`, `ก.ค.`, `ส.ค.`, `ก.ย.`, `ต.ค.`, `พ.ย.`, `ธ.ค.`.
- **Table header and cell alignment**:
  - Unify table column alignment across all screens: numeric values/currency right-aligned (`.num`), statuses centered (`.center`), text left-aligned.
- **Settings sub-navigation**:
  - Introduce prominent sub-tabs matching the `Entry.tsx` chip-row style (`📈 อัตราภาษีขั้นบันได`, `🛡️ เพดานค่าลดหย่อน`, `📁 ที่จัดเก็บข้อมูล`) allowing direct navigation and editing of tax brackets.
- **Deductions screen redesign**:
  - Group deduction categories into 5 semantic statutory sections with headers and item counts:
    - 👨‍👩‍👧 ผู้มีเงินได้และครอบครัว (Personal & Family)
    - 🛡️ เบี้ยประกันและการออม (Insurance & Savings)
    - 📈 กองทุนเกษียณและการลงทุน (Retirement Funds & Investment - Shared Cap 500k)
    - 🏠 อสังหาริมทรัพย์และดอกเบี้ยบ้าน (Housing Loan Interest)
    - 🎗️ เงินบริจาคและมาตรการกระตุ้นเศรษฐกิจ (Donations & Others)
  - Add a real-time live calculation summary tile strip (Effective Deductions, Raw Total, Active Categories).
  - Provide distinct over-cap visual warning feedback (`⚠️ ยอดที่กรอกเกินเพดาน`).
  - Upgrade form inputs with high-contrast white backgrounds, crisp borders, and consistent focus rings matching `TransactionForm.tsx`.
- **Architectural proposal for expense-to-deduction linkage**:
  - Formulate structured options (pros/cons/recommendation) for linking daily expenses (e.g. insurance, home mortgage interest) to tax deduction categories.

## Out of scope

- DB schema alterations.
- Backend calculation logic changes (`calc/money.ts`, `calc/deductions.ts`, and `calc/computeYear.ts` remain intact).

## Acceptance criteria

- AC-1: Thai month abbreviations in `LedgerTable` display official short forms (`ม.ค.` to `ธ.ค.`).
- AC-2: Column headers and data cells align consistently across all tables in `Entry.tsx`, `Summary.tsx`, `RecurringChecklist.tsx`, `ManageRecurringModal.tsx`, `Settings.tsx`, and `ImportExport.tsx`.
- AC-3: `Settings.tsx` features chip-style sub-tabs for `📈 อัตราภาษีขั้นบันได`, `🛡️ เพดานค่าลดหย่อน`, and `📁 ที่จัดเก็บข้อมูล`.
- AC-4: `Deductions.tsx` organizes categories into semantic groups with high-contrast white card panels, divider lines, and clean inputs.
- AC-5: `Deductions.tsx` shows real-time live summary tiles and highlights rows exceeding statutory caps.
- AC-6: All unit and component tests pass without regressions.

## Size proposal

**S** — Pure UI/UX enhancement and presentation layout fixes across renderer pages.
