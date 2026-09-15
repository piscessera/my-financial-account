# AT-1.4 — Money helper: baht↔satang conversion, half-up at the input boundary

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `964db04`
- **TC results:** #31 pass (`src/main/calc/__tests__/money.test.ts::parseBahtToSatang > TC-0001
  #31: rounds "1,234.567" THB half-up to 123457 satang, deterministically`)

## What was done

- `calc/money.ts` — the single input boundary for INV-1. `parseBahtToSatang(input)` converts a
  user-entered baht **string** to integer satang, rounding half-up on the magnitude (ties away
  from zero, so a reversal cancels its original exactly). Parsing works on the digit string with
  `BigInt`; no `parseFloat`/`Number()` on a fractional value and no float arithmetic anywhere.
- Accepts comma grouping, any whitespace (incl. NBSP), a `฿`/`THB` decoration, `+`/`-`, partial
  forms (`.5`, `1,234.`). Rejects inconsistent grouping, comma-as-decimal, exponent notation,
  junk, and magnitudes over `Number.MAX_SAFE_INTEGER` satang — each with a typed `MoneyError`
  carrying a stable `code`. `tryParseBahtToSatang()` is the non-throwing form for UI validation.
- Reverse direction included (judged in scope, the UI needs it): `formatSatangAsBaht(satang,
  {grouping, withCurrency})`, digit-string based, round-trip-tested against the parser. Guards
  `isSatang()` / `assertSatang()` reject non-integers before they reach the DB, where the
  schema's `typeof(x)='integer'` CHECK (AT-1.3) would reject them with a worse message.
- 20 tests in `calc/__tests__/money.test.ts`: TC #31 verbatim (incl. a 100× determinism loop),
  exact-half ties, negatives, zero/negative-zero, sub-half/over-half, large values, the safe
  integer boundary, every error code, formatting and round-trip. Suite: 83 passed; lint and
  `tsc --noEmit` clean.

## Deviations from design

- **`number` input is restricted.** Whole-baht numbers are accepted (seed data, tests); a
  fractional `number` is *rejected* with `FRACTIONAL_NUMBER_INPUT`, because by then the float
  parser has already decided the rounding. Callers pass decimals as strings. A stricter reading
  of INV-1, not a departure — no ANA decision row needed.
- One test documents the float bug by asserting `Math.round(1.005 * 100) === 100` (the naive
  implementation rounds an exact half *down*); it is a guard against reintroducing that idiom.

## Notes for follow-up tasks

- Every money-touching task (AT-1.5 seeds, AT-2.2 transactions, AT-3.x/AT-4.1 calc) imports from
  `src/main/calc/money.ts` — no local rounding, no `Math.round(x * 100)`.
- Arithmetic on satang is deliberately **not** here (plain integer maths in the calc engine);
  use `assertSatang()` at repository/IPC boundaries. `SATANG_PER_BAHT` / `CURRENCY_CODE` exported.
