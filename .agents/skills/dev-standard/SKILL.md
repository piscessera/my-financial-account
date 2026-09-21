---
name: dev-standard
description: Shared conventions for ALL project work — document IDs and front-matter, folder map, size classification (S/M/L), approval gates, daily log format, single-writer rule, traceability, invariants. Orchestrator-only rules (branches, dispatch payload, archive) are in orchestrator.md. Load whenever creating or updating any project document, dispatching a role, or logging work.
---

# dev-standard — process conventions

Obey these rules in any project work regardless of which skill or role is running.
Stack, standards and hosting constraints: `CLAUDE.md` §Project. Rationale: original design in
the TPS project (`AGENT-SYSTEM-DESIGN.md`, not copied here).

This file is what every sub-agent loads. Orchestrator-only sections (§9 archive, §11 branches,
§12 dispatch payload) live in `orchestrator.md` next to it — the main session loads both.

## 1. Folder map

```
docs/
├── INDEX.md              master registry (orchestrator-only writer)
├── 10-requirements/      REQ-NNNN-slug.md
├── 20-analysis/          ANA (analysis+design), GAP (investigations)
├── 30-test-cases/        TC
├── 40-prototypes/        PROTO-NNNN-slug/ (index.html, screens, CHANGELOG.md)
├── 50-plans/             PLAN
├── 60-reviews/           REV
├── 70-implementation/    IMPL-NNNN-slug/  ← a FOLDER: README.md + one AT-x.y.md per task
├── 80-releases/          REL-vX.Y.Z.md (dev-release)
├── PARKING-LOT.md        single ledger of deferred notes/ideas/parked items (orchestrator writes)
├── 90-daily-logs/        YYYY-MM-DD.md (append-only)
└── archive/              closed/superseded docs (never deleted)
```

## 2. IDs & front-matter

- ID = `TYPE-NNNN`, TYPE ∈ {REQ, ANA, TC, PROTO, PLAN, GAP, REV, IMPL}.
- **IDs are allocated only by the orchestrator** from the counters table in `docs/INDEX.md`,
  *before* dispatch, and passed in the payload. Sub-agents **never read the counters** (a
  worktree holds a stale INDEX copy — two streams would collide). If a sub-agent needs an ID it
  was not given, it stops and asks the orchestrator.
- File name: `TYPE-NNNN-slug.md` (kebab-case). Every doc starts from
  `.claude/templates/<TYPE>.md` and keeps front-matter updated (`status`, `updated`, `links`).

## 3. Status lifecycle

`draft → active → implemented → archived`; superseded: `draft → superseded → archived`;
investigations/ideas may be `parked`. Status changes are reported to the orchestrator.

## 4. Size classification (assign in analyze; user may override)

| Size | Rule of thumb | Path |
|------|---------------|------|
| **S** | ≤1 phase, ≤5 atomic tasks, 1 module, no schema change | intake+analyze merged (a GAP may act as the requirement) · plan optional (task list inside ANA) · prototype skipped unless UI-visible · 1 review gate at the end |
| **M** | default | full pipeline · gates after analyze and plan · mechanical gate per phase, model review at feature close |
| **L** | multi-phase/module, new data model, cross-cutting | full pipeline · prototype recommended · plan per phase · **mechanical gate per phase**, model review only for schema/auth phases + feature close · one audit at close · archivist checkpoint |

## 5. Gates

Stop and ask the user before proceeding past: REQ scope+size · design+TC · plan · prototype
rounds · post-implementation review. User reply vocabulary: `approve` / `change: …` / `hold`.
Record the outcome in the doc's decision log and the daily log. Silence = not approved.

## 6. Daily log

Append-only `docs/90-daily-logs/YYYY-MM-DD.md`, one entry per work unit, **≤ 4 lines**:

```markdown
## HH:MM · <skill> (<ID>) — <role>
- <what was produced/done>
- decision: <key decision, if any>
- next: <next step, if any>
```

The orchestrator takes `HH:MM` from `date +%H:%M`, never from memory.

## 7. Single-writer rule

Dispatched agents never write `docs/INDEX.md`, `docs/PARKING-LOT.md` or the daily log
(enforced by the PreToolUse guard `.claude/hooks/guard-shared-files.js`). They **return**: files
created/updated, a 3–5 bullet summary, and one pre-formatted log line. The orchestrator writes
the registry, the log, and commits.

## 8. No-pipeline mode

On the user's word ("quick", "just do it") or for trivial work: skip stages, work directly.
Still: one-line daily-log entry, and INDEX update if any document was touched.

## 9. Archive → `orchestrator.md` §9 (archivist: also read `dev-archive`)

## 10. Traceability, invariants & parking lot

**Invariants:** the ANA lists domain rules that must never break (`INV-n`, e.g. ledger balance,
immutable posted transactions, exact money types, audit trail). Every INV has ≥1 TC case
(`Maps to: INV-n`), the implementer never weakens one, and the reviewer checks them first.

Every artifact links parents/children in front-matter `links`. Requirement → design → test
cases → plan tasks → commits → review must form an unbroken chain for any feature.
Deferred things (REV notes/ideas, REQ out-of-scope items, parked GAPs) go to `docs/PARKING-LOT.md`
with an owner — never only inside a REV. `node .claude/scripts/validate-docs.js` checks links,
IDs vs counters, INDEX rows, IMPL note size, PLAN rows and parking-lot owners; run it at every
gate and before every commit on main.

## 11–12. Execution & branches · Dispatch payload → `orchestrator.md`

Main session only. Sub-agents: you receive a payload built by §12 — work from it, nothing more.
