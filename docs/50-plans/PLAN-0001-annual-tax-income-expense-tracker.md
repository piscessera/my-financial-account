---
id: PLAN-0001
type: plan
title: Annual tax income/expense tracker
status: active
created: 2026-09-13
updated: 2026-09-17
links: [ANA-0001, TC-0001, PROTO-0001]
---

# PLAN-0001: Annual tax income/expense tracker

## Stage A — Phases (strategic)

### P1: Foundation — scaffolding, data layer, onboarding, audit
- **Goal:** A running Electron+TS+React shell with the full SQLite schema, seed data from
  `TAX-2025`, a working test runner, the first-run folder picker, and the cross-cutting
  audit-log/money helpers every later phase depends on.
- **Deliverables:** project scaffold (Electron/Vite/React/TS/ESLint/Prettier); Drizzle schema +
  migration for all 8 tables; seed loader (17 built-in deduction categories + shared caps +
  8 tax brackets); money (baht↔satang) helper; `audit_log` repository; Onboarding screen +
  `dataLocation` API; launch-time lock-file guard; a static no-network-import lint check.
- **Exit criteria:** `npm run dev` opens the app to Onboarding on first run; choosing a folder
  creates and seeds the DB there; second launch skips onboarding; `npm test` runs and passes;
  TC #26, #31, #41 pass.
- **Depends on:** —

### P2: Transactions, attachments, and the open/closed lifecycle
- **Goal:** Record and edit income/expense transactions (tax-relevant and general alike),
  attach evidence files, and enforce the editable-while-open / immutable-while-closed rule —
  matching PROTO-0001's Entry screen.
- **Deliverables:** `tax_years` repository (create/list/get/setExpenseMethod — `close`/`reopen`
  deferred to P4, which needs the calc engine); `transactions` repository (create, void, update,
  createReversal, getHistory) enforcing INV-2/INV-2b and audit-logging every write;
  `attachments` repository; IPC wiring; the Entry screen (toggle, form, month-grouped ledger,
  history panel, general-transactions section).
- **Exit criteria:** TC #1, #1a, #2, #16, #17, #18, #19, #22, #24, #25, #34, #48, #49 pass.
- **Depends on:** P1.

### P3: Deductions, expense method, and Settings
- **Goal:** Full deduction-category system (all 3 cap shapes), expense-method choice for
  40(5)-(8) income, and the Settings screen (edit/add/archive categories, edit brackets,
  data-location display) — matching PROTO-0001's Deductions and Settings screens.
- **Deliverables:** `deduction_categories`/`shared_caps`/`deduction_entries`/`tax_brackets`
  repositories incl. `createCategory`/`setCategoryActive`/`updateCategory`/`updateSharedCap`/
  `updateBracket`; a pure deduction cap-shape calculator; a pure expense-method calculator;
  IPC wiring; Deductions screen; Settings screen; a tax-year switcher component (create year,
  set expense method, with the mid-year-switch warning).
- **Exit criteria:** TC #3, #4, #5, #6, #7, #8, #9, #10, #37, #38, #39, #40, #42 pass.
- **Depends on:** P1 (P2 not required — deductions are independent of transaction editing, but
  the tax-year switcher needs P2's `tax_years` repository, already delivered in P2 AT-2.1).

### P4: Tax calculation engine, Dashboard, and Year Close
- **Goal:** The pure calculation engine that turns a year's transactions and deductions into a
  tax result, the live Dashboard, and the close/reopen lifecycle (which needed the engine to
  freeze a result) — matching PROTO-0001's Dashboard and Summary screens.
- **Deliverables:** bracket calculator; `calc.computeYear()` (income/expense/deduction/WHT/
  bracket assembly, filtering `tax_relevant=true` per INV-8); `tax_years.close()`/`reopen()`
  (frozen-snapshot read path, INV-7); IPC wiring; Dashboard screen; Year Summary/Close screen.
- **Exit criteria:** TC #11, #12, #13, #14, #15, #20, #21, #27, #28, #29, #30, #32, #35, #36
  pass; INV-3/INV-7/INV-8 hold under test.
- **Depends on:** P2 (transactions), P3 (deduction cap calculator, expense-method calculator).

### P5: CSV import/export
- **Goal:** Round-trip a tax year's ledger to CSV and back, as a migration/backup path, with a
  mandatory preview step — matching PROTO-0001's Import/Export screen.
- **Deliverables:** `exportLedger`/`exportSummary`; `parseForPreview` (per-row validation incl.
  closed-year rejection) and `commitImport` (only the confirmed subset, `source='import'`, one
  batch audit-log entry); IPC wiring; Import/Export screen.
- **Exit criteria:** TC #43, #44, #45, #46, #47 pass.
- **Depends on:** P2 (transactions.create), P4 (computeYear, for the summary export).

## Dependencies & risks
- **`better-sqlite3` native module rebuild against Electron's ABI** — AT-1.1 must pin
  Electron/`better-sqlite3` versions together and document the rebuild step; a version bump
  later is the owner's (future plan's) responsibility to re-verify.
- **No existing test harness** — AT-1.2 stands up Vitest before any repository code is written,
  so every later task's "unit tests are part of the task" rule has somewhere to run.
- **Seed data accuracy** (ANA-0001 risk) — AT-1.5 seeds from `TAX-2025` as-is; verifying it
  against the current year's actual Revenue Department rules is a user action noted in the
  Settings screen (AC-11), not a plan task.
- **Close/reopen ordering** — `tax_years.close()` cannot be built until `calc.computeYear()`
  exists, so P2 only builds the parts of the lifecycle that don't need it (create/list/
  setExpenseMethod, and immutability enforcement using a directly-settable `status` for
  testing); the "Close tax year" user action lands in P4. This is a plan-ordering choice, not a
  scope change from ANA-0001.

## Hot files
- `package.json`, `tsconfig.json`, `vite.config.ts` — touched by AT-1.1 and any later task
  adding a dependency.
- `src/main/db/schema.ts` — touched by AT-1.3 and by any task adding/altering a column.
- `electron/preload.ts`, `src/main/ipc/index.ts` — touched by every phase's IPC-wiring task.
- `src/main/calc/computeYear.ts` — touched by AT-4.2 and read by AT-4.4/AT-5.2.

## Stage B — Atomic tasks (tactical)

Unit tests are part of each task. `[core]` marks money/ledger-correctness tasks. `Depends`
lists AT ids that must be Done first (— if none).

| Task | Phase | Description (incl. done-criterion) | Depends | Files touched | TC | Est | Done |
|------|-------|------------------------------------|---------|---------------|----|----|------|
| AT-1.1 | P1 | Scaffold Electron+TS+React+Vite app, ESLint+Prettier config, empty main/preload/renderer entry points. Done: `npm run dev` opens a blank window. | — | `package.json`, `tsconfig.json`, `vite.config.ts`, `electron/main.ts`, `electron/preload.ts`, `.eslintrc.*`, `.prettierrc` | — | ~4h | ☑ |
| AT-1.2 | P1 | Configure Vitest for main-process code. Done: `npm test` runs and passes one trivial test. | AT-1.1 | `vitest.config.ts`, `src/main/__tests__/sample.test.ts` | — | ~2h | ☑ |
| AT-1.3 | P1 | [core] Drizzle schema + migration runner for all 8 tables per ANA-0001 §Data model changes (columns, checks, FKs, indexes). Done: migration creates every table with the specified constraints in a temp DB, verified by a test that inserts one valid row per table and rejects one constraint violation per table. | AT-1.2 | `src/main/db/schema.ts`, `src/main/db/migrate.ts`, `src/main/db/client.ts` | — | ~4h | ☑ |
| AT-1.4 | P1 | [core] Money helper: baht↔satang conversion, half-up rounding at the input boundary, no float beyond this point. Done: unit tests incl. TC #31's exact case. | AT-1.2 | `src/main/calc/money.ts` + test | #31 | ~2h | ☑ |
| AT-1.5 | P1 | [core] Seed loader, optional by design (ANA-0001 decision 14 — no `TAX-2025` figures available): `seed.ts` runs at DB creation and inserts whatever rows `seedData/taxYear2025.ts` exports, which is an **empty** built-in set for now (0 categories, 0 shared caps, 0 brackets) — real figures can be dropped into that file later with no loader change. Done: unit test asserts seeding an empty set leaves the tables present but empty (no error), and — separately — that a non-empty fixture set seeds correctly (proves the loader itself still works once real figures arrive). | AT-1.3 | `src/main/db/seed.ts`, `src/main/db/seedData/taxYear2025.ts` + test | — | ~2h | ☑ |
| AT-1.6 | P1 | `dataLocation` API (`get`/`chooseFolder`/`createInFolder`) + remembered-path config outside the synced folder + Onboarding screen. Done: first run shows Onboarding; choosing a folder creates the DB + runs the (currently empty) seed step; second launch skips straight to Dashboard, which renders its empty state (no categories/brackets yet, prompts the user to Settings) rather than erroring. | AT-1.3, AT-1.5 | `src/main/dataLocation.ts`, `src/renderer/pages/Onboarding.tsx`, `electron/preload.ts` | #41 | ~4h | ☑ |
| AT-1.7 | P1 | [core] `audit_log` repository + a `recordMutation()` helper every later repository calls. Done: unit test verifies one row per call with entity/action/before/after/timestamp. | AT-1.3 | `src/main/repositories/auditLog.ts` + test | — | ~2h | ☑ |
| AT-1.8 | P1 | Launch-time lock-file guard (hostname+timestamp file; warn if another instance's lock looks recent). Done: manual check — stale/absent lock is silent, a <5min lock shows the warning banner. | AT-1.6 | `src/main/lockFile.ts`, `src/renderer/components/LockWarningBanner.tsx` | — | ~2h | ☑ |
| AT-1.9 | P1 | Static no-network guard: lint rule forbidding `fetch`/`http`/`https`/`net` imports outside a documented allowlist. Done: lint fails on a deliberately-added violation, passes on the current tree. | AT-1.1 | `.eslintrc.*`, `package.json` (lint script) | #26 | ~2h | ☑ |
| AT-2.1 | P2 | `tax_years` repository: create/list/get/setExpenseMethod, plus a test-only helper to set `status` directly (close/reopen proper land in P4). Done: unit tests incl. two years open simultaneously. | AT-1.3, AT-1.7 | `src/main/repositories/taxYears.ts` + test | #22 | ~4h | ☑ |
| AT-2.2 | P2 | [core] `transactions` repository: `create`/`void`, covering tax-relevant and general shapes with field validation (income_section required iff tax-relevant+income; general_category required iff general). Done: unit tests. | AT-1.3, AT-1.4, AT-1.7, AT-2.1 | `src/main/repositories/transactions.ts` + test | #1, #1a, #2, #17, #34 | ~4h | ☑ |
| AT-2.3 | P2 | [core] `transactions.update` (open-year only) + `createReversal` (closed-year only) + `getHistory`, all audit-logged. Done: unit tests incl. reject-on-closed and reversal visibility. | AT-2.2 | `src/main/repositories/transactions.ts` + test | #16, #18, #19, #24 | ~4h | ☐ |
| AT-2.4 | P2 | `attachments` repository (`add` copies the file into `<folder>/attachments/<transaction-id>/`, `list`) — no remove method. Done: unit test verifies copy + listing. | AT-1.6, AT-2.2 | `src/main/repositories/attachments.ts` + test | #1 | ~3h | ☐ |
| AT-2.5 | P2 | IPC wiring for `taxYears`/`transactions`/`attachments`. Done: manual smoke test creates a transaction end-to-end from a scratch renderer call. | AT-2.1, AT-2.3, AT-2.4 | `electron/preload.ts`, `src/main/ipc/index.ts` | — | ~3h | ☐ |
| AT-2.6 | P2 | Entry screen part 1: tax/general toggle, transaction form, validation-error state. Done: manually matches PROTO-0001 `entry.html`'s form + error-example states. | AT-2.5 | `src/renderer/pages/Entry.tsx`, `src/renderer/components/TransactionForm.tsx` | #34 | ~4h | ☐ |
| AT-2.7 | P2 | Entry screen part 2: month-grouped ledger table, edit/void row actions, history panel, separate general-transactions ledger section. Done: manually matches PROTO-0001 `entry.html`'s ledger + history + general-section states. | AT-2.6 | `src/renderer/components/LedgerTable.tsx`, `src/renderer/components/HistoryPanel.tsx` | #25, #48, #49 | ~4h | ☐ |
| AT-3.1 | P3 | [core] `deduction_categories`/`shared_caps`/`deduction_entries`/`tax_brackets` repositories: CRUD incl. `createCategory`, `setCategoryActive`, `updateCategory`, `updateSharedCap`, `updateBracket`, all audit-logged. Done: unit tests. | AT-1.3, AT-1.5, AT-1.7 | `src/main/repositories/deductions.ts`, `src/main/repositories/settings.ts` + tests | #37, #38, #39, #40 | ~4h | ☐ |
| AT-3.2 | P3 | [core] Deduction cap-shape calculator (pure function: fixed / per-count×count / shared-group-sum-with-sub-caps). Done: unit tests for all 3 shapes plus the sub-cap-inside-a-group edge case. | AT-3.1, AT-1.4 | `src/main/calc/deductions.ts` + test | #6, #7, #8, #9, #10 | ~4h | ☐ |
| AT-3.3 | P3 | Expense-method calculator (lump-sum vs. actual) as a pure helper for later use by the calc engine. Done: unit tests. | AT-1.4 | `src/main/calc/expenseMethod.ts` + test | #3, #4 | ~2h | ☐ |
| AT-3.4 | P3 | IPC wiring for `deductions`/`settings`. Done: manual smoke test round-trips a category edit. | AT-3.1 | `electron/preload.ts`, `src/main/ipc/index.ts` | — | ~2h | ☐ |
| AT-3.5 | P3 | Deductions screen: grouped list, per-category cap display incl. shared-group running total, per-count count input. Done: manually matches PROTO-0001 `deductions.html` states incl. over-cap example. | AT-3.4 | `src/renderer/pages/Deductions.tsx` | — | ~4h | ☐ |
| AT-3.6 | P3 | Settings screen: edit name/cap, "+ add category" (cap-shape picker), archive/reactivate toggle, bracket table edit, data-location panel. Done: manually matches PROTO-0001 `settings.html` states. | AT-3.4, AT-1.6 | `src/renderer/pages/Settings.tsx` | #42 | ~4h | ☐ |
| AT-3.7 | P3 | Tax-year switcher component: create a year, set 40(5)-(8) expense method, warn on switching method mid-year with existing income. Done: manually matches PROTO-0001's expected warning behavior. | AT-2.1, AT-3.3 | `src/renderer/components/TaxYearSwitcher.tsx` | #5 | ~3h | ☐ |
| AT-4.1 | P4 | [core] Bracket calculator (pure, integer satang × basis-point rate, per-bracket breakdown). Done: unit test reproduces the `TAX-2025` reference (793,831.04 → 73,766.21). | AT-1.4 | `src/main/calc/brackets.ts` + test | #11, #12 | ~4h | ☐ |
| AT-4.2 | P4 | [core] `calc.computeYear()`: assembles income/expense/deduction/WHT/bracket into the full result, filtering `tax_relevant=true` (INV-8), using AT-3.2/AT-3.3. Done: unit tests incl. general-transaction exclusion, negative-income floor, WHT due/refund. | AT-4.1, AT-3.2, AT-3.3, AT-2.3 | `src/main/calc/computeYear.ts` + test | #13, #14, #30, #35 | ~4h | ☐ |
| AT-4.3 | P4 | `tax_years.close()`/`reopen()`: close computes+freezes `frozen_result_json` and audit-logs; reopen clears `closed_at`. Done: unit tests. | AT-4.2, AT-2.1 | `src/main/repositories/taxYears.ts` + test | #20, #32 | ~3h | ☐ |
| AT-4.4 | P4 | Closed-year read path serves `frozen_result_json` instead of a live recompute; settings edits after close never change it. Done: unit test edits a cap after closing a year and confirms the closed year's served result is unchanged while an open year's isn't. | AT-4.3 | `src/main/repositories/taxYears.ts`, `src/main/calc/computeYear.ts` | #27 | ~2h | ☐ |
| AT-4.5 | P4 | IPC wiring for `calc`/close/reopen. Done: manual smoke test. | AT-4.3 | `electron/preload.ts`, `src/main/ipc/index.ts` | — | ~2h | ☐ |
| AT-4.6 | P4 | Dashboard screen: live tax tiles, deduction headroom list, separate general-transactions section, empty state. Done: manually matches PROTO-0001 `dashboard.html`. | AT-4.5, AT-3.5 | `src/renderer/pages/Dashboard.tsx` | #29, #36 | ~4h | ☐ |
| AT-4.7 | P4 | Year Summary/Close screen: breakdown, bracket table with the hit bracket highlighted, close confirmation modal, closed/locked view with reversal example, reopen action. Done: manually matches PROTO-0001 `summary.html`. | AT-4.5 | `src/renderer/pages/Summary.tsx` | #15, #20, #21, #28 | ~4h | ☐ |
| AT-5.1 | P5 | [core] `exportLedger(yearId, destPath)` — one CSV row per transaction, every reconstructable field. Done: unit test checks output against a fixture year incl. voided/reversal rows. | AT-2.3 | `src/main/repositories/csv.ts` + test | #43 | ~3h | ☐ |
| AT-5.2 | P5 | `exportSummary(yearId, destPath)` — read-only CSV of `computeYear()`'s figures. Done: unit test matches on-screen figures. | AT-4.2 | `src/main/repositories/csv.ts` + test | #44 | ~2h | ☐ |
| AT-5.3 | P5 | [core] `parseForPreview(filePath)` — per-row validation (required fields, valid money, tax-year open-or-creatable, closed-year rows always invalid per INV-2b), no write. Done: unit tests for well-formed, missing-field, and closed-year rows. | AT-2.1, AT-5.1 | `src/main/repositories/csv.ts` + test | #45, #46 | ~4h | ☐ |
| AT-5.4 | P5 | [core] `commitImport(rows, sourceFilename)` — inserts only the confirmed rows via `transactions.create({ source: 'import' })`, plus one batch `audit_log` entry. Done: unit test — partial confirm inserts the exact subset and one batch audit row with correct counts. | AT-5.3, AT-2.2 | `src/main/repositories/csv.ts` + test | #47 | ~3h | ☐ |
| AT-5.5 | P5 | IPC wiring for `csv.*`. Done: manual smoke test. | AT-5.4 | `electron/preload.ts`, `src/main/ipc/index.ts` | — | ~2h | ☐ |
| AT-5.6 | P5 | Import/Export screen: year picker + export buttons, import dropzone → preview table with per-row checkbox/status. Done: manually matches PROTO-0001 `import-export.html`. | AT-5.5 | `src/renderer/pages/ImportExport.tsx` | — | ~4h | ☐ |

## Re-plan log
| Date | Change | Reason |
|------|--------|--------|
| 2026-09-13 | **Gate: approved.** 5 phases, 36 tasks confirmed. | Proceed to `/dev-implement` (or `/dev-execute` for continuous execution). |
| 2026-09-17 | AT-1.5 redefined as an optional seed loader seeding an empty built-in set (no `TAX-2025` data available); AT-1.6's done-criterion no longer requires seeded reference data, only that Onboarding/Dashboard handle zero categories/brackets gracefully. | User has no seed data on hand; unblocks the P1 stream paused since 2026-09-15 (see ANA-0001 decision 14, REQ-0001 2026-09-17 decision log entry). |
