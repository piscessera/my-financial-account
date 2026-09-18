import { useEffect, useState } from 'react';

import type { DataLocationInfo } from '../main/dataLocation';
import type { LockInfo } from '../main/lockFile';
import LockWarningBanner from './components/LockWarningBanner';
import Onboarding from './pages/Onboarding';
import Entry from './pages/Entry';
import Deductions from './pages/Deductions';

type LoadState =
  | { status: 'loading' }
  | { status: 'needsOnboarding' }
  | { status: 'ready'; info: DataLocationInfo };

type Screen = 'entry' | 'deductions';

/**
 * Minimal nav shell, PROTO-0001's `app-nav` (design/DESIGN.md), with plain local-state screen
 * switching — no real router exists yet (nothing in the plan calls for one specifically; this
 * is the smallest thing that makes more than one screen reachable). Dashboard (AT-4.6),
 * Settings (AT-3.6), Summary (AT-4.7), Import/Export (AT-5.6) are still placeholders.
 */
function AppShell({ info }: { info: DataLocationInfo }): JSX.Element {
  const [screen, setScreen] = useState<Screen>('entry');

  return (
    <>
      <nav className="app-nav">
        <div className="brand">🧾 สมุดภาษีรายปี</div>
        <div className="links">
          <span className="muted">Dashboard (เร็วๆ นี้)</span>
          <a href="#" className={screen === 'entry' ? 'active' : ''} onClick={() => setScreen('entry')}>
            บันทึกรายรับ-รายจ่าย
          </a>
          <a href="#" className={screen === 'deductions' ? 'active' : ''} onClick={() => setScreen('deductions')}>
            ค่าลดหย่อน
          </a>
          <span className="muted">ตั้งค่า (เร็วๆ นี้)</span>
        </div>
        <div className="year-pill">
          <span className="status-dot open" />
          {info.folderPath}
        </div>
      </nav>
      {screen === 'entry' ? <Entry /> : <Deductions />}
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
