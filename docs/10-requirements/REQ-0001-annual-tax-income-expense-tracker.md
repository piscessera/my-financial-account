---
id: REQ-0001
type: requirement
title: Annual tax income/expense tracker
status: active
size: L
created: 2026-09-13
updated: 2026-09-13
links: []
---

# REQ-0001: Annual tax income/expense tracker

## Problem
The user currently tracks personal income and expenses in a manual Excel workbook
(`Puy Money Management.xlsx`) to produce an annual Thai personal income tax summary. Entries
are recorded monthly in aggregate rather than per transaction, deduction ceilings are
maintained by hand, and the tax calculation is a set of manually-linked formulas the user must
keep correct every year. The user wants a dedicated application that records each income (and,
where relevant, expense) transaction individually, applies Thai personal income tax rules, and
produces an annual tax summary — reducing manual formula upkeep and giving an auditable,
per-transaction record with supporting evidence attached.

## Users & triggers
Single user (the account owner), on their own Windows machine. Triggered continuously through
the year as income is received (salary, freelance, business/sales) and, at year end, when
preparing the annual personal income tax filing (ภ.ง.ด.90/91).

## In scope
- Desktop application (Windows), evaluated as Electron or Tauri at analyze stage.
- Local data storage (e.g. SQLite file) in a folder the user chooses — intended to be a folder
  synced by the Google Drive desktop client. No Google API integration; the app only reads/
  writes a local file.
- Record income transactions individually (not monthly aggregates), each with: date, amount,
  income type (Revenue Code section 40(1) salary/wages, 40(2) freelance, 40(5)–(8) business/
  sales), source/payer, withholding tax (WHT) amount if any, and optional attached evidence
  files (image/PDF).
- Per tax year, choice of business expense deduction method for 40(5)-(8) income: lump-sum
  (%) or actual expenses — actual expenses requires recording expense transactions.
- Deduction (ค่าลดหย่อน) entry covering the full category list found in the user's existing
  workbook (`TAX-2025` sheet — personal, spouse, children, parents, disabled dependents, life/
  health insurance incl. parents', LTF, RMF, SSF/Thai ESG, provident fund, pension insurance,
  social security, home-loan interest, other government stimulus measures, and 3 donation
  categories), each with its statutory cap shown/enforced.
- Progressive tax calculation (current brackets: 0–35%) on net taxable income after expenses
  and deductions.
- Net the calculated tax against total WHT recorded for the year; show whether additional tax
  is due or a refund is owed.
- On-screen annual summary per tax year; multi-year history (the user re-enters data per
  calendar/tax year, consistent with the existing workbook's per-year sheets).
- More than one tax year can be open at once — the user can create and start entering data for
  a future tax year in advance, without needing to close the current one first.
- Mark a tax year as filed/closed once its return has been submitted, locking its transactions;
  a confirmation step states plainly what becomes locked before it takes effect.
- Settings screen listing every deduction category's cap and the progressive tax bracket
  table, editable by the user (fixed values, not income-relative formulas) so figures can be
  updated if the law changes; edits apply per tax year going forward and are audit-logged.
- Dashboard (home screen) for the open tax year the user is currently viewing: running income
  and WHT totals, each deduction category's amount used vs. its remaining headroom, and an
  estimated tax position — all computed live from the same engine as the year-end summary, so
  the user can track standing before the year closes.
- Domain invariants from `CLAUDE.md`: money as integer minor units or exact decimal (never
  float); a transaction is directly editable while its tax year is open (every edit
  audit-logged with before/after values); once the tax year is marked filed/closed its
  transactions lock and further correction is a reversal entry, not a silent edit; balances
  reconcile to entries; every mutation audit-logged; currency explicit (THB only).

## Out of scope
- Personal budget/spending allocation tracking (categories such as Food, Shopping, Fund,
  Insurance from the existing workbook) — parked for a later phase.
- Net worth / asset / investment portfolio / insurance policy tracking (the existing
  `*-Asset` sheets) — parked for a later phase.
- Generating official filing documents (PDF, ภ.ง.ด.90/91 forms) — MVP shows the summary
  on-screen only; the user files manually using the displayed figures.
- CSV/bank-statement import and OCR receipt scanning — manual entry only for MVP; import may
  be reconsidered later if manual entry volume becomes a burden.
- Multi-user access, authentication, or any server/cloud backend.
- Concurrent use of the same data file from two machines at once (Google Drive sync is
  treated as backup/single-writer-at-a-time, not real-time multi-device collaboration).

## Acceptance criteria
- AC-1: User can create an income transaction with date, amount, income type (40(1)/40(2)/
  40(5)-(8)), source/payer, WHT withheld, and zero or more attached evidence files.
- AC-2: User can set, per tax year, whether 40(5)-(8) business income uses lump-sum (%) or
  actual-expense deduction; when actual is selected, expense transactions can be recorded and
  are used in the calculation instead of the lump-sum amount.
- AC-3: User can enter an amount for each statutory deduction category from the reference list
  in `TAX-2025`; the system displays that category's statutory cap (a fixed value, editable in
  Settings — see AC-11) and does not allow the entered amount to silently exceed it uncapped
  in the calculation.
- AC-3a: Caps are modeled per their real shape, not uniformly as one flat amount: some are a
  fixed ceiling (e.g. general donation cap), some are a per-count multiplier (e.g. children,
  qualifying parents — cap scales with how many the user records), and some are a shared
  ceiling spanning multiple deduction line items (e.g. life + health self-insurance capped
  together at 100,000 while health insurance also has its own 25,000 sub-cap). The calculation
  enforces whichever shape applies to each category.
- AC-4: Given a tax year's recorded income, expenses, and deductions, the system computes net
  taxable income and applies the progressive bracket table to produce the tax payable.
- AC-5: The system subtracts total recorded WHT for the year from the computed tax and clearly
  displays either "additional tax due" or "refund owed" with the amount.
- AC-6: User can select any tax year with recorded data and view its summary independently of
  other years.
- AC-7: While its tax year is open, a transaction can be edited directly, and every edit
  records an audit-log entry with the before/after values and timestamp. Hard delete is never
  allowed (an unwanted entry is removed by editing its amount to zero or an equivalent
  voiding action that still preserves the audit trail).
- AC-7a: Once a tax year is marked filed/closed, its transactions lock — editing is disabled,
  and any correction after that point creates a reversal entry (original and reversal both
  remain visible) rather than modifying the closed record.
- AC-7b: The user can mark a tax year as filed/closed, after confirming a summary of what will
  lock, and the system prevents new edits to that year's transactions from that point on
  (until/unless explicitly reopened, which is itself an audit-logged action).
- AC-7c: The user can open a new (e.g. future) tax year and record transactions in it while an
  earlier tax year is still open — tax years are not required to be closed in order.
- AC-11: Deduction category caps and the progressive tax bracket table are visible and editable
  on a Settings screen; a change is audit-logged and applies to calculations for the tax
  year(s) the user chooses going forward, without altering already-closed years.
- AC-12: For the tax year currently selected, a Dashboard shows running totals (income, WHT),
  each deduction category's used amount vs. remaining headroom against its cap, and an
  estimated tax position — updating live as transactions are added, without requiring the year
  to be closed first.
- AC-8: All monetary fields are stored and calculated as integer minor units or exact decimal
  types; no floating-point arithmetic is used for money.
- AC-9: Every create, reversal, or configuration change (e.g. expense-method choice) writes an
  audit-log entry (who — implicitly the single user —, what, when, before/after).
- AC-9a: From any transaction, the user can open its edit history and see every recorded
  change to it (before/after values and timestamp) — the audit log is user-visible, not only
  stored internally.
- AC-10: The application stores its data file locally at a user-chosen path and performs no
  network calls to Google or any other cloud API.

## Constraints & assumptions
- Platform: Windows desktop, single user, no login.
- Storage: local file-based DB (SQLite assumed; confirm at analyze), path chosen by the user
  so it can live inside their existing Google Drive sync folder.
- Currency: THB only.
- The deduction category list and caps are sourced from the user's own workbook
  (`Puy Money Management.xlsx`, sheet `TAX-2025`) as of tax year 2025; caps and brackets are
  set by Thai Revenue Department rules and can change yearly, so they are stored as editable
  configuration (Settings screen, AC-11) seeded from the 2025 sheet, not hard-coded constants —
  the analyze stage should confirm current-year figures rather than assume the 2025 sheet is
  still accurate for future years.
- No existing codebase/stack yet — this is the first feature; analyze stage picks and records
  the concrete stack (Electron vs Tauri, SQLite access library, language) in `CLAUDE.md`.

## Size proposal
**L** — new data model (transactions, deductions, tax-year config, attachments, audit log),
a calculation engine with legally-sourced rules, multiple screens (entry, deductions, settings,
dashboard, summary), and cross-cutting invariants (edit/lock lifecycle, audit log, exact-money
types) that touch every module. Recommend the prototype stage (UI already sketched informally)
and a plan broken into phases: (1) data layer + income entry + audit log, (2) deductions +
expense-method choice + Settings screen, (3) tax calculation engine + Dashboard + year-end
summary + close/reopen lifecycle, (4) attachments.

## Decision log
| Date | Decision | By |
|------|----------|----|
| 2026-09-13 | Scope, platform (Windows desktop, Electron/Tauri), storage (local file in Google Drive-synced folder), deduction list (from TAX-2025 sheet), and entry granularity (per-transaction, not monthly) agreed in chat discovery before REQ drafting. | user + assistant |
| 2026-09-13 | Changed AC-7 from always-immutable to editable-while-open / locked-after-filing: transactions can be edited directly until the user marks their tax year filed/closed, after which corrections require a reversal. `CLAUDE.md` domain invariants updated to match. | user |
| 2026-09-13 | Declined: Excel history import, dynamic income-relative deduction caps, CSV export. Confirmed: deduction caps and tax brackets stay fixed values but editable via a Settings screen (AC-11); tax-year closing requires a confirm step and years may be opened out of order so a future year can be pre-entered before closing the current one (AC-7b/7c). | user |
| 2026-09-13 | Added a live Dashboard for the currently-open tax year (income/WHT running totals, deduction headroom per category, estimated tax) so the user has an in-year view rather than only a year-end summary (AC-12). | user |
| 2026-09-13 | Clarified deduction caps are not all flat single amounts — fixed, per-count-multiplier, and shared-across-line-items shapes must all be supported (AC-3a). Made the audit log user-visible per transaction, not just internally recorded (AC-9a). | user |
| 2026-09-13 | **Gate: approved.** Size L confirmed. Proceed to `dev-analyze`. | user |
