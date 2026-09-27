# AT-1.1 — Shared Cap Groups CRUD in Settings Repository

- **Plan:** PLAN-0008 · **Phase:** P1 · **Commit:** `pending`
- **TC results:** #4 pass (`settings.test.ts::createSharedCap`), #5 pass (`settings.test.ts::updateSharedCap`), #6 pass (`settings.test.ts::deleteSharedCap`), #7 pass (`settings.test.ts::deleteSharedCap blocks deleting a group when categories reference it`), #10 pass (`settings.test.ts::audit-log`), #11 pass (`settings.test.ts::closed tax year rejects shared cap mutations`), #12 pass (`settings.test.ts::rejects a negative cap`)

## What was done
- Implemented `createSharedCap`, `updateSharedCap` (supporting name and amount), and `deleteSharedCap` in `src/main/repositories/settings.ts`.
- Added referential integrity check before deleting shared cap group to prevent deleting groups that have referencing categories.
- Added closed tax year mutation checks (INV-7) and audit logging (INV-4).
- Added comprehensive unit tests in `src/main/repositories/__tests__/settings.test.ts`.

## Deviations from design
(none)

## Notes for follow-up tasks
- `AT-1.2` can now safely link categories to shared caps and update category records.
