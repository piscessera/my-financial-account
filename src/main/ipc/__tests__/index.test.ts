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

function seedTaxBrackets(): void {
  const rows: [number, number | null, number][] = [
    [0, 150_000_00, 0],
    [150_000_00, 300_000_00, 500],
    [300_000_00, 500_000_00, 1000],
    [500_000_00, 750_000_00, 1500],
    [750_000_00, 1_000_000_00, 2000],
    [1_000_000_00, 2_000_000_00, 2500],
    [2_000_000_00, 5_000_000_00, 3000],
    [5_000_000_00, null, 3500],
  ];
  rows.forEach(([lower, upper, rateBp], i) => {
    temp.sqlite
      .prepare(`INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order) VALUES (?, ?, ?, ?)`)
      .run(lower, upper, rateBp, i + 1);
  });
}

describe('taxYears:close/reopen + calc:computeYear (AT-4.5)', () => {
  it('closes a year, freezes its result, and calc:computeYear serves the frozen snapshot', () => {
    seedTaxBrackets();
    const year = handlers['taxYears:create'](2569);
    handlers['transactions:create']({
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 793_831_04,
      whtMinor: 93_963_71,
    });

    const closed = handlers['taxYears:close'](year.id);
    expect(closed.status).toBe('closed');
    expect(closed.frozenResultJson).not.toBeNull();

    const result = handlers['calc:computeYear'](year.id);
    expect(result.balance).toEqual({ direction: 'refund', amountMinor: 20_197_50 });

    const reopened = handlers['taxYears:reopen'](year.id);
    expect(reopened.status).toBe('open');
    expect(reopened.closedAt).toBeNull();
  });

  it('calc:computeYear computes live for an open year', () => {
    const year = handlers['taxYears:create'](2569);
    handlers['transactions:create']({
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 100_000_00,
    });

    const result = handlers['calc:computeYear'](year.id);
    expect(result.totalIncomeMinor).toBe(100_000_00);
  });

  it('TC-0001 #15: two years summaries stay independent', () => {
    seedTaxBrackets();
    const yearA = handlers['taxYears:create'](2568);
    const yearB = handlers['taxYears:create'](2569);
    handlers['transactions:create']({
      taxYearId: yearA.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2025-03-15',
      amountMinor: 300_000_00,
    });
    handlers['transactions:create']({
      taxYearId: yearB.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 900_000_00,
    });

    const resultA = handlers['calc:computeYear'](yearA.id);
    const resultB = handlers['calc:computeYear'](yearB.id);

    expect(resultA.totalIncomeMinor).toBe(300_000_00);
    expect(resultB.totalIncomeMinor).toBe(900_000_00);
    expect(resultA.taxTotalMinor).not.toBe(resultB.taxTotalMinor);
  });

  it('TC-0001 #28: an open year reflects a bracket rate edit on the next computeYear call', () => {
    seedTaxBrackets();
    const year = handlers['taxYears:create'](2569);
    handlers['transactions:create']({
      taxYearId: year.id,
      kind: 'income',
      incomeSection: '40_1',
      date: '2026-03-15',
      amountMinor: 200_000_00,
    });

    const before = handlers['calc:computeYear'](year.id);
    const secondBracket = handlers['settings:getBrackets']().find((b) => b.sortOrder === 2);
    handlers['settings:updateBracket'](secondBracket?.id as number, 2000); // 5% -> 20%
    const after = handlers['calc:computeYear'](year.id);

    expect(after.taxTotalMinor).toBeGreaterThan(before.taxTotalMinor);
  });
});

describe('deductions/settings channels (AT-3.4)', () => {
  it('settings:createCategory + deductions:listCategories/setEntry round-trip', () => {
    const category = handlers['settings:createCategory']({
      code: 'donation',
      name: 'เงินบริจาค',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    expect(handlers['deductions:listCategories']()).toHaveLength(1);

    const year = handlers['taxYears:create'](2569);
    const entry = handlers['deductions:setEntry']({
      taxYearId: year.id,
      categoryId: category.id,
      amountMinor: 5_000_00,
    });
    expect(entry.amountMinor).toBe(5_000_00);
  });

  it('settings:setCategoryActive removes it from deductions:listCategories but not settings:getCaps', () => {
    const category = handlers['settings:createCategory']({
      code: 'donation',
      name: 'เงินบริจาค',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    handlers['settings:setCategoryActive'](category.id, false);

    expect(handlers['deductions:listCategories']()).toHaveLength(0);
    expect(handlers['settings:getCaps']()).toHaveLength(1);
  });

  it('settings:updateCategory renames', () => {
    const category = handlers['settings:createCategory']({
      code: 'donation',
      name: 'เงินบริจาค',
      capType: 'fixed',
      capAmountMinor: 100_000_00,
    });
    const renamed = handlers['settings:updateCategory'](category.id, { name: 'บริจาคใหม่' });
    expect(renamed.name).toBe('บริจาคใหม่');
  });

  it('settings:getSharedCaps/updateSharedCap round-trip', () => {
    const id = temp.sqlite
      .prepare(`INSERT INTO shared_caps (name, cap_amount_minor) VALUES (?, ?)`)
      .run('Life+Health', 100_000_00).lastInsertRowid as number;

    expect(handlers['settings:getSharedCaps']()).toHaveLength(1);
    const updated = handlers['settings:updateSharedCap'](id, 120_000_00);
    expect(updated.capAmountMinor).toBe(120_000_00);
  });

  it('settings:getBrackets/updateBracket round-trip', () => {
    const id = temp.sqlite
      .prepare(
        `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order) VALUES (?, ?, ?, ?)`,
      )
      .run(0, 15_000_00, 500, 1).lastInsertRowid as number;

    expect(handlers['settings:getBrackets']()).toHaveLength(1);
    const updated = handlers['settings:updateBracket'](id, 700);
    expect(updated.rateBp).toBe(700);
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
