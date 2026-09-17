# AT-1.5 — Seed loader, optional by design (ANA-0001 decision 14)

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `f7a3c2f`
- **TC results:** none linked to this row.

## What was done

- `db/seed.ts` — `seedDatabase(sqlite, dataSet)` inserts `shared_caps` → `deduction_categories`
  (resolving `sharedGroupName` to the FK) → `tax_brackets` from a `SeedDataSet`, in one
  `sqlite.transaction`. Skips (`{ skipped: true }`, zero inserts) if any of the three tables
  already has rows, so re-opening an already-seeded or user-populated DB never duplicates.
  Takes the raw better-sqlite3 connection, same convention as `client.ts`/`auditLog.ts`.
- `db/seedData/taxYear2025.ts` — exports `TAX_YEAR_2025_SEED`, the built-in set the app actually
  ships with today: `{ sharedCaps: [], deductionCategories: [], taxBrackets: [] }`. Empty by
  design — no `TAX-2025` reference figures exist yet (ANA-0001 decision 14). Dropping real
  figures in later means filling these three arrays; `seed.ts` does not change.
- 4 tests in `db/__tests__/seed.test.ts`: seeding today's empty built-in set leaves all three
  tables present with 0 rows and no error; a test-local fixture (not real tax figures — 3
  categories covering all 3 `cap_type` shapes, 1 shared cap, 2 brackets) seeds correctly and
  resolves the shared-group FK; a second seed call on an already-seeded DB skips; an unresolved
  `sharedGroupName` throws and rolls back the whole batch (DB `CHECK`s cover the rest of INV-6,
  so no separate pre-validation was added for those shapes). Suite: 102/102 passed; lint and
  `tsc --noEmit` clean.

## Deviations from design

- None beyond the redefinition PLAN-0001's re-plan log already records (empty built-in set, no
  `TAX-2025` data) — no new ANA decision needed.

## Notes for follow-up tasks

- AT-1.6 (Onboarding) calls `seedDatabase(handle.sqlite, TAX_YEAR_2025_SEED)` once, right after
  `migrateToLatest` on first run; today that's a no-op (0 rows), so Onboarding/Dashboard must
  render the empty-categories/empty-brackets state rather than assume seeded rows exist.
- AT-3.1's `deductions`/`settings` repositories are the only way rows land in these three tables
  until real `TAX-2025` figures are supplied — `is_builtin` will be `false` for every row until
  then, which is correct per ANA-0001's schema note (a zero-row or all-user-added table is not
  an error condition anywhere downstream).
