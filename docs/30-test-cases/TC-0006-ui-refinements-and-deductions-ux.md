---
id: TC-0006
type: test-cases
title: UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX — test cases
status: implemented
size: S
created: 2026-09-23
updated: 2026-09-23
links: [ANA-0006, REQ-0006]
---

# TC-0006: UI refinements for Thai month abbreviations, table alignments, Settings sub-navigation, and Deductions UX — test cases

Rule: every AC and every ANA invariant (INV-n) has ≥ 1 case; `Level = Unit` cases must be implementable in the project test runners.

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | Thai month short abbreviations in ledger | Given transactions in March, When LedgerTable renders, Then date displays official Thai short abbreviation `มี.ค.` | Unit | AC-1 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 2 | Table column alignments (`.num`, `.center`, `.right`) | Given data tables rendered across views, When inspected, Then numbers align right (`.num`), status centered (`.center`), text left | Unit | AC-2 | PASS | `src/renderer/components/__tests__/LedgerTable.test.tsx` |
| 3 | Settings sub-navigation chip tabs | Given Settings screen, When user switches between tabs, Then Tax Brackets, Deduction Caps, and Storage panels display appropriately | Unit | AC-3 | PASS | `src/renderer/pages/Settings.tsx` |
| 4 | Deductions semantic grouping and high-contrast styling | Given deduction categories, When Deductions page renders, Then items are organized in 5 semantic white card panels with divider lines | Unit | AC-4, INV-6 | PASS | `src/renderer/pages/Deductions.tsx` |
| 5 | Real-time live computation and cap excess warnings | Given entered deduction amount exceeds statutory limit, When typed, Then row highlights over-cap warning and computes effective total | Unit | AC-5, INV-1, INV-6 | PASS | `src/renderer/pages/Deductions.tsx` |
| 6 | Closed year read-only preservation | Given closed tax year, When Deductions or Settings viewed, Then inputs and edit actions are locked | Unit | INV-7 | PASS | `src/renderer/pages/Deductions.tsx` |
| 7 | Full test suite regression check | Given complete codebase, When Vitest runs, Then all 29 test suites pass | Unit | AC-6 | PASS | `npx vitest run` |

## Coverage summary
- ACs covered: 6 / 6
- Unit cases: 7 · Manual cases: 0
- Invariants covered: 3 / 3 (INV-1, INV-6, INV-7)
