import { useEffect, useState } from 'react';

import type { DataLocationInfo } from '../main/dataLocation';
import type { LockInfo } from '../main/lockFile';
import LockWarningBanner from './components/LockWarningBanner';
import Onboarding from './pages/Onboarding';
import Entry from './pages/Entry';

type LoadState =
  | { status: 'loading' }
  | { status: 'needsOnboarding' }
  | { status: 'ready'; info: DataLocationInfo };

/**
 * Minimal nav shell, PROTO-0001's `app-nav` (design/DESIGN.md). Only "บันทึกรายรับ-รายจ่าย"
 * (Entry, AT-2.6/2.7) is a real screen so far; the rest (Dashboard AT-4.6, Deductions AT-3.5,
 * Settings AT-3.6, Summary AT-4.7, Import/Export AT-5.6) land in later plan tasks — a real
 * router/switcher is that later task's job too, not invented ahead of it here.
 */
function AppShell({ info }: { info: DataLocationInfo }): JSX.Element {
  return (
    <>
      <nav className="app-nav">
        <div className="brand">🧾 สมุดภาษีรายปี</div>
        <div className="links">
          <span className="muted">Dashboard (เร็วๆ นี้)</span>
          <a href="#" className="active">
            บันทึกรายรับ-รายจ่าย
          </a>
          <span className="muted">ค่าลดหย่อน (เร็วๆ นี้)</span>
          <span className="muted">ตั้งค่า (เร็วๆ นี้)</span>
        </div>
        <div className="year-pill">
          <span className="status-dot open" />
          {info.folderPath}
        </div>
      </nav>
      <Entry />
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
