import { contextBridge } from 'electron';

// Narrow typed API surface for the renderer. The renderer never touches
// SQLite/Node APIs directly — every method here is added by a later plan
// task (dataLocation, taxYears, transactions, deductions, calc, csv) and
// backed by an ipcRenderer.invoke call to a handler in src/main.
const api = {
  // populated incrementally by later tasks (AT-1.6+)
} as const;

contextBridge.exposeInMainWorld('api', api);

export type PreloadApi = typeof api;
