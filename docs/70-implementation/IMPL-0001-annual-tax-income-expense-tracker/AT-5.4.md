# AT-5.4 — `commitImport`

- **Plan:** PLAN-0001 · **Phase:** P5 · **Commit:** `bbc82ec`
- **TC results:** TC-0001 #47 pass (`src/main/repositories/__tests__/csvCommitImport.test.ts`,
  4 cases).

## What was done

- `commitImport(sqlite, {targetYear, confirmedRows, skippedCount, sourceFilename})` — resolves
  `targetYear` to an existing tax year or creates it, then creates **only**
  `confirmedRows` (the caller — the Import/Export screen, AT-5.6 — is responsible for filtering
  `parseForPreview`'s valid rows down to what the user actually left checked) through
  `transactions.createTransaction` with `source: 'import'`. No separate write path, so every
  invariant `createTransaction` already enforces (INV-1 money, INV-2 audit-on-write, INV-6 the
  shape rules) applies to an imported row exactly like a manual one.
- Adds **one** extra `audit_log` row (`entityType: 'tax_year'`, `action: 'import'`) summarizing
  the batch — source filename, imported count, skipped count (AC-24) — on top of each row's own
  individual `create` audit entry.
- 223 tests pass (219 prior + 4 new); lint + `tsc --noEmit` clean.

## Deviations from design

None. `CreateTransactionInput.taxYearId` on each confirmed row is a `-1` placeholder from
`parseForPreview` (AT-5.3) — `commitImport` always overwrites it with the resolved year's real
id, never trusts the placeholder.

## Notes for follow-up tasks

- API for AT-5.5 (IPC wiring) / AT-5.6 (Import/Export screen): the screen calls
  `parseForPreview` first, lets the user uncheck rows, then calls `commitImport` with
  `confirmedRows: checkedValidRows.map(r => r.data)` and `skippedCount: totalRows -
  confirmedRows.length`.
