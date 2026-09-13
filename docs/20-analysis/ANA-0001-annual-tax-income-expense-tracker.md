---
id: ANA-0001
type: analysis
title: Annual tax income/expense tracker — design
status: active
size: L
created: 2026-09-13
updated: 2026-09-13
links: [REQ-0001, TC-0001]
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

## Data model changes
New SQLite schema (all tables new — greenfield):

- **tax_years**(`id`, `year` UNIQUE, `status` CHECK(open|closed), `expense_method`
  CHECK(lump_sum|actual) NULL, `lump_sum_rate_bp` INTEGER NULL, `closed_at` NULL,
  `frozen_result_json` NULL, `created_at`, `updated_at`)
- **transactions**(`id`, `tax_year_id` FK, `kind` CHECK(income|expense), `income_section`
  CHECK(40_1|40_2|40_5_8) NULL — required when `kind='income'`, `date`, `amount_minor`,
  `currency` CHECK(='THB'), `wht_minor` DEFAULT 0, `source_payer`, `payer_tax_id` NULL (13-digit
  Thai tax ID, not validated/required — useful for matching against WHT certificates but not
  every payer provides it), `note` NULL, `status` CHECK(active|voided) DEFAULT active,
  `reversal_of_id` NULL FK self, `created_at`, `updated_at`)
- **attachments**(`id`, `transaction_id` FK, `relative_path`, `original_filename`,
  `mime_type`, `added_at`)
- **deduction_categories**(`id`, `code` UNIQUE, `name`, `cap_type`
  CHECK(fixed|per_count|shared_group_member), `cap_amount_minor` NULL, `shared_group_id` NULL FK
  `shared_caps`, `sort_order`, `description`) — seeded from `TAX-2025` at first run.
- **shared_caps**(`id`, `name`, `cap_amount_minor`)
- **deduction_entries**(`id`, `tax_year_id` FK, `category_id` FK, `amount_minor`, `count` NULL,
  `updated_at`; unique on (`tax_year_id`, `category_id`))
- **tax_brackets**(`id`, `lower_bound_minor`, `upper_bound_minor` NULL, `rate_bp`,
  `sort_order`) — seeded from `TAX-2025` rows 65–72.
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
- `settings`: `getCaps()`, `updateCap(categoryId, newCapAmountMinor)` (audit-logged),
  `getSharedCaps()`, `updateSharedCap(id, newCapAmountMinor)`, `getBrackets()`,
  `updateBracket(id, rateBp, bounds)`.
- `calc`: `computeYear(yearId)` → `{ totalIncome, totalExpense, totalDeductions, netTaxable,
  bracketBreakdown[], taxTotal, whtTotal, balance: {direction: 'due'|'refund', amountMinor} }`
  — the single pure function used by the Dashboard (live), the Close action (freeze), and every
  calculation-related unit test.
- `attachments`: `add(transactionId, filePath)`, `list(transactionId)` (no remove — evidence is
  not deletable, matching the no-hard-delete stance in AC-7).

## UI changes
- **Onboarding** (first run only): choose/create the data folder; creates the DB + seeds
  reference data (categories, shared caps, brackets from `TAX-2025`).
- **Tax-year switcher**: list of years (open/closed badge), create a new year, set
  40(5)-(8) expense method for the selected year.
- **Dashboard** (per open year, AC-12): stat tiles (income, WHT, estimated tax), deduction
  headroom list (used vs. remaining per category/shared group) — all from a live
  `calc.computeYear()` call.
- **Income/Expense entry** (from the earlier mockup): form + ledger table, transactions grouped
  by month with a per-month subtotal header row and an annual totals strip above the table
  (linking to the full year summary) — easier to scan month-by-month while the annual figures
  stay one click away; each row has an "Edit" action (open-year only) and a "History" action
  (AC-9a) opening the audit trail for that transaction.
- **Deductions**: grouped list (personal/family, insurance & retirement, donations) matching
  `TAX-2025`'s sections; each row shows its cap (and, for shared-group members, the group's
  running total) — editable only while the year is open.
- **Settings**: edit deduction caps, shared-cap group ceilings, and the tax bracket table
  (AC-11); every save is audit-logged and takes effect for open years' live calculations only.
- **Year summary / Close**: full breakdown (income, deductions, bracket table with the hit
  bracket highlighted, WHT netting, due/refund strip — matching the earlier mockup) plus the
  "Close tax year" action behind a confirmation modal that states exactly what will lock; a
  separate "Reopen" action (with its own confirmation) is available from a closed year's
  summary.
- **Transaction history panel**: chronological before/after list for one transaction (AC-9a).

## UX decisions (from prototype, filled by dev-prototype)
(Not yet run — the rough mockup shared during requirement discovery was informal chat-level
sketching, not a formal `dev-prototype` round. Recommended before `dev-plan` given the number
of screens; see gate note below.)

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

## Task list (size S only)
N/A — REQ-0001 is size L; tasks are broken out in `dev-plan`.
