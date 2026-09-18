# AT-4.3 — `tax_years.close()`/`reopen()`

- **Plan:** PLAN-0001 · **Phase:** P4 · **Commit:** `c55ea44`
- **TC results:** TC-0001 #20, #32 pass (`src/main/repositories/__tests__/taxYearsLifecycle.test.ts`,
  5 cases).

## What was done

- `close(sqlite, id, input: CloseTaxYearInput)` — computes `calc.computeYear()` (AT-4.2) and
  freezes the result as `frozen_result_json`, sets `status='closed'`/`closed_at`. Rejects an
  already-closed year. Audit-logs as `close` (INV-4).
- `reopen(sqlite, id)` — clears `closed_at`, flips `status` back to `open`, **keeps**
  `frozen_result_json` as-is (ANA-0001 §Tax-year lifecycle: "keeps frozen_result_json until the
  year is closed again"). Rejects an already-open year. Audit-logs as `reopen`.
- `CloseTaxYearInput` (transactions/deductionCategories/deductionEntries/sharedCaps/brackets)
  is gathered by the **caller**, not by this repository — see Deviations.
- 203 tests pass (198 prior + 5 new); lint + `tsc --noEmit` clean.

## Deviations from design

- **`close()` doesn't gather its own inputs from the DB.** The obvious design would have
  `taxYears.ts` import `transactions.listByYear`/`deductions.listCategories`/
  `deductions.listEntries`/`settings.getSharedCaps`/`settings.getBrackets` itself. That would
  create a circular module dependency: `transactions.ts` already imports `getTaxYear` from
  `taxYears.ts` (for its own closed-year checks, AT-2.3), so `taxYears.ts` importing back from
  `transactions.ts` would be circular. Verified this isn't just theoretical caution — pushing
  the data-gathering up to the caller and keeping `taxYears.ts`'s only new import as
  `calc/computeYear.ts` (which itself imports no repository) is the same layering pattern the
  IPC layer (`ipc/index.ts`) already uses for `attachments:add`'s mime-type inference: assemble
  cross-cutting inputs at the orchestration layer, keep each repository focused on its own
  table(s). AT-4.5 (IPC wiring) is where `CloseTaxYearInput` actually gets assembled from the
  other repositories.

## Notes for follow-up tasks

- API for AT-4.4 (closed-year read path): `getTaxYear(sqlite, id).frozenResultJson` is already
  the frozen snapshot (a JSON string of `ComputeYearResult`) — AT-4.4's job is making the read
  path serve `JSON.parse(frozenResultJson)` instead of calling `computeYear()` live when
  `status === 'closed'`.
- API for AT-4.5 (IPC wiring): the `taxYears:close` handler must call `transactions.listByYear`,
  `deductions.listCategories`, `deductions.listEntries`, `settings.getSharedCaps`,
  `settings.getBrackets` (all already exist) to build `CloseTaxYearInput` before calling
  `taxYears.close(sqlite, id, input)`.
