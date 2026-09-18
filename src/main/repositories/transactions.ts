/**
 * `transactions` repository (AT-2.2).
 *
 * Scope for this task: `create`/`void`, covering both transaction shapes —
 * tax-relevant (`income_section` required iff `kind='income'`) and general
 * (`general_category` required, no income section/WHT) — per ANA-0001 §Data model and
 * §Repository API. `update`/`createReversal`/`getHistory` land in AT-2.3.
 *
 * Per ANA-0001's repository API list, `create` is **not** rejected on a closed year (only
 * `update` is — AT-2.3, INV-2b); `void` likewise carries no closed-year restriction in that
 * list. This mirrors the design contract literally rather than inventing an extra rule.
 *
 * `void` is the "no hard delete" path (TC-0001 #17): it sets `status='voided'`, never removes
 * the row, so it stays visible in the ledger/history.
 *
 * Follows `auditLog.ts`/`taxYears.ts`'s conventions: raw connection, cached prepared
 * statements, caller-owned `sqlite.transaction()` wrapping the row write + `recordMutation`
 * (INV-2/INV-4).
 */
import type BetterSqlite3 from 'better-sqlite3';

import type {
  GeneralCategory,
  IncomeSection,
  TransactionKind,
  TransactionRow,
  TransactionSource,
} from '../db/schema';
import { recordMutation } from './auditLog';

/** Thrown when a caller hands this repository invalid input. */
export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

export interface CreateTransactionInput {
  readonly taxYearId: number;
  readonly kind: TransactionKind;
  /** Defaults to `true` (tax-relevant). */
  readonly taxRelevant?: boolean;
  /** Required iff `taxRelevant && kind === 'income'`; must be omitted otherwise. */
  readonly incomeSection?: IncomeSection | null;
  /** Required iff `taxRelevant === false`; must be omitted for a tax-relevant row. */
  readonly generalCategory?: GeneralCategory | null;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** Integer satang, non-zero (INV-1). */
  readonly amountMinor: number;
  /** Integer satang, `>= 0`. Defaults to 0; only meaningful for tax-relevant income. */
  readonly whtMinor?: number;
  readonly sourcePayer?: string | null;
  /** 13-digit Thai tax ID; not validated/required — not every payer provides one. */
  readonly payerTaxId?: string | null;
  readonly note?: string | null;
  /** Defaults to `'manual'`; the CSV import path (AT-5.4) passes `'import'`. */
  readonly source?: TransactionSource;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertCreateInput(input: CreateTransactionInput): void {
  const taxRelevant = input.taxRelevant ?? true;

  if (!Number.isSafeInteger(input.taxYearId)) {
    throw new TransactionError(`taxYearId must be an integer, got ${String(input.taxYearId)}.`);
  }
  if (input.kind !== 'income' && input.kind !== 'expense') {
    throw new TransactionError(`kind must be "income" or "expense", got ${String(input.kind)}.`);
  }
  if (typeof input.date !== 'string' || !DATE_RE.test(input.date)) {
    throw new TransactionError(`date must be "YYYY-MM-DD", got ${String(input.date)}.`);
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor === 0) {
    throw new TransactionError(
      `amountMinor must be a non-zero integer (satang), got ${String(input.amountMinor)}.`,
    );
  }
  const whtMinor = input.whtMinor ?? 0;
  if (!Number.isSafeInteger(whtMinor) || whtMinor < 0) {
    throw new TransactionError(`whtMinor must be an integer >= 0, got ${String(whtMinor)}.`);
  }

  // Mirrors the three `transactions_*` CHECK constraints exactly (001-initial-schema.ts),
  // so a bad call gets a TransactionError, not an opaque SQLite CHECK failure.
  if (taxRelevant) {
    if (input.generalCategory != null) {
      throw new TransactionError('generalCategory must be omitted for a tax-relevant transaction.');
    }
    if (input.kind === 'income' && input.incomeSection == null) {
      throw new TransactionError('incomeSection is required for a tax-relevant income transaction.');
    }
  } else {
    if (input.generalCategory == null) {
      throw new TransactionError('generalCategory is required for a general (non-tax) transaction.');
    }
    if (input.incomeSection != null) {
      throw new TransactionError('incomeSection must be omitted for a general (non-tax) transaction.');
    }
  }
}

interface Statements {
  readonly insert: BetterSqlite3.Statement;
  readonly selectById: BetterSqlite3.Statement;
  readonly updateStatus: BetterSqlite3.Statement;
}

const statementCache = new WeakMap<BetterSqlite3.Database, Statements>();

const INSERT_COLUMNS = [
  'tax_year_id',
  'kind',
  'tax_relevant',
  'income_section',
  'general_category',
  'date',
  'amount_minor',
  'wht_minor',
  'source_payer',
  'payer_tax_id',
  'note',
  'source',
].join(', ');

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    insert: sqlite.prepare(
      `INSERT INTO transactions (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    selectById: sqlite.prepare(`SELECT * FROM transactions WHERE id = ?`),
    updateStatus: sqlite.prepare(
      `UPDATE transactions
       SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ),
  };
  statementCache.set(sqlite, statements);
  return statements;
}

interface RawTransactionRow {
  id: number;
  tax_year_id: number;
  kind: TransactionKind;
  tax_relevant: number;
  income_section: IncomeSection | null;
  general_category: GeneralCategory | null;
  date: string;
  amount_minor: number;
  currency: string;
  wht_minor: number;
  source_payer: string | null;
  payer_tax_id: string | null;
  note: string | null;
  status: 'active' | 'voided';
  reversal_of_id: number | null;
  source: TransactionSource;
  created_at: string;
  updated_at: string;
}

function toTransactionRow(raw: unknown): TransactionRow {
  const row = raw as RawTransactionRow;
  return {
    id: row.id,
    taxYearId: row.tax_year_id,
    kind: row.kind,
    taxRelevant: row.tax_relevant === 1,
    incomeSection: row.income_section,
    generalCategory: row.general_category,
    date: row.date,
    amountMinor: row.amount_minor,
    currency: row.currency,
    whtMinor: row.wht_minor,
    sourcePayer: row.source_payer,
    payerTaxId: row.payer_tax_id,
    note: row.note,
    status: row.status,
    reversalOfId: row.reversal_of_id,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireRow(sqlite: BetterSqlite3.Database, id: number): TransactionRow {
  const raw = statementsFor(sqlite).selectById.get(id);
  if (raw === undefined) throw new TransactionError(`transactions row ${id} not found.`);
  return toTransactionRow(raw);
}

/** Create a transaction (tax-relevant or general shape) as `active`. Audit-logs as `create` (INV-4). */
export function createTransaction(sqlite: BetterSqlite3.Database, input: CreateTransactionInput): TransactionRow {
  assertCreateInput(input);
  const taxRelevant = input.taxRelevant ?? true;

  const run = sqlite.transaction(() => {
    const info = statementsFor(sqlite).insert.run(
      input.taxYearId,
      input.kind,
      taxRelevant ? 1 : 0,
      input.incomeSection ?? null,
      input.generalCategory ?? null,
      input.date,
      input.amountMinor,
      input.whtMinor ?? 0,
      input.sourcePayer ?? null,
      input.payerTaxId ?? null,
      input.note ?? null,
      input.source ?? 'manual',
    );
    const row = requireRow(sqlite, Number(info.lastInsertRowid));
    recordMutation(sqlite, {
      entityType: 'transaction',
      entityId: row.id,
      action: 'create',
      after: row as unknown as Record<string, unknown>,
    });
    return row;
  });
  return run();
}

/**
 * Void a transaction: sets `status='voided'`, preserving the row and its history — there is
 * no hard-delete path (TC-0001 #17). Audit-logs as `void` (INV-4).
 */
export function voidTransaction(sqlite: BetterSqlite3.Database, id: number): TransactionRow {
  const run = sqlite.transaction(() => {
    const before = requireRow(sqlite, id);
    if (before.status === 'voided') {
      throw new TransactionError(`transactions row ${id} is already voided.`);
    }
    statementsFor(sqlite).updateStatus.run('voided', id);
    const after = requireRow(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'transaction',
      entityId: id,
      action: 'void',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

/** One transaction by id, or `undefined` if it doesn't exist. */
export function getTransaction(sqlite: BetterSqlite3.Database, id: number): TransactionRow | undefined {
  const raw = statementsFor(sqlite).selectById.get(id);
  return raw === undefined ? undefined : toTransactionRow(raw);
}
