/**
 * AT-5.3 — `parseForPreview`.
 *
 * Covers TC-0001 #45, #46.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear, setStatusForTest } from '../taxYears';
import { LEDGER_CSV_COLUMNS, parseForPreview } from '../csv';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;
let outDir: string;

beforeEach(() => {
  temp = openTempDatabase();
  outDir = mkdtempSync(join(tmpdir(), 'mfa-csv-import-'));
});

afterEach(() => {
  temp.dispose();
  rmSync(outDir, { recursive: true, force: true });
});

function writeCsv(rows: string[]): string {
  const path = join(outDir, 'import.csv');
  writeFileSync(path, [LEDGER_CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n', 'utf8');
  return path;
}

const WELL_FORMED_ROW =
  '1,2026-03-15,income,true,40_1,,68870.00,THB,450.00,บจก. ไฮเลเวล,1234567890123,note,active,,manual';
const MISSING_INCOME_SECTION_ROW = '2,2026-03-16,income,true,,,1000.00,THB,0.00,,,,active,,manual';

describe('parseForPreview — TC-0001 #45: flags invalid rows without writing anything', () => {
  it('shows both a valid and an invalid row with correct status, and writes nothing', () => {
    const path = writeCsv([WELL_FORMED_ROW, MISSING_INCOME_SECTION_ROW]);

    const result = parseForPreview(temp.sqlite, path, 2569);

    expect(result.targetYearStatus).toBe('will_create');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].valid).toBe(true);
    expect(result.rows[0].data?.amountMinor).toBe(68_870_00);
    expect(result.rows[1].valid).toBe(false);
    expect(result.rows[1].errors.some((e) => e.includes('income_section'))).toBe(true);

    const count = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM transactions`).get() as {
      n: number;
    };
    expect(count.n).toBe(0);
    const yearCount = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM tax_years`).get() as {
      n: number;
    };
    expect(yearCount.n).toBe(0); // parseForPreview never creates the year either
  });

  it('rejects a file with the wrong header', () => {
    const path = join(outDir, 'bad.csv');
    writeFileSync(path, 'not,the,right,header\r\n', 'utf8');
    expect(() => parseForPreview(temp.sqlite, path, 2569)).toThrow();
  });
});

describe('parseForPreview — TC-0001 #46: rejects rows targeting an already-closed year', () => {
  it('marks every row invalid, even a well-formed one, when the target year is closed', () => {
    const year = createTaxYear(temp.sqlite, { year: 2569 });
    setStatusForTest(temp.sqlite, year.id, 'closed');
    const path = writeCsv([WELL_FORMED_ROW]);

    const result = parseForPreview(temp.sqlite, path, 2569);

    expect(result.targetYearStatus).toBe('closed');
    expect(result.rows[0].valid).toBe(false);
    expect(result.rows[0].errors.some((e) => e.includes('already closed'))).toBe(true);
  });

  it('reports "open" for an existing open year and validates rows normally', () => {
    createTaxYear(temp.sqlite, { year: 2569 });
    const path = writeCsv([WELL_FORMED_ROW]);

    const result = parseForPreview(temp.sqlite, path, 2569);

    expect(result.targetYearStatus).toBe('open');
    expect(result.rows[0].valid).toBe(true);
  });
});

describe('parseForPreview — general-transaction and money validation', () => {
  it('rejects a general row missing its category', () => {
    const path = writeCsv(['3,2026-03-15,expense,false,,,450.00,THB,0.00,,,,active,,manual']);
    const result = parseForPreview(temp.sqlite, path, 2569);
    expect(result.rows[0].valid).toBe(false);
  });

  it('accepts a well-formed general row', () => {
    const path = writeCsv([
      '3,2026-03-15,expense,false,,food,450.00,THB,0.00,,,lunch,active,,manual',
    ]);
    const result = parseForPreview(temp.sqlite, path, 2569);
    expect(result.rows[0].valid).toBe(true);
    expect(result.rows[0].data?.generalCategory).toBe('food');
  });

  it('rejects an invalid amount', () => {
    const path = writeCsv([
      '4,2026-03-15,income,true,40_1,,not-a-number,THB,0.00,,,,active,,manual',
    ]);
    const result = parseForPreview(temp.sqlite, path, 2569);
    expect(result.rows[0].valid).toBe(false);
  });
});
