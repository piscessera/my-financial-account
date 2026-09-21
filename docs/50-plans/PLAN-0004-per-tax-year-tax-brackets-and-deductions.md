---
id: PLAN-0004
type: plan
title: Per-tax-year tax brackets and deduction configurations with baseline template
status: active
created: 2026-09-21
updated: 2026-09-21
links: [ANA-0004, TC-0004, REQ-0004]
---

# PLAN-0004: Per-tax-year tax brackets and deduction configurations with baseline template

## Stage A — Phases (strategic)

### P1: Database Schema Migration & Baseline Seed Data
- **Goal:** Support nullable `tax_year_id` on reference tables and pre-populate Thailand's 8 statutory progressive tax brackets into baseline seed data.
- **Deliverables:** Migration `002-year-scoped-config.ts`, `schema.ts` typed models, updated `seedData/taxYear2025.ts` with 8 progressive tax brackets (0%–35%).
- **Exit criteria:** TC-0004 #1 passes; migration and schema tests pass.
- **Depends on:** —

### P2: Tax Year Lifecycle Cloning & Isolated Calculation
- **Goal:** Automatically clone baseline configuration upon `createTaxYear` and ensure calculations strictly use that year's specific configuration.
- **Deliverables:** `taxYears.ts` cloning logic, `settings.ts` repository updates with closed-year guards, `computeYear.ts` year-scoped queries.
- **Exit criteria:** TC-0004 #2, #3, #4, #5, #7, #8 pass.
- **Depends on:** P1

### P3: IPC & Settings UI Dual-Mode
- **Goal:** Allow users to toggle between editing Baseline Defaults and editing specific Tax Year configurations in Settings.
- **Deliverables:** Typed IPC methods, `Settings.tsx` tab switcher and year selector.
- **Exit criteria:** TC-0004 #6 passes; complete UI build and test suite pass.
- **Depends on:** P2

## Dependencies & risks

- Low risk. Database migration preserves existing database data and adds nullable foreign keys.

## Hot files

- `src/main/db/schema.ts`
- `src/main/db/migrations/002-year-scoped-config.ts`
- `src/main/db/seedData/taxYear2025.ts`
- `src/main/repositories/taxYears.ts`
- `src/main/repositories/settings.ts`
- `src/main/calc/computeYear.ts`
- `src/main/ipc/index.ts`
- `src/renderer/pages/Settings.tsx`

## Stage B — Atomic tasks (tactical)

| Task | Phase | Description (incl. done-criterion) | Depends | Files touched | TC | Est | Done |
|------|-------|------------------------------------|---------|---------------|----|----|------|
| AT-1.1 | P1 | [core] Add migration `002-year-scoped-config.ts` and update `schema.ts` with nullable `tax_year_id` on `tax_brackets`, `deduction_categories`, `shared_caps` | — | `src/main/db/schema.ts`, `src/main/db/migrations/002-year-scoped-config.ts` | #1 | ~1h | ☑ |
| AT-1.2 | P1 | Populate standard Thai statutory 8-bracket progressive rates (0-35%) and standard deductions into baseline seed data | AT-1.1 | `src/main/db/seedData/taxYear2025.ts`, `src/main/db/seed.ts` | #1 | ~1h | ☑ |
| AT-2.1 | P2 | [core] Implement baseline template cloning in `taxYears.createTaxYear` including shared group remapping | AT-1.2 | `src/main/repositories/taxYears.ts` | #2, #8 | ~1.5h | ☑ |
| AT-2.2 | P2 | Update `settings.ts` repository to support `taxYearId` parameter and closed-year mutation protection | AT-2.1 | `src/main/repositories/settings.ts` | #3, #4, #7 | ~1.5h | ☑ |
| AT-2.3 | P2 | [core] Update `computeYear.ts` to query and calculate tax using the specific tax year's brackets and categories | AT-2.2 | `src/main/calc/computeYear.ts` | #5 | ~1h | ☑ |
| AT-3.1 | P3 | Update IPC handlers in `src/main/ipc/index.ts` and preload API types for year-scoped settings | AT-2.3 | `src/main/ipc/index.ts`, `src/preload.ts` | #6 | ~1h | ☑ |
| AT-3.2 | P3 | Update `Settings.tsx` to add dual-mode tab switcher (Baseline Defaults vs Year Settings) with year selector and closed-year lock state | AT-3.1 | `src/renderer/pages/Settings.tsx` | #6 | ~2h | ☑ |

## Re-plan log
| Date | Change | Reason |
|------|--------|--------|
