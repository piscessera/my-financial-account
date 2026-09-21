# my-financial-account (สมุดภาษีรายปี)

A personal finance desktop app for a single account owner. It records income and expense
transactions individually, tracks monthly recurring commitments, and produces an annual
Thai personal income tax summary (8 progressive rate brackets, statutory deductions,
withholding-tax netting, and year-scoped customization) — replacing a manual Excel workbook.

---

## Key Features

- **📊 Visual Financial Dashboard:**
  - Annual income, expense, and tax liability summary cards.
  - Interactive monthly cashflow trend chart (income vs expense vs net).
  - Category distribution donut chart for expense breakdown.

- **🧾 Thai Personal Income Tax Tracking (`REQ-0001`):**
  - Section 40 income classification (40(1) salary, 40(2) freelance, 40(5)–(8) business/sales).
  - Expense deduction calculation (statutory flat rates or verified actual expenses).
  - Comprehensive tax deduction engine (personal, spouse, child, parents, social security, provident fund, life/health insurance, RMF/SSF/ThaiESG, donations, and shared caps).
  - Withholding tax (WHT) credit netting and annual tax payable/refundable calculation.
  - Year closing & freeze snapshot with audit trail (`INV-2b` / `INV-3`).

- **⚙️ Year-Scoped Config & Baseline Templates (`REQ-0004`):**
  - Standard statutory Thai tax brackets (8 brackets: 0% to 35% with standard upper bounds).
  - Editable system baseline templates automatically cloned when creating new tax years.
  - Independent customization per tax year with closed-year edit protection (`INV-7`).

- **📋 Monthly Recurring Checklist (`REQ-0005`):**
  - Customizable recurring expense/income templates (due day, default amount, notes).
  - Monthly checklist widget for tracking bills, rent, utilities, and subscriptions.
  - 1-click quick record, skip month, and undo actions.

- **📑 Streamlined Segmented Ledger (`REQ-0003`, UX refinement):**
  - Segmented views: Tax Items, General & Monthly Items, and All Transactions.
  - Collapsible quick-entry form with smart edit auto-tab switching.
  - Net amount calculation (`Amount - WHT`) and custom remarks for every transaction.

- **🔒 Safe Local Storage & Cloud Sync Support (`REQ-0002`):**
  - Local SQLite database stored at a user-selected path (e.g. Google Drive synced folder).
  - In-app data folder switcher with multi-instance lockfile protection (`INV-6`).

---

## Stack

- **Runtime**: **Electron** + TypeScript, Windows desktop application.
- **Main process**: Node.js, [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
  (synchronous SQLite driver) + [Drizzle](https://orm.drizzle.team/) as a type-safe query
  builder (money-affecting queries stay explicit and deterministic).
- **Renderer**: **React** + **Vite**, modern clean design with custom SVG charts.
- **IPC**: `electron/preload.ts` exposes a narrow typed API via `contextBridge`. The
  renderer never touches SQLite directly — all business logic and invariant enforcement
  lives in the main process.
- **Storage**: Local SQLite file at a path the user chooses, designed to live in a folder
  synced by cloud clients (Google Drive / OneDrive) for automatic backup and versioning.
- **Test Runner**: [Vitest](https://vitest.dev/) for unit, calculation engine, repository, and UI component tests.
- **Lint/format**: ESLint + Prettier.
- **Packaging**: [electron-builder](https://www.electron.build/) (Windows NSIS & portable target).
- **Currency**: THB only (all money represented as integer minor units/satang, `INV-1`).

---

## Prerequisites

- Node.js 20+ (developed and tested against Node 24) and npm.
- Windows 10/11 for running the packaged Electron app (development supported cross-platform).

---

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Run in development mode (Vite + Electron hot reload):**

   ```bash
   npm run dev
   ```

3. **Build production bundle:**

   ```bash
   npm run build
   ```

---

## Available Scripts

| Command           | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`     | Start the Vite dev server and launch the Electron app with live reload.              |
| `npm run build`   | Type-check with `tsc` and build renderer + Electron main/preload bundles.            |
| `npm test`        | Run all Vitest test suites (main process, repositories, calc engine, and UI tests).  |
| `npm run lint`    | Lint the codebase using ESLint.                                                      |
| `npm run format`  | Format the codebase using Prettier.                                                  |
| `npm run build:app` | Package the Windows application installer / executable via electron-builder.        |

---

## Project Layout

```
electron/             Electron main process and preload script
  main.ts             App entry point, BrowserWindow setup, window icon & IPC registration
  preload.ts          contextBridge IPC surface exposed to the renderer
src/
  main/               Main-process domain logic (runs in Node.js, handles SQLite & business logic)
    calc/             Calculation engine (tax brackets, statutory deductions, money satang arithmetic)
    db/               SQLite client, schema, seed data, and versioned migrations (001, 002, 003)
    repositories/     Data access repositories (taxYears, transactions, deductions, settings, recurring, auditLog)
    ipc/              IPC channel definitions and dispatch handlers
  renderer/           React + Vite renderer UI
    components/       Reusable UI widgets (LedgerTable, TransactionForm, RecurringChecklist, Charts, History)
    pages/            App pages (Dashboard, Entry, Summary, Deductions, Settings, ImportExport, Onboarding)
    styles.css        Design tokens, responsive layouts, and typography
docs/                 TPS document-driven architecture (requirements, analysis, test cases, plans, daily logs)
.agents/              Agent workflows, skills, roles, hooks, and automated gate validation scripts
```

---

## Domain Invariants (Core Rules)

1. **`INV-1` (Money representation):** Money is strictly stored as integer minor units (satang) or decimal — never floating point numbers.
2. **`INV-2` (Transaction mutability):** Transactions are directly editable while their tax year is open. Every edit is audit-logged with before/after values and timestamps.
3. **`INV-2b` / `INV-3` (Closed tax years):** When a tax year is closed/filed, its transactions and tax settings are locked. Further corrections require reversal entries, never silent edits.
4. **`INV-4` (Audit trail):** Every mutation (create, update, void, reversal, template change) records an immutable entry in `audit_log`.
5. **`INV-6` (Lockfile protection):** A single-instance lockfile protects the SQLite database file when opened across synced cloud folders.
6. **`INV-7` (Year-scoped tax config):** Tax brackets and deduction caps are isolated per tax year; modifying an open year does not affect other closed years.

---

## Documentation & Process

This project follows a document-driven development process defined in `.agents/` and indexed in [docs/INDEX.md](docs/INDEX.md). All features (`REQ-0001` through `REQ-0005`) are accompanied by formal analysis (`ANA`), test cases (`TC`), implementation plans (`PLAN`), and verification logs in `docs/90-daily-logs/`.
