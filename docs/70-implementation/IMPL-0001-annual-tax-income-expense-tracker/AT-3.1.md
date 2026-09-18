# AT-3.1 — deductions/settings repositories

- **Plan:** PLAN-0001 · **Phase:** P3 · **Commit:** `a729cd5`
- **TC results:** TC-0001 #37, #38, #39, #40 pass
  (`src/main/repositories/__tests__/deductions.test.ts`, 11 cases;
  `src/main/repositories/__tests__/settings.test.ts`, 8 cases).

## What was done

- `deductions.ts` — `createCategory`/`listCategories`/`getCategory`/`setCategoryActive`/
  `updateCategory` for `deduction_categories` (all three `cap_type` shapes: `fixed`,
  `per_count`, `shared_group_member`), plus `setEntry`/`listEntries` for `deduction_entries`
  (`setEntry` upserts on the schema's `(tax_year_id, category_id)` unique index — one entry per
  category per year, replaced not appended). Validation mirrors the CHECK constraints:
  `sharedGroupId` required iff `shared_group_member`, `capAmountMinor` required otherwise.
- `settings.ts` — `getSharedCaps`/`updateSharedCap` and `getBrackets`/`updateBracket`. Neither
  table gets a `create` here, matching ANA-0001 §API/backend changes' `settings` surface
  literally: both are small statutory reference tables edited in place, not added to, through
  this UI. `updateBracket` re-validates `upperBoundMinor > lowerBoundMinor` in code (mirrors
  `tax_brackets_upper_above_lower`).
- Both files follow the established repository pattern (raw connection, cached prepared
  statements, caller-owned transaction + `recordMutation`); `setCategoryActive`/`updateCategory`/
  `updateSharedCap`/`updateBracket` audit-log as `update`, `createCategory`/first-time `setEntry`
  as `create`.
- 164 tests pass (145 prior + 19 new); lint + `tsc --noEmit` clean.

## Deviations from design

None. `updateCategory`'s field list (`name`, `capAmountMinor`) is an implementation-level call —
`capType`/`sharedGroupId` never change through it (that would be a different category, not an
edit), consistent with `transactions.updateTransaction`'s same principle (AT-2.3) of never
letting `update` change a row's shape.

## Notes for follow-up tasks

- API for AT-3.2 (cap-shape calculator): `listCategories(sqlite)` + `listEntries(sqlite,
  taxYearId)` + `getSharedCaps(sqlite)` are the raw inputs; the calculator is a pure function
  over these three lists, not a repository method.
- API for AT-3.4 (IPC wiring) / AT-3.5-3.6 (Deductions/Settings screens): both files' functions
  take the raw connection (`handle.sqlite`), same as every other repository.
- `deduction_entries.count` (for `per_count`) is stored but not validated against the
  category's `cap_type` here — AT-3.2's calculator is where "only `per_count` categories use
  `count`" actually matters for a number, not a write-time rule.
