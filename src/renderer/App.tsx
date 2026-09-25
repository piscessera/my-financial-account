import { useEffect, useState } from 'react';

import type { DataLocationInfo } from '../main/dataLocation';
import type { LockInfo } from '../main/lockFile';
import type { TaxYearRow } from '../main/db/schema';
import logoUrl from './assets/logo.png';
import LockWarningBanner from './components/LockWarningBanner';
import TaxYearSwitcher from './components/TaxYearSwitcher';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Entry from './pages/Entry';
import Deductions from './pages/Deductions';
import Settings from './pages/Settings';
import Summary from './pages/Summary';
import ImportExport from './pages/ImportExport';

type LoadState =
  | { status: 'loading' }
  | { status: 'needsOnboarding' }
  | { status: 'ready'; info: DataLocationInfo };

type Screen =
  'dashboard' | 'entry' | 'deductions' | 'settings' | 'taxYears' | 'summary' | 'importExport';

/**
 * Minimal nav shell, PROTO-0001's `app-nav` (design/DESIGN.md), with plain local-state screen
 * switching — no real router exists yet (nothing in the plan calls for one specifically; this
 * is the smallest thing that makes more than one screen reachable). All PLAN-0001 screens are
 * now wired in as of AT-5.6.
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
  const [entryMonth, setEntryMonth] = useState<number | null>(null);

  function handleNavigateToEntry(month?: number): void {
    setEntryMonth(month ?? null);
    setScreen('entry');
  }

  return (
    <>
      <nav className="app-nav">
        <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src={logoUrl}
            alt="Logo"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              objectFit: 'contain',
              display: 'block',
            }}
          />
          <span>สมุดภาษีรายปี</span>
        </div>
        <div className="links">
          <a
            href="#"
            className={screen === 'dashboard' ? 'active' : ''}
            onClick={() => setScreen('dashboard')}
          >
            Dashboard
          </a>
          <a
            href="#"
            className={screen === 'summary' ? 'active' : ''}
            onClick={() => setScreen('summary')}
          >
            สรุปปี
          </a>
          <a
            href="#"
            className={screen === 'entry' ? 'active' : ''}
            onClick={() => {
              setEntryMonth(null);
              setScreen('entry');
            }}
          >
            บันทึกรายรับ-รายจ่าย
          </a>
          <a
            href="#"
            className={screen === 'deductions' ? 'active' : ''}
            onClick={() => setScreen('deductions')}
          >
            ค่าลดหย่อน
          </a>
          <a
            href="#"
            className={screen === 'settings' ? 'active' : ''}
            onClick={() => setScreen('settings')}
          >
            ตั้งค่า
          </a>
          <a
            href="#"
            className={screen === 'taxYears' ? 'active' : ''}
            onClick={() => setScreen('taxYears')}
          >
            ปีภาษี
          </a>
          <a
            href="#"
            className={screen === 'importExport' ? 'active' : ''}
            onClick={() => setScreen('importExport')}
          >
            นำเข้า/ส่งออก
          </a>
        </div>
        <div className="year-pill">
          <span className="status-dot open" />
          {info.folderPath}
        </div>
      </nav>
      {screen === 'dashboard' && <Dashboard onNavigateToEntry={handleNavigateToEntry} />}
      {screen === 'entry' && <Entry initialMonth={entryMonth} />}
      {screen === 'deductions' && <Deductions />}
      {screen === 'settings' && <Settings />}
      {screen === 'taxYears' && (
        <div className="page">
          <div className="page-head">
            <h1>ปีภาษี</h1>
          </div>
          <TaxYearSwitcher
            selectedYearId={selectedYear?.id ?? null}
            onSelectYear={setSelectedYear}
          />
        </div>
      )}
      {screen === 'summary' && <Summary />}
      {screen === 'importExport' && <ImportExport />}
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
