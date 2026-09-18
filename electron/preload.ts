import { contextBridge, ipcRenderer } from 'electron';

import type {
  AttachmentRow,
  DeductionCategoryRow,
  DeductionEntryRow,
  ExpenseMethod,
  SharedCapRow,
  TaxBracketRow,
  TaxYearRow,
  TransactionRow,
} from '../src/main/db/schema';
import type { ChangeFolderMode, ChangeFolderResult, DataLocationInfo } from '../src/main/dataLocation';
import type { AuditEntry } from '../src/main/repositories/auditLog';
import type {
  CreateCategoryInput,
  SetEntryInput,
  UpdateCategoryInput,
} from '../src/main/repositories/deductions';
import type { UpdateBracketBounds } from '../src/main/repositories/settings';
import type {
  CreateReversalInput,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../src/main/repositories/transactions';
import type { LockCheckResult } from '../src/main/lockFile';
import type { ComputeYearResult } from '../src/main/calc/computeYear';
import type {
  CommitImportInput,
  CommitImportResult,
  ParseForPreviewResult,
} from '../src/main/repositories/csv';

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
    /** REQ-0002 AC-4: does `targetFolderPath` already have a DB file? */
    targetHasExistingDb: (targetFolderPath: string): Promise<boolean> =>
      ipcRenderer.invoke('dataLocation:targetHasExistingDb', targetFolderPath),
    /** REQ-0002: re-points an already-configured install's data folder (move or switch). */
    changeFolder: (targetFolderPath: string, mode: ChangeFolderMode): Promise<ChangeFolderResult> =>
      ipcRenderer.invoke('dataLocation:changeFolder', targetFolderPath, mode),
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
    /** Computes + freezes the year's result (AC-7b); rejects further edits (INV-2b). */
    close: (id: number): Promise<TaxYearRow> => ipcRenderer.invoke('taxYears:close', id),
    /** Clears `closedAt`; keeps the frozen snapshot until the year is closed again. */
    reopen: (id: number): Promise<TaxYearRow> => ipcRenderer.invoke('taxYears:reopen', id),
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
  deductions: {
    /** Active categories only — the Deductions screen's "add an entry" picker (AC-17). */
    listCategories: (): Promise<DeductionCategoryRow[]> => ipcRenderer.invoke('deductions:listCategories'),
    setEntry: (input: SetEntryInput): Promise<DeductionEntryRow> =>
      ipcRenderer.invoke('deductions:setEntry', input),
    listEntries: (taxYearId: number): Promise<DeductionEntryRow[]> =>
      ipcRenderer.invoke('deductions:listEntries', taxYearId),
  },
  settings: {
    /** Every category, including archived ones (Settings can reactivate them, AC-17). */
    getCaps: (): Promise<DeductionCategoryRow[]> => ipcRenderer.invoke('settings:getCaps'),
    createCategory: (input: CreateCategoryInput): Promise<DeductionCategoryRow> =>
      ipcRenderer.invoke('settings:createCategory', input),
    updateCategory: (categoryId: number, input: UpdateCategoryInput): Promise<DeductionCategoryRow> =>
      ipcRenderer.invoke('settings:updateCategory', categoryId, input),
    setCategoryActive: (id: number, isActive: boolean): Promise<DeductionCategoryRow> =>
      ipcRenderer.invoke('settings:setCategoryActive', id, isActive),
    getSharedCaps: (): Promise<SharedCapRow[]> => ipcRenderer.invoke('settings:getSharedCaps'),
    updateSharedCap: (id: number, newCapAmountMinor: number): Promise<SharedCapRow> =>
      ipcRenderer.invoke('settings:updateSharedCap', id, newCapAmountMinor),
    getBrackets: (): Promise<TaxBracketRow[]> => ipcRenderer.invoke('settings:getBrackets'),
    updateBracket: (id: number, rateBp: number, bounds?: UpdateBracketBounds): Promise<TaxBracketRow> =>
      ipcRenderer.invoke('settings:updateBracket', id, rateBp, bounds),
  },
  calc: {
    /** Frozen snapshot for a closed year; a live recompute for an open one (INV-7, AT-4.4). */
    computeYear: (yearId: number): Promise<ComputeYearResult> => ipcRenderer.invoke('calc:computeYear', yearId),
  },
  csv: {
    exportLedger: (yearId: number, destPath: string): Promise<void> =>
      ipcRenderer.invoke('csv:exportLedger', yearId, destPath),
    exportSummary: (yearId: number, destPath: string): Promise<void> =>
      ipcRenderer.invoke('csv:exportSummary', yearId, destPath),
    /** No write — step 1 of the three-step import flow (AC-22/23). */
    parseForPreview: (filePath: string, targetYear: number): Promise<ParseForPreviewResult> =>
      ipcRenderer.invoke('csv:parseForPreview', filePath, targetYear),
    /** Inserts only the confirmed subset — step 3 of the import flow (AC-24). */
    commitImport: (input: CommitImportInput): Promise<CommitImportResult> =>
      ipcRenderer.invoke('csv:commitImport', input),
    /** Native save dialog; resolves the chosen path, or `null` if cancelled. */
    chooseSavePath: (defaultFilename: string): Promise<string | null> =>
      ipcRenderer.invoke('csv:chooseSavePath', defaultFilename),
    /** Native open dialog restricted to `.csv`; resolves the chosen path, or `null` if cancelled. */
    chooseImportFile: (): Promise<string | null> => ipcRenderer.invoke('csv:chooseImportFile'),
  },
} as const;

contextBridge.exposeInMainWorld('api', api);

export type PreloadApi = typeof api;
