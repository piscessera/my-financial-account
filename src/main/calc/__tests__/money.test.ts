/**
 * Unit tests for the money boundary helper (AT-1.4, TC-0001 #31, INV-1).
 */
import { describe, expect, it } from 'vitest';

import {
  CURRENCY_CODE,
  MoneyError,
  SATANG_PER_BAHT,
  assertSatang,
  formatSatangAsBaht,
  isSatang,
  parseBahtToSatang,
  tryParseBahtToSatang,
} from '../money';

/** Asserts the thrown value is a MoneyError with the expected code. */
function expectMoneyError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(MoneyError);
    expect((error as MoneyError).code).toBe(code);
    return;
  }
  throw new Error(`expected a MoneyError(${code}), but nothing was thrown`);
}

describe('parseBahtToSatang', () => {
  it('TC-0001 #31: rounds "1,234.567" THB half-up to 123457 satang, deterministically', () => {
    // The verbatim case from TC-0001 #31 / INV-1.
    expect(parseBahtToSatang('1,234.567')).toBe(123457);

    // "deterministically": the same input always yields the same output, and the value is
    // an exact integer (not a float that merely prints as one).
    for (let i = 0; i < 100; i += 1) {
      expect(parseBahtToSatang('1,234.567')).toBe(123457);
    }
    expect(Number.isInteger(parseBahtToSatang('1,234.567'))).toBe(true);
  });

  it('rounds an exact half satang away from zero (the half-up tie)', () => {
    expect(parseBahtToSatang('0.005')).toBe(1);
    expect(parseBahtToSatang('0.015')).toBe(2); // banker's rounding would give 1
    expect(parseBahtToSatang('0.025')).toBe(3); // banker's rounding would give 2
    expect(parseBahtToSatang('1234.565')).toBe(123457);
    expect(parseBahtToSatang('-1234.565')).toBe(-123457);
  });

  it('is immune to the binary floating point error that Math.round(x * 100) hits', () => {
    // 1.005 * 100 === 100.49999999999999 in IEEE-754, so the naive implementation rounds
    // DOWN on a value the user wrote as an exact half. This is the bug INV-1 exists to
    // prevent — and note which inputs it hits is not predictable by eye.
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(parseBahtToSatang('1.005')).toBe(101);

    // 8.165 * 100 === 816.4999999999999; 10.075 * 100 === 1007.4999999999999.
    expect(Math.round(8.165 * 100)).toBe(816);
    expect(parseBahtToSatang('8.165')).toBe(817);
    expect(Math.round(10.075 * 100)).toBe(1007);
    expect(parseBahtToSatang('10.075')).toBe(1008);

    // Every exact-half satang from 0.005 to 99.995 rounds up, with no exceptions.
    for (let thousandths = 5; thousandths < 100_000; thousandths += 10) {
      const baht = (thousandths / 1000).toFixed(3);
      expect(parseBahtToSatang(baht)).toBe((thousandths + 5) / 10);
    }

    // A long fractional tail must not perturb the satang digits either.
    expect(parseBahtToSatang('0.1')).toBe(10);
    expect(parseBahtToSatang('0.2')).toBe(20);
    expect(parseBahtToSatang('0.30000000000000004')).toBe(30);
  });

  it('rounds down below the half and up above it', () => {
    expect(parseBahtToSatang('1.004')).toBe(100);
    expect(parseBahtToSatang('1.0049999')).toBe(100);
    expect(parseBahtToSatang('1.0050001')).toBe(101);
    expect(parseBahtToSatang('1.006')).toBe(101);
    expect(parseBahtToSatang('1.999')).toBe(200);
  });

  it('handles zero, and never produces negative zero', () => {
    expect(parseBahtToSatang('0')).toBe(0);
    expect(parseBahtToSatang('0.00')).toBe(0);
    expect(parseBahtToSatang('-0')).toBe(0);
    expect(parseBahtToSatang('-0.004')).toBe(0); // rounds down to zero
    expect(Object.is(parseBahtToSatang('-0.004'), -0)).toBe(false);
    expect(Object.is(parseBahtToSatang('-0'), -0)).toBe(false);
  });

  it('handles negative amounts symmetrically (a reversal must cancel to the satang)', () => {
    for (const baht of ['1234.567', '0.005', '99.994', '12,345.678']) {
      expect(parseBahtToSatang(`-${baht}`)).toBe(-parseBahtToSatang(baht));
    }
    expect(parseBahtToSatang('-1,234.567')).toBe(-123457);
    expect(parseBahtToSatang('+1,234.567')).toBe(123457);
  });

  it('accepts whole and partial decimal forms', () => {
    expect(parseBahtToSatang('1234')).toBe(123400);
    expect(parseBahtToSatang('1234.')).toBe(123400);
    expect(parseBahtToSatang('1234.5')).toBe(123450);
    expect(parseBahtToSatang('1234.50')).toBe(123450);
    expect(parseBahtToSatang('.5')).toBe(50);
    expect(parseBahtToSatang('0.5')).toBe(50);
  });

  it('accepts grouping, surrounding whitespace and a ฿/THB decoration', () => {
    expect(parseBahtToSatang('  1,234.56  ')).toBe(123456);
    expect(parseBahtToSatang('1,234,567.89')).toBe(123456789);
    expect(parseBahtToSatang('฿1,234.56')).toBe(123456);
    expect(parseBahtToSatang('1,234.56 THB')).toBe(123456);
    expect(parseBahtToSatang('฿ 1 234.50')).toBe(123450);
    // Non-breaking / narrow / thin spaces, as pasted from Excel or a locale formatter.
    expect(parseBahtToSatang('1 234.50')).toBe(123450);
    expect(parseBahtToSatang('1 234.50')).toBe(123450);
    expect(parseBahtToSatang('1 234.50')).toBe(123450);
  });

  it('preserves precision for amounts far beyond float-safe baht arithmetic', () => {
    // 90071992547.409 baht = 9007199254740.9 satang -> 9007199254741.
    expect(parseBahtToSatang('90071992547.409')).toBe(9007199254741);
    // 12345678901.235 baht = 1234567890123.5 satang -> tie, rounds away from zero.
    expect(parseBahtToSatang('12345678901.235')).toBe(1234567890124);
    expect(parseBahtToSatang('-12345678901.235')).toBe(-1234567890124);
  });

  it('rejects malformed input with a typed error', () => {
    expectMoneyError(() => parseBahtToSatang(''), 'EMPTY');
    expectMoneyError(() => parseBahtToSatang('   '), 'EMPTY');
    expectMoneyError(() => parseBahtToSatang('abc'), 'INVALID_FORMAT');
    expectMoneyError(() => parseBahtToSatang('1.2.3'), 'INVALID_FORMAT');
    expectMoneyError(() => parseBahtToSatang('12,34.5'), 'INVALID_FORMAT'); // bad grouping
    expectMoneyError(() => parseBahtToSatang('1234,50'), 'INVALID_FORMAT'); // comma decimal mark
    expectMoneyError(() => parseBahtToSatang('1e3'), 'INVALID_FORMAT'); // exponent notation
    expectMoneyError(() => parseBahtToSatang('1_000'), 'INVALID_FORMAT');
    expectMoneyError(() => parseBahtToSatang('-'), 'INVALID_FORMAT');
    expectMoneyError(() => parseBahtToSatang('.'), 'INVALID_FORMAT');
    expectMoneyError(() => parseBahtToSatang('NaN'), 'INVALID_FORMAT');
    expectMoneyError(() => parseBahtToSatang('Infinity'), 'INVALID_FORMAT');
  });

  it('rejects amounts beyond the safe integer range instead of silently losing precision', () => {
    expectMoneyError(() => parseBahtToSatang('90071992547409.92'), 'OUT_OF_RANGE');
    expectMoneyError(() => parseBahtToSatang('-90071992547409.92'), 'OUT_OF_RANGE');
    // The boundary itself is still accepted: MAX_SAFE_INTEGER === 9007199254740991 satang.
    expect(parseBahtToSatang('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('accepts whole-baht numbers but refuses fractional number input (INV-1)', () => {
    expect(parseBahtToSatang(1234)).toBe(123400);
    expect(parseBahtToSatang(-1234)).toBe(-123400);
    expect(parseBahtToSatang(0)).toBe(0);
    expect(parseBahtToSatang(-0)).toBe(0);
    expectMoneyError(() => parseBahtToSatang(1234.56), 'FRACTIONAL_NUMBER_INPUT');
    expectMoneyError(() => parseBahtToSatang(Number.NaN), 'NOT_FINITE');
    expectMoneyError(() => parseBahtToSatang(Number.POSITIVE_INFINITY), 'NOT_FINITE');
  });
});

describe('tryParseBahtToSatang', () => {
  it('returns a result instead of throwing, for field-level validation', () => {
    expect(tryParseBahtToSatang('1,234.567')).toEqual({ ok: true, satang: 123457 });

    const bad = tryParseBahtToSatang('abc');
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('unreachable');
    expect(bad.error).toBeInstanceOf(MoneyError);
    expect(bad.error.code).toBe('INVALID_FORMAT');
    expect(bad.error.message).toContain('abc');
  });
});

describe('formatSatangAsBaht', () => {
  it('renders satang as a two-decimal baht string', () => {
    expect(formatSatangAsBaht(123457)).toBe('1,234.57');
    expect(formatSatangAsBaht(0)).toBe('0.00');
    expect(formatSatangAsBaht(5)).toBe('0.05');
    expect(formatSatangAsBaht(50)).toBe('0.50');
    expect(formatSatangAsBaht(100)).toBe('1.00');
    expect(formatSatangAsBaht(-123457)).toBe('-1,234.57');
    expect(formatSatangAsBaht(-5)).toBe('-0.05');
    expect(formatSatangAsBaht(123456789)).toBe('1,234,567.89');
    expect(formatSatangAsBaht(Number.MAX_SAFE_INTEGER)).toBe('90,071,992,547,409.91');
  });

  it('supports plain (ungrouped) and currency-suffixed output', () => {
    expect(formatSatangAsBaht(123457, { grouping: false })).toBe('1234.57');
    expect(formatSatangAsBaht(123457, { withCurrency: true })).toBe(`1,234.57 ${CURRENCY_CODE}`);
    expect(formatSatangAsBaht(-5, { grouping: false, withCurrency: true })).toBe('-0.05 THB');
  });

  it('round-trips with parseBahtToSatang for any already-rounded amount', () => {
    for (const satang of [0, 1, 5, 50, 99, 100, 123457, -123457, -1, 123456789]) {
      expect(parseBahtToSatang(formatSatangAsBaht(satang))).toBe(satang);
      expect(parseBahtToSatang(formatSatangAsBaht(satang, { grouping: false }))).toBe(satang);
    }
  });

  it('refuses to format a non-integer amount', () => {
    expectMoneyError(() => formatSatangAsBaht(1.5), 'NOT_INTEGER');
  });
});

describe('isSatang / assertSatang', () => {
  it('accepts safe integers only', () => {
    expect(isSatang(0)).toBe(true);
    expect(isSatang(-123457)).toBe(true);
    expect(isSatang(1.5)).toBe(false);
    expect(isSatang(Number.NaN)).toBe(false);
    expect(isSatang(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
    expect(isSatang('123')).toBe(false);
    expect(isSatang(null)).toBe(false);
    expect(isSatang(undefined)).toBe(false);
  });

  it('throws a coded MoneyError for anything else', () => {
    expect(() => assertSatang(123457)).not.toThrow();
    expectMoneyError(() => assertSatang(0.1 + 0.2), 'NOT_INTEGER');
    expectMoneyError(() => assertSatang(Number.NaN), 'NOT_FINITE');
    expectMoneyError(() => assertSatang('123'), 'NOT_FINITE');
    expectMoneyError(() => assertSatang(Number.MAX_SAFE_INTEGER + 2), 'OUT_OF_RANGE');
  });
});

describe('constants', () => {
  it('exposes the THB scale used by the schema', () => {
    expect(SATANG_PER_BAHT).toBe(100);
    expect(CURRENCY_CODE).toBe('THB');
  });
});
