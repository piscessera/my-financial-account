import { useEffect, useState } from 'react';

import type { DataLocationInfo } from '../main/dataLocation';
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

export default function App(): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    void window.api.dataLocation.get().then((info) => {
      setState(info ? { status: 'ready', info } : { status: 'needsOnboarding' });
    });
  }, []);

  if (state.status === 'loading') return <div>Loading...</div>;
  if (state.status === 'needsOnboarding') {
    return <Onboarding onComplete={(info) => setState({ status: 'ready', info })} />;
  }
  return <DashboardPlaceholder info={state.info} />;
}
