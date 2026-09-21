---
id: TC-0004
type: test-cases
title: Per-tax-year tax brackets and deduction configurations with baseline template — test cases
status: active
created: 2026-09-21
updated: 2026-09-21
links: [ANA-0004, REQ-0004]
---

# TC-0004: Per-tax-year tax brackets and deduction configurations with baseline template — test cases

Rule: every AC and every ANA invariant (INV-n) has ≥ 1 case; `Level = Unit` cases must be implementable in the project test runners.

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | Baseline seed initializes 8 Thai progressive tax brackets | Given fresh database seed, When queried for baseline brackets (tax_year_id is null), Then 8 brackets from 0% to 35% are returned | Unit | AC-1, INV-1 | | |
| 2 | Creating new tax year clones baseline templates into year-scoped rows | Given baseline brackets and deduction categories, When createTaxYear(2569) is executed, Then year 2569 receives cloned brackets and categories with tax_year_id = 2569 | Unit | AC-2 | | |
| 3 | Modifying year-scoped bracket does not affect baseline or other years | Given years 2568 and 2569, When bracket rate for 2569 is updated, Then 2568 and baseline brackets remain unchanged | Unit | AC-3, INV-4 | | |
| 4 | Modifying baseline bracket updates template for future years only | Given baseline bracket updated, When a new year 2570 is created, Then 2570 receives the updated template while 2569 remains unchanged | Unit | AC-4 | | |
| 5 | computeYear uses target tax year's specific brackets | Given year 2569 with custom top bracket rate (e.g. 40%), When computeYear(2569) calculates tax, Then tax is computed using 2569's custom rates | Unit | AC-5 | | |
| 6 | Settings UI provides tab switcher for Baseline vs Year Settings | Given Settings page, When user toggles between Baseline and Tax Year tabs, Then corresponding configuration rows are loaded and displayed | Unit | AC-6 | | |
| 7 | Modifying closed tax year's brackets or categories is rejected | Given a closed tax year, When user attempts to update a bracket or category cap for that year, Then update is rejected with an error | Unit | AC-7, INV-7 | | |
| 8 | Deduction shared group remapping on year cloning | Given baseline shared cap group with member categories, When new tax year is created, Then member categories in the new year reference the new year's cloned shared group ID | Unit | AC-2, INV-6 | | |

## Coverage summary
- ACs covered: 8 / 8
- Unit cases: 8 · Manual cases: 0
- Invariants covered: 4 / 4 (INV-1, INV-4, INV-6, INV-7)
