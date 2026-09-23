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
  getDeductionSummary,
  getSourceTransactions,
  listCategories,
  listEntries,
  setCategoryActive,
  setEntry,
  updateCategory,
  type CreateCategoryInput,
  type DeductionSummaryResult,
  type SetEntryInput,
  type UpdateCategoryInput,
} from '../repositories/deductions';
import {
  addTaxBracket,
  deleteTaxBracket,
  getBrackets,
  getSharedCaps,
  resetTaxBracketsToDefault,
  updateBracket,
  updateSharedCap,
  type NewTaxBracketInput,
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
import {
  close,
  createTaxYear,
  getTaxYear,
  getYearResult,
  listTaxYears,
  reopen,
  setExpenseMethod,
  type CloseTaxYearInput,
} from '../repositories/taxYears';
import {
  commitImport,
  exportLedger,
  exportSummary,
  parseForPreview,
  type CommitImportInput,
  type CommitImportResult,
  type ParseForPreviewResult,
} from '../repositories/csv';
import {
  createTemplate,
  deleteTemplate,
  getMonthlyChecklist,
  listTemplates,
  recordRecurringItem,
  setTemplateActive as setRecurringTemplateActive,
  skipRecurringItem,
  undoRecurringItem,
  updateTemplate,
  type CreateRecurringTemplateInput,
  type MonthlyChecklistItem,
  type RecordRecurringInput,
  type UpdateRecurringTemplateInput,
} from '../repositories/recurring';
import type { ComputeYearResult } from '../calc/computeYear';
import type {
  DeductionCategoryRow,
  DeductionEntryRow,
  ExpenseMethod,
  RecurringMonthlyLogRow,
  RecurringTemplateRow,
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
 * Assembles a `CloseTaxYearInput` (everything `taxYears.close()`/`getYearResult()` need beyond
 * the DB connection) by calling the other repositories — the cross-cutting orchestration that
 * `taxYears.ts` deliberately doesn't do itself (AT-4.3's note on avoiding a circular import
 * with `transactions.ts`). Shared by `taxYears:close` and `calc:computeYear`.
 */
function gatherYearInputs(sqlite: BetterSqlite3.Database, yearId: number): CloseTaxYearInput {
  return {
    transactions: listByYear(sqlite, yearId),
    deductionCategories: listCategories(sqlite, yearId),
    deductionEntries: listEntries(sqlite, yearId),
    sharedCaps: getSharedCaps(sqlite, yearId),
    brackets: getBrackets(sqlite, yearId),
  };
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
    'taxYears:close': (id: number): TaxYearRow =>
      close(ctx.getSqlite(), id, gatherYearInputs(ctx.getSqlite(), id)).taxYear,
    'taxYears:reopen': (id: number): TaxYearRow => reopen(ctx.getSqlite(), id),

    'transactions:create': (input: CreateTransactionInput): TransactionRow =>
      createTransaction(ctx.getSqlite(), input),
    'transactions:update': (id: number, input: UpdateTransactionInput): TransactionRow =>
      updateTransaction(ctx.getSqlite(), id, input),
    'transactions:void': (id: number): TransactionRow => voidTransaction(ctx.getSqlite(), id),
    'transactions:createReversal': (
      originalId: number,
      input: CreateReversalInput,
    ): TransactionRow => createReversal(ctx.getSqlite(), originalId, input),
    'transactions:listByYear': (yearId: number): TransactionRow[] =>
      listByYear(ctx.getSqlite(), yearId),
    'transactions:getHistory': (id: number): AuditEntry[] =>
      getTransactionHistory(ctx.getSqlite(), id),

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
    'deductions:listCategories': (taxYearId?: number | null): DeductionCategoryRow[] =>
      listCategories(ctx.getSqlite(), taxYearId).filter((c) => c.isActive),
    'deductions:setEntry': (input: SetEntryInput): DeductionEntryRow =>
      setEntry(ctx.getSqlite(), input),
    'deductions:listEntries': (taxYearId: number): DeductionEntryRow[] =>
      listEntries(ctx.getSqlite(), taxYearId),
    'deductions:getSummary': (taxYearId: number): DeductionSummaryResult =>
      getDeductionSummary(ctx.getSqlite(), taxYearId),
    'deductions:getSourceTransactions': (taxYearId: number, categoryId: number): TransactionRow[] =>
      getSourceTransactions(ctx.getSqlite(), taxYearId, categoryId),

    // `settings` (ANA-0001 §API/backend changes): the management surface — every category
    // (including archived, so Settings can reactivate one), plus create/archive/rename and
    // the shared-cap/bracket editors.
    'settings:getCaps': (taxYearId?: number | null): DeductionCategoryRow[] =>
      listCategories(ctx.getSqlite(), taxYearId),
    'settings:createCategory': (input: CreateCategoryInput): DeductionCategoryRow =>
      createCategory(ctx.getSqlite(), input),
    'settings:updateCategory': (
      categoryId: number,
      input: UpdateCategoryInput,
    ): DeductionCategoryRow => updateCategory(ctx.getSqlite(), categoryId, input),
    'settings:setCategoryActive': (id: number, isActive: boolean): DeductionCategoryRow =>
      setCategoryActive(ctx.getSqlite(), id, isActive),
    'settings:getSharedCaps': (taxYearId?: number | null): SharedCapRow[] =>
      getSharedCaps(ctx.getSqlite(), taxYearId),
    'settings:updateSharedCap': (id: number, newCapAmountMinor: number): SharedCapRow =>
      updateSharedCap(ctx.getSqlite(), id, newCapAmountMinor),
    'settings:getBrackets': (taxYearId?: number | null): TaxBracketRow[] =>
      getBrackets(ctx.getSqlite(), taxYearId),
    'settings:updateBracket': (
      id: number,
      rateBp: number,
      bounds?: UpdateBracketBounds,
    ): TaxBracketRow => updateBracket(ctx.getSqlite(), id, rateBp, bounds),
    'settings:addBracket': (input: NewTaxBracketInput): TaxBracketRow =>
      addTaxBracket(ctx.getSqlite(), input),
    'settings:deleteBracket': (id: number): void =>
      deleteTaxBracket(ctx.getSqlite(), id),
    'settings:resetBrackets': (taxYearId?: number | null): TaxBracketRow[] =>
      resetTaxBracketsToDefault(ctx.getSqlite(), taxYearId),

    // `calc` (ANA-0001 §API/backend changes): the single figure-producing call every screen
    // (Dashboard live, Summary, unit tests) uses. Always goes through `getYearResult` (AT-4.4)
    // so a closed year serves its frozen snapshot rather than ever being live-recomputed here.
    'calc:computeYear': (yearId: number): ComputeYearResult => {
      const sqlite = ctx.getSqlite();
      const taxYear = getTaxYear(sqlite, yearId);
      if (!taxYear) throw new Error(`tax_years row ${yearId} not found.`);
      return getYearResult(taxYear, gatherYearInputs(sqlite, yearId));
    },

    // `csv` (ANA-0001 §API/backend changes): export is read-only; import is the three-step
    // parse-preview-then-commit flow, never a direct write.
    'csv:exportLedger': (yearId: number, destPath: string): void =>
      exportLedger(ctx.getSqlite(), yearId, destPath),
    'csv:exportSummary': (yearId: number, destPath: string): void => {
      const sqlite = ctx.getSqlite();
      const taxYear = getTaxYear(sqlite, yearId);
      if (!taxYear) throw new Error(`tax_years row ${yearId} not found.`);
      const result = getYearResult(taxYear, gatherYearInputs(sqlite, yearId));
      exportSummary(destPath, taxYear.year, result);
    },
    'csv:parseForPreview': (filePath: string, targetYear: number): ParseForPreviewResult =>
      parseForPreview(ctx.getSqlite(), filePath, targetYear),
    'csv:commitImport': (input: CommitImportInput): CommitImportResult =>
      commitImport(ctx.getSqlite(), input),

    // `recurring` (REQ-0005, ANA-0005): Template management & monthly checklist operations
    'recurring:listTemplates': (includeInactive?: boolean): RecurringTemplateRow[] =>
      listTemplates(ctx.getSqlite(), includeInactive),
    'recurring:createTemplate': (input: CreateRecurringTemplateInput): RecurringTemplateRow =>
      createTemplate(ctx.getSqlite(), input),
    'recurring:updateTemplate': (
      id: number,
      input: UpdateRecurringTemplateInput,
    ): RecurringTemplateRow => updateTemplate(ctx.getSqlite(), id, input),
    'recurring:setTemplateActive': (id: number, isActive: boolean): RecurringTemplateRow =>
      setRecurringTemplateActive(ctx.getSqlite(), id, isActive),
    'recurring:deleteTemplate': (id: number): void => deleteTemplate(ctx.getSqlite(), id),
    'recurring:getMonthlyChecklist': (yearMonth: string): MonthlyChecklistItem[] =>
      getMonthlyChecklist(ctx.getSqlite(), yearMonth),
    'recurring:record': (
      input: RecordRecurringInput,
    ): { log: RecurringMonthlyLogRow; transaction: TransactionRow } =>
      recordRecurringItem(ctx.getSqlite(), input),
    'recurring:skip': (templateId: number, yearMonth: string): RecurringMonthlyLogRow =>
      skipRecurringItem(ctx.getSqlite(), templateId, yearMonth),
    'recurring:undo': (templateId: number, yearMonth: string): void =>
      undoRecurringItem(ctx.getSqlite(), templateId, yearMonth),
  } as const;
}

export type DomainIpcHandlers = ReturnType<typeof createDomainIpcHandlers>;
export type DomainIpcChannel = keyof DomainIpcHandlers;
