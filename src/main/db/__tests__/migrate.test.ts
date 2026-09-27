import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from '../client';
import { getSchemaVersion, LATEST_SCHEMA_VERSION, migrateToLatest } from '../migrate';
import { MIGRATION_006_SQL } from '../migrations/006-normalize-transaction-dates';

const EXPECTED_TABLES = [
  'attachments',
  'audit_log',
  'deduction_categories',
  'deduction_entries',
  'recurring_monthly_logs',
  'recurring_templates',
  'shared_caps',
  'tax_brackets',
  'tax_years',
  'transactions',
];

const EXPECTED_INDEXES = [
  'idx_audit_log_entity',
  'idx_deduction_entries_year_category',
  'idx_transactions_tax_year',
];

describe('migrateToLatest', () => {
  let dir: string;
  let handle: DatabaseHandle;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mfa-migrate-'));
    handle = openDatabase(join(dir, 'test.db'));
  });

  afterEach(() => {
    handle.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates all eight tables from ANA-0001 in a fresh database', () => {
    const tables = handle.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((row) => (row as { name: string }).name)
      .sort();

    expect(tables).toEqual(EXPECTED_TABLES);
  });

  it('creates the indexes ANA-0001 requires', () => {
    const indexes = handle.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`)
      .all()
      .map((row) => (row as { name: string }).name);

    for (const name of EXPECTED_INDEXES) {
      expect(indexes).toContain(name);
    }
  });

  it('makes deduction_entries(tax_year_id, category_id) a UNIQUE index', () => {
    const indexList = handle.sqlite.pragma('index_list(deduction_entries)') as {
      name: string;
      unique: number;
    }[];
    const info = indexList.find((row) => row.name === 'idx_deduction_entries_year_category');

    expect(info?.unique).toBe(1);
  });

  it('records the applied version and reports what it applied', () => {
    expect(getSchemaVersion(handle.sqlite)).toBe(LATEST_SCHEMA_VERSION);
    expect(handle.migration).toEqual({
      from: 0,
      to: LATEST_SCHEMA_VERSION,
      applied: [
        '001-initial-schema',
        '002-year-scoped-config',
        '003-recurring-checklist',
        '004-expense-deduction-linkage',
        '005-custom-deduction-amount',
        '006-normalize-transaction-dates',
      ],
    });
  });

  it('is idempotent — re-running applies nothing', () => {
    const result = migrateToLatest(handle.sqlite);

    expect(result.applied).toEqual([]);
    expect(result.to).toBe(LATEST_SCHEMA_VERSION);
  });

  it('refuses a database written by a newer schema version', () => {
    handle.sqlite.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`);

    expect(() => migrateToLatest(handle.sqlite)).toThrow(/newer than this app supports/);
  });

  it('enables foreign key enforcement on the connection', () => {
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('leaves the journal in single-file mode for Drive-synced storage', () => {
    expect(handle.sqlite.pragma('journal_mode', { simple: true })).toBe('delete');
  });

  it('stores no floating point money columns (INV-1)', () => {
    const moneyColumns = handle.sqlite
      .prepare(
        `SELECT m.name AS table_name, c.name AS column_name, c.type AS column_type
           FROM sqlite_master m
           JOIN pragma_table_info(m.name) c
          WHERE m.type = 'table'
            AND (c.name LIKE '%_minor' OR c.name LIKE '%_bp')`,
      )
      .all() as { table_name: string; column_name: string; column_type: string }[];

    expect(moneyColumns.length).toBeGreaterThan(0);
    for (const column of moneyColumns) {
      expect(column.column_type).toBe('INTEGER');
    }
  });

  it('normalizes Buddhist Era dates to Christian Era in migration 006', () => {
    const yearId = handle.sqlite
      .prepare(`INSERT INTO tax_years (year, status) VALUES (2569, 'open')`)
      .run().lastInsertRowid;
    const txId = handle.sqlite
      .prepare(
        `INSERT INTO transactions (tax_year_id, kind, tax_relevant, general_category, date, amount_minor)
         VALUES (?, 'expense', 0, 'other', '2569-09-15', 50000)`,
      )
      .run(yearId).lastInsertRowid;

    // Run migration 006 SQL manually to verify the normalization script
    handle.sqlite.exec(MIGRATION_006_SQL);

    const updated = handle.sqlite
      .prepare(`SELECT date FROM transactions WHERE id = ?`)
      .get(txId) as { date: string };
    expect(updated.date).toBe('2026-09-15');
  });
});
