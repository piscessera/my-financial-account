# AT-2.2 — `transactions` repository (`create`/`void`)

- **Plan:** PLAN-0001 · **Phase:** P2 · **Commit:** `0443755`
- **TC results:** TC-0001 #1, #1a, #2, #17, #34 pass
  (`src/main/repositories/__tests__/transactions.test.ts`, 10 cases). #1's attachment part is
  AT-2.4's scope, not re-tested here.

## What was done

- `src/main/repositories/transactions.ts` — `createTransaction`, `voidTransaction`,
  `getTransaction`. Validation mirrors the three `transactions_*` CHECK constraints
  (`001-initial-schema.ts`) in code, so a bad call gets a `TransactionError`, not an opaque
  SQLite failure: `generalCategory` required iff `taxRelevant === false`, `incomeSection`
  required iff tax-relevant income, and each forbidden on the other shape. Also validates the
  date format, non-zero integer amount, and non-negative integer WHT.
- `voidTransaction` sets `status='voided'` only — no hard-delete path exists anywhere in this
  repository (TC-0001 #17); rejects voiding an already-voided row.
- Per ANA-0001 §Repository API (`create(input)`, `void(id)` — no "rejected if closed" note,
  unlike `update`), neither function checks tax-year status; that check is `update`'s job in
  AT-2.3 (INV-2b).
- Both mutations audit-log via `recordMutation` (`create`/`void`) inside the same
  `sqlite.transaction()` as the row write, same composition as `taxYears.ts`.
- 130 tests pass (120 prior + 10 new); lint + `tsc --noEmit` clean.

## Deviations from design

None.

## Notes for follow-up tasks

- API for AT-2.3 (`update`/`createReversal`/`getHistory`) and AT-2.4 (`attachments`): import
  `createTransaction`/`voidTransaction`/`getTransaction` from `./transactions`; the raw
  `TransactionRow` shape (camelCase, matches `schema.ts`'s `$inferSelect`) is what all of them
  should read/return for consistency.
- `assertCreateInput`'s validation logic is create-specific (it doesn't know about `status`/
  `reversalOfId`); AT-2.3's `update` will need its own validation pass rather than reusing this
  one directly, since an update may only touch a subset of fields.
