/**
 * Domain IPC handlers (AT-2.5) — `taxYears`/`transactions`/`attachments`, per ANA-0001
 * §API/backend changes.
 *
 * Deliberately has **no `electron` import**: requiring `electron` outside an actual Electron
 * process (e.g. under Vitest) doesn't give you `ipcMain`, so a module that imports it can't be
 * unit-tested the way `dataLocation.ts`/`lockFile.ts` are. Instead this exports a plain object
 * of channel → handler functions; `electron/main.ts` is the only place that knows about
 * `ipcMain` and just loops `ipcMain.handle(channel, handler)` over it. That keeps the actual
 * business-logic wiring (argument shape → repository call) testable here, while the one line
 * that touches Electron's API stays in `main.ts`, manually/structurally verified the same way
 * AT-1.6/AT-1.8's handlers are (no display server in this sandbox).
 */
import { extname } from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import type { AttachmentRow } from '../db/schema';
import { addAttachment, listAttachments } from '../repositories/attachments';
import type { AuditEntry } from '../repositories/auditLog';
import {
  createCategory,
  listCategories,
  listEntries,
  setCategoryActive,
  setEntry,
  updateCategory,
  type CreateCategoryInput,
  type SetEntryInput,
  type UpdateCategoryInput,
} from '../repositories/deductions';
import {
  getBrackets,
  getSharedCaps,
  updateBracket,
  updateSharedCap,
  type UpdateBracketBounds,
} from '../repositories/settings';
import {
  createReversal,
  createTransaction,
  getTransactionHistory,
  listByYear,
  updateTransaction,
  voidTransaction,
  type CreateReversalInput,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from '../repositories/transactions';
import { createTaxYear, getTaxYear, listTaxYears, setExpenseMethod } from '../repositories/taxYears';
import type {
  DeductionCategoryRow,
  DeductionEntryRow,
  ExpenseMethod,
  SharedCapRow,
  TaxBracketRow,
  TaxYearRow,
  TransactionRow,
} from '../db/schema';

/** What every handler needs from the app: the live DB connection and the data folder path. */
export interface DomainIpcContext {
  readonly getSqlite: () => BetterSqlite3.Database;
  readonly getDataFolderPath: () => string;
}

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
};

/** Best-effort mime type from a file's extension; ANA-0001's `attachments.add(id, filePath)` IPC signature carries no mime type of its own. */
function guessMimeType(filePath: string): string {
  return MIME_TYPES_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Channel → handler map. Each function's signature is `(...args) => result`, matching how
 * `ipcMain.handle(channel, (event, ...args) => ...)` is called minus the `event` parameter —
 * `main.ts` drops `event` before forwarding into these.
 */
export function createDomainIpcHandlers(ctx: DomainIpcContext) {
  return {
    'taxYears:list': (): TaxYearRow[] => listTaxYears(ctx.getSqlite()),
    'taxYears:create': (year: number): TaxYearRow => createTaxYear(ctx.getSqlite(), { year }),
    'taxYears:get': (id: number): TaxYearRow | undefined => getTaxYear(ctx.getSqlite(), id),
    'taxYears:setExpenseMethod': (
      id: number,
      expenseMethod: ExpenseMethod,
      lumpSumRateBp?: number | null,
    ): TaxYearRow => setExpenseMethod(ctx.getSqlite(), { id, expenseMethod, lumpSumRateBp }),

    'transactions:create': (input: CreateTransactionInput): TransactionRow =>
      createTransaction(ctx.getSqlite(), input),
    'transactions:update': (id: number, input: UpdateTransactionInput): TransactionRow =>
      updateTransaction(ctx.getSqlite(), id, input),
    'transactions:void': (id: number): TransactionRow => voidTransaction(ctx.getSqlite(), id),
    'transactions:createReversal': (originalId: number, input: CreateReversalInput): TransactionRow =>
      createReversal(ctx.getSqlite(), originalId, input),
    'transactions:listByYear': (yearId: number): TransactionRow[] => listByYear(ctx.getSqlite(), yearId),
    'transactions:getHistory': (id: number): AuditEntry[] => getTransactionHistory(ctx.getSqlite(), id),

    'attachments:add': (transactionId: number, filePath: string): AttachmentRow =>
      addAttachment(ctx.getSqlite(), ctx.getDataFolderPath(), {
        transactionId,
        sourceFilePath: filePath,
        mimeType: guessMimeType(filePath),
      }),
    'attachments:list': (transactionId: number): AttachmentRow[] =>
      listAttachments(ctx.getSqlite(), transactionId),

    // `deductions` (ANA-0001 §API/backend changes): the entry-time surface — only active
    // categories (AC-17: archived ones don't appear as an option to add), plus setEntry.
    'deductions:listCategories': (): DeductionCategoryRow[] =>
      listCategories(ctx.getSqlite()).filter((c) => c.isActive),
    'deductions:setEntry': (input: SetEntryInput): DeductionEntryRow => setEntry(ctx.getSqlite(), input),
    'deductions:listEntries': (taxYearId: number): DeductionEntryRow[] =>
      listEntries(ctx.getSqlite(), taxYearId),

    // `settings` (ANA-0001 §API/backend changes): the management surface — every category
    // (including archived, so Settings can reactivate one), plus create/archive/rename and
    // the shared-cap/bracket editors.
    'settings:getCaps': (): DeductionCategoryRow[] => listCategories(ctx.getSqlite()),
    'settings:createCategory': (input: CreateCategoryInput): DeductionCategoryRow =>
      createCategory(ctx.getSqlite(), input),
    'settings:updateCategory': (categoryId: number, input: UpdateCategoryInput): DeductionCategoryRow =>
      updateCategory(ctx.getSqlite(), categoryId, input),
    'settings:setCategoryActive': (id: number, isActive: boolean): DeductionCategoryRow =>
      setCategoryActive(ctx.getSqlite(), id, isActive),
    'settings:getSharedCaps': (): SharedCapRow[] => getSharedCaps(ctx.getSqlite()),
    'settings:updateSharedCap': (id: number, newCapAmountMinor: number): SharedCapRow =>
      updateSharedCap(ctx.getSqlite(), id, newCapAmountMinor),
    'settings:getBrackets': (): TaxBracketRow[] => getBrackets(ctx.getSqlite()),
    'settings:updateBracket': (id: number, rateBp: number, bounds?: UpdateBracketBounds): TaxBracketRow =>
      updateBracket(ctx.getSqlite(), id, rateBp, bounds),
  } as const;
}

export type DomainIpcHandlers = ReturnType<typeof createDomainIpcHandlers>;
export type DomainIpcChannel = keyof DomainIpcHandlers;
