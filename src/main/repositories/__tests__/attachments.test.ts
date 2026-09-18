/**
 * AT-2.4 — `attachments` repository (`add`/`list`).
 *
 * Done-criterion: unit test verifies copy + listing.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createTaxYear } from '../taxYears';
import { createTransaction } from '../transactions';
import { AttachmentError, addAttachment, listAttachments } from '../attachments';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;
let dataFolderPath: string;
let sourceDir: string;
let transactionId: number;

beforeEach(() => {
  temp = openTempDatabase();
  dataFolderPath = mkdtempSync(join(tmpdir(), 'mfa-data-'));
  sourceDir = mkdtempSync(join(tmpdir(), 'mfa-src-'));

  const taxYearId = createTaxYear(temp.sqlite, { year: 2569 }).id;
  transactionId = createTransaction(temp.sqlite, {
    taxYearId,
    kind: 'income',
    incomeSection: '40_1',
    date: '2026-03-15',
    amountMinor: 1_000_000,
  }).id;
});

afterEach(() => {
  temp.dispose();
  rmSync(dataFolderPath, { recursive: true, force: true });
  rmSync(sourceDir, { recursive: true, force: true });
});

function countAuditRows(action: string): number {
  const row = temp.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE entity_type = 'attachment' AND action = ?`)
    .get(action) as { n: number };
  return row.n;
}

describe('addAttachment — TC-0001 #1 (attachment part)', () => {
  it('copies the source file into <dataFolder>/attachments/<transactionId>/ and records it', () => {
    const sourceFile = join(sourceDir, 'receipt.pdf');
    writeFileSync(sourceFile, 'fake pdf bytes');

    const row = addAttachment(temp.sqlite, dataFolderPath, {
      transactionId,
      sourceFilePath: sourceFile,
      mimeType: 'application/pdf',
    });

    expect(row.transactionId).toBe(transactionId);
    expect(row.originalFilename).toBe('receipt.pdf');
    expect(row.mimeType).toBe('application/pdf');
    expect(row.relativePath).toBe(`attachments/${transactionId}/receipt.pdf`);

    const copiedPath = join(dataFolderPath, 'attachments', String(transactionId), 'receipt.pdf');
    expect(existsSync(copiedPath)).toBe(true);
    expect(readFileSync(copiedPath, 'utf8')).toBe('fake pdf bytes');
    expect(countAuditRows('create')).toBe(1);
  });

  it('avoids a filename collision by suffixing -2, -3, …', () => {
    const sourceFile = join(sourceDir, 'receipt.pdf');
    writeFileSync(sourceFile, 'first');

    const first = addAttachment(temp.sqlite, dataFolderPath, {
      transactionId,
      sourceFilePath: sourceFile,
      mimeType: 'application/pdf',
    });
    writeFileSync(sourceFile, 'second');
    const second = addAttachment(temp.sqlite, dataFolderPath, {
      transactionId,
      sourceFilePath: sourceFile,
      mimeType: 'application/pdf',
    });

    expect(first.relativePath).toBe(`attachments/${transactionId}/receipt.pdf`);
    expect(second.relativePath).toBe(`attachments/${transactionId}/receipt-2.pdf`);
  });

  it('rejects a source file that does not exist', () => {
    expect(() =>
      addAttachment(temp.sqlite, dataFolderPath, {
        transactionId,
        sourceFilePath: join(sourceDir, 'does-not-exist.pdf'),
        mimeType: 'application/pdf',
      }),
    ).toThrow(AttachmentError);
  });
});

describe('listAttachments', () => {
  it('lists every attachment for a transaction, oldest first', () => {
    const fileA = join(sourceDir, 'a.pdf');
    const fileB = join(sourceDir, 'b.png');
    writeFileSync(fileA, 'a');
    writeFileSync(fileB, 'b');

    addAttachment(temp.sqlite, dataFolderPath, {
      transactionId,
      sourceFilePath: fileA,
      mimeType: 'application/pdf',
    });
    addAttachment(temp.sqlite, dataFolderPath, {
      transactionId,
      sourceFilePath: fileB,
      mimeType: 'image/png',
    });

    const list = listAttachments(temp.sqlite, transactionId);
    expect(list.map((a) => a.originalFilename)).toEqual(['a.pdf', 'b.png']);
  });

  it('returns an empty list for a transaction with no attachments', () => {
    expect(listAttachments(temp.sqlite, transactionId)).toEqual([]);
  });
});
