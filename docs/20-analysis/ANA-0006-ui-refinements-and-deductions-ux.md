---
id: ANA-0006
type: analysis
title: UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX — design
status: implemented
size: S
created: 2026-09-23
updated: 2026-09-23
links: [REQ-0006, TC-0006]
---

# ANA-0006: UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX — design

## 1. Context & Goals

REQ-0006 addresses multiple UI/UX visual inconsistencies across the desktop application, enhancing readability, table data alignments, tax bracket accessibility in settings, and presenting statutory deduction categories in structured, high-contrast groups.

## 2. Technical Architecture & Component Changes

### 2.1 Thai Month Abbreviations (`LedgerTable.tsx`)
- Replaced `THAI_MONTHS[monthIdx].slice(0, 3)` with an explicit constant:
  ```ts
  const THAI_SHORT_MONTHS = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
  ];
  ```
- Combined with Buddhist year: `${day} ${THAI_SHORT_MONTHS[monthIdx]} ${yy}`.

### 2.2 Table Layout & Styles (`styles.css` & Renderer Components)
- Changed base `thead th` default alignment to `text-align: left`.
- Standardized utility classes:
  - `thead th.num, thead th.right, tbody td.num, tbody td.right`: `text-align: right`
  - `thead th.center, tbody td.center`: `text-align: center`
- Applied consistently across:
  - `src/renderer/components/LedgerTable.tsx`
  - `src/renderer/components/RecurringChecklist.tsx`
  - `src/renderer/components/ManageRecurringModal.tsx`
  - `src/renderer/pages/Entry.tsx`
  - `src/renderer/pages/Summary.tsx`
  - `src/renderer/pages/ImportExport.tsx`
  - `src/renderer/pages/Settings.tsx`

### 2.3 Settings Sub-Navigation (`Settings.tsx`)
- Added top chip-style tab bar matching `Entry.tsx`:
  - `📈 อัตราภาษีขั้นบันได`: Directly displays tax brackets table and edit modal/inline forms.
  - `🛡️ เพดานค่าลดหย่อน`: Manages statutory caps, per-count caps, and shared group limits.
  - `📁 ที่จัดเก็บข้อมูล`: Manages database location, file path, and directory change flow.

### 2.4 Deductions Screen Redesign (`Deductions.tsx`)
- Structured categories into 5 semantic groups:
  1. `personal_family`: ผู้มีเงินได้และครอบครัว
  2. `insurance_savings`: เบี้ยประกันและการออม
  3. `retirement_invest`: กองทุนเกษียณและการลงทุน (500,000 THB shared cap)
  4. `housing_property`: อสังหาริมทรัพย์และดอกเบี้ยบ้าน
  5. `donation_other`: เงินบริจาคและมาตรการกระตุ้นเศรษฐกิจ
- Replaced heavy gray container boxes with clean pure white card panels (`background: var(--surface); border: 1px solid var(--line)`).
- Input fields upgraded with `background: var(--surface)`, crisp borders, and consistent focus outline matching `TransactionForm.tsx`.
- Real-time live computation tile header showing effective deductions, raw total, and active categories.
- Visual warning indicators (`var(--bad-soft)`) for entries exceeding statutory limits.

### 2.5 Deductions & Expenses Linking Architecture (Future Capability)
Proposed 3 architectural patterns for automated linkage between daily expenses and tax deduction categories:
- **Option 1 (Recommended):** Deduction expense category tagging in transaction entries with automatic roll-up and statutory capping.
- **Option 2:** Recurring templates linked to deduction categories.
- **Option 3:** Hybrid auto-reconciliation with manual override.

## Invariants

- `INV-1`: Satang integer representation preserved.
- `INV-6`: Statutory deduction caps and shared group rules enforced.
- `INV-7`: Closed tax years remain read-only and immutable.
