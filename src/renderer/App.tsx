import { useEffect, useState } from 'react';

import type { DataLocationInfo } from '../main/dataLocation';
import type { LockInfo } from '../main/lockFile';
import LockWarningBanner from './components/LockWarningBanner';
import Onboarding from './pages/Onboarding';

type LoadState =
  | { status: 'loading' }
  | { status: 'needsOnboarding' }
  | { status: 'ready'; info: DataLocationInfo };

// Real screens (Dashboard, Entry, Deductions, Settings, Summary, Import/Export) land in later
// plan tasks (AT-4.6 etc.) — this placeholder is what AT-1.6 routes to once onboarding is done.
function DashboardPlaceholder({ info }: { info: DataLocationInfo }): JSX.Element {
  return (
    <div>
      <h1>My Financial Account</h1>
      <p>Data folder: {info.folderPath}</p>
    </div>
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
      <DashboardPlaceholder info={state.info} />
    </>
  );
}
