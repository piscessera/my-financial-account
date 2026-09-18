/**
 * AT-4.1 — progressive tax bracket calculator.
 *
 * Covers TC-0001 #11, #12.
 */
import { describe, expect, it } from 'vitest';

import type { TaxBracketRow } from '../../db/schema';
import { computeTax } from '../brackets';

// Standard Thai progressive PIT brackets (also PROTO-0001's settings.html reference table).
const TAX_2025_BRACKETS: TaxBracketRow[] = [
  { id: 1, lowerBoundMinor: 0, upperBoundMinor: 150_000_00, rateBp: 0, sortOrder: 1 },
  { id: 2, lowerBoundMinor: 150_000_00, upperBoundMinor: 300_000_00, rateBp: 500, sortOrder: 2 },
  { id: 3, lowerBoundMinor: 300_000_00, upperBoundMinor: 500_000_00, rateBp: 1000, sortOrder: 3 },
  { id: 4, lowerBoundMinor: 500_000_00, upperBoundMinor: 750_000_00, rateBp: 1500, sortOrder: 4 },
  { id: 5, lowerBoundMinor: 750_000_00, upperBoundMinor: 1_000_000_00, rateBp: 2000, sortOrder: 5 },
  { id: 6, lowerBoundMinor: 1_000_000_00, upperBoundMinor: 2_000_000_00, rateBp: 2500, sortOrder: 6 },
  { id: 7, lowerBoundMinor: 2_000_000_00, upperBoundMinor: 5_000_000_00, rateBp: 3000, sortOrder: 7 },
  { id: 8, lowerBoundMinor: 5_000_000_00, upperBoundMinor: null, rateBp: 3500, sortOrder: 8 },
];

describe('TC-0001 #11: progressive bracket calculation, multi-bracket', () => {
  it('reproduces the TAX-2025 reference figure exactly: 793,831.04 -> 73,766.21', () => {
    const result = computeTax(793_831_04, TAX_2025_BRACKETS);

    expect(result.totalTaxMinor).toBe(73_766_21);
    // Bracket-by-bracket: 0 + 7,500.00 + 20,000.00 + 37,500.00 + 8,766.21 (partial 5th bracket).
    expect(result.breakdown.map((b) => b.taxMinor)).toEqual([0, 750_000, 2_000_000, 3_750_000, 876_621, 0, 0, 0]);
    expect(result.breakdown[4].amountInBracketMinor).toBe(4_383_104); // 793,831.04 - 750,000.00
  });
});

describe('TC-0001 #12: zero or negative net taxable income', () => {
  it('floors negative income to 0 -- tax payable is never negative', () => {
    expect(computeTax(-1_000_00, TAX_2025_BRACKETS).totalTaxMinor).toBe(0);
  });

  it('zero income yields zero tax', () => {
    expect(computeTax(0, TAX_2025_BRACKETS).totalTaxMinor).toBe(0);
  });

  it('income within the first (0%) bracket yields zero tax', () => {
    expect(computeTax(100_000_00, TAX_2025_BRACKETS).totalTaxMinor).toBe(0);
  });
});

describe('open-ended top bracket', () => {
  it('taxes everything above the last finite bound at the top rate', () => {
    const result = computeTax(5_600_000_00, TAX_2025_BRACKETS);
    const topBracket = result.breakdown.at(-1);
    expect(topBracket?.amountInBracketMinor).toBe(600_000_00);
    expect(topBracket?.taxMinor).toBe(210_000_00); // 600,000 * 35%
  });
});
