# AT-2.3 — `transactions.update` / `createReversal` / `getHistory`

- **Plan:** PLAN-0001 · **Phase:** P2 · **Commit:** `3a1d226`
- **TC results:** TC-0001 #16, #18, #19, #24 pass
  (`src/main/repositories/__tests__/transactionsLifecycle.test.ts`, 5 cases).

## What was done

- `updateTransaction(sqlite, id, input)` — edits date/amount/WHT/payer fields/note/income
  section/general category; never `kind`/`taxRelevant`/`taxYearId` (those define the row's
  shape, not editable via update). Rejects when the tax year is `closed` (INV-2b, TC-0001 #18)
  before touching the row. Re-validates the merged result through the same shape rules
  `createTransaction` uses, so an update can't produce an invalid combination either.
- `createReversal(sqlite, originalId, input)` — only allowed when the original's tax year is
  `closed` (TC-0001 #19); inserts a new row with `reversalOfId` set, copying the original's
  kind/taxRelevant/incomeSection/generalCategory/sourcePayer/payerTaxId and negating
  `amountMinor`. **Resolves PL-0009** (the open sign-convention question from REV-0001): a
  negative `amountMinor` is already valid under the existing `CHECK (amount_minor <> 0)`, no
  migration needed. `whtMinor` is fixed at 0 on a reversal since `wht_minor`'s CHECK requires
  `>= 0` — a WHT correction, if ever needed, is a fresh `create`, documented as a deliberate
  scope decision in the module header, not an oversight.
- `getTransactionHistory(sqlite, id)` — thin wrapper over `auditLog.listEntityHistory`, scoped
  to `entityType: 'transaction'`.
- 135 tests pass (130 prior + 5 new); lint + `tsc --noEmit` clean.

## Deviations from design

None from ANA-0001. `update`'s field list is an implementation-level judgement call (not
specified in the ANA beyond "rejected if closed") — landed on "everything except the fields that
define the row's shape," matching how the Entry screen (AT-2.6) is expected to work (amount/date/
details editable, income-vs-general toggle is not).

## Notes for follow-up tasks

- API for AT-2.5 (IPC wiring) / AT-2.6-2.7 (Entry screen): `updateTransaction(sqlite, id,
  {date?, amountMinor?, whtMinor?, sourcePayer?, payerTaxId?, note?, incomeSection?,
  generalCategory?})`; `createReversal(sqlite, originalId, {date, note?})`;
  `getTransactionHistory(sqlite, id)` returns `AuditEntry[]` (from `auditLog.ts`), already
  parsed (`before`/`after` are objects, not JSON strings).
- To correct a closed year's entry end-to-end: call `createReversal` (negates the original),
  then optionally `createTransaction` for the corrected value — `create` isn't blocked by a
  closed year per ANA-0001's repository API list, only `update` is.
- PL-0009 closed in `docs/PARKING-LOT.md`.
