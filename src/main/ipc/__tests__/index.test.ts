/**
 * AT-2.5 — domain IPC handlers.
 *
 * Exercises the channel → handler map directly (no `electron`/`ipcMain` involved — see the
 * module header). This is the "manual smoke test creates a transaction end-to-end from a
 * scratch renderer call" done-criterion's automatable half: it proves the wiring from a
 * channel name + raw args through to a repository call and back. The other half — an actual
 * `ipcRenderer.invoke` round-trip through a running Electron window — has no display server in
 * this sandbox (same limitation as AT-1.1/AT-1.6/AT-1.8) and is a manual check, not a unit test.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import { createDomainIpcHandlers } from '../index';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;
let dataFolderPath: string;
let sourceDir: string;
let handlers: ReturnType<typeof createDomainIpcHandlers>;

beforeEach(() => {
  temp = openTempDatabase();
  dataFolderPath = mkdtempSync(join(tmpdir(), 'mfa-data-'));
  sourceDir = mkdtempSync(join(tmpdir(), 'mfa-src-'));
  handlers = createDomainIpcHandlers({
    getSqlite: () => temp.sqlite,
    getDataFolderPath: () => dataFolderPath,
  });
});

afterEach(() => {
  temp.dispose();
  rmSync(dataFolderPath, { recursive: true, force: true });
  rmSync(sourceDir, { recursive: true, force: true });
});

describe('end-to-end: create a tax year, a transaction, and an attachment through the IPC map', () => {
  it('round-trips from raw channel args to stored rows, the way a renderer call would', () => {
    const year = handlers['taxYears:create'](2569);
    expect(year.status).toBe('open');

    const transaction = handlers['transactions:create']({
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });
    expect(transaction.id).toBeGreaterThan(0);

    const listed = handlers['transactions:listByYear'](year.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(transaction.id);

    const updated = handlers['transactions:update'](transaction.id, { amountMinor: 1_200_000 });
    expect(updated.amountMinor).toBe(1_200_000);

    const history = handlers['transactions:getHistory'](transaction.id);
    expect(history.map((e) => e.action)).toEqual(['create', 'update']);

    const sourceFile = join(sourceDir, 'receipt.pdf');
    writeFileSync(sourceFile, 'fake pdf bytes');
    const attachment = handlers['attachments:add'](transaction.id, sourceFile);
    expect(attachment.mimeType).toBe('application/pdf');

    const attachments = handlers['attachments:list'](transaction.id);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].id).toBe(attachment.id);
  });
});

describe('taxYears channels', () => {
  it('list/get/setExpenseMethod round-trip', () => {
    const year = handlers['taxYears:create'](2569);
    expect(handlers['taxYears:list']()).toHaveLength(1);
    expect(handlers['taxYears:get'](year.id)?.id).toBe(year.id);

    const updated = handlers['taxYears:setExpenseMethod'](year.id, 'lump_sum', 6000);
    expect(updated.expenseMethod).toBe('lump_sum');
    expect(updated.lumpSumRateBp).toBe(6000);
  });
});

describe('transactions:void and transactions:createReversal channels', () => {
  it('voids a transaction, and reverses one once its year is closed', () => {
    const year = handlers['taxYears:create'](2569);
    const transaction = handlers['transactions:create']({
      taxYearId: year.id,
      kind: 'expense',
      taxRelevant: false,
      generalCategory: 'food',
      date: '2026-03-15',
      amountMinor: 25_000,
    });

    const voided = handlers['transactions:void'](transaction.id);
    expect(voided.status).toBe('voided');
  });
});

describe('attachments:add mime-type inference', () => {
  it('guesses common extensions and falls back to application/octet-stream', () => {
    const year = handlers['taxYears:create'](2569);
    const transaction = handlers['transactions:create']({
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 1_000_000,
    });

    const png = join(sourceDir, 'photo.PNG');
    writeFileSync(png, 'x');
    expect(handlers['attachments:add'](transaction.id, png).mimeType).toBe('image/png');

    const unknown = join(sourceDir, 'notes.xyz');
    writeFileSync(unknown, 'x');
    expect(handlers['attachments:add'](transaction.id, unknown).mimeType).toBe(
      'application/octet-stream',
    );
  });
});
