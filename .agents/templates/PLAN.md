---
id: PLAN-{{NNNN}}
type: plan
title: {{title}}
status: draft
created: {{DATE}}
updated: {{DATE}}
links: [ANA-{{NNNN}}, TC-{{NNNN}}]
---

# PLAN-{{NNNN}}: {{title}}

## Stage A — Phases (strategic)

### P1: {{phase name}}
- **Goal:** …
- **Deliverables:** …
- **Exit criteria:** TC cases #a–#b pass; …
- **Depends on:** —

## Dependencies & risks
(External deps, host constraints, parked items — with owner plans.)

## Hot files
(Shared files this plan touches — routes, core models, migrations, package manifests.
`dev-execute` will not run two plans with overlapping hot files at the same time.)
- …

## Stage B — Atomic tasks (tactical)

Unit tests are part of each task. Tag money/ledger tasks `[core]` in the description (they may
be dispatched to a stronger model). `Depends` lists AT ids that must be Done first (— if none);
the executor never starts a blocked task. Each row must be actionable on its own — it is pasted
alone into the implementer's dispatch payload.

| Task | Phase | Description (incl. done-criterion) | Depends | Files touched | TC | Est | Done |
|------|-------|------------------------------------|---------|---------------|----|----|------|
| AT-1.1 | P1 | … | — | … | # | ~2h | ☐ |
| AT-1.2 | P1 | … | AT-1.1 | … | # | ~3h | ☐ |
| AT-2.1 | P2 | … | — | … | # | ~2h | ☐ |

## Re-plan log
| Date | Change | Reason |
|------|--------|--------|
