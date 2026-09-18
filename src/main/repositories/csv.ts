/**
 * CSV export/import (P5, ANA-0001 §CSV export/import) — a migration/backup path for one tax
 * year's ledger, and (AT-5.2 onward) its summary, plus a three-step import flow: parse for
 * preview (no write), then commit only the confirmed subset.
 *
 * `exportLedger` (AT-5.1) is a read-only report: one CSV row per transaction, active/voided/
 * reversal alike — "every column needed to recreate it" (ANA-0001), so this is also the only
 * column format `parseForPreview`/`commitImport` (AT-5.3/5.4) accept back.
 */
import { writeFileSync } from 'node:fs';

import type BetterSqlite3 from 'better-sqlite3';

import type { ComputeYearResult } from '../calc/computeYear';
import { formatSatangAsBaht } from '../calc/money';
import type { TransactionRow } from '../db/schema';
import { listByYear } from './transactions';

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
