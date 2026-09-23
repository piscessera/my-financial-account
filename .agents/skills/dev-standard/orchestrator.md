# dev-standard — orchestrator sections (§9, §11, §12)

Loaded only by the main session. Sub-agents never need this file (saves ~800 tokens/dispatch).
Section numbers continue from `SKILL.md`.

## 9. Archive (orchestrator / archivist)

Never delete. Move closed/superseded docs to `docs/archive/<TYPE>/`, add a row to
`docs/archive/MANIFEST.md` (from → to, why, date), tombstone the INDEX row
(`status: archived`, `archived_to: …`), one commit. Reversible by moving back.

## 11. Execution & branches (used by `dev-execute`)

- Integration branch is **`main`**. Each executing plan gets branch `plan/PLAN-NNNN-slug` cut from
  latest main and worktree `.worktrees/PLAN-NNNN/` (gitignored) — all coding happens there.
- **Shared files change only on main, only by the orchestrator:** `docs/INDEX.md`,
  `docs/PARKING-LOT.md`, `docs/90-daily-logs/`, `AGENTS.md`, `DESIGN.md`, `.agents/`. A feature branch edits
  only its own plan's documents (PLAN/TC/IMPL/PROTO of that plan) plus code/tests. *Docs* then
  cannot conflict; *code* still can — the planner lists **hot files** and the orchestrator does
  not run two plans with overlapping hot files concurrently.
- **Sync-before-commit:** before every commit/push/merge, verify `main` hasn't advanced. If it
  did: merge `main` into the branch, resolve, re-run tests, then commit. Never force-push.
- **Merge queue:** one `--no-ff` merge into main at a time; full suite green on main after merge;
  worktree + branch removed; other streams sync main before their next commit.
- Run state: `.agents/runs/PLAN-NNNN.state` (gitignored) — `plan:`, `branch:`, `worktree:`,
  `status: executing|paused|done`, `started: <ISO date>`, `continuations: 0`. The Stop hook
  reads these (ignores states older than 12 h; max 3 continuations per run).
- **Mechanical gate** = `bash .agents/scripts/gate.sh [--plan PLAN-NNNN --phase Pn] [--dir <worktree>]`
  (validate-docs + `TEST_CMD` + `LINT_CMD` + optional `SECRETS_CMD` from `.agents/gate.env`).
  Run it at every phase end, before every merge into main, and before `/dev-release`.
  Paste its summary block into the reviewer payload when a model review follows.

## 12. Dispatch payload rule (token discipline)

Sub-agents start with an empty context. The orchestrator therefore sends **excerpts, not
references**, and the sub-agent reads *only* what the payload lists.

Every dispatch prompt contains, in this order:

1. **Role & skill:** "You are `<role>`; run `.agents/skills/<skill>/SKILL.md`."
2. **Project line (always):** the `Stack`, `Standards`, `UX/UI Design System` and hosting-constraint bullets from
   `AGENTS.md §Project`, verbatim (3–5 lines) — do not assume the sub-agent has AGENTS.md.
3. **Allocated IDs** (§2) — e.g. `REV id: REV-0014`.
4. **Work item excerpt** — the PLAN task row(s), or the REQ/GAP section, verbatim.
5. **Linked TC cases** — only the rows whose ids the task links, verbatim.
6. **Relevant ANA section(s)** — only the design points the task touches, **plus the
   `Invariants` rows the task can affect** (INV-n) — not the whole ANA.
7. **PROTO screen path(s)** for UI tasks — the specific file(s), not the folder.
8. **Read list** — code files the agent may need (paths). Everything else is off-limits unless
   the agent hits a concrete need, in which case it reads the minimum and reports what it read.
9. **Worktree path** (execution), gate output if relevant, and the expected **return format**
   (from the role file).

Hard limits: never paste whole ANA/TC/PLAN files; never point an agent at an IMPL folder to
"catch up" — previous tasks' notes are not needed to implement the next task; the PLAN row and
TC cases are the contract. Sub-agents cannot talk to the user: any open question is **returned**
to the orchestrator, who asks the user. Tasks tagged `[core]` in the PLAN (money/ledger logic)
may be dispatched with `model: opus`.
