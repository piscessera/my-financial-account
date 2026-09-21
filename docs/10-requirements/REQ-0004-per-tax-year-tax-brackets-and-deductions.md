---
id: REQ-0004
type: requirement
title: Per-tax-year tax brackets and deduction configurations with baseline template
status: active
size: M
created: 2026-09-21
updated: 2026-09-21
links: [ANA-0004, TC-0004, PLAN-0004]
---

# REQ-0004: Per-tax-year tax brackets and deduction configurations with baseline template

## Problem

Currently, tax brackets (`tax_brackets`) and deduction rules (`deduction_categories`, `shared_caps`) are stored in global tables shared across all tax years. If a user adjusts tax bracket rates or deduction caps, the changes apply globally across the entire database. This prevents users from adapting to tax law amendments in a specific tax year or simulating year-specific adjustments without inadvertently altering calculations for past or future tax years.

Additionally, newly created databases start with empty reference tables rather than pre-populated standard Thai statutory tax brackets (8 brackets from 0% up to 35%) and baseline deduction categories.

## Users & triggers

Single account owner, triggered when:
1. Setting up or maintaining the master system baseline configurations (brackets and deductions).
2. Creating a new tax year (which should inherit a snapshot of the baseline template).
3. Customizing or overriding tax brackets and deduction rules for a specific tax year.

## In scope

- **Baseline Templates (System Defaults)**:
  - Pre-seeded baseline templates for:
    - Standard Thai 8-bracket progressive personal income tax rates (0%, 5%, 10%, 15%, 20%, 25%, 30%, 35%).
    - Standard statutory deduction categories and shared caps.
  - Ability to view and edit baseline templates in Settings so that future tax years inherit updated templates.
- **Year-Scoped Cloned Configuration**:
  - When creating a new tax year (`taxYears.create`), automatically clone/snapshot the baseline brackets, deduction categories, and shared caps into records bound to that `tax_year_id`.
  - Allow editing year-specific brackets and deduction caps for an open tax year without mutating baseline templates or other tax years.
- **Calculation Engine Alignment**:
  - `computeYear`, `computeTax`, and deduction calculation functions query and use the specific brackets and categories belonging to the target `tax_year_id`.
- **Settings UI Enhancement**:
  - Provide a toggle / tab interface in Settings to switch between:
    1. **System Baseline Defaults (ค่าเริ่มต้นระบบ)** — edits template used for new years.
    2. **Tax Year Settings (การตั้งค่าปีภาษี: YYYY)** — edits the active configuration for the selected/working tax year.
- **Immutability & Invariants**:
  - When a tax year is closed (`status = 'closed'`), its year-specific brackets and deduction rules lock against modifications.
  - Every mutation is audit-logged with before/after values.

## Out of scope

- Multi-tenant / multi-user configuration.
- Complex tax formula engines beyond progressive step brackets and capped deduction categories.

## Acceptance criteria

- AC-1: Database is initialized / seeded with the standard Thai statutory progressive tax brackets (8 brackets: 0% to 35%) in the baseline templates.
- AC-2: Creating a new tax year automatically snapshots all baseline tax brackets, deduction categories, and shared caps into year-scoped records for that year.
- AC-3: Modifying tax brackets or deduction caps for an open tax year updates only that tax year and does not alter the baseline template or other tax years.
- AC-4: Modifying the baseline template updates the defaults for subsequent tax years created thereafter, without retroactively modifying existing tax years.
- AC-5: `computeYear` calculates tax using the target tax year's specific tax brackets and deduction categories.
- AC-6: Settings UI provides seamless switching between editing "System Baseline Defaults" and editing "Tax Year Settings" for the current/selected tax year.
- AC-7: Closed tax years reject edits to their year-scoped brackets and deduction categories.
- AC-8: All automated unit tests, lifecycle tests, and regression tests pass cleanly.

## Constraints & assumptions

- Domain invariants from `AGENTS.md` apply (money as integer satang `minor`, audit logging on mutations, closed year immutability).
- Database migration to migrate existing global reference tables to support both baseline templates and year-scoped configurations.

## Size proposal

**M** — Cross-cutting enhancement touching DB schema migrations, seed loaders, tax calculation engine, IPC endpoints, and Settings UI with multiple states and lifecycle constraints. Sized as **M** (full pipeline with analyze, test cases, implementation, and review).

## Decision log

| Date | Decision | By |
|------|----------|----|
| 2026-09-21 | Selected Solution 1: Year-Scoped Cloned Config (snapshot from Baseline upon tax year creation); covers both tax brackets and deduction categories; dual-mode Settings UI; sized M | user (in intake interview) |
| 2026-09-21 | Scope & size gate approved (size M confirmed) | user |
