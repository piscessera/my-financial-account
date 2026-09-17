---
id: ANA-0001
type: analysis
title: Annual tax income/expense tracker — design
status: active
size: L
created: 2026-09-13
updated: 2026-09-17
links: [REQ-0001, TC-0001, PLAN-0001]
---

# ANA-0001: Annual tax income/expense tracker — design

## Context & current behavior
No application code exists yet — this is the project's first feature (`ls` of the repo root
shows only `.claude/`, `docs/`, `CLAUDE.md`, `.gitignore`; no `src/`, `package.json`, or
similar). Design is therefore greenfield, informed by:
- `REQ-0001` (docs/10-requirements/REQ-0001-annual-tax-income-expense-tracker.md) — full scope,
  18 acceptance criteria.
- `CLAUDE.md` §Project — domain invariants (money as integer/decimal never float,
  editable-while-open/locked-after-close transactions, audit-logged mutations, explicit
  currency), storage constraint (local file, no Google API), platform (Windows desktop, single
  user).
- The user's existing manual workbook `Puy Money Management.xlsx`, sheet `TAX-2025` (rows
  2–89): the concrete list of income lines, deduction categories with their caps (including
  the shared/combined caps — e.g. rows 39–42 show life+health self-insurance summing to a
  100,000 ceiling while health insurance alone also caps at 25,000), the donation categories,
  and the progressive bracket table (rows 64–72, 0–35% across 8 bands) — used as the reference
  data set and as calculation fixtures for the test cases below.

## Solution overview

### Runtime & stack
- **Electron + TypeScript**, single desktop app, Windows target (matches `CLAUDE.md`).
- **Main process** owns all data access and business logic (SQLite via `better-sqlite3`,
  synchronous — appropriate for a single local writer, avoids async-transaction complexity).
  Query layer: **Drizzle** as a type-safe SQL builder over `better-sqlite3` — chosen over a full
  ORM so every money-affecting query stays explicit SQL the reviewer can read directly (matches
  the financial-correctness priority in `CLAUDE.md`), while still getting compile-time column
  checks.
- **Renderer**: React + Vite. No heavy component library — the approved rough mockup
  (`tax_mockup.html`, shared with the user earlier) already sketches the visual language;
  rebuild it as React components with the same tokens.
- **IPC boundary**: a `preload.ts` exposes a narrow, typed API on `window.api` via
  `contextBridge` (e.g. `api.transactions.create(input)`, `api.calc.computeYear(yearId)`). The
  renderer never touches SQLite directly — every mutation and every calculation runs in the
  main process, which is the single place invariants are enforced (INV-1…7 below).
- **Testing**: Vitest for the calculation engine and repository layer (pure Node, no Electron
  needed to run — satisfies "Unit cases must be implementable in the project's test runners").
  UI flows are `Manual` test cases for now; adding an Electron E2E runner (e.g.
  Playwright-for-Electron) is a candidate for a later phase, not this one (see Risks).
- **Lint/format**: ESLint + Prettier, standard TS config.
- **Packaging**: `electron-builder`, Windows target (NSIS or portable exe) — finalized at the
  first `/dev-release`, not needed to start implementation.

### Data file layout
On first run the user picks a folder (intended: one already synced by Google Drive Desktop).
The app creates, inside it:
```
<chosen-folder>/
├── tax-tracker.db        SQLite database
└── attachments/
    └── <transaction-id>/ evidence files, original filenames preserved
```
Both the DB and attachments live under the same folder so Google Drive syncs them together as
one unit — no Google API calls anywhere in the app (AC-10).

### Money representation
All monetary columns are **integers in satang** (1 THB = 100 satang) — matches the 2-decimal
precision already used throughout the reference workbook. User-entered decimal baht is
converted to satang by rounding **half-up** at input time; no floating-point type is used at
any point after that conversion (INV-1). Tax bracket math is done as integer satang × integer
basis-point rate, divided and rounded half-up only at the point a figure is displayed or
stored — never accumulated as a float across steps.

### Tax-year lifecycle (implements REQ AC-7/7a/7b/7c)
A `tax_years` row is `open` or `closed`. While `open`: transactions and deduction entries for
that year are directly editable; every edit writes a row to `audit_log` (before/after values).
Closing a year (after the UI confirmation naming what will lock) computes the full result via
the calculation engine and stores it as `frozen_result_json` on the row — the year's summary
thereafter renders that snapshot, not a live recompute, so later settings edits never change an
already-filed year's displayed numbers (INV-7). Reopening a closed year is allowed (it clears
`closed_at`/keeps `frozen_result_json` until the year is closed again) and is itself
audit-logged. Multiple `tax_years` rows can be `open` simultaneously (AC-7c) — there is no
"current year" singleton in the schema, only a `tax_year_id` the UI is currently viewing.

### Tax-relevant vs. general transactions (implements REQ AC-13/14/15)
A `tax_years` row is really just "the record-keeping bucket for that year" — it now holds both
kinds of transaction, distinguished by `transactions.tax_relevant`. A general transaction
(`tax_relevant=false`) skips `income_section`/WHT entirely and instead takes a
`general_category` from a small fixed set (Food/Shopping/Housing/Other — no percentages, no
budgets; recording only, per the user's explicit scope call). `calc.computeYear()` filters
`WHERE tax_relevant = true` for every tax figure (income, expenses, deductions, WHT, bracket
calculation) — a general transaction can never influence a tax number. The Dashboard and ledger
render tax-relevant and general transactions as two separate sections/totals, never merged.

### Deduction cap shapes (implements REQ AC-3a)
`deduction_categories.cap_type` is one of:
- `fixed` — `cap_amount_minor` is the ceiling for that category alone.
- `per_count` — `cap_amount_minor` is the **per-unit** ceiling; the entry's `count` field
  (e.g. number of qualifying children/parents) multiplies it to get the effective cap.
- `shared_group_member` — the category also carries its own `cap_amount_minor` as a sub-cap,
  but additionally belongs to a `shared_caps` row; the calculation sums every entry across all
  categories in that group and caps the **group total**, on top of each member's own sub-cap.

The calculation engine applies whichever rule a category declares — there is no code path that
assumes "one flat cap per category."

### CSV export/import (implements REQ AC-20/21/22/23/24)
Export is two independent CSV writers, both read-only reports over existing data: a per-year
**ledger export** (one row per transaction, active/voided/reversal alike, every column needed
to recreate it — date, kind, `tax_relevant`, `income_section`/`general_category`, amount, WHT,
`source_payer`, `payer_tax_id`, note, status, `reversal_of_id`) and a per-year **summary
export** (the same figures `calc.computeYear()` shows on-screen). The summary export is
one-way — it is never a valid import source, only the ledger export's column format is.

Import is a three-step flow, never a direct write: (1) parse the CSV, (2) validate every row
independently — required fields present, amounts parse as valid money, `tax_year` either
matches an existing *open* year or will create a new one, and reject any row whose `tax_year`
already exists as *closed* in this install (closed-year immutability, INV-2b, applies to
imported rows exactly like manually-entered ones) — and (3) show a preview table where the
user can also manually exclude any row before confirming. Only step 3's confirmed subset is
ever inserted, each as a normal `transactions` row through the same repository path as manual
entry (so INV-1/2/4/5/6 all apply unchanged), plus one extra `audit_log` row summarizing the
batch (source filename, counts) for AC-24. A `transactions.source` column
(`manual`/`import`, default `manual`) records how each row was created, for traceability.

### Adding and archiving deduction categories (implements REQ AC-16/17)
Settings can create a new `deduction_categories` row with any of the three `cap_type` shapes
above — this is how a new one-off government measure (e.g. a "ช้อปดีมีคืน"-style scheme
introduced for a single tax year) gets added without a code change. Archiving a category sets
`is_active=false`: the Deductions entry screen filters it out of the "add a category" list for
any *open* tax year, but existing `deduction_entries` rows referencing it are untouched, still
display (read-only where the year is closed, editable where still open, same as any other
category), and still feed the calculation exactly as before — archiving only affects
*discoverability* for new entries, never historical data or math (consistent with the
project's "archive, never delete" convention).

## Invariants
| INV | Rule | Enforced by (code / DB constraint / test) |
|-----|------|--------------------------------------------|
| INV-1 | All monetary amounts are stored and computed as integer satang; user-entered decimal baht rounds half-up to the nearest satang at input; no float is used anywhere in the calculation path. | `amount_minor` columns are `INTEGER`; conversion helper is the single input boundary; TC-0001 #22, #30 |
| INV-2 | A transaction in an `open` tax year is directly editable; every edit inserts an `audit_log` row (before/after, timestamp) in the same DB transaction as the update. | Repository layer wraps update+audit insert atomically; TC-0001 #16, #23 |
| INV-2b | A transaction in a `closed` tax year is immutable; the only correction is a new transaction with `reversal_of_id` pointing at it — both remain visible. | Repository rejects updates when `tax_years.status = 'closed'`; TC-0001 #18, #19 |
| INV-3 | A tax year's figures are always fully derivable by re-running the calculation engine against its stored rows; for a closed year, that recompute must equal the `frozen_result_json` captured at close time. | Pure `computeYear()` function, no hidden state; TC-0001 #31 |
| INV-4 | Every mutation (transaction create/edit/reversal, deduction entry change, settings change, tax-year close/reopen) writes an `audit_log` row (entity, action, before→after, timestamp). | Single repository layer is the only writer; every write path inserts to `audit_log`; TC-0001 #23 |
| INV-5 | Currency is always explicit and fixed at THB for this MVP (no silent assumption). | `currency` column present on every amount-bearing table, `CHECK (currency = 'THB')`; TC-0001 #32 |
| INV-6 | A deduction category's effective cap is computed per its declared `cap_type` (fixed / per-count × count / shared-group sum), and the calculation never lets a category or shared group contribute more than its cap to net taxable income. | `computeDeductions()` branches on `cap_type`; TC-0001 #8, #9, #10 |
| INV-7 | Once a tax year is closed, its displayed summary is the frozen snapshot from close time and does not change if global settings (caps/brackets) are edited afterward. | Closed-year read path serves `frozen_result_json`, never a live recompute; TC-0001 #33 |
| INV-8 | A transaction marked `tax_relevant=false` (general) never contributes to any tax figure — income, deductions, WHT netting, or bracket calculation. | `calc.computeYear()`'s base query filters `WHERE tax_relevant = true`; TC-0001 #35 |

## Data model changes
New SQLite schema (all tables new — greenfield):

- **tax_years**(`id`, `year` UNIQUE, `status` CHECK(open|closed), `expense_method`
  CHECK(lump_sum|actual) NULL, `lump_sum_rate_bp` INTEGER NULL, `closed_at` NULL,
  `frozen_result_json` NULL, `created_at`, `updated_at`)
- **transactions**(`id`, `tax_year_id` FK, `kind` CHECK(income|expense), `tax_relevant` BOOLEAN
  NOT NULL DEFAULT true, `income_section` CHECK(40_1|40_2|40_5_8) NULL — required when
  `tax_relevant=true AND kind='income'`, `general_category` CHECK(food|shopping|housing|other)
  NULL — required when `tax_relevant=false`, `date`, `amount_minor`, `currency` CHECK(='THB'),
  `wht_minor` DEFAULT 0, `source_payer` NULL (not required for general transactions),
  `payer_tax_id` NULL (13-digit Thai tax ID, not validated/required — useful for matching
  against WHT certificates but not every payer provides it), `note` NULL, `status`
  CHECK(active|voided) DEFAULT active, `reversal_of_id` NULL FK self, `source`
  CHECK(manual|import) NOT NULL DEFAULT manual, `created_at`, `updated_at`)
- **attachments**(`id`, `transaction_id` FK, `relative_path`, `original_filename`,
  `mime_type`, `added_at`)
- **deduction_categories**(`id`, `code` UNIQUE, `name`, `cap_type`
  CHECK(fixed|per_count|shared_group_member), `cap_amount_minor` NULL, `shared_group_id` NULL FK
  `shared_caps`, `sort_order`, `description`, `is_active` BOOLEAN NOT NULL DEFAULT true,
  `is_builtin` BOOLEAN NOT NULL DEFAULT false) — when `TAX-2025` reference figures are supplied,
  the ~17 built-in categories seed from them (`is_builtin=true`); with no reference data supplied
  (current state, 2026-09-17 decision) the table starts empty and the user adds categories from
  Settings (AC-16), which land with `is_builtin=false`. Either way rows are otherwise identical,
  so the calculation engine treats every category the same way regardless of origin — a zero-row
  table is a valid, supported state, not an error.
- **shared_caps**(`id`, `name`, `cap_amount_minor`)
- **deduction_entries**(`id`, `tax_year_id` FK, `category_id` FK, `amount_minor`, `count` NULL,
  `updated_at`; unique on (`tax_year_id`, `category_id`))
- **tax_brackets**(`id`, `lower_bound_minor`, `upper_bound_minor` NULL, `rate_bp`,
  `sort_order`) — seeds from `TAX-2025` rows 65–72 if supplied; otherwise starts empty and the
  user enters brackets via Settings' bracket table edit (AC-11). `calc.computeYear()` with zero
  brackets yields zero tax rather than erroring (net taxable income has nothing to multiply
  against) — an expected empty state, not a bug.
- **audit_log**(`id`, `entity_type`, `entity_id`, `action`, `before_json` NULL,
  `after_json` NULL, `occurred_at`)

Indexes: `transactions(tax_year_id)`, `deduction_entries(tax_year_id, category_id)` unique,
`audit_log(entity_type, entity_id)`.

## API / backend changes
IPC surface exposed on `window.api` (all logic lives in the main process):
- `taxYears`: `list()`, `create(year)`, `get(id)`, `close(id)` (computes + freezes),
  `reopen(id)` (audit-logged), `setExpenseMethod(id, method, rate?)`.
- `transactions`: `create(input)`, `update(id, input)` (rejected if year closed), `void(id)`,
  `createReversal(originalId, input)` (only if year closed), `listByYear(yearId)`,
  `getHistory(id)`.
- `deductions`: `listCategories()`, `setEntry(yearId, categoryId, amount, count?)`.
- `settings`: `getCaps()`, `updateCategory(categoryId, { name?, capAmountMinor? })`
  (audit-logged — covers both a rename and a cap change, together or separately),
  `getSharedCaps()`, `updateSharedCap(id, newCapAmountMinor)`, `getBrackets()`,
  `updateBracket(id, rateBp, bounds)`, `createCategory(input)` (name, `cap_type`, cap value(s),
  optional shared-group; audit-logged), `setCategoryActive(id, isActive)` (archive/reactivate,
  audit-logged).
- `calc`: `computeYear(yearId)` → `{ totalIncome, totalExpense, totalDeductions, netTaxable,
  bracketBreakdown[], taxTotal, whtTotal, balance: {direction: 'due'|'refund', amountMinor} }`
  — the single pure function used by the Dashboard (live), the Close action (freeze), and every
  calculation-related unit test.
- `attachments`: `add(transactionId, filePath)`, `list(transactionId)` (no remove — evidence is
  not deletable, matching the no-hard-delete stance in AC-7).
- `dataLocation`: `get()` (current folder path + DB file size/last-modified — read-only,
  AC-19), `chooseFolder()` / `createInFolder(path)` (first-run only, AC-18).
- `csv`: `exportLedger(yearId, destPath)` (AC-20), `exportSummary(yearId, destPath)` (AC-21,
  read-only report), `parseForPreview(filePath)` → per-row `{ data, valid, errors[] }` without
  writing anything (AC-22/23), `commitImport(rows, sourceFilename)` (only the rows the preview
  step confirmed; each becomes a normal `transactions.create()` call with `source='import'`,
  plus one batch `audit_log` entry, AC-24).

## UI changes
- **Onboarding** (first run only, AC-18): choose or create the data folder (guidance points the
  user at a Google Drive–synced location, but any folder works); creates the DB there and runs
  the seed loader, which seeds reference data (categories, shared caps, brackets) from
  `TAX-2025` when that data is available, or completes with zero rows in those tables when it
  isn't (current state) — either way Onboarding finishes and hands off to the Dashboard, which
  must render its empty state (no categories, no brackets, zero tax) rather than block. The
  chosen path is remembered (a small local config file outside the synced folder, e.g.
  Electron's userData dir) so every later launch skips this screen.
- **Tax-year switcher**: list of years (open/closed badge), create a new year, set
  40(5)-(8) expense method for the selected year.
- **Dashboard** (per open year, AC-12/15): two clearly separated sections — "ภาษี" (stat tiles:
  income, WHT, estimated tax; deduction headroom list) computed from tax-relevant transactions
  only, and "ทั่วไป" (general income/expense totals by category) below it — never blended into
  one number.
- **Income/Expense entry** (from the earlier mockup): one form for both kinds, with a
  tax-relevant/general toggle (AC-13) that swaps the income-section chips for a general-category
  chip row (Food/Shopping/Housing/Other) and hides WHT for general entries. The ledger groups by
  month with a per-month subtotal header row and an annual totals strip above the table (split
  into tax-relevant vs. general totals) linking to the full year summary; each row has an "Edit"
  action (open-year only) and a "History" action (AC-9a) opening the audit trail for that
  transaction.
- **Deductions**: grouped list (personal/family, insurance & retirement, donations) matching
  `TAX-2025`'s sections; each row shows its cap (and, for shared-group members, the group's
  running total) — editable only while the year is open.
- **Settings**: edit a deduction category's name and cap, shared-cap group ceilings, and the
  tax bracket table (AC-11); every save is audit-logged and takes effect for open years' live
  calculations (and display, for a name) only. Also: "+ add category" (AC-16) with a cap-shape
  picker (fixed / per-count / shared-group) and an archive/reactivate toggle per row (AC-17) —
  archived categories show a muted "archived" state instead of being removed from the list.
  Also (AC-19): a read-only "data location" panel showing the folder path and the DB file's
  last-modified time — informational only, no in-app sync action (there is nothing to sync;
  Google Drive Desktop does that outside the app).
- **Import/Export** (AC-20/21/22/23/24, its own screen): year picker + two export buttons
  (ledger CSV, summary CSV); an import section with a file picker leading to a preview table
  (per-row valid/error pill, a checkbox to exclude any row, closed-year rows shown as
  permanently excluded) and a "commit" button that only acts on what stayed checked.
- **Year summary / Close**: full breakdown (income, deductions, bracket table with the hit
  bracket highlighted, WHT netting, due/refund strip — matching the earlier mockup) plus the
  "Close tax year" action behind a confirmation modal that states exactly what will lock; a
  separate "Reopen" action (with its own confirmation) is available from a closed year's
  summary.
- **Transaction history panel**: chronological before/after list for one transaction (AC-9a).

## UX decisions (from PROTO-0001, accepted 2026-09-13)
`PROTO-0001` ran 9 feedback rounds over the rough mockup shared during requirement discovery.
Accepted decisions, now the UI reference for `dev-implement`/`dev-review`:

- **Visual direction: B — "Slate & Amber"** (see `PROTO-0001/design/DESIGN.md`) — indigo accent,
  amber for bracket/highlight states, Chakra Petch/Sarabun/JetBrains Mono type pairing, full
  light+dark token sets. Chosen over the initially-sketched "Ledger Jade" direction.
- **Screens, final set:** `onboarding` (first-run folder picker) → `dashboard` (live tax
  figures + separate general-transactions section) → `entry` (tax/general toggle, month-grouped
  ledger with a separate amber-bordered general ledger panel) → `deductions` → `settings`
  (category caps/names, add/archive category, tax brackets, data-location panel) →
  `import-export` (CSV export/import with mandatory preview) → `summary` (year close/reopen).
- **Ledger grouping:** transactions display grouped by month with a per-month subtotal header
  row spanning the table, plus an annual totals strip above linking to the full year summary —
  not a flat chronological list.
- **Tax vs. general transactions:** never visually merged. Same entry form with a toggle swaps
  income-section chips for a general-category chip row and hides WHT; the ledger and Dashboard
  each render general figures in a distinct, amber-accented section below the tax section.
- **Settings category management:** an "add category" form exposes all three cap shapes
  (fixed/per-count/shared-group); archived categories stay in the list muted with a
  "reactivate" action rather than disappearing; both name and cap are editable per category.
- **Data location, not "sync":** onboarding asks for a folder once; Settings shows that folder
  path and the DB file's last-modified time read-only — deliberately no "sync" control anywhere,
  since the app has no Drive API integration.
- **CSV import safety:** import is never a direct write. A dropzone leads to a preview table
  with a checkbox per row, a valid/error pill, and closed-year rows permanently disabled
  (unchecked, greyed) — commit only acts on what stays checked.

## Dependencies & risks
- **`better-sqlite3` native module**: must be rebuilt against Electron's Node ABI
  (`electron-rebuild` or prebuilt binaries). Risk: ABI mismatch after an Electron version
  bump. Mitigation: pin Electron and `better-sqlite3` versions together; document the rebuild
  step in the plan's setup task.
- **Google Drive sync is not a real-time multi-writer store** (already out of scope in
  REQ-0001, but worth a cheap guard): recommend a minimal file-lock check at launch — a
  `.lock` file with hostname+timestamp — that shows a warning banner if another instance's lock
  looks recent, rather than building full conflict resolution. Low cost, meaningfully reduces
  the risk of silent data loss; propose as a phase-1 task, decide at plan stage.
- **Attachments stored next to the DB**: large evidence files could slow Google Drive sync;
  documented as a known limitation, no size cap enforced in this REQ.
- **No test harness exists yet**: Vitest configuration is a phase-1 setup task, not assumed to
  already work.
- **Seed data accuracy**: deduction caps/brackets seeded from the user's own 2025 workbook are
  not independently verified against the current Revenue Department rules for whichever tax
  year is actually being filed. AC-11's Settings screen exists specifically so the user can
  correct them, but the user should confirm current-year figures before relying on the first
  live calculation for an actual filing — flagged here, not something the app can verify
  itself.

## Decisions
| # | Decision | Reason | Date |
|---|----------|--------|------|
| 1 | Electron (not Tauri) | Faster solo-dev velocity: mature SQLite bindings (`better-sqlite3`), no Rust required for native file/db access, large ecosystem; binary size/resource use are not real constraints for a single-user personal app. | 2026-09-13 |
| 2 | `better-sqlite3` (sync) + Drizzle, not a full ORM | Single local writer makes synchronous I/O simplest and easiest to reason about; Drizzle keeps money-affecting SQL explicit and reviewable while still type-checked. | 2026-09-13 |
| 3 | Closed-year results are frozen snapshots, not live recomputes | Simplest way to satisfy "editing Settings must not alter already-closed years" (REQ AC-11) without building full settings versioning. | 2026-09-13 |
| 4 | Single polymorphic `audit_log` table for all entity types | One enforcement point for INV-4 instead of a per-table history table for each mutable entity. | 2026-09-13 |
| 5 | Amounts stored in satang (integer, ×100) | Matches the reference workbook's 2-decimal precision exactly; avoids float drift (INV-1). | 2026-09-13 |
| 6 | Drizzle instead of Kysely | Same SQL-close, non-magic philosophy, but larger and faster-growing community/backing — lower long-term risk for a project with no dedicated maintenance team. | 2026-09-13 |
| 7 | **Gate: approved.** Proceed to `dev-prototype`, then `dev-plan`. | — | 2026-09-13 |
| 8 | Added `payer_tax_id` (optional) to `transactions` | PROTO-0001 feedback: user wants the payer's Thai tax ID captured alongside source/payer, useful for matching WHT certificates at filing time. | 2026-09-13 |
| 9 | Added `tax_relevant` + `general_category` to `transactions`, new INV-8 | PROTO-0001 feedback: pulled the recording half of `PL-0001` into REQ-0001 (AC-13/14/15) — general transactions share the same table/form as tax transactions (simplest schema, one ledger to scan) but are excluded from every tax figure via a boolean filter, not a separate table. | 2026-09-13 |
| 10 | Added `is_active`/`is_builtin` to `deduction_categories`, `createCategory`/`setCategoryActive` | PROTO-0001 feedback: user needs to add categories for new yearly stimulus measures without a code change, and archive one-year measures without deleting history — soft `is_active` flag chosen over hard delete, consistent with the project's archive-never-delete convention (AC-16/17). | 2026-09-13 |
| 11 | `updateCap` widened to `updateCategory({ name?, capAmountMinor? })` | PROTO-0001 feedback: category names must be editable too (e.g. wording changes when a measure is renamed year to year), not just their cap amount — one endpoint covers both instead of adding a parallel `renameCategory`. | 2026-09-13 |
| 12 | No in-app "Sync" action; added explicit Onboarding screen + Settings data-location panel | PROTO-0001 feedback: user expected a sync button since none exists by design (no Google Drive API integration, per REQ-0001 constraints). Rather than leave that invisible, made the folder choice an explicit first-run step (AC-18) and surfaced the folder path/last-modified in Settings (AC-19) so the architecture is legible to the user, not just documented. | 2026-09-13 |
| 13 | Added CSV export (ledger + summary) and a narrowly-scoped CSV import (this app's own format only, mandatory preview, closed-year rows always rejected) | PROTO-0001 feedback reversed the earlier "no export" call. Import is deliberately not a general bank-statement importer — user's stated purpose is machine/account migration and backup restore, so round-tripping this app's own export format is sufficient and keeps validation simple (the column set is known exactly). Reused the existing repository/audit-log path for every imported row so no invariant gets a separate code path (AC-20/21/22/23/24). | 2026-09-13 |
| 14 | Seed loader is optional, not required: with no `TAX-2025` figures supplied, Onboarding/AT-1.5 leave `deduction_categories`/`shared_caps`/`tax_brackets` empty instead of blocking; Dashboard/Deductions/Summary render an empty state (zero tax, "add a category" prompt) and the user builds their own categories/brackets via Settings (AC-11/16). Real 2025 figures can be supplied later and seeded the same way. | User has no `TAX-2025` data on hand right now; blocking the whole app on it (as originally scoped) stalls AT-1.5/AT-1.6 indefinitely. Every table this affects already has a full manual-CRUD path planned (AT-3.1/AT-3.6), so "empty" is just the starting point of that same path, not a new code path. | 2026-09-17 |

## Task list (size S only)
N/A — REQ-0001 is size L; tasks are broken out in `dev-plan`.
