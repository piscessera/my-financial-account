/**
 * Money helper — the single input boundary between user-entered decimal baht and the
 * integer satang used everywhere else (AT-1.4, TC-0001 #31, INV-1).
 *
 * INV-1: "All monetary amounts are stored and computed as integer satang; user-entered
 * decimal baht rounds half-up to the nearest satang at input; no float is used anywhere in
 * the calculation path."
 *
 * Consequences, and why this file looks the way it does:
 *
 * - **Every** conversion from human input to storage goes through `parseBahtToSatang`.
 *   Repositories, IPC handlers and the calculation engine import this module instead of
 *   doing their own rounding. `Math.round(x * 100)` is exactly the bug INV-1 exists to
 *   prevent: it evaluates the decimal in binary floating point first (e.g. `1234.565 * 100`
 *   is `123456.49999999999` in IEEE-754, so it rounds *down* — non-deterministically wrong).
 * - Parsing is therefore done on the *digit string*: no `parseFloat`, no `Number(...)` on a
 *   fractional value, no float arithmetic. Integer maths uses `BigInt` so that intermediate
 *   values cannot silently lose precision; only the final in-range result becomes a `number`.
 * - Input is a **string** (what an `<input>` element actually holds). Whole-baht `number`
 *   input is accepted as a convenience for seed data and tests, but a fractional `number`
 *   is rejected: by the time a decimal has become a JS `number` the rounding question has
 *   already been answered by the float parser, not by us.
 *
 * Rounding mode: **half-up on the magnitude** (ties away from zero), so 1234.565 → 123457
 * satang and -1234.565 → -123457 satang. This keeps |round(-x)| == |round(x)|, which is what
 * a reversal entry needs (a reversal must cancel the original to the satang).
 *
 * Scope: conversion and display only. Arithmetic on satang is ordinary integer arithmetic
 * and belongs to the calculation engine; the guard here is `assertSatang`.
 */

/**
 * An integer number of satang (1 baht = 100 satang). This is the *only* money
 * representation allowed past this module — see INV-1.
 */
export type Satang = number;

/** 1 baht = 100 satang. */
export const SATANG_PER_BAHT = 100;

/** The ISO 4217 code for the one currency this app handles (CLAUDE.md §Project). */
export const CURRENCY_CODE = 'THB';

export type MoneyErrorCode =
  | 'EMPTY'
  | 'INVALID_FORMAT'
  | 'FRACTIONAL_NUMBER_INPUT'
  | 'NOT_FINITE'
  | 'NOT_INTEGER'
  | 'OUT_OF_RANGE';

/** Thrown by the throwing entry points; carries a stable `code` for UI messaging. */
export class MoneyError extends Error {
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode, message: string) {
    super(message);
    this.name = 'MoneyError';
    this.code = code;
  }
}

export type ParseResult = { ok: true; satang: Satang } | { ok: false; error: MoneyError };

/**
 * Whitespace is stripped anywhere in the input. JS `\s` already covers the spaces a paste
 * from Excel or a locale formatter carries (NBSP U+00A0, narrow NBSP U+202F, thin space
 * U+2009) — locale formatting uses them as thousands separators.
 */
const STRIPPABLE_SPACE = /\s/g;

/** Optional currency decoration a user may paste in: "฿1,234.50", "1,234.50 THB". */
const CURRENCY_DECORATION = /^฿|฿$|^THB|THB$/gi;

/**
 * A decimal baht literal: optional sign, digits with optional *consistent* comma grouping,
 * optional fractional part of any length (sub-satang digits decide the rounding).
 * Either the integer part or the fractional part may be omitted, but not both.
 */
const BAHT_LITERAL = /^([+-]?)(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d*))?$/;

/** `Number.MAX_SAFE_INTEGER` satang ≈ 90 trillion baht — far beyond any personal ledger. */
const MAX_SATANG = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Convert user-entered baht to integer satang, rounding half-up at the satang.
 *
 * Accepts: `"1234.56"`, `"1,234.567"`, `"-1,234.5"`, `".5"`, `"1,234."`, a leading `+`/`-`,
 * surrounding/embedded spaces and a `฿`/`THB` decoration (`"฿ 1 234.50"`), and whole-baht
 * `number`s.
 * Rejects: fractional `number`s, inconsistent grouping (`"12,34.5"`), a comma used as the
 * decimal mark (`"1234,50"`), exponent notation, anything non-numeric, and magnitudes beyond
 * `Number.MAX_SAFE_INTEGER` satang.
 *
 * @throws {MoneyError} on any rejected input — callers that want to show a field-level
 * validation message should use {@link tryParseBahtToSatang} instead.
 */
export function parseBahtToSatang(input: string | number): Satang {
  const result = tryParseBahtToSatang(input);
  if (!result.ok) throw result.error;
  return result.satang;
}

/** Non-throwing form of {@link parseBahtToSatang}, for field-level input validation. */
export function tryParseBahtToSatang(input: string | number): ParseResult {
  if (typeof input === 'number') return parseNumberInput(input);

  const cleaned = input.replace(STRIPPABLE_SPACE, '').replace(CURRENCY_DECORATION, '');
  if (cleaned === '') {
    return fail('EMPTY', 'Enter an amount in baht.');
  }

  const match = BAHT_LITERAL.exec(cleaned);
  if (match === null) {
    return fail('INVALID_FORMAT', `"${input}" is not a valid baht amount.`);
  }

  const [, sign, groupedInteger, fraction = ''] = match;
  const integerDigits = groupedInteger.replace(/,/g, '');
  if (integerDigits === '' && fraction === '') {
    // Matched only a sign and/or a bare ".".
    return fail('INVALID_FORMAT', `"${input}" is not a valid baht amount.`);
  }

  return finish(sign === '-', roundHalfUpToSatang(integerDigits, fraction), input);
}

/**
 * Round `<integerDigits>.<fractionDigits>` baht to satang, half-up, as a non-negative
 * magnitude. Pure digit-string / BigInt arithmetic — no float is created at any point.
 */
function roundHalfUpToSatang(integerDigits: string, fractionDigits: string): bigint {
  const satangDigits = fractionDigits.padEnd(2, '0').slice(0, 2);
  const subSatangDigits = fractionDigits.slice(2);

  const magnitude = BigInt(`${integerDigits || '0'}${satangDigits}`);

  // The discarded remainder is `0.<subSatangDigits>` of one satang. It is >= one half
  // exactly when its first digit is >= 5 ("5" followed by zeros is the tie, which half-up
  // rounds away from zero; "5" followed by anything else is already greater than half).
  const roundsUp = subSatangDigits.charCodeAt(0) >= /* '5' */ 53;

  return roundsUp ? magnitude + 1n : magnitude;
}

function parseNumberInput(input: number): ParseResult {
  if (!Number.isFinite(input)) {
    return fail('NOT_FINITE', 'Amount must be a finite number.');
  }
  if (!Number.isInteger(input)) {
    return fail(
      'FRACTIONAL_NUMBER_INPUT',
      `Pass decimal baht as a string (e.g. "${input}"), not a number: a JS number has ` +
        'already been rounded in binary floating point before this helper sees it (INV-1).',
    );
  }
  const magnitude = BigInt(Math.abs(input)) * BigInt(SATANG_PER_BAHT);
  return finish(input < 0, magnitude, input);
}

function finish(negative: boolean, magnitude: bigint, input: string | number): ParseResult {
  if (magnitude > MAX_SATANG) {
    return fail('OUT_OF_RANGE', `"${input}" is too large to store as satang.`);
  }
  // `magnitude` is <= MAX_SAFE_INTEGER here, so this Number() is exact.
  const satang = Number(magnitude);
  // `|| 0` normalises -0 (from "-0.001" rounding down) to 0: SQLite and JS agree on 0,
  // but -0 formats as "-0.00" and breaks Object.is-based comparisons in later tasks.
  return { ok: true, satang: negative ? -satang || 0 : satang };
}

function fail(code: MoneyErrorCode, message: string): ParseResult {
  return { ok: false, error: new MoneyError(code, message) };
}

export interface FormatOptions {
  /** Thousands separators, e.g. `1,234.57`. Default `true`. */
  readonly grouping?: boolean;
  /** Append ` THB`. Default `false`. */
  readonly withCurrency?: boolean;
}

/**
 * Render integer satang as a baht display string with exactly two decimals
 * (`123457` → `"1,234.57"`). Digit-string arithmetic, so no float ever touches a
 * displayed amount. This is the inverse of {@link parseBahtToSatang} for any value that
 * has already been rounded to satang.
 *
 * @throws {MoneyError} if `satang` is not a safe integer.
 */
export function formatSatangAsBaht(satang: Satang, options: FormatOptions = {}): string {
  assertSatang(satang);
  const { grouping = true, withCurrency = false } = options;

  const digits = Math.abs(satang).toString().padStart(3, '0');
  const integerPart = digits.slice(0, -2);
  const fractionPart = digits.slice(-2);
  const sign = satang < 0 ? '-' : '';
  const grouped = grouping ? integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : integerPart;

  return `${sign}${grouped}.${fractionPart}${withCurrency ? ` ${CURRENCY_CODE}` : ''}`;
}

/** Type guard: a valid satang amount is a safe integer. */
export function isSatang(value: unknown): value is Satang {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Guard for the boundaries where money enters or leaves the calculation path (repository
 * writes, IPC payloads). Rejects floats before they can reach the DB, where the schema's
 * `typeof(x)='integer'` CHECK would reject them anyway — but with a far worse message.
 *
 * @throws {MoneyError} if `value` is not a safe integer number of satang.
 */
export function assertSatang(value: unknown): asserts value is Satang {
  if (isSatang(value)) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MoneyError('NOT_FINITE', `Expected an integer satang amount, got ${String(value)}.`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      'NOT_INTEGER',
      `Money must be integer satang, never a fraction (INV-1); got ${value}.`,
    );
  }
  throw new MoneyError('OUT_OF_RANGE', `Satang amount ${value} exceeds the safe integer range.`);
}
