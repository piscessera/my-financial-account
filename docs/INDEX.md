# Document Index

Single registry of every working document. **Only the orchestrator writes this file**
(single-writer rule) and **only the orchestrator allocates IDs** from the counters below —
sub-agents receive their IDs in the dispatch payload.

| ID | Title | Type | Status | Size | Links | Updated |
|----|-------|------|--------|------|-------|---------|
| REQ-0001 | Annual tax income/expense tracker | requirement | active | L | ANA-0001, TC-0001, PLAN-0001 | 2026-09-17 |
| ANA-0001 | Annual tax income/expense tracker — design | analysis | active | L | REQ-0001, TC-0001, PLAN-0001 | 2026-09-17 |
| TC-0001 | Annual tax income/expense tracker — test cases | test-cases | active | — | ANA-0001, PROTO-0001, PLAN-0001 | 2026-09-17 |
| PROTO-0001 | Annual tax income/expense tracker — prototype | prototype | active | — | ANA-0001, REQ-0001, TC-0001 | 2026-09-13 |
| PLAN-0001 | Annual tax income/expense tracker | plan | implemented | L | ANA-0001, TC-0001, PROTO-0001 | 2026-09-18 |
| IMPL-0001 | Annual tax income/expense tracker | implementation | implemented | — | PLAN-0001 | 2026-09-18 |
| REV-0001 | PLAN-0001 Phase P1 — Foundation | review | implemented | — | PLAN-0001, ANA-0001, TC-0001 | 2026-09-17 |
| REV-0002 | PLAN-0001 close — Phases P2-P5 and overall acceptance | review | implemented | — | PLAN-0001, ANA-0001, TC-0001, REQ-0001 | 2026-09-18 |
| REQ-0002 | Change data folder path after setup | requirement | active | M | ANA-0002, TC-0002, PLAN-0002 | 2026-09-18 |
| ANA-0002 | Change data folder path after setup — design | analysis | active | M | REQ-0002, TC-0002, PLAN-0002 | 2026-09-18 |
| TC-0002 | Change data folder path after setup — test cases | test-cases | active | — | ANA-0002, PLAN-0002 | 2026-09-18 |
| PLAN-0002 | Change data folder path after setup | plan | implemented | M | ANA-0002, TC-0002, REQ-0002, REV-0003 | 2026-09-19 |
| IMPL-0002 | Change data folder path after setup | implementation | implemented | — | PLAN-0002 | 2026-09-19 |
| REV-0003 | PLAN-0002 close — change data folder acceptance review | review | implemented | — | PLAN-0002, ANA-0002, TC-0002, REQ-0002 | 2026-09-19 |

## ID counters (next value to use)

| REQ | ANA | TC | PROTO | PLAN | GAP | REV | IMPL |
|-----|-----|----|-------|------|-----|-----|------|
| 3 | 3 | 3 | 2 | 3 | 1 | 4 | 3 |

## Status vocabulary

`draft → active → implemented → archived` · superseded: `draft → superseded → archived` ·
investigations/ideas may be `parked` (visible in dev-status, never silently dropped).

## Open gates (things waiting on the user)

| ID | Gate | Since |
|----|------|-------|
| — | *(none)* | |
