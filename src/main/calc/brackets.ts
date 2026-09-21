/**
 * Progressive tax bracket calculator (AT-4.1) — a pure function over net taxable income and
 * the `tax_brackets` reference rows. Integer satang × integer basis-point rate, each bracket's
 * own contribution half-up rounded independently via `BigInt` (never accumulated as a float,
 * never rounded only once at the end) — this is what reproduces the `TAX-2025` reference figure
 * exactly (TC-0001 #11): 793,831.04 THB → 73,766.21 THB, verified bracket-by-bracket.
 *
 * Negative net taxable income is floored to 0 before bracketing (TC-0001 #12) — tax payable is
 * never negative.
 */
import type { TaxBracketRow } from '../db/schema';
import { assertSatang, type Satang } from './money';

export class BracketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BracketError';
  }
}

export interface BracketContribution {
  readonly bracketId: number;
  /** How much of `netTaxableMinor` fell inside this bracket. */
  readonly amountInBracketMinor: Satang;
  readonly rateBp: number;
  /** This bracket's own half-up-rounded tax contribution. */
  readonly taxMinor: Satang;
}

export interface ComputeTaxResult {
  readonly totalTaxMinor: Satang;
  readonly breakdown: readonly BracketContribution[];
}

/** `amountMinor × rateBp / 10000`, half-up rounded — same convention as `expenseMethod.ts`. */
function taxForBracket(amountMinor: number, rateBp: number): Satang {
  const product = BigInt(amountMinor) * BigInt(rateBp);
  const quotient = product / 10_000n;
  const remainder = product % 10_000n;
  const roundedUp = remainder * 2n >= 10_000n;
  return Number(roundedUp ? quotient + 1n : quotient);
}

/**
 * Compute progressive tax over `netTaxableMinor`, using `brackets` (any order — sorted here by
 * `sortOrder`). Each bracket's contribution is `min(netTaxable, upperBound) - lowerBound`,
 * clamped to `>= 0`; the last bracket's `upperBoundMinor` is `null` (open-ended).
 */
export function computeTax(
  netTaxableMinor: Satang,
  brackets: readonly TaxBracketRow[],
): ComputeTaxResult {
  assertSatang(netTaxableMinor);
  const floored = Math.max(netTaxableMinor, 0);

  const sorted = [...brackets].sort((a, b) => a.sortOrder - b.sortOrder);
  const breakdown: BracketContribution[] = [];
  let totalTaxMinor = 0;

  for (const bracket of sorted) {
    const upper = bracket.upperBoundMinor;
    const amountInBracketMinor = Math.max(
      0,
      Math.min(floored, upper ?? floored) - bracket.lowerBoundMinor,
    );
    const taxMinor =
      amountInBracketMinor > 0 ? taxForBracket(amountInBracketMinor, bracket.rateBp) : 0;
    breakdown.push({
      bracketId: bracket.id,
      amountInBracketMinor,
      rateBp: bracket.rateBp,
      taxMinor,
    });
    totalTaxMinor += taxMinor;
  }

  return { totalTaxMinor, breakdown };
}
