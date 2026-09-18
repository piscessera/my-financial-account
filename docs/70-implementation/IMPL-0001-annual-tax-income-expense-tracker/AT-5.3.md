# AT-5.3 — `parseForPreview`

- **Plan:** PLAN-0001 · **Phase:** P5 · **Commit:** `5520b40`
- **TC results:** TC-0001 #45, #46 pass (`src/main/repositories/__tests__/csvImport.test.ts`,
  7 cases).

## What was done

- `parseForPreview(sqlite, filePath, targetYear)` — reads the CSV, validates the header matches
  `LEDGER_CSV_COLUMNS` exactly, then validates every row independently: date format, `kind`,
  `tax_relevant`, the income-section/general-category shape rules (mirroring
  `transactions.ts`'s `assertCreateInput`), and money fields via `tryParseBahtToSatang`. No
  database write happens anywhere in this function (TC-0001 #45) — it doesn't even create
  `targetYear` if it doesn't exist yet, only reports what *would* happen (`will_create` /
  `open` / `closed`).
- **Closed-year rule (TC-0001 #46, INV-2b):** if `targetYear` already exists and is `closed`,
  every row is forced invalid with an explicit reason, regardless of how well-formed it
  otherwise is — checked once, not per-row (see Deviations).
- A minimal RFC-4180 line splitter (`splitCsvLine`) matching `exportLedger`'s own quoting
  (`""`-escaped quoted fields).
- 219 tests pass (212 prior + 7 new); lint + `tsc --noEmit` clean.

## Deviations from design

ANA-0001's import description reads "tax_year either matches an existing open year or will
create a new one" as if it were a **per-row** field, but `exportLedger`'s column set
(`LEDGER_CSV_COLUMNS`, AT-5.1) has no `tax_year` column — the export is already scoped to one
year per file (`exportLedger(sqlite, yearId, destPath)`), so every row in a genuine export
already belongs to the same year. `parseForPreview` therefore takes `targetYear` as a parameter
(the file's destination year, chosen by the user/UI) and checks it once for the whole file
rather than reading a non-existent per-row column. This is equivalent for any file that actually
came from `exportLedger`, and simpler; retrofitting a `tax_year` column into AT-5.1's already-
shipped format would have been a larger, unnecessary change. Documented in `csv.ts`'s doc
comment for AT-5.4/5.5 to build on consistently.

## Notes for follow-up tasks

- API for AT-5.4 (`commitImport`): each valid `ParsedLedgerRow.data` has `taxYearId: -1` as a
  placeholder — `commitImport` must overwrite it with the real (possibly newly created) tax
  year's id before calling `transactions.createTransaction`. Only rows the user has confirmed
  (a subset of `valid` rows) should ever reach `commitImport`.
- API for AT-5.6 (Import/Export screen): render `ParseForPreviewResult.rows[].errors` per row,
  and surface `targetYearStatus` so the UI can show "will create year 2569" vs. "importing into
  existing open year 2569" vs. a hard block for `closed`.
