/**
 * `transactions` repository (AT-2.2, AT-2.3).
 *
 * `create`/`void` cover both transaction shapes — tax-relevant (`income_section` required iff
 * `kind='income'`) and general (`general_category` required, no income section/WHT) — per
 * ANA-0001 §Data model and §Repository API. `update`/`createReversal`/`getHistory` are AT-2.3.
 *
 * Per ANA-0001's repository API list, `create` is **not** rejected on a closed year (only
 * `update` is — INV-2b, TC-0001 #18); `void` likewise carries no closed-year restriction in
 * that list. This mirrors the design contract literally rather than inventing an extra rule —
 * it's also what makes a closed year's correction path work: `createReversal` records the
 * negation, and a fresh corrected entry (if needed) goes through ordinary `create`.
 *
 * `void` is the "no hard delete" path (TC-0001 #17): it sets `status='voided'`, never removes
 * the row, so it stays visible in the ledger/history.
 *
 * **Reversal sign convention (PL-0009):** `createReversal` copies the original row's shape
 * (kind/taxRelevant/incomeSection/generalCategory/sourcePayer/payerTaxId) and negates its
 * `amountMinor` — summing a kind's amounts then nets the reversed pair to zero, which is what
 * `calc.computeYear()` (AT-4.2) will do. `amount_minor`'s CHECK only requires non-zero, so a
 * negative value is already representable; `wht_minor`'s CHECK requires `>= 0`, so a reversal
 * cannot itself carry a negative WHT correction — the reversal always records `whtMinor: 0`.
 * A WHT correction, if ever needed, is a fresh `create`, not something `createReversal`
 * attempts to express; this is a deliberate scope decision, not an oversight.
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
import { listEntityHistory, recordMutation, type AuditEntry } from './auditLog';
import { getTaxYear } from './taxYears';

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
  readonly insertReversal: BetterSqlite3.Statement;
  readonly selectById: BetterSqlite3.Statement;
  readonly selectByTaxYear: BetterSqlite3.Statement;
  readonly updateStatus: BetterSqlite3.Statement;
  readonly updateFields: BetterSqlite3.Statement;
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
    insertReversal: sqlite.prepare(
      `INSERT INTO transactions (${INSERT_COLUMNS}, reversal_of_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    selectById: sqlite.prepare(`SELECT * FROM transactions WHERE id = ?`),
    selectByTaxYear: sqlite.prepare(
      `SELECT * FROM transactions WHERE tax_year_id = ? ORDER BY date ASC, id ASC`,
    ),
    updateStatus: sqlite.prepare(
      `UPDATE transactions
       SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ),
    updateFields: sqlite.prepare(
      `UPDATE transactions
       SET income_section = ?, general_category = ?, date = ?, amount_minor = ?, wht_minor = ?,
           source_payer = ?, payer_tax_id = ?, note = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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

/** Every transaction (active, voided, and reversal rows alike) for one tax year, date-ordered. */
export function listByYear(sqlite: BetterSqlite3.Database, taxYearId: number): TransactionRow[] {
  return statementsFor(sqlite)
    .selectByTaxYear.all(taxYearId)
    .map(toTransactionRow);
}

function requireOpenTaxYear(sqlite: BetterSqlite3.Database, taxYearId: number, action: string): void {
  const taxYear = getTaxYear(sqlite, taxYearId);
  if (taxYear === undefined) throw new TransactionError(`tax_years row ${taxYearId} not found.`);
  if (taxYear.status === 'closed') {
    throw new TransactionError(`Cannot ${action} a transaction in a closed tax year (INV-2b).`);
  }
}

export interface UpdateTransactionInput {
  readonly date?: string;
  /** Non-zero integer satang. */
  readonly amountMinor?: number;
  readonly whtMinor?: number;
  readonly sourcePayer?: string | null;
  readonly payerTaxId?: string | null;
  readonly note?: string | null;
  readonly incomeSection?: IncomeSection | null;
  readonly generalCategory?: GeneralCategory | null;
}

/**
 * Edit an existing transaction's field values (never `kind`/`taxRelevant`/`taxYearId`, which
 * define its shape). Rejected when its tax year is `closed` (INV-2b, TC-0001 #18) — the only
 * correction for a closed year is `createReversal`. Audit-logs as `update` (INV-2/INV-4).
 */
export function updateTransaction(
  sqlite: BetterSqlite3.Database,
  id: number,
  input: UpdateTransactionInput,
): TransactionRow {
  const run = sqlite.transaction(() => {
    const before = requireRow(sqlite, id);
    requireOpenTaxYear(sqlite, before.taxYearId, 'edit');

    const merged = {
      incomeSection: input.incomeSection !== undefined ? input.incomeSection : before.incomeSection,
      generalCategory:
        input.generalCategory !== undefined ? input.generalCategory : before.generalCategory,
      date: input.date ?? before.date,
      amountMinor: input.amountMinor ?? before.amountMinor,
      whtMinor: input.whtMinor ?? before.whtMinor,
      sourcePayer: input.sourcePayer !== undefined ? input.sourcePayer : before.sourcePayer,
      payerTaxId: input.payerTaxId !== undefined ? input.payerTaxId : before.payerTaxId,
      note: input.note !== undefined ? input.note : before.note,
    };

    assertCreateInput({
      taxYearId: before.taxYearId,
      kind: before.kind,
      taxRelevant: before.taxRelevant,
      incomeSection: merged.incomeSection,
      generalCategory: merged.generalCategory,
      date: merged.date,
      amountMinor: merged.amountMinor,
      whtMinor: merged.whtMinor,
    });

    statementsFor(sqlite).updateFields.run(
      merged.incomeSection,
      merged.generalCategory,
      merged.date,
      merged.amountMinor,
      merged.whtMinor,
      merged.sourcePayer,
      merged.payerTaxId,
      merged.note,
      id,
    );
    const after = requireRow(sqlite, id);
    recordMutation(sqlite, {
      entityType: 'transaction',
      entityId: id,
      action: 'update',
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  });
  return run();
}

export interface CreateReversalInput {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** Defaults to `Reversal of transaction #<originalId>`. */
  readonly note?: string | null;
}

/**
 * Create a reversal of `originalId`: a new transaction with `reversalOfId` set, copying the
 * original's shape (kind/taxRelevant/incomeSection/generalCategory/sourcePayer/payerTaxId) and
 * negating its `amountMinor` (see the module header's sign-convention note, PL-0009). Only
 * allowed when the original's tax year is `closed` — that's the whole point of a reversal
 * (INV-2b, TC-0001 #19); an open year's transaction is corrected with `updateTransaction`
 * instead. Both the original and the reversal remain visible. Audit-logs as `reverse` (INV-4).
 */
export function createReversal(
  sqlite: BetterSqlite3.Database,
  originalId: number,
  input: CreateReversalInput,
): TransactionRow {
  const run = sqlite.transaction(() => {
    const original = requireRow(sqlite, originalId);
    const taxYear = getTaxYear(sqlite, original.taxYearId);
    if (taxYear === undefined) {
      throw new TransactionError(`tax_years row ${original.taxYearId} not found.`);
    }
    if (taxYear.status !== 'closed') {
      throw new TransactionError(
        `createReversal is only allowed for a transaction in a closed tax year (row ${originalId} is in an open year).`,
      );
    }
    if (typeof input.date !== 'string' || !DATE_RE.test(input.date)) {
      throw new TransactionError(`date must be "YYYY-MM-DD", got ${String(input.date)}.`);
    }

    const info = statementsFor(sqlite).insertReversal.run(
      original.taxYearId,
      original.kind,
      original.taxRelevant ? 1 : 0,
      original.incomeSection,
      original.generalCategory,
      input.date,
      -original.amountMinor,
      0,
      original.sourcePayer,
      original.payerTaxId,
      input.note ?? `Reversal of transaction #${originalId}`,
      'manual',
      originalId,
    );
    const row = requireRow(sqlite, Number(info.lastInsertRowid));
    recordMutation(sqlite, {
      entityType: 'transaction',
      entityId: row.id,
      action: 'reverse',
      after: row as unknown as Record<string, unknown>,
    });
    return row;
  });
  return run();
}

/** Full audit history of one transaction, oldest first (INV-4, TC-0001 #24/#25). */
export function getTransactionHistory(sqlite: BetterSqlite3.Database, id: number): AuditEntry[] {
  return listEntityHistory(sqlite, 'transaction', id);
}
