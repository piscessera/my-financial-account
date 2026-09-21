/**
 * AT-5.1 — `exportLedger`.
 *
 * Covers TC-0001 #43.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear, setStatusForTest } from '../taxYears';
import { createReversal, createTransaction, voidTransaction } from '../transactions';
import { LEDGER_CSV_COLUMNS, exportLedger, exportSummary } from '../csv';
import type { ComputeYearResult } from '../../calc/computeYear';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;
let outDir: string;

beforeEach(() => {
  temp = openTempDatabase();
  outDir = mkdtempSync(join(tmpdir(), 'mfa-csv-'));
});

afterEach(() => {
  temp.dispose();
  rmSync(outDir, { recursive: true, force: true });
});

describe('exportLedger — TC-0001 #43', () => {
  it('writes one CSV row per transaction, incl. a voided one and a reversal, with every reconstructable field', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const income = createTransaction(temp.sqlite, {
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 68_870_00,
      whtMinor: 450_00,
      sourcePayer: 'บจก. ไฮเลเวล',
      payerTaxId: '1234567890123',
      note: 'March salary',
    });
    const toVoid = createTransaction(temp.sqlite, {
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_5_8',
      date: '2026-04-01',
      amountMinor: 1_000_00,
    });
    voidTransaction(temp.sqlite, toVoid.id);
    const general = createTransaction(temp.sqlite, {
      taxYearId: year.id,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'food',
      date: '2026-04-05',
      amountMinor: 450_00,
      note: 'lunch',
    });

    setStatusForTest(temp.sqlite, year.id, 'closed');
    const reversal = createReversal(temp.sqlite, income.id, {
      date: '2026-05-01',
      note: 'correction',
    });

    const destPath = join(outDir, 'ledger.csv');
    exportLedger(temp.sqlite, year.id, destPath);

    const content = readFileSync(destPath, 'utf8');
    const lines = content.trim().split('\r\n');

    expect(lines[0]).toBe(LEDGER_CSV_COLUMNS.join(','));
    // header + income + voided + general + reversal = 5 lines.
    expect(lines).toHaveLength(5);

    const incomeLine = lines.find((l) => l.startsWith(`${income.id},`));
    expect(incomeLine).toBe(
      [
        income.id,
        '2026-03-15',
        'income',
        'true',
        '40_1',
        '',
        '68870.00',
        'THB',
        '450.00',
        'บจก. ไฮเลเวล',
        '1234567890123',
        'March salary',
        'active',
        '',
        'manual',
      ].join(','),
    );

    const voidedLine = lines.find((l) => l.startsWith(`${toVoid.id},`));
    expect(voidedLine).toContain(',voided,');

    const generalLine = lines.find((l) => l.startsWith(`${general.id},`));
    expect(generalLine).toContain(',expense,false,,food,450.00,');

    const reversalLine = lines.find((l) => l.startsWith(`${reversal.id},`));
    expect(reversalLine).toContain(`,${income.id},manual`);
    expect(reversalLine).toContain(',-68870.00,');
    expect(reversal.amountMinor).toBe(-68_870_00);
  });

  it('quotes a note field containing a comma', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    createTransaction(temp.sqlite, {
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_00,
      note: 'a, note with a comma',
    });

    const destPath = join(outDir, 'ledger.csv');
    exportLedger(temp.sqlite, year.id, destPath);
    const content = readFileSync(destPath, 'utf8');

    expect(content).toContain('"a, note with a comma"');
  });

  it('exports an empty ledger as just the header row', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    const destPath = join(outDir, 'ledger.csv');
    exportLedger(temp.sqlite, year.id, destPath);

    const content = readFileSync(destPath, 'utf8').trim();
    expect(content).toBe(LEDGER_CSV_COLUMNS.join(','));
  });
});

describe('exportSummary — TC-0001 #44', () => {
  const SAMPLE_RESULT: ComputeYearResult = {
    totalIncomeMinor: 793_831_04,
    incomeBySection: { section40_1Minor: 793_831_04, section40_2Minor: 0, section40_5_8Minor: 0 },
    totalExpenseMinor: 0,
    expenseDeductionMinor: 0,
    deductions: { perCategory: [], sharedGroups: [], totalMinor: 0 },
    totalDeductionsMinor: 0,
    netTaxableMinor: 793_831_04,
    bracket: { totalTaxMinor: 73_766_21, breakdown: [] },
    taxTotalMinor: 73_766_21,
    whtTotalMinor: 93_963_71,
    balance: { direction: 'refund', amountMinor: 20_197_50 },
  };

  it('matches the on-screen summary figures exactly, and is never a valid import source', () => {
    const destPath = join(outDir, 'summary.csv');
    exportSummary(destPath, 2569, SAMPLE_RESULT);

    const content = readFileSync(destPath, 'utf8');
    expect(content).toContain('tax_total,73766.21');
    expect(content).toContain('wht_total,93963.71');
    expect(content).toContain('balance_direction,refund');
    expect(content).toContain('balance_amount,20197.50');
    // One-way: the header is field/value, not LEDGER_CSV_COLUMNS -- structurally distinct from
    // a ledger export, so it can never be mistaken for one by parseForPreview (AT-5.3).
    expect(content.startsWith('field,value')).toBe(true);
  });
});
