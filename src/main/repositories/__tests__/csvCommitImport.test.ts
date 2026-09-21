/**
 * AT-5.4 — `commitImport`.
 *
 * Covers TC-0001 #47.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import type { CreateTransactionInput } from '../transactions';
import { commitImport } from '../csv';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;

beforeEach(() => {
  temp = openTempDatabase();
});

afterEach(() => {
  temp.dispose();
});

function row(amountMinor: number): CreateTransactionInput {
  return {
    taxYearId: -1,
    kind: 'income',
    incomeSection: '40_1',
    date: '2026-03-15',
    amountMinor,
    whtMinor: 0,
  };
}

describe('commitImport — TC-0001 #47: only the confirmed subset is inserted', () => {
  it('inserts exactly the confirmed rows (source=import) and one batch audit_log entry with correct counts', () => {
    const confirmedRows = [row(100_00), row(200_00), row(300_00)]; // 3 of an original 5

    const result = commitImport(temp.sqlite, {
      targetYear: 2569,
      confirmedRows,
      skippedCount: 2,
      sourceFilename: 'ledger.csv',
    });

    expect(result.created).toHaveLength(3);
    expect(result.importedCount).toBe(3);
    expect(result.skippedCount).toBe(2);
    expect(result.created.every((t) => t.source === 'import')).toBe(true);

    const txCount = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM transactions`).get() as {
      n: number;
    };
    expect(txCount.n).toBe(3);

    const batchAudit = temp.sqlite
      .prepare(`SELECT * FROM audit_log WHERE entity_type = 'tax_year' AND action = 'import'`)
      .all() as { after_json: string }[];
    expect(batchAudit).toHaveLength(1);
    const summary = JSON.parse(batchAudit[0].after_json) as {
      sourceFilename: string;
      importedCount: number;
      skippedCount: number;
    };
    expect(summary).toEqual({ sourceFilename: 'ledger.csv', importedCount: 3, skippedCount: 2 });
  });

  it('creates the target tax year if it does not exist yet', () => {
    const result = commitImport(temp.sqlite, {
      targetYear: 2569,
      confirmedRows: [row(100_00)],
      skippedCount: 0,
      sourceFilename: 'ledger.csv',
    });

    const year = temp.sqlite
      .prepare(`SELECT year FROM tax_years WHERE id = ?`)
      .get(result.taxYearId) as {
      year: number;
    };
    expect(year.year).toBe(2569);
  });

  it('reuses an existing tax year with the target year number', () => {
    temp.sqlite.prepare(`INSERT INTO tax_years (year, status) VALUES (2569, 'open')`).run();

    const result = commitImport(temp.sqlite, {
      targetYear: 2569,
      confirmedRows: [row(100_00)],
      skippedCount: 0,
      sourceFilename: 'ledger.csv',
    });

    const yearCount = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM tax_years`).get() as {
      n: number;
    };
    expect(yearCount.n).toBe(1);
    expect(result.created[0].taxYearId).toBe(result.taxYearId);
  });

  it('inserts nothing when the confirmed subset is empty, but still records the batch summary', () => {
    const result = commitImport(temp.sqlite, {
      targetYear: 2569,
      confirmedRows: [],
      skippedCount: 5,
      sourceFilename: 'ledger.csv',
    });

    expect(result.created).toHaveLength(0);
    const batchAudit = temp.sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'tax_year' AND action = 'import'`,
      )
      .get() as { n: number };
    expect(batchAudit.n).toBe(1);
  });
});
