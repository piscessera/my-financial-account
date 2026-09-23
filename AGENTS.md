# my-financial-account — Workspace Instructions

Developed through the document-driven agent process in `.agents/` (ported from the TPS agent
system, 2026-09-12). These instructions apply to every session in this repository.

## Project

- **What:** personal finance app for a single account owner. Records income/expense
  transactions individually and produces an annual Thai personal income tax summary
  (progressive rate, statutory deductions, WHT netting), replacing a manual Excel workbook.
  First feature: `REQ-0001` (annual tax income/expense tracker).
- **Main users:** single user (the account owner), no login/multi-user.
- **Stack** (chosen at `REQ-0001` / `ANA-0001` analyze):
  - Runtime: **Electron** + TypeScript, Windows desktop app.
  - Main process: Node.js, **`better-sqlite3`** (synchronous SQLite driver) + **Drizzle**
    (type-safe SQL query builder, not a full ORM — money-affecting queries stay explicit SQL).
  - Renderer: **React** + Vite, no heavy component library. Styling uses Vanilla CSS
    (`src/renderer/styles.css`) strictly following the design system in `DESIGN.md`
    (Direction B: "Slate & Amber" — Sarabun body, Chakra Petch headings, JetBrains Mono numbers).
  - IPC: `preload.ts` exposes a narrow typed API via `contextBridge`; the renderer never
    touches SQLite directly — all business logic/invariant enforcement lives in the main
    process.
  - Storage: local file-based DB (SQLite) at a path the user chooses, intended to be a folder
    synced by the Google Drive desktop client. No Google API/OAuth integration — the app only
    reads/writes local files; Drive handles sync/backup outside the app.
  - Test runner: **Vitest** (main-process/calculation-engine unit tests).
  - Lint/format: ESLint + Prettier.
  - Packaging: `electron-builder` (Windows target — NSIS/portable exe, finalized at first
    `/dev-release`).
  - Currency: THB only.
- **UX/UI Design System:** `DESIGN.md` (root / `design/DESIGN.md`) is the canonical specification
  for colors (Slate & Amber tokens), typography pairing, tabular number formatting, component
  patterns, form states, and Thai localization. All prototypes, analysis UI sections,
  implementations, and UI reviews must adhere to `DESIGN.md`.
- **Domain invariants (always):** money as integer minor units or decimal — never float;
  transactions are directly editable while their tax year is open, and every edit is
  audit-logged (before/after values, timestamp); once a tax year is marked filed/closed, its
  transactions lock — further correction is a reversal entry, never a silent edit; balances
  reconcile to entries; every mutation audit-logged; currency explicit. The ANA lists them as
  `INV-n`; each has a test.
- **Deployment:** local desktop app, no server/hosting. Runs directly on the user's own
  machine — no remote deploy target. Build command, installer/packaging steps, and any
  migration command for the local DB: TBD, to be filled in before the first `/dev-release`
  once the stack is chosen. No cron/scheduler, no smoke-check URLs (nothing network-facing).
  Rollback = restore the local DB file from Google Drive's version history.

## Working process (summary)

```
requirement → analyze(+TC) → [prototype loop] → plan(phases+tasks) → implement(code+unit tests) → review → close/archive
```

- **Sizes drive depth:** S = condensed path · M = full pipeline · L = full + prototype + one audit at close.
  Classification rules live in the `dev-standard` skill.
- **Gates** stop for explicit user approval. Reply vocabulary: `approve` / `change: …` / `hold`.
- **Documents live in `docs/`.** Every artifact has an ID (`REQ/ANA/TC/PROTO/PLAN/GAP/REV/IMPL`)
  and a row in `docs/INDEX.md`. Templates: `.agents/templates/`.
- **Single-writer rule:** the orchestrator (main session) is the only writer of `docs/INDEX.md`
  and `docs/90-daily-logs/`; it also **allocates every document ID** and passes it to the
  sub-agent. Sub-agents return summaries + a log line; they never read ID counters themselves.
- **Dispatch payload rule:** when dispatching a role, the orchestrator sends *excerpts* (the task
  row, the linked TC cases, the relevant ANA section) — not whole documents. Sub-agents read only
  what the payload lists. See `.agents/skills/dev-standard/orchestrator.md` §12 (main session
  loads `SKILL.md` + `orchestrator.md`; sub-agents load `SKILL.md` only).
- **Every skill's last step:** the orchestrator appends to `docs/90-daily-logs/YYYY-MM-DD.md`.
- **No-pipeline mode:** trivial work skips stages on the user's word; still one log line.
- **Parking lot:** every deferred note/idea/out-of-scope item is a row in `docs/PARKING-LOT.md`
  with an owner (orchestrator writes it). `node .agents/scripts/validate-docs.js` runs at every
  gate and before commits on `main`.
- **Review cadence:** every phase passes the mechanical gate `bash .agents/scripts/gate.sh`
  (validate-docs, tests, lint, secrets — commands in `.agents/gate.env`); a
  model review (`qa-reviewer`) runs only at feature close or for schema/auth phases.
- **Enforcement:** `.agents/hooks/guard-shared-files.js` (PreToolUse) blocks sub-agents and
  worktrees from writing shared files, and keeps `qa-reviewer` read-only.
- **Archive, never delete:** closed docs move to `docs/archive/` with INDEX tombstones.
- **Continuous execution:** `/dev-execute [PLAN-id | all]` (user-only) runs ready plans to
  completion — dependency-aware, max 2 parallel streams (branch `plan/PLAN-NNNN-slug` + git
  worktree per plan), sync-before-commit, merge queue into `main`. `orchestrator.md` §11.

## Skills & roles

- Skills (runbooks): `.agents/skills/` — `dev-standard`, `dev-requirement`, `dev-analyze`,
  `dev-investigate`, `dev-prototype`, `dev-plan`, `dev-implement`, `dev-review`, `dev-status`,
  `dev-log`, `dev-archive`, `dev-release`, `dev-execute` (user-only slash command).
- Roles (sub-agents, auto-registered): `.agents/agents/` — `requirement-intake`,
  `solution-analyst`, `impact-investigator`, `ux-prototyper`, `work-planner`, `implementer`,
  `qa-reviewer`, `archivist`. Role file = identity + tools + model + return format only; all
  rules live in the skill it runs.
- Orchestration (size classification, gates, ID allocation, INDEX/log writes, dispatch) is done
  by the main session — there is deliberately no orchestrator role.
