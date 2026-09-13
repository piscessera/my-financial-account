---
id: REV-{{NNNN}}
type: review
title: {{title}}
status: active
mode: review
created: {{DATE}}
updated: {{DATE}}
links: []
---

# REV-{{NNNN}}: {{title}}

> Mode: review (acceptance) / audit (standards sweep) / verify (design-vs-code). Read-only;
> findings must cite evidence (file:line, test output, doc link).

## Scope
What was reviewed (docs, commits, phase).

## Checklist
| # | Item | Pass/Fail | Evidence / note |
|---|------|-----------|-----------------|
| 1 | … | ✅/❌ | … |

## Findings
| # | Type (defect/note/idea) | Finding | Evidence | Suggested action | PARKING-LOT row (notes/ideas) |
|---|-------------------------|---------|----------|------------------|-------------------------------|

## Verdict
`PASS` / `PASS with notes` / `FAIL` — with required rework if FAIL
(rework tasks → PLAN; every note/idea → a proposed `docs/PARKING-LOT.md` row with owner).

## Code-quality checklist (review mode)
| Item | Pass/Fail/n.a. | Evidence |
|------|----------------|----------|
| authorization + negative test | | |
| input validation / allow-list / uploads | | |
| migrations reversible · exact money types · indexes | | |
| no N+1 on list views | | |
| failure paths surfaced · no secrets | | |
| UTF-8 round-trip | | |
