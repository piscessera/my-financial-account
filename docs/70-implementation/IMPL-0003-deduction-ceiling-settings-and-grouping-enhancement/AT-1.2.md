# AT-1.2 — Deduction Category Update & Grouping in Repositories

- **Plan:** PLAN-0008 · **Phase:** P1 · **Commit:** `pending`
- **TC results:** #1 pass (`deductions.test.ts::renames a category and updates description`), #2 pass (`deductions.test.ts::converts a fixed category to shared_group_member`), #3 pass (`deductions.test.ts::rejects shared_group_member with missing or nonexistent sharedGroupId`), #8 pass (`calc/deductions.test.ts::TC #8`), #9 pass (`calc/deductions.test.ts::TC #9`), #10 pass (`deductions.test.ts::audit-log`), #11 pass (`deductions.test.ts::closed tax year rejects category updates`), #12 pass (`deductions.test.ts::validation`)

## What was done
- Expanded `UpdateCategoryInput` and `updateCategory` in `src/main/repositories/deductions.ts` to support editing `description`, `capType`, `sharedGroupId`, and `capAmountMinor` (sub-cap).
- Added integrity validations ensuring valid `sharedGroupId` when `capType === 'shared_group_member'` and clearing `sharedGroupId` when `capType !== 'shared_group_member'`.
- Verified calculation rules in `src/main/calc/__tests__/deductions.test.ts` for insurance grouping sub-caps and group caps.
- Added tests in `src/main/repositories/__tests__/deductions.test.ts`.

## Deviations from design
(none)

## Notes for follow-up tasks
- Phase P1 exit criteria achieved. Next is Phase P2 (IPC API and preload exposure).
