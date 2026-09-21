/**
 * `recurring_templates` + `recurring_monthly_logs` repository (REQ-0005, ANA-0005).
 *
 * Manages recurring monthly general transaction templates and tracks per-month completion/skip status.
 */
import type BetterSqlite3 from 'better-sqlite3';

import type {
  GeneralCategory,
  IncomeSection,
  RecurringMonthlyLogRow,
  RecurringMonthlyStatus,
  RecurringTemplateRow,
  TransactionKind,
  TransactionRow,
  TransactionStatus,
} from '../db/schema';
import { recordMutation } from './auditLog';
import { createTransaction, voidTransaction } from './transactions';

export class RecurringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurringError';
  }
}

export interface CreateRecurringTemplateInput {
  readonly name: string;
  readonly kind: TransactionKind;
  readonly generalCategory: GeneralCategory;
  readonly dueDay: number;
  readonly defaultAmountMinor?: number | null;
  readonly defaultNote?: string;
  readonly sortOrder?: number;
}

export interface UpdateRecurringTemplateInput {
  readonly name?: string;
  readonly kind?: TransactionKind;
  readonly generalCategory?: GeneralCategory;
  readonly dueDay?: number;
  readonly defaultAmountMinor?: number | null;
  readonly defaultNote?: string;
  readonly sortOrder?: number;
}

export interface MonthlyChecklistItem {
  readonly template: RecurringTemplateRow;
  readonly status: 'pending' | 'completed' | 'skipped';
  readonly log: RecurringMonthlyLogRow | null;
  readonly transaction: TransactionRow | null;
}

export interface RecordRecurringInput {
  readonly templateId: number;
  readonly yearMonth: string;
  readonly taxYearId: number;
  readonly date: string;
  readonly amountMinor?: number;
  readonly note?: string;
}

interface RawTemplateRow {
  id: number;
  name: string;
  kind: TransactionKind;
  general_category: GeneralCategory;
  due_day: number;
  default_amount_minor: number | null;
  default_note: string;
  is_active: number;
  sort_order: number;
}

function toTemplateRow(raw: unknown): RecurringTemplateRow {
  const r = raw as RawTemplateRow;
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    generalCategory: r.general_category,
    dueDay: r.due_day,
    defaultAmountMinor: r.default_amount_minor,
    defaultNote: r.default_note,
    isActive: r.is_active === 1,
    sortOrder: r.sort_order,
  };
}

interface RawLogRow {
  id: number;
  template_id: number;
  year_month: string;
  status: RecurringMonthlyStatus;
  transaction_id: number | null;
  recorded_at: string;
}

function toLogRow(raw: unknown): RecurringMonthlyLogRow {
  const r = raw as RawLogRow;
  return {
    id: r.id,
    templateId: r.template_id,
    yearMonth: r.year_month,
    status: r.status,
    transactionId: r.transaction_id,
    recordedAt: r.recorded_at,
  };
}

function requireTemplate(sqlite: BetterSqlite3.Database, id: number): RecurringTemplateRow {
  const raw = sqlite.prepare(`SELECT * FROM recurring_templates WHERE id = ?`).get(id);
  if (!raw) throw new RecurringError(`recurring_templates row ${id} not found.`);
  return toTemplateRow(raw);
}

export function listTemplates(
  sqlite: BetterSqlite3.Database,
  includeInactive = false,
): RecurringTemplateRow[] {
  const sql = includeInactive
    ? `SELECT * FROM recurring_templates ORDER BY sort_order ASC, due_day ASC, id ASC`
    : `SELECT * FROM recurring_templates WHERE is_active = 1 ORDER BY sort_order ASC, due_day ASC, id ASC`;
  return sqlite.prepare(sql).all().map(toTemplateRow);
}

export function createTemplate(
  sqlite: BetterSqlite3.Database,
  input: CreateRecurringTemplateInput,
): RecurringTemplateRow {
  if (!input.name || input.name.trim().length === 0) {
    throw new RecurringError('Template name is required.');
  }
  if (!input.dueDay || input.dueDay < 1 || input.dueDay > 31) {
    throw new RecurringError('dueDay must be between 1 and 31.');
  }
  if (
    input.defaultAmountMinor != null &&
    (!Number.isSafeInteger(input.defaultAmountMinor) || input.defaultAmountMinor < 0)
  ) {
    throw new RecurringError('defaultAmountMinor must be a non-negative integer.');
  }

  const run = sqlite.transaction(() => {
    const info = sqlite
      .prepare(
        `INSERT INTO recurring_templates (name, kind, general_category, due_day, default_amount_minor, default_note, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name.trim(),
        input.kind,
        input.generalCategory,
        input.dueDay,
        input.defaultAmountMinor ?? null,
        input.defaultNote ?? '',
        input.sortOrder ?? 0,
      );
    const row = requireTemplate(sqlite, Number(info.lastInsertRowid));
    recordMutation(sqlite, {
      entityType: 'recurring_template',
      entityId: row.id,
      action: 'create',
      after: row as unknown as Record<string, unknown>,
    });
    return row;
  });
  return run();
}

export function updateTemplate(
  sqlite: BetterSqlite3.Database,
  id: number,
  input: UpdateRecurringTemplateInput,
): RecurringTemplateRow {
  const run = sqlite.transaction(() => {
    const before = requireTemplate(sqlite, id);
    const name = input.name !== undefined ? input.name.trim() : before.name;
    const kind = input.kind !== undefined ? input.kind : before.kind;
    const generalCategory =
      input.generalCategory !== undefined ? input.generalCategory : before.generalCategory;
    const dueDay = input.dueDay !== undefined ? input.dueDay : before.dueDay;
    const defaultAmountMinor =
      input.defaultAmountMinor !== undefined ? input.defaultAmountMinor : before.defaultAmountMinor;
    const defaultNote =
      input.defaultNote !== undefined ? input.defaultNote : before.defaultNote;
    const sortOrder = input.sortOrder !== undefined ? input.sortOrder : before.sortOrder;

    if (!name || name.length === 0) throw new RecurringError('Template name cannot be empty.');
    if (dueDay < 1 || dueDay > 31) throw new RecurringError('dueDay must be between 1 and 31.');
    if (
      defaultAmountMinor != null &&
      (!Number.isSafeInteger(defaultAmountMinor) || defaultAmountMinor < 0)
    ) {
      throw new RecurringError('defaultAmountMinor must be a non-negative integer.');
    }

    sqlite
      .prepare(
        `UPDATE recurring_templates
         SET name = ?, kind = ?, general_category = ?, due_day = ?, default_amount_minor = ?, default_note = ?, sort_order = ?
         WHERE id = ?`,
      )
      .run(name, kind, generalCategory, dueDay, defaultAmountMinor, defaultNote, sortOrder, id);

    const after = requireTemplate(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'recurring_template',
      entityId: id,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

export function setTemplateActive(
  sqlite: BetterSqlite3.Database,
  id: number,
  isActive: boolean,
): RecurringTemplateRow {
  const run = sqlite.transaction(() => {
    const before = requireTemplate(sqlite, id);
    sqlite.prepare(`UPDATE recurring_templates SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, id);
    const after = requireTemplate(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'recurring_template',
      entityId: id,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

export function deleteTemplate(sqlite: BetterSqlite3.Database, id: number): void {
  const run = sqlite.transaction(() => {
    const before = requireTemplate(sqlite, id);
    sqlite.prepare(`DELETE FROM recurring_templates WHERE id = ?`).run(id);
    recordMutation(sqlite, {
      entityType: 'recurring_template',
      entityId: id,
      action: 'delete',
      before: before as unknown as Record<string, unknown>,
    });
  });
  run();
}

export function getMonthlyChecklist(
  sqlite: BetterSqlite3.Database,
  yearMonth: string,
): MonthlyChecklistItem[] {
  const templates = listTemplates(sqlite, false);
  const logs = sqlite
    .prepare(`SELECT * FROM recurring_monthly_logs WHERE year_month = ?`)
    .all(yearMonth)
    .map(toLogRow);

  const logByTemplateId = new Map<number, RecurringMonthlyLogRow>();
  for (const log of logs) {
    logByTemplateId.set(log.templateId, log);
  }

  const transactionIds = logs
    .map((l) => l.transactionId)
    .filter((id): id is number => typeof id === 'number');
  const txMap = new Map<number, TransactionRow>();
  if (transactionIds.length > 0) {
    const placeholders = transactionIds.map(() => '?').join(',');
    const rawTxs = sqlite
      .prepare(`SELECT * FROM transactions WHERE id IN (${placeholders})`)
      .all(...transactionIds) as Record<string, unknown>[];
    for (const raw of rawTxs) {
      txMap.set(Number(raw.id), {
        id: Number(raw.id),
        taxYearId: Number(raw.tax_year_id),
        kind: raw.kind as TransactionKind,
        taxRelevant: raw.tax_relevant === 1,
        incomeSection: (raw.income_section as IncomeSection) ?? null,
        generalCategory: (raw.general_category as GeneralCategory) ?? null,
        date: String(raw.date),
        amountMinor: Number(raw.amount_minor),
        currency: (raw.currency as string) ?? 'THB',
        whtMinor: Number(raw.wht_minor),
        sourcePayer: (raw.source_payer as string) ?? null,
        payerTaxId: (raw.payer_tax_id as string) ?? null,
        note: (raw.note as string) ?? null,
        status: raw.status as TransactionStatus,
        reversalOfId: raw.reversal_of_id ? Number(raw.reversal_of_id) : null,
        source: (raw.source as any) ?? 'manual',
        createdAt: String(raw.created_at),
        updatedAt: String(raw.updated_at),
      });
    }
  }

  return templates.map((template) => {
    const log = logByTemplateId.get(template.id) ?? null;
    let status: 'pending' | 'completed' | 'skipped' = 'pending';
    if (log) {
      status = log.status;
    }
    const transaction = log?.transactionId ? txMap.get(log.transactionId) ?? null : null;
    return {
      template,
      status,
      log,
      transaction,
    };
  });
}

export function recordRecurringItem(
  sqlite: BetterSqlite3.Database,
  input: RecordRecurringInput,
): { log: RecurringMonthlyLogRow; transaction: TransactionRow } {
  const run = sqlite.transaction(() => {
    const template = requireTemplate(sqlite, input.templateId);
    const amountMinor =
      input.amountMinor !== undefined
        ? input.amountMinor
        : template.defaultAmountMinor ?? 0;

    const transaction = createTransaction(sqlite, {
      taxYearId: input.taxYearId,
      kind: template.kind,
      taxRelevant: false,
      generalCategory: template.generalCategory,
      date: input.date,
      amountMinor,
      note: input.note !== undefined ? input.note : (template.defaultNote || template.name),
    });

    sqlite
      .prepare(
        `INSERT INTO recurring_monthly_logs (template_id, year_month, status, transaction_id)
         VALUES (?, ?, 'completed', ?)
         ON CONFLICT (template_id, year_month)
         DO UPDATE SET status = 'completed', transaction_id = excluded.transaction_id, recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(template.id, input.yearMonth, transaction.id);

    const logRaw = sqlite
      .prepare(`SELECT * FROM recurring_monthly_logs WHERE template_id = ? AND year_month = ?`)
      .get(template.id, input.yearMonth);
    const log = toLogRow(logRaw);

    recordMutation(sqlite, {
      entityType: 'recurring_monthly_log',
      entityId: log.id,
      action: 'create',
      after: log as unknown as Record<string, unknown>,
    });

    return { log, transaction };
  });
  return run();
}

export function skipRecurringItem(
  sqlite: BetterSqlite3.Database,
  templateId: number,
  yearMonth: string,
): RecurringMonthlyLogRow {
  const run = sqlite.transaction(() => {
    requireTemplate(sqlite, templateId);
    sqlite
      .prepare(
        `INSERT INTO recurring_monthly_logs (template_id, year_month, status, transaction_id)
         VALUES (?, ?, 'skipped', NULL)
         ON CONFLICT (template_id, year_month)
         DO UPDATE SET status = 'skipped', transaction_id = NULL, recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(templateId, yearMonth);

    const logRaw = sqlite
      .prepare(`SELECT * FROM recurring_monthly_logs WHERE template_id = ? AND year_month = ?`)
      .get(templateId, yearMonth);
    const log = toLogRow(logRaw);

    recordMutation(sqlite, {
      entityType: 'recurring_monthly_log',
      entityId: log.id,
      action: 'update',
      after: log as unknown as Record<string, unknown>,
    });
    return log;
  });
  return run();
}

export function undoRecurringItem(
  sqlite: BetterSqlite3.Database,
  templateId: number,
  yearMonth: string,
): void {
  const run = sqlite.transaction(() => {
    const existingRaw = sqlite
      .prepare(`SELECT * FROM recurring_monthly_logs WHERE template_id = ? AND year_month = ?`)
      .get(templateId, yearMonth);
    if (!existingRaw) return;

    const log = toLogRow(existingRaw);
    if (log.transactionId) {
      try {
        voidTransaction(sqlite, log.transactionId);
      } catch {
        // If already voided or deleted, ignore
      }
    }

    sqlite
      .prepare(`DELETE FROM recurring_monthly_logs WHERE template_id = ? AND year_month = ?`)
      .run(templateId, yearMonth);

    recordMutation(sqlite, {
      entityType: 'recurring_monthly_log',
      entityId: log.id,
      action: 'delete',
      before: log as unknown as Record<string, unknown>,
    });
  });
  run();
}
