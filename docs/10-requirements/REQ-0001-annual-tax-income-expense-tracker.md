---
id: REQ-0001
type: requirement
title: Annual tax income/expense tracker
status: active
size: L
created: 2026-09-13
updated: 2026-09-17
links: [ANA-0001, TC-0001, PLAN-0001]
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
- Settings screen listing every deduction category's name and cap, and the progressive tax
  bracket table, all editable by the user (fixed cap values, not income-relative formulas) so
  wording/figures can be updated if the law changes; edits apply per tax year going forward and
  are audit-logged.
- CSV export/import as a portable backup/migration path (not a bank-statement importer): export
  a tax year's full transaction ledger (tax-relevant + general) to CSV, and separately export
  its computed annual tax summary to CSV (read-only report). Import re-reads a CSV this app
  previously exported — e.g. after moving to a new computer or restoring from a backup copy —
  through a mandatory preview step where invalid or unwanted rows can be excluded before
  anything is committed.
- Settings also lets the user add a brand-new deduction category (any of the 3 cap shapes —
  fixed / per-count / shared-group) to support a new one-off government measure introduced in a
  given tax year, and archive/deactivate a category that no longer applies (e.g. a one-year
  stimulus measure) — an archived category is hidden from new deduction entries but its
  existing data and historical calculations are never deleted or altered.
- Recording general (non-tax) income/expense transactions in the same entry form, toggled as
  "tax-relevant" or "general" — a general transaction takes a simple fixed category (Food /
  Shopping / Housing / Other) instead of an income section, and is excluded from every tax
  calculation. Dashboard and the year's ledger show tax-relevant and general figures as two
  clearly separate sections, never blended into one total. Category-based budgeting/allocation
  (percentages, spending limits per category) stays out of scope — see `PL-0001` — this is
  recording only.
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
- Importing bank-statement CSVs or OCR receipt scanning as an ongoing entry method — manual
  entry stays the primary way to record transactions. CSV import (AC-22/23/24) is scoped
  narrowly as a migration/restore path for this app's own export format, not a general-purpose
  bank-statement importer.
- Multi-user access, authentication, or any server/cloud backend.
- Concurrent use of the same data file from two machines at once (Google Drive sync is
  treated as backup/single-writer-at-a-time, not real-time multi-device collaboration).

## Acceptance criteria
- AC-1: User can create an income transaction with date, amount, income type (40(1)/40(2)/
  40(5)-(8)), source/payer (with the payer's tax ID, optional), WHT withheld, and zero or more
  attached evidence files.
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
- AC-11: Deduction category names and caps, and the progressive tax bracket table, are visible
  and editable on a Settings screen; a change is audit-logged and applies to calculations
  (and, for a name change, to display) for the tax year(s) the user chooses going forward,
  without altering already-closed years.
- AC-12: For the tax year currently selected, a Dashboard shows running totals (income, WHT),
  each deduction category's used amount vs. remaining headroom against its cap, and an
  estimated tax position — updating live as transactions are added, without requiring the year
  to be closed first.
- AC-13: When creating or editing a transaction, the user can mark it "tax-relevant" (default)
  or "general"; a general transaction requires a category from a fixed set (Food, Shopping,
  Housing, Other) instead of an income section, and does not require WHT/income-section fields.
- AC-14: General transactions are excluded from every tax calculation — net taxable income,
  deduction eligibility, and WHT netting are computed only from tax-relevant transactions.
- AC-15: The Dashboard and the year's ledger present tax-relevant and general transactions as
  two clearly separate sections/totals — general figures are visible but never combined into
  the tax summary numbers.
- AC-16: From Settings, the user can create a new deduction category — name, cap shape (fixed /
  per-count / shared-group), and its cap value(s) — which then appears on the Deductions screen
  for entry like any built-in category.
- AC-17: From Settings, the user can archive/deactivate a deduction category; an archived
  category no longer appears as an entry option for new/open tax years, but any tax year that
  already has an entry under it keeps that entry and its historical calculation unchanged, and
  the category can be viewed (read-only) wherever it was already used.
- AC-18: On first run, the app asks the user to choose or create the data folder (intended to
  be a Google Drive–synced location); on every later launch it reuses that same folder
  automatically without asking again.
- AC-19: Settings shows the current data folder's path and basic file info (e.g. last
  modified) so the user can confirm data is where they expect — this is informational only;
  the app performs no sync action itself, since Google Drive Desktop syncs that folder in the
  background independently of the app.
- AC-20: User can export a chosen tax year's full transaction ledger (every tax-relevant and
  general transaction, active or voided/reversal) to a CSV file with enough columns to fully
  reconstruct each transaction.
- AC-21: User can export a chosen tax year's computed annual tax summary (income, deductions
  used per category, net taxable income, tax by bracket, WHT, due/refund) to a CSV file; this
  export is a read-only report and is not a supported import source.
- AC-22: User can import a CSV file previously produced by AC-20's export (this app's own
  format) to recreate its transactions — intended for moving to a new computer or restoring
  from a backup copy, not for importing bank statements or other external formats.
- AC-23: Before anything is committed, import shows a preview listing every row with a
  valid/error status and lets the user exclude any row (valid or not) from the import; rows
  targeting a tax year that is already closed in this install are always flagged invalid,
  since closed-year transactions are immutable (INV-2b) — a closed year can never receive
  imported rows, only a new or already-open one can.
- AC-24: A completed import writes one audit-log entry summarizing the batch (source filename,
  rows imported, rows skipped, timestamp), in addition to each imported transaction being
  individually audit-logged as normal.
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
- The deduction category list and caps are intended to be sourced from the user's own workbook
  (`Puy Money Management.xlsx`, sheet `TAX-2025`) as of tax year 2025; caps and brackets are
  set by Thai Revenue Department rules and can change yearly, so they are stored as editable
  configuration (Settings screen, AC-11), not hard-coded constants. That workbook data is not
  currently available (2026-09-17): the app must not require it to function — first run seeds
  zero categories/brackets and the user builds them via Settings (AC-16/AC-11); real 2025
  figures can be supplied and seeded later without a schema or code change.
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
| 2026-09-13 | PROTO-0001 feedback: added the payer's tax ID (optional) to AC-1's income transaction fields. | user |
| 2026-09-13 | PROTO-0001 feedback: pulled the *recording* half of parked `PL-0001` into REQ-0001 — general (non-tax) transactions with a simple fixed category, excluded from tax calculation, shown as a separate section from tax figures (AC-13/14/15). Category-based budgeting/allocation (percentages, spending limits) stays parked in `PL-0001`. | user |
| 2026-09-13 | PROTO-0001 feedback: Settings can add brand-new deduction categories (all 3 cap shapes) for new yearly stimulus measures, and archive/deactivate ones that stop applying without deleting history (AC-16/17). | user |
| 2026-09-13 | PROTO-0001 feedback: a category's name (not just its cap) is editable in Settings too (AC-11 extended). | user |
| 2026-09-13 | PROTO-0001 feedback: user asked where the "Sync Google Drive" button was — clarified there isn't one by design (no Drive API integration; Drive syncs the folder externally). Added an explicit first-run folder picker (AC-18) and a read-only data-location/status display in Settings (AC-19) so the absence of a sync button doesn't read as a missing feature. | user |
| 2026-09-17 | `TAX-2025` workbook figures aren't available. App must work with no seed data: first run creates the DB with zero deduction categories/brackets rather than blocking; user adds them manually via Settings (AC-11/16), matching decision 14 in ANA-0001. Unblocks PLAN-0001 AT-1.5/AT-1.6. | user |
| 2026-09-13 | PROTO-0001 feedback: reversed the earlier "no CSV export" decision — added CSV export (ledger + summary, AC-20/21) and CSV import scoped narrowly as a restore/migration path for this app's own export format, with a mandatory preview/exclude step and closed-year protection (AC-22/23/24). General bank-statement import stays out of scope. | user |
