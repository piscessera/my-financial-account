# .claude — agent system (ported from TPS, 2026-09-12)

```
.claude/
├── agents/       8 roles — auto-registered sub-agents (identity + tools + model + return format)
├── skills/       13 runbooks; dev-execute is user-only (disable-model-invocation)
├── templates/    document templates (IMPL is a folder: README.md + IMPL-task.md per task)
├── hooks/        stop-continuity.sh (Stop) · guard-shared-files.js (PreToolUse)
├── scripts/      validate-docs.js (doc checks) · gate.sh (mechanical phase gate; commands in gate.env)
├── gate.env.example  copy to gate.env once the stack is decided
└── settings.json
```

## Changes vs the original TPS `.agents/` system

| # | Change | Why |
|---|--------|-----|
| A1 | IDs allocated only by the orchestrator, passed in the payload | worktrees hold a stale INDEX → parallel streams collided on IDs |
| A2 | IMPL is a folder with one ≤40-line note per task; no code/test output | single IMPL grew to 266 KB (~66K tokens) and was re-read every task |
| A3 | Stop hook: stale-state guard (12 h) + 3-continuation counter | a crashed run blocked every later session's stop |
| B1 | Dispatch payload rule (`dev-standard` §12): excerpts, not "read the ANA/TC" | sub-agents start empty; whole docs cost 30–90K tokens per task |
| B4 | `model:` per role (opus for analyst/planner/reviewer/investigator, sonnet for implementer/prototyper/intake, haiku for archivist) | cost |
| B5 | Role files slimmed; all rules live in the skill | two copies drifted |
| C1 | Claude Code layout (`.claude/agents|skills`, `settings.json`) | roles now auto-register; `/dev-execute` works natively |
| C2 | `disable-model-invocation: true` on dev-execute | enforced user-only trigger instead of a prose request |
| C3 | Interactive skills (requirement, prototype) note that the interview/feedback loop stays with the orchestrator | sub-agents cannot talk to the user |
| D1 | PLAN has a **Hot files** list; dev-execute won't run overlapping plans concurrently | "cannot conflict by construction" was only true for docs |
| A4 | `docs/PARKING-LOT.md` single ledger; audit checks REV notes landed there; open rows need an owner | 12/13 original REVs were "PASS with notes" and the notes had nowhere to go |
| C4 | PreToolUse guard: sub-agents/worktrees cannot write INDEX/log/CLAUDE/.claude; qa-reviewer can write only its REV | rules were prose-only |
| C5 | `scripts/validate-docs.js` | mechanical checks no longer cost model tokens |
| B2 | Review cadence: mechanical gate per phase; model review only at feature close / schema-auth phases / FAIL history | 8 phase reviews × 40–80K tokens per L feature |
| D2 | Code-quality checklist in review mode (authz + negative test, validation, migrations/money types, N+1, secrets, UTF-8) | checklist was process-only |
| D3 | `dev-release` skill (pre-flight, semver, CHANGELOG, deploy per CLAUDE.md §Deployment, smoke, tag, rollback) | no deploy runbook |
| E1 | `dev-standard` split: `SKILL.md` (sub-agents) + `orchestrator.md` (§9/§11/§12, main session only) | ~800 tokens less per dispatch |
| E2 | `scripts/gate.sh` + `gate.env` — one command for the mechanical gate | orchestrator no longer improvises the gate |
| E3 | Payload always carries the project/stack lines | sub-agent may not see CLAUDE.md |
| E5 | ANA `Invariants` (INV-n) + TC coverage + review checks them first; `[core]` task tag | financial rules designed in, not reviewed in |

Not yet done: D4 — dry-run one small bug through `dev-investigate → GAP-lite → S path` once the
project has code, to find friction in the S path.

## Role → skill map

| Role | Model | Skill | Produces |
|------|-------|-------|----------|
| requirement-intake | sonnet | dev-requirement | REQ draft (+questions) |
| solution-analyst | opus | dev-analyze | ANA + TC |
| impact-investigator | opus | dev-investigate | GAP |
| ux-prototyper | sonnet | dev-prototype | PROTO round (+ANA/TC write-back) |
| work-planner | opus | dev-plan | PLAN |
| implementer | sonnet | dev-implement | code + tests, IMPL task notes |
| qa-reviewer | opus | dev-review | REV |
| archivist | haiku | dev-archive | archive moves, MANIFEST |
