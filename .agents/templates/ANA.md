---
id: ANA-{{NNNN}}
type: analysis
title: {{title}}
status: draft
size: M
created: {{DATE}}
updated: {{DATE}}
links: [REQ-{{NNNN}}]
---

# ANA-{{NNNN}}: {{title}}

## Context & current behavior
(What exists today — cite the files/code read.)

## Solution overview
(Stack per CLAUDE.md §Project. The shape of the change. Use one heading per design area — sections are excerpted into dispatch payloads.)

## Invariants
(Rules that must never break — each gets ≥1 TC case and is checked first in review.)
| INV | Rule | Enforced by (code / DB constraint / test) |
|-----|------|--------------------------------------------|
| INV-1 | Amounts are integer minor units (or decimal), never float; rounding rule: … | |
| INV-2 | Posted transactions are immutable; corrections are reversal entries | |
| INV-3 | Every balance equals the sum of its entries (reconciliation test) | |
| INV-4 | Every mutation is audit-logged (who / when / before → after) | |

## Data model changes
(Migrations, new fields, indexes.)

## API / backend changes
(Endpoints, jobs, events, policies.)

## UI changes
(Pages, components, states.)

## UX decisions (from prototype, filled by dev-prototype)
(Appended on PROTO acceptance — do not remove this heading.)

## Dependencies & risks
(External dependencies and host constraints, each with an owner plan.)

## Decisions
| # | Decision | Reason | Date |
|---|----------|--------|------|

## Task list (size S only)
(For size-S work the atomic task list lives here instead of a separate PLAN.)
