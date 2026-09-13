---
id: TC-{{NNNN}}
type: test-cases
title: {{title}}
status: draft
created: {{DATE}}
updated: {{DATE}}
links: [ANA-{{NNNN}}]
---

# TC-{{NNNN}}: {{title}}

Rule: every AC (or GAP fix) **and every ANA invariant (INV-n)** has ≥ 1 case; `Level = Unit` cases must be implementable in
the project test runners — coding fills the `Result` and `Test ref` columns (dev-implement).

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | {{happy path}} | Given … When … Then … | Unit | AC-1 | | |
| 2 | {{edge case}} | Given … When … Then … | Unit | AC-1 | | |
| 3 | {{failure path}} | Given … When … Then … | Unit | AC-2 | | |
| 4 | {{permission/boundary}} | Given … When … Then … | Manual | AC-3 | | |
| 5 | {{invariant: balance = Σ entries}} | Given … When … Then … | Unit | INV-3 | | |

## Coverage summary
- ACs covered: … / total
- Unit cases: n · Manual cases: m
- Invariants covered: … / total
