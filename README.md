# my-financial-account

A personal finance desktop app for a single account owner. It records income and expense
transactions individually and produces an annual Thai personal income tax summary
(progressive rate, statutory deductions, withholding-tax netting) — replacing a manual
Excel workbook.

First feature: `REQ-0001` — annual tax income/expense tracker. See
[docs/10-requirements/REQ-0001-annual-tax-income-expense-tracker.md](docs/10-requirements/REQ-0001-annual-tax-income-expense-tracker.md)
for the full requirement and [docs/INDEX.md](docs/INDEX.md) for the current status of every
project document.

## Stack

- **Electron** + TypeScript, packaged as a Windows desktop app.
- **Main process**: Node.js, [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
  (synchronous SQLite driver) + [Drizzle](https://orm.drizzle.team/) as a type-safe query
  builder (not a full ORM — money-affecting queries stay explicit SQL).
- **Renderer**: React + Vite, no heavy component library.
- **IPC**: `electron/preload.ts` exposes a narrow typed API via `contextBridge`. The
  renderer never touches SQLite directly — all business logic and invariant enforcement
  lives in the main process.
- **Storage**: a local SQLite file at a path the user chooses, intended to live in a folder
  synced by the Google Drive desktop client. The app only reads/writes local files — no
  Google API/OAuth integration; Drive handles sync and version-history backup outside the
  app.
- **Tests**: [Vitest](https://vitest.dev/) for main-process and calculation-engine unit
  tests.
- **Lint/format**: ESLint + Prettier.
- **Packaging**: [electron-builder](https://www.electron.build/) (Windows target — finalized
  at first release).
- Currency: THB only.

## Prerequisites

- Node.js 20+ (developed against Node 24) and npm.
- Windows, to run the packaged Electron app (development can run cross-platform).

## Getting started

Install dependencies:

```bash
npm install
```

Run the app in development (starts Vite + Electron with hot reload):

```bash
npm run dev
```

## Available scripts

| Command           | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`     | Start the Vite dev server and launch the Electron app against it.                    |
| `npm run build`   | Type-check, build the renderer (Vite) and compile the Electron main/preload sources. |
| `npm run preview` | Preview the built renderer with Vite (renderer only, no Electron shell).             |
| `npm test`        | Run the Vitest unit test suite (`src/main/**/*.test.ts`).                            |
| `npm run lint`    | Lint the project with ESLint.                                                        |
| `npm run format`  | Format the project with Prettier.                                                    |
| `npm run build:app | Release                                                                             |

## Project layout

```
electron/            Electron main process and preload script
  main.ts             App entry point, BrowserWindow setup
  preload.ts           contextBridge IPC surface exposed to the renderer
src/
  main/                Main-process code (runs in Node.js, has DB access)
    calc/               Calculation engine (money helpers, tax rules)
    db/                 SQLite client, schema, migrations (Drizzle)
    repositories/       Data-access modules (e.g. audit log)
  renderer/            React + Vite renderer (UI)
docs/                 Project documentation, see below
.claude/              Agent workflow: skills, agent roles, templates, scripts
```

## Data & storage

The app stores all data in a single local SQLite file at a path you choose — point it at a
folder synced by the Google Drive desktop client to get automatic backup and version
history. The app itself never talks to any Google API; Drive sync/backup happens entirely
outside the app, at the filesystem level.

Key invariants enforced by the app (see `CLAUDE.md` for the full list):

- Money is always stored as integer minor units or fixed-precision decimal — never float.
- Transactions are directly editable while their tax year is open; every edit is
  audit-logged (before/after values, timestamp).
- Once a tax year is marked filed/closed, its transactions lock — further correction is a
  reversal entry, never a silent edit.
- Balances always reconcile to entries; currency is always explicit (THB).

## Project documentation & workflow

This project is developed through a document-driven agent process defined in `.claude/`.
All working documents (requirements, analysis, test cases, plans, reviews,
implementation notes, daily logs) live under `docs/`, indexed in
[docs/INDEX.md](docs/INDEX.md). See [CLAUDE.md](CLAUDE.md) for the full description of the
stack, domain invariants, and the `requirement → analyze → plan → implement → review →
archive` working process, including its skills (`.claude/skills/`) and agent roles
(`.claude/agents/`).

## Status

Development is in progress on `REQ-0001` (see [docs/INDEX.md](docs/INDEX.md) for live
status of each document). There is no packaged release yet; build/installer steps for
`electron-builder` and any local-DB migration command will be finalized before the first
release.
