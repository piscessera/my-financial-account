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

| REQ-0003 | Add remark field and net amount column to income and expense | requirement | implemented | S | ANA-0003, TC-0003 | 2026-09-21 |
| ANA-0003 | Add remark field and net amount column to income and expense — design | analysis | implemented | S | REQ-0003, TC-0003 | 2026-09-21 |
| TC-0003 | Add remark field and net amount column to income and expense — test cases | test-cases | implemented | — | ANA-0003, REQ-0003 | 2026-09-21 |
| REQ-0004 | Per-tax-year tax brackets and deduction configurations with baseline template | requirement | implemented | M | ANA-0004, TC-0004, PLAN-0004 | 2026-09-21 |
| ANA-0004 | Per-tax-year tax brackets and deduction configurations with baseline template — design | analysis | implemented | M | REQ-0004, TC-0004, PLAN-0004 | 2026-09-21 |
| TC-0004 | Per-tax-year tax brackets and deduction configurations with baseline template — test cases | test-cases | implemented | — | ANA-0004, PLAN-0004, REQ-0004 | 2026-09-21 |
| PLAN-0004 | Per-tax-year tax brackets and deduction configurations with baseline template | plan | implemented | M | ANA-0004, TC-0004, REQ-0004 | 2026-09-21 |
| REQ-0005 | Monthly recurring checklist for general transactions | requirement | implemented | M | ANA-0005, TC-0005, PLAN-0005 | 2026-09-21 |
| ANA-0005 | Monthly recurring checklist for general transactions — design | analysis | implemented | M | REQ-0005, TC-0005, PLAN-0005 | 2026-09-21 |
| TC-0005 | Monthly recurring checklist for general transactions — test cases | test-cases | implemented | — | ANA-0005, PLAN-0005, REQ-0005 | 2026-09-21 |
| PLAN-0005 | Monthly recurring checklist for general transactions | plan | implemented | M | ANA-0005, TC-0005, REQ-0005 | 2026-09-21 |

| REQ-0006 | UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX | requirement | implemented | S | ANA-0006, TC-0006 | 2026-09-23 |
| ANA-0006 | UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX — design | analysis | implemented | S | REQ-0006, TC-0006 | 2026-09-23 |
| TC-0006 | UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX — test cases | test-cases | implemented | — | ANA-0006, REQ-0006 | 2026-09-23 |
| REQ-0007 | Tax bracket range customization and expense-to-deduction linkage | requirement | implemented | M | ANA-0007, TC-0007, PLAN-0007 | 2026-09-23 |
| ANA-0007 | Tax bracket range customization and expense-to-deduction linkage — design | analysis | implemented | M | REQ-0007, TC-0007, PLAN-0007 | 2026-09-23 |
| TC-0007 | Tax bracket range customization and expense-to-deduction linkage — test cases | test-cases | implemented | — | ANA-0007, REQ-0007, PLAN-0007 | 2026-09-23 |
| PLAN-0007 | Tax bracket range customization and expense-to-deduction linkage | plan | implemented | M | ANA-0007, TC-0007, REQ-0007 | 2026-09-23 |
| REQ-0008 | Custom tax deductible amount per transaction | requirement | implemented | S | ANA-0008, TC-0008 | 2026-09-23 |
| ANA-0008 | Custom tax deductible amount per transaction — design | analysis | implemented | S | REQ-0008, TC-0008 | 2026-09-23 |
| TC-0008 | Custom tax deductible amount per transaction — test cases | test-cases | implemented | — | ANA-0008, REQ-0008 | 2026-09-23 |

## ID counters (next value to use)

| REQ | ANA | TC | PROTO | PLAN | GAP | REV | IMPL |
|-----|-----|----|-------|------|-----|-----|------|
| 9 | 9 | 9 | 2 | 8 | 1 | 4 | 3 |

## Status vocabulary

`draft → active → implemented → archived` · superseded: `draft → superseded → archived` ·
investigations/ideas may be `parked` (visible in dev-status, never silently dropped).

## Open gates (things waiting on the user)

| ID | Gate | Since |
|----|------|-------|
| — | — | — |
