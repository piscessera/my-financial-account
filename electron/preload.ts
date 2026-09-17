import { contextBridge, ipcRenderer } from 'electron';

import type { DataLocationInfo } from '../src/main/dataLocation';
import type { LockCheckResult } from '../src/main/lockFile';

// Narrow typed API surface for the renderer. The renderer never touches
// SQLite/Node APIs directly — every method here is added by a later plan
// task (dataLocation, taxYears, transactions, deductions, calc, csv) and
// backed by an ipcRenderer.invoke call to a handler in src/main.
const api = {
  dataLocation: {
    /** Current data-location status, or `null` if onboarding hasn't completed yet (AC-19). */
    get: (): Promise<DataLocationInfo | null> => ipcRenderer.invoke('dataLocation:get'),
    /** Opens the OS folder picker; resolves the chosen path, or `null` if cancelled. */
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dataLocation:chooseFolder'),
    /** First-run only (AC-18): creates+seeds the DB in `folderPath` and remembers it. */
    createInFolder: (folderPath: string): Promise<DataLocationInfo> =>
      ipcRenderer.invoke('dataLocation:createInFolder', folderPath),
  },
  lockFile: {
    /** Launch-time check (AT-1.8): claims the lock, reporting if another instance looked recent. */
    check: (folderPath: string): Promise<LockCheckResult> =>
      ipcRenderer.invoke('lockFile:check', folderPath),
  },
} as const;

contextBridge.exposeInMainWorld('api', api);

export type PreloadApi = typeof api;
