# AT-5.1 — `exportLedger`

- **Plan:** PLAN-0001 · **Phase:** P5 · **Commit:** `ef7ba19`
- **TC results:** TC-0001 #43 pass (`src/main/repositories/__tests__/csv.test.ts`, 3 cases).

## What was done

- `src/main/repositories/csv.ts` — `exportLedger(sqlite, yearId, destPath)`: one CSV row per
  `transactions.listByYear()` row (active/voided/reversal alike, tax-relevant and general
  alike), every column ANA-0001 lists as needed to reconstruct it: `id, date, kind,
  tax_relevant, income_section, general_category, amount, currency, wht, source_payer,
  payer_tax_id, note, status, reversal_of_id, source`. Money columns are ungrouped decimal
  baht (`formatSatangAsBaht(minor, {grouping:false})`) for a clean round-trip through
  `tryParseBahtToSatang` when AT-5.3 reads it back.
- `LEDGER_CSV_COLUMNS` is exported as the column-order contract — `parseForPreview` (AT-5.3)
  reads exactly this format, since ANA-0001 states the ledger export's own format is the only
  valid import source.
- Basic RFC-4180-style quoting (`csvField`) for values containing a comma, quote, or newline —
  needed because `note` is free text.
- 211 tests pass (208 prior + 3 new); lint + `tsc --noEmit` clean.

## Deviations from design

None. `id` and `reversal_of_id` are included in the export for traceability (a human opening the
CSV can see which rows are linked), even though AT-5.4's import doesn't attempt to reconstruct
reversal chains or preserve original ids — noted in `csv.ts`'s module header rather than left
implicit.

## Notes for follow-up tasks

- AT-5.2 (`exportSummary`) is a separate, one-way report — do not reuse `LEDGER_CSV_COLUMNS` or
  `exportLedger`'s row shape for it.
- AT-5.3 (`parseForPreview`) must validate against exactly `LEDGER_CSV_COLUMNS`'s column order/
  names — any other CSV shape is invalid input, per ANA-0001.
