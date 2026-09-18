import { useEffect, useState } from 'react';

import type { DataLocationInfo } from '../main/dataLocation';
import type { LockInfo } from '../main/lockFile';
import type { TaxYearRow } from '../main/db/schema';
import LockWarningBanner from './components/LockWarningBanner';
import TaxYearSwitcher from './components/TaxYearSwitcher';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Entry from './pages/Entry';
import Deductions from './pages/Deductions';
import Settings from './pages/Settings';

type LoadState =
  | { status: 'loading' }
  | { status: 'needsOnboarding' }
  | { status: 'ready'; info: DataLocationInfo };

type Screen = 'dashboard' | 'entry' | 'deductions' | 'settings' | 'taxYears';

/**
 * Minimal nav shell, PROTO-0001's `app-nav` (design/DESIGN.md), with plain local-state screen
 * switching — no real router exists yet (nothing in the plan calls for one specifically; this
 * is the smallest thing that makes more than one screen reachable). Summary/Import-Export
 * (AT-4.7/AT-5.6) are still placeholders.
 *
 * `TaxYearSwitcher` (AT-3.7) gets its own tab rather than replacing Entry's/Deductions'
 * independent `useWorkingTaxYear` resolution — lifting "the selected year" into shared state
 * that every screen reads from is a real refactor of already-built screens, out of this atomic
 * task's scope (`TaxYearSwitcher.tsx` only). This tab is what makes the component reachable
 * for its own manual verification (TC-0001 #5) without that broader change.
 */
function AppShell({ info }: { info: DataLocationInfo }): JSX.Element {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [selectedYear, setSelectedYear] = useState<TaxYearRow | null>(null);

  return (
    <>
      <nav className="app-nav">
        <div className="brand">🧾 สมุดภาษีรายปี</div>
        <div className="links">
          <a href="#" className={screen === 'dashboard' ? 'active' : ''} onClick={() => setScreen('dashboard')}>
            Dashboard
          </a>
          <a href="#" className={screen === 'entry' ? 'active' : ''} onClick={() => setScreen('entry')}>
            บันทึกรายรับ-รายจ่าย
          </a>
          <a href="#" className={screen === 'deductions' ? 'active' : ''} onClick={() => setScreen('deductions')}>
            ค่าลดหย่อน
          </a>
          <a href="#" className={screen === 'settings' ? 'active' : ''} onClick={() => setScreen('settings')}>
            ตั้งค่า
          </a>
          <a href="#" className={screen === 'taxYears' ? 'active' : ''} onClick={() => setScreen('taxYears')}>
            ปีภาษี
          </a>
        </div>
        <div className="year-pill">
          <span className="status-dot open" />
          {info.folderPath}
        </div>
      </nav>
      {screen === 'dashboard' && <Dashboard />}
      {screen === 'entry' && <Entry />}
      {screen === 'deductions' && <Deductions />}
      {screen === 'settings' && <Settings />}
      {screen === 'taxYears' && (
        <div className="page">
          <div className="page-head">
            <h1>ปีภาษี</h1>
          </div>
          <TaxYearSwitcher selectedYearId={selectedYear?.id ?? null} onSelectYear={setSelectedYear} />
        </div>
      )}
    </>
  );
}

/** Runs the AT-1.8 launch-time lock check once a data folder is known. */
function useLockWarning(folderPath: string | null): LockInfo | null {
  const [warning, setWarning] = useState<LockInfo | null>(null);

  useEffect(() => {
    if (!folderPath) return;
    void window.api.lockFile.check(folderPath).then((result) => {
      setWarning(result.warn ? result.previous : null);
    });
  }, [folderPath]);

  return warning;
}

export default function App(): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const lockWarning = useLockWarning(state.status === 'ready' ? state.info.folderPath : null);

  useEffect(() => {
    void window.api.dataLocation.get().then((info) => {
      setState(info ? { status: 'ready', info } : { status: 'needsOnboarding' });
    });
  }, []);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'needsOnboarding') {
    return <Onboarding onComplete={(info) => setState({ status: 'ready', info })} />;
  }
  return (
    <>
      {lockWarning !== null && <LockWarningBanner previous={lockWarning} />}
      <AppShell info={state.info} />
    </>
  );
}
