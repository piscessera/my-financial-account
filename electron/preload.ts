import { contextBridge, ipcRenderer } from 'electron';

import type { AttachmentRow, ExpenseMethod, TaxYearRow, TransactionRow } from '../src/main/db/schema';
import type { DataLocationInfo } from '../src/main/dataLocation';
import type { AuditEntry } from '../src/main/repositories/auditLog';
import type {
  CreateReversalInput,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../src/main/repositories/transactions';
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
  taxYears: {
    list: (): Promise<TaxYearRow[]> => ipcRenderer.invoke('taxYears:list'),
    create: (year: number): Promise<TaxYearRow> => ipcRenderer.invoke('taxYears:create', year),
    get: (id: number): Promise<TaxYearRow | undefined> => ipcRenderer.invoke('taxYears:get', id),
    setExpenseMethod: (
      id: number,
      expenseMethod: ExpenseMethod,
      lumpSumRateBp?: number | null,
    ): Promise<TaxYearRow> =>
      ipcRenderer.invoke('taxYears:setExpenseMethod', id, expenseMethod, lumpSumRateBp),
  },
  transactions: {
    create: (input: CreateTransactionInput): Promise<TransactionRow> =>
      ipcRenderer.invoke('transactions:create', input),
    update: (id: number, input: UpdateTransactionInput): Promise<TransactionRow> =>
      ipcRenderer.invoke('transactions:update', id, input),
    void: (id: number): Promise<TransactionRow> => ipcRenderer.invoke('transactions:void', id),
    createReversal: (originalId: number, input: CreateReversalInput): Promise<TransactionRow> =>
      ipcRenderer.invoke('transactions:createReversal', originalId, input),
    listByYear: (yearId: number): Promise<TransactionRow[]> =>
      ipcRenderer.invoke('transactions:listByYear', yearId),
    getHistory: (id: number): Promise<AuditEntry[]> => ipcRenderer.invoke('transactions:getHistory', id),
  },
  attachments: {
    /** No remove method — evidence is not deletable (matches the no-hard-delete stance, AC-7). */
    add: (transactionId: number, filePath: string): Promise<AttachmentRow> =>
      ipcRenderer.invoke('attachments:add', transactionId, filePath),
    list: (transactionId: number): Promise<AttachmentRow[]> =>
      ipcRenderer.invoke('attachments:list', transactionId),
    /** Opens a native "choose one file" dialog; resolves the chosen path, or `null` if cancelled. */
    chooseFile: (): Promise<string | null> => ipcRenderer.invoke('attachments:chooseFile'),
  },
} as const;

contextBridge.exposeInMainWorld('api', api);

export type PreloadApi = typeof api;
