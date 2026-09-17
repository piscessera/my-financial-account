/**
 * Built-in reference data for `seed.ts` (AT-1.5).
 *
 * ANA-0001 decision 14: no `TAX-2025` workbook figures are available yet, so this seed set is
 * empty on purpose — an empty `deduction_categories`/`shared_caps`/`tax_brackets` table is a
 * supported state, not a placeholder bug. When the real 2025 figures are supplied, fill the
 * arrays below (money values as integer satang via `calc/money.ts#parseBahtToSatang` — INV-1)
 * and nothing else in the seed path changes.
 */
import type { SeedDataSet } from '../seed';

export const TAX_YEAR_2025_SEED: SeedDataSet = {
  label: 'TAX-2025',
  sharedCaps: [],
  deductionCategories: [],
  taxBrackets: [],
};
