---
id: IMPL-0001
type: implementation
title: Annual tax income/expense tracker
status: active
created: 2026-09-15
updated: 2026-09-15
links: [PLAN-0001]
---

# IMPL-0001: Annual tax income/expense tracker

This is the **folder index** (`docs/70-implementation/IMPL-0001-annual-tax-income-expense-tracker/README.md`).
Per-task notes live next to it as `AT-x.y.md` (template `IMPL-task.md`, ≤ 40 lines each).
Nobody needs to read previous notes to implement the next task — the PLAN row and TC cases are
the contract; this folder is the audit trail.

## Task log
| Task | Commit | Note | Deviation? |
|------|--------|------|------------|
| AT-1.1 | `b9818c7` | [AT-1.1.md](./AT-1.1.md) | yes — eslint flat config filename; dev window verified via build+process-launch, not a screenshot (no display in sandbox) |
| AT-1.2 | `ccaad19` | [AT-1.2.md](./AT-1.2.md) | no |
| AT-1.9 | `6e3b199` | [AT-1.9.md](./AT-1.9.md) | yes — TC #26 is `Level: Manual`; this task's static lint guard is a proxy, recorded as `manual (static guard only)`, not `pass` |

## Setup & config notes
(Env vars, scheduler entries, migrations, deploy steps — cumulative, short.)

## Known limitations / follow-ups
(→ PARKING-LOT / future GAPs.)
