import { useEffect, useState } from 'react';

import type { TaxYearRow } from '../../main/db/schema';

/**
 * Resolves a working tax year: the current Buddhist-era year if it already exists, or the
 * first open year, or creates the current year on first use. Stand-in for AT-3.7's real
 * tax-year switcher (no UI to pick a *different* year exists yet) — shared by every screen
 * that needs "the" current tax year until that switcher replaces this.
 */
export function currentBuddhistYear(): number {
  return new Date().getFullYear() + 543;
}

export type WorkingTaxYearState =
  | { status: 'loading' }
  | { status: 'ready'; year: TaxYearRow }
  | { status: 'error'; message: string };

export function useWorkingTaxYear(): WorkingTaxYearState {
  const [state, setState] = useState<WorkingTaxYearState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const years = await window.api.taxYears.list();
        const wanted = currentBuddhistYear();
        const existing = years.find((y) => y.year === wanted) ?? years.find((y) => y.status === 'open');
        const year = existing ?? (await window.api.taxYears.create(wanted));
        if (!cancelled) setState({ status: 'ready', year });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
