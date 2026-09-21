---
id: ANA-0004
type: analysis
title: Per-tax-year tax brackets and deduction configurations with baseline template — design
status: active
size: M
created: 2026-09-21
updated: 2026-09-21
links: [REQ-0004, TC-0004, PLAN-0004]
---

# ANA-0004: Per-tax-year tax brackets and deduction configurations with baseline template — design

## Context & current behavior

Currently, `tax_brackets`, `deduction_categories`, and `shared_caps` are global tables in SQLite without any `tax_year_id` foreign key. In `src/main/calc/computeYear.ts` and `src/main/repositories/settings.ts`, all queries read these tables globally. If a user edits a bracket or category cap, the edit applies to all tax years indiscriminately. Furthermore, seed data (`src/main/db/seedData/taxYear2025.ts`) starts empty, leaving newly created databases without the statutory Thai progressive tax brackets.

## Solution overview

### 1. Database Schema & Migration (`migrations/002-year-scoped-config.ts` & `schema.ts`)
- Add nullable `tax_year_id` integer column with foreign key referencing `tax_years(id)` (ON DELETE CASCADE) to:
  - `tax_brackets`
  - `deduction_categories`
  - `shared_caps`
- Semantic:
  - `tax_year_id IS NULL` represents the **System Baseline Template (ค่าเริ่มต้นระบบ)**.
  - `tax_year_id = <yearId>` represents the **Year-Scoped Configuration** for that tax year.
- Seed Baseline Data:
  - Populate baseline `tax_brackets` with Thailand's statutory 8-bracket progressive rates (0%, 5%, 10%, 15%, 20%, 25%, 30%, 35%).
  - Populate baseline standard deduction categories (e.g. personal allowance, insurance, etc.).

### 2. Tax Year Lifecycle & Cloning (`src/main/repositories/taxYears.ts`)
- When `createTaxYear(db, { year })` executes:
  1. Creates the `tax_years` row.
  2. Queries all baseline `shared_caps` (`tax_year_id IS NULL`) and inserts cloned copies for `newYear.id`, building a map of `baselineSharedGroupId -> newSharedGroupId`.
  3. Queries all baseline `deduction_categories` (`tax_year_id IS NULL`) and inserts cloned copies for `newYear.id` with `shared_group_id` remapped.
  4. Queries all baseline `tax_brackets` (`tax_year_id IS NULL`) and inserts cloned copies for `newYear.id`.

### 3. Settings & Repositories (`src/main/repositories/settings.ts`)
- Support optional `taxYearId?: number` in:
  - `getTaxBrackets(db, taxYearId?)`
  - `getDeductionCategories(db, taxYearId?)`
  - `getSharedCaps(db, taxYearId?)`
- Mutation methods (`updateBracket`, `updateCategory`, `updateSharedCap`):
  - If updating a year-scoped row and that tax year is `closed`, throws a typed `TaxYearClosedError` (preserving `INV-7`).
  - Records audit log entries capturing before and after values (`INV-4`).

### 4. Calculation Engine (`src/main/calc/computeYear.ts`)
- `computeYear(yearId)` retrieves the tax brackets and deduction categories matching `tax_year_id = yearId` (with graceful fallback to baseline if none exist), ensuring calculations are strictly isolated to that tax year's rules.

### 5. Settings UI (`src/renderer/pages/Settings.tsx`)
- Add a top tab switcher:
  - 🏢 **"ค่าเริ่มต้นระบบ (Baseline Defaults)"** (edits `tax_year_id IS NULL` templates)
  - 📅 **"การตั้งค่าปีภาษี (ปี {selectedYear})"** (edits the year-scoped rows for the active/selected tax year)
- When viewing a closed tax year, inputs are disabled / read-only with a lock notice.

## Invariants

| INV | Rule | Enforced by (code / DB constraint / test) |
|-----|------|--------------------------------------------|
| INV-1 | All bracket boundaries and deduction caps remain integer satang minor units. | Drizzle schema integer columns + `assertSatang` |
| INV-4 | Every update to baseline or year-scoped config is audit-logged with before/after snapshots. | `repositories/settings.ts` / audit log |
| INV-6 | Shared cap member categories cannot exceed their parent group cap amount. | `calc/deductions.ts` and `settings.ts` |
| INV-7 | Closed tax years reject updates to their year-scoped brackets and categories. | `repositories/settings.ts` and `taxYears.ts` |

## Data model changes

Migration `002-year-scoped-config.ts`:
- Alter `shared_caps` ADD COLUMN `tax_year_id INTEGER REFERENCES tax_years(id) ON DELETE CASCADE`.
- Alter `deduction_categories` ADD COLUMN `tax_year_id INTEGER REFERENCES tax_years(id) ON DELETE CASCADE`.
- Alter `tax_brackets` ADD COLUMN `tax_year_id INTEGER REFERENCES tax_years(id) ON DELETE CASCADE`.
- Ensure appropriate indexes on `tax_year_id` for fast lookups.

## API / backend changes

- IPC handlers:
  - `settings:getBrackets(taxYearId?: number)`
  - `settings:getCaps(taxYearId?: number)`
  - `settings:getSharedCaps(taxYearId?: number)`
  - `settings:updateBracket(id, input)`
  - `settings:updateCap(id, input)`
  - `settings:updateSharedCap(id, input)`

## UI changes

- `src/renderer/pages/Settings.tsx`: Add tab switcher for Baseline Defaults vs Year-Specific configuration, and year dropdown selector.

## Decisions

| # | Decision | Reason | Date |
|---|----------|--------|------|
| 1 | Single table with nullable `tax_year_id` for baseline vs year config | Avoids duplicate table schemas while providing clean SQL foreign key constraints | 2026-09-21 |
| 2 | Clone on `createTaxYear` | Guarantees complete data isolation between years and immutability for past years | 2026-09-21 |
