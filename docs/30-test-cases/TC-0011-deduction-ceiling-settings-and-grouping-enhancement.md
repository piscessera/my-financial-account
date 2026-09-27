---
id: TC-0011
type: test-cases
title: Deduction ceiling customization, description editing, and shared cap grouping management — test cases
status: implemented
created: 2026-09-27
updated: 2026-09-27
links: [ANA-0011, REQ-0011, PLAN-0008]
---

# TC-0011: Deduction ceiling customization, description editing, and shared cap grouping management — test cases

Rule: every AC (AC-1 to AC-9) **and every ANA invariant (INV-1, INV-4, INV-6, INV-7)** has ≥ 1 case; `Level = Unit` cases must be implementable in the project test runners — coding fills the `Result` and `Test ref` columns (dev-implement).

| # | Case | Given / When / Then | Level | Maps to | Result | Test ref |
|---|------|---------------------|-------|---------|--------|----------|
| 1 | Update category description, name, and cap amount | Given an existing deduction category When `updateCategory` is called with updated name, description, and cap amount Then the category reflects all updated fields in DB | Unit | AC-1 | pass | `src/main/repositories/__tests__/deductions.test.ts` |
| 2 | Update category cap type from fixed to shared_group_member | Given an existing fixed category When `updateCategory` changes `capType` to `shared_group_member` with a valid `sharedGroupId` and sub-cap Then the category becomes a group member with the sub-cap | Unit | AC-1, AC-6 | pass | `src/main/repositories/__tests__/deductions.test.ts` |
| 3 | Reject shared_group_member without sharedGroupId | Given an existing category When `updateCategory` sets `capType: 'shared_group_member'` with null/missing `sharedGroupId` Then `DeductionError` is thrown | Unit | AC-1 | pass | `src/main/repositories/__tests__/deductions.test.ts` |
| 4 | Create new shared cap group in baseline and specific tax year | Given an open tax year or baseline When `createSharedCap` is called with valid name and cap amount Then a new `shared_caps` record is created and retrievable | Unit | AC-2, AC-3 | pass | `src/main/repositories/__tests__/settings.test.ts` |
| 5 | Update shared cap group name and amount | Given an existing shared cap group When `updateSharedCap` is called with a new name and amount Then the shared cap group record is updated | Unit | AC-4 | pass | `src/main/repositories/__tests__/settings.test.ts` |
| 6 | Delete shared cap group without members | Given a shared cap group with 0 referencing categories When `deleteSharedCap` is called Then the record is deleted from DB | Unit | AC-5 | pass | `src/main/repositories/__tests__/settings.test.ts` |
| 7 | Block deleting shared cap group with active members | Given a shared cap group with 1 or more assigned categories When `deleteSharedCap` is called Then `SettingsError` is thrown and deletion is blocked | Unit | AC-5 | pass | `src/main/repositories/__tests__/settings.test.ts` |
| 8 | Shared group calculation: individual sub-caps and group cap enforcement | Given categories A (sub-cap 100k) and B (sub-cap 25k) in Group G (cap 100k), and entries A=100k, B=25k When `computeDeductions` runs Then effective A=100k, B=25k, but group capped contribution is 100k and grand total deduction is 100k | Unit | AC-6, INV-6 | pass | `src/main/calc/__tests__/deductions.test.ts` |
| 9 | Shared group calculation: partial usage below group cap | Given categories A (sub-cap 100k) and B (sub-cap 25k) in Group G (cap 100k), and entries A=40k, B=20k When `computeDeductions` runs Then group total is 60k (unconstrained since 60k < 100k) | Unit | AC-6, INV-6 | pass | `src/main/calc/__tests__/deductions.test.ts` |
| 10 | Audit logging for category updates and shared cap operations | Given category and shared cap mutations When operations execute Then corresponding `audit_log` records are written with before/after payloads | Unit | AC-7, INV-4 | pass | `src/main/repositories/__tests__/settings.test.ts`, `src/main/repositories/__tests__/deductions.test.ts` |
| 11 | Closed tax year rejects category and shared cap edits | Given a closed tax year (`closedAt != null`) When attempting to create/update/delete categories or shared groups Then `DeductionError` or `SettingsError` is thrown (INV-7) | Unit | AC-8, INV-7 | pass | `src/main/repositories/__tests__/settings.test.ts`, `src/main/repositories/__tests__/deductions.test.ts` |
| 12 | Money minor satang validation | Given a shared cap or category update When negative amount or non-integer satang is provided Then validation rejects the input | Unit | AC-9, INV-1 | pass | `src/main/repositories/__tests__/settings.test.ts`, `src/main/repositories/__tests__/deductions.test.ts` |
| 13 | Settings UI: Render shared caps table and category edit dialog | Given Settings page is loaded on Deductions tab When viewing shared caps and editing a category Then all fields (description, capType, group) render and save properly | UI/Unit | AC-1, AC-2 | pass | `src/renderer/pages/Settings.tsx` (Vite build + renderer tests) |

## Coverage summary

- ACs covered: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9 (9/9)
- Unit cases: 12 · Manual cases: 1
- Invariants covered: INV-1, INV-4, INV-6, INV-7 (4/4)
