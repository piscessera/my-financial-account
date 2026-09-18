/**
 * CSV export/import (P5, ANA-0001 §CSV export/import) — a migration/backup path for one tax
 * year's ledger, and (AT-5.2 onward) its summary, plus a three-step import flow: parse for
 * preview (no write), then commit only the confirmed subset.
 *
 * `exportLedger` (AT-5.1) is a read-only report: one CSV row per transaction, active/voided/
 * reversal alike — "every column needed to recreate it" (ANA-0001), so this is also the only
 * column format `parseForPreview`/`commitImport` (AT-5.3/5.4) accept back.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import type BetterSqlite3 from 'better-sqlite3';

import type { ComputeYearResult } from '../calc/computeYear';
import { formatSatangAsBaht, tryParseBahtToSatang } from '../calc/money';
import { recordMutation } from './auditLog';
import type { GeneralCategory, IncomeSection, TransactionKind, TransactionRow } from '../db/schema';
import { createTransaction, listByYear, type CreateTransactionInput } from './transactions';
import { createTaxYear, listTaxYears } from './taxYears';

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

/** The ledger export/import column set, in order — this exact order is the contract between
 *  `exportLedger` and `parseForPreview`. */
export const LEDGER_CSV_COLUMNS = [
  'id',
  'date',
  'kind',
  'tax_relevant',
  'income_section',
  'general_category',
  'amount',
  'currency',
  'wht',
  'source_payer',
  'payer_tax_id',
  'note',
  'status',
  'reversal_of_id',
  'source',
] as const;

/** Money columns are decimal baht (no thousands separators) for a clean round-trip through `tryParseBahtToSatang`. */
function moneyField(minor: number): string {
  return formatSatangAsBaht(minor, { grouping: false });
}

/** RFC 4180-ish quoting: quote and escape a field only when it needs it (contains `,`, `"`, or a newline). */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(row: TransactionRow): string {
  const fields = [
    String(row.id),
    row.date,
    row.kind,
    row.taxRelevant ? 'true' : 'false',
    row.incomeSection ?? '',
    row.generalCategory ?? '',
    moneyField(row.amountMinor),
    row.currency,
    moneyField(row.whtMinor),
    row.sourcePayer ?? '',
    row.payerTaxId ?? '',
    row.note ?? '',
    row.status,
    row.reversalOfId === null ? '' : String(row.reversalOfId),
    row.source,
  ];
  return fields.map(csvField).join(',');
}

/**
 * Export one tax year's full ledger to a CSV file at `destPath` — every transaction, whatever
 * its status (`active`/`voided`) or origin (manual entry, a reversal, a prior import), one row
 * each (TC-0001 #43). Read-only: never touches the DB beyond the `SELECT` in `listByYear`.
 */
export function exportLedger(sqlite: BetterSqlite3.Database, yearId: number, destPath: string): void {
  const rows = listByYear(sqlite, yearId);
  const lines = [LEDGER_CSV_COLUMNS.join(','), ...rows.map(toCsvRow)];
  writeFileSync(destPath, lines.join('\r\n') + '\r\n', 'utf8');
}

/**
 * Export a tax year's *summary* — the same figures `calc.computeYear()` shows on-screen
 * (TC-0001 #44), not the raw transaction list. A pure formatter over an already-computed
 * {@link ComputeYearResult} (not `sqlite`/`yearId`): the caller (IPC layer) is responsible for
 * getting that result the right way — `taxYears.getYearResult()`, so a closed year's export
 * matches its frozen snapshot, never a live recompute (INV-7) — same principle AT-4.4 already
 * established for the read path.
 *
 * **One-way**: this format is never a valid `parseForPreview`/`commitImport` input (ANA-0001)
 * — only `exportLedger`'s column format round-trips.
 */
export function exportSummary(destPath: string, year: number, result: ComputeYearResult): void {
  const rows: [string, string][] = [
    ['tax_year', String(year)],
    ['total_income', formatSatangAsBaht(result.totalIncomeMinor, { grouping: false })],
    ['total_expense', formatSatangAsBaht(result.totalExpenseMinor, { grouping: false })],
    ['expense_deduction', formatSatangAsBaht(result.expenseDeductionMinor, { grouping: false })],
    ['total_deductions', formatSatangAsBaht(result.totalDeductionsMinor, { grouping: false })],
    ['net_taxable', formatSatangAsBaht(result.netTaxableMinor, { grouping: false })],
    ['tax_total', formatSatangAsBaht(result.taxTotalMinor, { grouping: false })],
    ['wht_total', formatSatangAsBaht(result.whtTotalMinor, { grouping: false })],
    ['balance_direction', result.balance.direction],
    ['balance_amount', formatSatangAsBaht(result.balance.amountMinor, { grouping: false })],
  ];
  const lines = ['field,value', ...rows.map(([field, value]) => `${csvField(field)},${csvField(value)}`)];
  writeFileSync(destPath, lines.join('\r\n') + '\r\n', 'utf8');
}

/** Minimal RFC-4180 line splitter matching {@link csvField}'s quoting (handles `""` escapes). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_KINDS = new Set<TransactionKind>(['income', 'expense']);
const VALID_INCOME_SECTIONS = new Set<IncomeSection>(['40_1', '40_2', '40_5_8']);
const VALID_GENERAL_CATEGORIES = new Set<GeneralCategory>(['food', 'shopping', 'housing', 'other']);

export interface ParsedLedgerRow {
  /** 1-based, counting only data rows (the header is not row 1). */
  readonly rowNumber: number;
  readonly raw: Readonly<Record<string, string>>;
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Present only when `valid` is `true`. */
  readonly data?: CreateTransactionInput;
}

export interface ParseForPreviewResult {
  readonly targetYear: number;
  /** Whether `targetYear` already exists in this install, and if so, its status. */
  readonly targetYearStatus: 'will_create' | 'open' | 'closed';
  readonly rows: readonly ParsedLedgerRow[];
}

function validateRow(raw: Record<string, string>): { data?: CreateTransactionInput; errors: string[] } {
  const errors: string[] = [];

  if (!DATE_RE.test(raw.date ?? '')) errors.push('date must be "YYYY-MM-DD".');
  const kind = raw.kind as TransactionKind;
  if (!VALID_KINDS.has(kind)) errors.push('kind must be "income" or "expense".');
  if (raw.tax_relevant !== 'true' && raw.tax_relevant !== 'false') {
    errors.push('tax_relevant must be "true" or "false".');
  }
  const taxRelevant = raw.tax_relevant === 'true';

  const incomeSection = raw.income_section === '' ? null : (raw.income_section as IncomeSection);
  if (incomeSection !== null && !VALID_INCOME_SECTIONS.has(incomeSection)) {
    errors.push(`income_section "${raw.income_section}" is not valid.`);
  }
  const generalCategory = raw.general_category === '' ? null : (raw.general_category as GeneralCategory);
  if (generalCategory !== null && !VALID_GENERAL_CATEGORIES.has(generalCategory)) {
    errors.push(`general_category "${raw.general_category}" is not valid.`);
  }
  if (taxRelevant && kind === 'income' && incomeSection === null) {
    errors.push('income_section is required for a tax-relevant income row.');
  }
  if (!taxRelevant && generalCategory === null) {
    errors.push('general_category is required for a general (non-tax) row.');
  }
  if (taxRelevant && generalCategory !== null) {
    errors.push('general_category must be empty for a tax-relevant row.');
  }
  if (!taxRelevant && incomeSection !== null) {
    errors.push('income_section must be empty for a general (non-tax) row.');
  }

  const amountResult = tryParseBahtToSatang(raw.amount ?? '');
  if (!amountResult.ok || amountResult.satang === 0) errors.push('amount must be a non-zero valid baht amount.');
  const whtResult = tryParseBahtToSatang(raw.wht === '' ? '0' : (raw.wht ?? ''));
  if (!whtResult.ok || whtResult.satang < 0) errors.push('wht must be a valid non-negative baht amount.');

  if (errors.length > 0 || !amountResult.ok || !whtResult.ok) return { errors };

  return {
    errors,
    data: {
      taxYearId: -1, // filled in by commitImport (AT-5.4) once the target year id is known
      kind,
      taxRelevant,
      incomeSection,
      generalCategory,
      date: raw.date,
      amountMinor: amountResult.satang,
      whtMinor: whtResult.satang,
      sourcePayer: raw.source_payer === '' ? null : raw.source_payer,
      payerTaxId: raw.payer_tax_id === '' ? null : raw.payer_tax_id,
      note: raw.note === '' ? null : raw.note,
      source: 'import',
    },
  };
}

/**
 * Parse a ledger CSV for preview — **no write** (TC-0001 #45). Every row is validated
 * independently (required fields, valid money, the tax-relevant/general shape rules that
 * mirror `transactions.createTransaction`'s own validation). `targetYear` is the whole file's
 * destination year — `exportLedger` scopes one file to one year with no per-row year column,
 * so this checks it once for the file rather than once per row (equivalent, since every row in
 * a genuine export already belongs to the same year). If `targetYear` already exists **closed**
 * in this install, every row is forced invalid regardless of its own well-formedness (TC-0001
 * #46, INV-2b) — closed-year immutability applies to imported rows exactly like manual ones.
 */
export function parseForPreview(
  sqlite: BetterSqlite3.Database,
  filePath: string,
  targetYear: number,
): ParseForPreviewResult {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r\n|\n/).filter((line) => line.length > 0);
  if (lines.length === 0 || lines[0] !== LEDGER_CSV_COLUMNS.join(',')) {
    throw new CsvError('File does not match the expected ledger export column format.');
  }

  const existingYear = listTaxYears(sqlite).find((y) => y.year === targetYear);
  const targetYearStatus: ParseForPreviewResult['targetYearStatus'] = existingYear
    ? existingYear.status
    : 'will_create';
  const yearIsClosed = targetYearStatus === 'closed';

  const rows: ParsedLedgerRow[] = lines.slice(1).map((line, index) => {
    const values = splitCsvLine(line);
    const raw: Record<string, string> = {};
    LEDGER_CSV_COLUMNS.forEach((col, i) => {
      raw[col] = values[i] ?? '';
    });

    const { data, errors } = validateRow(raw);
    if (yearIsClosed) {
      errors.push(`Tax year ${targetYear} is already closed in this install — cannot import into it (INV-2b).`);
    }
    const valid = errors.length === 0;
    return { rowNumber: index + 1, raw, valid, errors, data: valid ? data : undefined };
  });

  return { targetYear, targetYearStatus, rows };
}

export interface CommitImportInput {
  readonly targetYear: number;
  /** The user-confirmed subset of a `parseForPreview` result's valid rows, in whatever order. */
  readonly confirmedRows: readonly CreateTransactionInput[];
  /** How many previewed rows were *not* confirmed (unchecked or invalid) — for the audit summary. */
  readonly skippedCount: number;
  readonly sourceFilename: string;
}

export interface CommitImportResult {
  readonly taxYearId: number;
  readonly created: readonly TransactionRow[];
  readonly importedCount: number;
  readonly skippedCount: number;
}

/**
 * Commit an import: creates **only** the confirmed subset (TC-0001 #47), each through the
 * normal `transactions.createTransaction` path with `source: 'import'` (so INV-1/2/4/5/6 all
 * apply exactly as they do for a manual entry — no separate write path). Resolves `targetYear`
 * to an existing tax year or creates it. Adds **one** extra `audit_log` row summarizing the
 * whole batch (filename + imported/skipped counts, AC-24), on top of each row's own individual
 * `create` audit entry from `createTransaction`.
 */
export function commitImport(sqlite: BetterSqlite3.Database, input: CommitImportInput): CommitImportResult {
  const run = sqlite.transaction(() => {
    const existing = listTaxYears(sqlite).find((y) => y.year === input.targetYear);
    const year = existing ?? createTaxYear(sqlite, { year: input.targetYear });

    const created = input.confirmedRows.map((row) =>
      createTransaction(sqlite, { ...row, taxYearId: year.id, source: 'import' }),
    );

    recordMutation(sqlite, {
      entityType: 'tax_year',
      entityId: year.id,
      action: 'import',
      after: {
        sourceFilename: input.sourceFilename,
        importedCount: created.length,
        skippedCount: input.skippedCount,
      },
    });

    return {
      taxYearId: year.id,
      created,
      importedCount: created.length,
      skippedCount: input.skippedCount,
    };
  });
  return run();
}
