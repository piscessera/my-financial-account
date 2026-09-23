---
id: REQ-0007
type: requirement
title: Tax bracket range customization and expense-to-deduction linkage
status: active
size: M
created: 2026-09-23
updated: 2026-09-23
links: [ANA-0007, TC-0007, PLAN-0007]
---

# REQ-0007: Tax bracket range customization and expense-to-deduction linkage

## Problem

1. **Tax Bracket Tier Customization**: Currently, the system only allows editing the percentage tax rate (`rateBp`) of fixed pre-seeded brackets, but does not allow customizing, adding, or removing the net income bracket ranges (lower and upper bounds, e.g. 0 – 150,000, 150,001 – 300,000). Users need full flexibility to customize bracket thresholds if tax legislation evolves or for custom tax planning scenarios.
2. **Expense-to-Deduction Disconnect**: Tax-deductible expenses (such as Life Insurance, Health Insurance, Home Loan Mortgage Interest, Social Security SSO, Provident Fund, or Donations) are often recorded as individual day-to-day transactions in the general expense ledger. Currently, users must manually sum these transactions outside the app and manually type the total into the Deductions screen.
3. **Statutory Cap Enforcing & Visibility**: When multiple expense transactions are tagged with a deduction category, their cumulative sum may exceed statutory caps (e.g. 100,000 THB for life insurance, 25,000 THB for health insurance). Users need automated aggregation that respects statutory caps, warns when over the cap, and displays the source transaction items clearly.

## Users & triggers

- **Single account owner**, triggered when:
  1. Customizing progressive tax bracket tiers (ranges and rates) in baseline defaults or for a specific tax year.
  2. Recording an expense transaction and tagging it with a tax deduction category.
  3. Reviewing the annual tax deductions summary to inspect linked transaction totals, manual adjustments, and capped amounts.
  4. Computing annual tax with accurate deduction caps and tax credits (WHT, dividend credits).

## In scope

- **1. Progressive Tax Bracket Tier Management**:
  - Pre-seeded default baseline of 8 Thai statutory tiers:
    - 0 – 150,000: Exempt (0%)
    - 150,001 – 300,000: 5%
    - 300,001 – 500,000: 10%
    - 500,001 – 750,000: 15%
    - 750,001 – 1,000,000: 20%
    - 1,000,001 – 2,000,000: 25%
    - 2,000,001 – 5,000,000: 30%
    - Over 5,000,000: 35%
  - Add, edit, and delete bracket tiers in Settings (both Baseline Defaults and Year-Specific).
  - Validation: bracket ranges must be contiguous and non-overlapping, with lowerBound < upperBound, and the final tier having no upper bound (open-ended).
  - Quick-access action buttons/links to tax bracket configuration from navigation/summary.
- **2. Expense-to-Deduction Tagging**:
  - In the General Transaction entry form (`Entry.tsx`), when type is `expense`, provide an optional dropdown to select a `deduction_category_id` (e.g. เบี้ยประกันชีวิต, เบี้ยประกันสุขภาพ, ดอกเบี้ยกู้บ้าน, กองทุนสำรองเลี้ยงชีพ/กบข., ประกันสังคม, เงินบริจาค).
  - Store the linked `deduction_category_id` on the transaction row.
- **3. Deductions Screen Aggregation & Itemized Drill-down**:
  - In `Deductions.tsx`, calculate and display the auto-aggregated total from linked transactions for each deduction category.
  - Allow inspecting the itemized list of source transactions for each category (e.g. date, description, amount).
  - Allow manual override or additional manual amount entry alongside linked transactions if necessary.
  - Enforce statutory caps automatically in calculation (e.g. if linked life insurance is 120,000 THB, effective deduction applied is 100,000 THB with an over-cap indicator).
  - Support shared group caps (e.g. Health Insurance 25k max within Life + Health 100k cap, Retirement funds shared cap 500k).
- **4. Tax Calculation Integration & Tax Credits**:
  - Ensure `computeYear` incorporates the combined effective deductions (auto-linked + manual) subject to individual and shared caps.
  - Clearly distinguish between income deductions (reducing taxable net income) and tax credits / prepaid taxes (WHT, dividend tax credits reducing final tax payable).

## Out of scope

- Multi-tenant / multi-user data storage.
- Automated bank statement OCR / receipt image scanning.
- Corporate tax (P.N.D. 50/51) rules — personal income tax (P.N.D. 90/91) only.

## Acceptance criteria

- **AC-1**: Users can add, edit, and delete tax bracket tiers in Settings for both baseline defaults and open tax years, with validation ensuring contiguous, non-overlapping bounds.
- **AC-2**: The standard 8 Thai statutory progressive tax bracket tiers are initialized as the system default.
- **AC-3**: When creating or editing an expense transaction, users can select a tax deduction category from a dropdown list.
- **AC-4**: In the Deductions page, each category displays its aggregated sum from linked expense transactions alongside any manual input.
- **AC-5**: Users can view the itemized list of source expense transactions contributing to any deduction category.
- **AC-6**: When linked expense amounts exceed the statutory cap of a category or a shared group cap, the tax calculation engine caps the deduction at the legal limit and displays a clear over-cap badge in the UI.
- **AC-7**: All tax calculations in Summary and Dashboard accurately reflect customized brackets, capped deductions, and tax credits.
- **AC-8**: All database constraints, domain invariants (minor integer satang, closed year locking, audit logging), and unit tests pass cleanly.

## Constraints & assumptions

- Domain invariants from `AGENTS.md` apply (money as integer satang `minor`, audit logging for all mutations, closed tax years locked against edits).
- Backward compatibility: existing transactions without deduction linkage remain valid (`deduction_category_id = null`).

## Size proposal

**M** — Full lifecycle pipeline requiring DB schema migration (adding deduction foreign key to transactions, bracket tier mutations), calculation engine updates, and enhancements across Entry, Deductions, Settings, and Summary screens.

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-23 | Tax bracket tiers: support full Add/Edit/Delete range customization with 8 standard Thai tiers as default | user |
| 2026-09-23 | Expense-to-Deduction linkage: provide category dropdown in expense form, auto-aggregate in Deductions with drill-down and manual support | user |
| 2026-09-23 | Enforce statutory caps automatically with visual feedback for over-cap amounts; separate deductions from tax credits | user |
