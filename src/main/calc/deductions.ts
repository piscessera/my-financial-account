/**
 * Deduction cap-shape calculator (AT-3.2, INV-6) — a pure function over a tax year's
 * `deduction_entries` plus the `deduction_categories`/`shared_caps` reference data. No DB
 * access, no I/O: `repositories/deductions.ts` and `repositories/settings.ts` supply the raw
 * rows, this module only does the arithmetic (calc engine convention, same split as
 * `calc/money.ts`).
 *
 * Applies the three cap shapes from ANA-0001 §Deduction cap shapes:
 * - `fixed` — the category's `capAmountMinor` is the ceiling for that category alone.
 * - `per_count` — `capAmountMinor` is the *per-unit* ceiling; the entry's `count` multiplies
 *   it to get the effective cap for that category.
 * - `shared_group_member` — the category may carry its own `capAmountMinor` as an *optional*
 *   sub-cap (applied first, per-category); every member's sub-cap-limited amount is then
 *   summed and the group total is capped at its `shared_caps.capAmountMinor` (TC-0001 #9). A
 *   member's own `effectiveMinor` in {@link PerCategoryDeduction} always reflects only its own
 *   sub-cap — never a proportional share of the group cap — so the Deductions screen can show
 *   "this member: X/sub-cap" and "group: Y/group-cap" as two independent, correct numbers
 *   (AT-3.5's "shared-group running total"); the group cap only reduces the *grand total* fed
 *   to `calc.computeYear()` (AT-4.2), via {@link ComputeDeductionsResult.totalMinor}.
 */
import type { DeductionCategoryRow, DeductionEntryRow, SharedCapRow } from '../db/schema';

export interface PerCategoryDeduction {
  readonly categoryId: number;
  /** The raw amount entered, before any cap. */
  readonly enteredMinor: number;
  /** After this category's own cap (fixed / per-count×count / its optional sub-cap). */
  readonly effectiveMinor: number;
  /** `true` iff `effectiveMinor < enteredMinor` — the UI's "capped" indicator (TC-0001 #7). */
  readonly cappedByOwnCap: boolean;
}

export interface SharedGroupContribution {
  readonly sharedGroupId: number;
  /** Sum of every member's `effectiveMinor` (each already limited by its own sub-cap). */
  readonly rawTotalMinor: number;
  /** `rawTotalMinor`, capped at the group's `shared_caps.capAmountMinor`. */
  readonly cappedTotalMinor: number;
}

export interface ComputeDeductionsResult {
  readonly perCategory: readonly PerCategoryDeduction[];
  readonly sharedGroups: readonly SharedGroupContribution[];
  /** The grand total to subtract from taxable income — non-grouped categories' effective
   *  amounts plus every shared group's capped total. This is what `calc.computeYear()` uses. */
  readonly totalMinor: number;
}

function effectiveCapFor(category: DeductionCategoryRow, entry: DeductionEntryRow): number | null {
  switch (category.capType) {
    case 'fixed':
      // capAmountMinor is required (non-null) for 'fixed' by the repository's own CHECK/
      // validation (AT-3.1); the `?? 0` here is only a defensive fallback, never reachable
      // through the repository's own write path.
      return category.capAmountMinor ?? 0;
    case 'per_count':
      return (category.capAmountMinor ?? 0) * (entry.count ?? 0);
    case 'shared_group_member':
      // No sub-cap declared: unconstrained beyond the group's own cap.
      return category.capAmountMinor;
  }
}

/**
 * Compute every category's capped deduction and the grand total, for one tax year's entries.
 * `categories`/`sharedCaps` are the full reference lists (not just the ones with entries) —
 * only categories that actually have an entry in `entries` contribute anything.
 */
export function computeDeductions(
  categories: readonly DeductionCategoryRow[],
  entries: readonly DeductionEntryRow[],
  sharedCaps: readonly SharedCapRow[],
): ComputeDeductionsResult {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const sharedCapById = new Map(sharedCaps.map((g) => [g.id, g]));

  const perCategory: PerCategoryDeduction[] = [];
  const groupRawTotals = new Map<number, number>();

  for (const entry of entries) {
    const category = categoryById.get(entry.categoryId);
    if (!category) continue; // an entry for a since-deleted category (shouldn't happen; ON DELETE RESTRICT) — skip defensively.

    const cap = effectiveCapFor(category, entry);
    const effectiveMinor = cap === null ? entry.amountMinor : Math.min(entry.amountMinor, cap);

    perCategory.push({
      categoryId: category.id,
      enteredMinor: entry.amountMinor,
      effectiveMinor,
      cappedByOwnCap: effectiveMinor < entry.amountMinor,
    });

    if (category.capType === 'shared_group_member' && category.sharedGroupId !== null) {
      groupRawTotals.set(
        category.sharedGroupId,
        (groupRawTotals.get(category.sharedGroupId) ?? 0) + effectiveMinor,
      );
    }
  }

  const sharedGroups: SharedGroupContribution[] = [...groupRawTotals.entries()].map(
    ([sharedGroupId, rawTotalMinor]) => {
      const groupCap = sharedCapById.get(sharedGroupId)?.capAmountMinor ?? null;
      return {
        sharedGroupId,
        rawTotalMinor,
        cappedTotalMinor: groupCap === null ? rawTotalMinor : Math.min(rawTotalMinor, groupCap),
      };
    },
  );

  const nonGroupedTotal = perCategory
    .filter((p) => categoryById.get(p.categoryId)?.capType !== 'shared_group_member')
    .reduce((sum, p) => sum + p.effectiveMinor, 0);
  const groupedTotal = sharedGroups.reduce((sum, g) => sum + g.cappedTotalMinor, 0);

  return { perCategory, sharedGroups, totalMinor: nonGroupedTotal + groupedTotal };
}
