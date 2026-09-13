# Document Index

Single registry of every working document. **Only the orchestrator writes this file**
(single-writer rule) and **only the orchestrator allocates IDs** from the counters below —
sub-agents receive their IDs in the dispatch payload.

| ID | Title | Type | Status | Size | Links | Updated |
|----|-------|------|--------|------|-------|---------|
| REQ-0001 | Annual tax income/expense tracker | requirement | active | L | ANA-0001, TC-0001 | 2026-09-13 |
| ANA-0001 | Annual tax income/expense tracker — design | analysis | active | L | REQ-0001, TC-0001 | 2026-09-13 |
| TC-0001 | Annual tax income/expense tracker — test cases | test-cases | active | — | ANA-0001 | 2026-09-13 |
| PROTO-0001 | Annual tax income/expense tracker — prototype | prototype | draft | — | ANA-0001 | 2026-09-13 |

## ID counters (next value to use)

| REQ | ANA | TC | PROTO | PLAN | GAP | REV | IMPL |
|-----|-----|----|-------|------|-----|-----|------|
| 2 | 2 | 2 | 2 | 1 | 1 | 1 | 1 |

## Status vocabulary

`draft → active → implemented → archived` · superseded: `draft → superseded → archived` ·
investigations/ideas may be `parked` (visible in dev-status, never silently dropped).

## Open gates (things waiting on the user)

| ID | Gate | Since |
|----|------|-------|
| PROTO-0001 | 5 screens built (Direction B) — awaiting feedback/acceptance | 2026-09-13 |
