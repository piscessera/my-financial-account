import { getTableColumns, getTableName, type Table } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import { openTempDatabase } from './helpers';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;

/** FK parents shared by the per-table cases. */
let openYearId: number;
let closedYearId: number;
let transactionId: number;
let sharedCapId: number;
let categoryId: number;

function run(sql: string, ...params: unknown[]): number {
  const info = temp.sqlite.prepare(sql).run(...(params as never[]));
  return Number(info.lastInsertRowid);
}

/** Asserts the statement is rejected by a SQLite constraint (CHECK, FK, NOT NULL, UNIQUE). */
function expectRejected(fn: () => unknown): void {
  expect(fn).toThrowError(/SQLITE_CONSTRAINT|constraint failed/i);
}

beforeAll(() => {
  temp = openTempDatabase();

  openYearId = run(`INSERT INTO tax_years (year, status) VALUES (2025, 'open')`);
  closedYearId = run(
    `INSERT INTO tax_years (year, status, closed_at, expense_method, lump_sum_rate_bp)
     VALUES (2024, 'closed', '2025-03-31T00:00:00.000Z', 'lump_sum', 5000)`,
  );
  transactionId = run(
    `INSERT INTO transactions (tax_year_id, kind, tax_relevant, income_section, date, amount_minor, wht_minor, source_payer)
     VALUES (?, 'income', 1, '40_1', '2025-01-31', 5000000, 150000, 'ACME Co., Ltd.')`,
    openYearId,
  );
  sharedCapId = run(
    `INSERT INTO shared_caps (name, cap_amount_minor) VALUES ('RMF/SSF', 50000000)`,
  );
  categoryId = run(
    `INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, sort_order, description)
     VALUES ('personal_allowance', 'Personal allowance', 'fixed', 6000000, 1, 'Statutory')`,
  );
});

afterAll(() => {
  temp.dispose();
});

describe('tax_years', () => {
  it('accepts a valid row and stamps created_at/updated_at', () => {
    const row = temp.sqlite.prepare(`SELECT * FROM tax_years WHERE id = ?`).get(openYearId) as {
      year: number;
      status: string;
      created_at: string;
      updated_at: string;
    };

    expect(row.year).toBe(2025);
    expect(row.status).toBe('open');
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('rejects an unknown status', () => {
    expectRejected(() => run(`INSERT INTO tax_years (year, status) VALUES (2030, 'archived')`));
  });

  it('rejects a duplicate year', () => {
    expectRejected(() => run(`INSERT INTO tax_years (year, status) VALUES (2025, 'open')`));
  });

  it('rejects a closed year with no closed_at (INV-2b)', () => {
    expectRejected(() => run(`INSERT INTO tax_years (year, status) VALUES (2023, 'closed')`));
  });

  it('rejects an open year that carries closed_at (INV-2b)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO tax_years (year, status, closed_at) VALUES (2023, 'open', '2024-03-31T00:00:00.000Z')`,
      ),
    );
  });

  it('rejects a lump-sum rate outside 0–10000 basis points', () => {
    expectRejected(() =>
      run(
        `INSERT INTO tax_years (year, status, expense_method, lump_sum_rate_bp)
         VALUES (2023, 'open', 'lump_sum', 10001)`,
      ),
    );
  });

  it('rejects a lump-sum rate on the actual-expense method', () => {
    expectRejected(() =>
      run(
        `INSERT INTO tax_years (year, status, expense_method, lump_sum_rate_bp)
         VALUES (2023, 'open', 'actual', 5000)`,
      ),
    );
  });
});

describe('transactions', () => {
  it('accepts a valid tax-relevant income row with defaults applied', () => {
    const row = temp.sqlite
      .prepare(`SELECT * FROM transactions WHERE id = ?`)
      .get(transactionId) as {
      currency: string;
      status: string;
      source: string;
      tax_relevant: number;
      amount_minor: number;
    };

    expect(row.currency).toBe('THB');
    expect(row.status).toBe('active');
    expect(row.source).toBe('manual');
    expect(row.tax_relevant).toBe(1);
    expect(row.amount_minor).toBe(5000000);
  });

  it('accepts a general (non-tax) expense with a general_category', () => {
    const id = run(
      `INSERT INTO transactions (tax_year_id, kind, tax_relevant, general_category, date, amount_minor)
       VALUES (?, 'expense', 0, 'food', '2025-02-01', 25000)`,
      openYearId,
    );

    expect(id).toBeGreaterThan(0);
  });

  it('rejects a non-THB currency (INV-5)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor, currency)
         VALUES (?, 'income', '40_1', '2025-01-31', 100, 'USD')`,
        openYearId,
      ),
    );
  });

  it('rejects a fractional amount — money is integer satang (INV-1)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor)
         VALUES (?, 'income', '40_1', '2025-01-31', 100.5)`,
        openYearId,
      ),
    );
  });

  it('rejects a zero amount', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor)
         VALUES (?, 'income', '40_1', '2025-01-31', 0)`,
        openYearId,
      ),
    );
  });

  it('rejects tax-relevant income with no income_section', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, tax_relevant, date, amount_minor)
         VALUES (?, 'income', 1, '2025-01-31', 100)`,
        openYearId,
      ),
    );
  });

  it('rejects a non-tax transaction with no general_category', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, tax_relevant, date, amount_minor)
         VALUES (?, 'expense', 0, '2025-01-31', 100)`,
        openYearId,
      ),
    );
  });

  it('rejects a non-tax transaction that also claims an income_section', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, tax_relevant, general_category, income_section, date, amount_minor)
         VALUES (?, 'income', 0, 'other', '40_1', '2025-01-31', 100)`,
        openYearId,
      ),
    );
  });

  it('rejects an unknown income_section', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor)
         VALUES (?, 'income', '40_4', '2025-01-31', 100)`,
        openYearId,
      ),
    );
  });

  it('rejects a malformed date', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor)
         VALUES (?, 'income', '40_1', '31/01/2025', 100)`,
        openYearId,
      ),
    );
  });

  it('rejects negative withholding tax', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor, wht_minor)
         VALUES (?, 'income', '40_1', '2025-01-31', 100, -1)`,
        openYearId,
      ),
    );
  });

  it('rejects a transaction pointing at a non-existent tax year (FK)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor)
         VALUES (99999, 'income', '40_1', '2025-01-31', 100)`,
      ),
    );
  });

  it('accepts a reversal that points at an existing transaction (INV-2b)', () => {
    const id = run(
      `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor, reversal_of_id, note)
       VALUES (?, 'income', '40_1', '2025-04-01', -5000000, ?, 'Reversal of #1')`,
      closedYearId,
      transactionId,
    );

    expect(id).toBeGreaterThan(0);
  });

  it('rejects a reversal of a non-existent transaction (self-FK)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor, reversal_of_id)
         VALUES (?, 'income', '40_1', '2025-04-01', -100, 99999)`,
        openYearId,
      ),
    );
  });

  it('rejects an unknown source', () => {
    expectRejected(() =>
      run(
        `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor, source)
         VALUES (?, 'income', '40_1', '2025-01-31', 100, 'sync')`,
        openYearId,
      ),
    );
  });
});

describe('attachments', () => {
  it('accepts a valid row', () => {
    const id = run(
      `INSERT INTO attachments (transaction_id, relative_path, original_filename, mime_type)
       VALUES (?, 'attachments/2025/receipt-1.pdf', 'receipt-1.pdf', 'application/pdf')`,
      transactionId,
    );

    expect(id).toBeGreaterThan(0);
  });

  it('rejects an attachment on a non-existent transaction (FK)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO attachments (transaction_id, relative_path, original_filename, mime_type)
         VALUES (99999, 'a.pdf', 'a.pdf', 'application/pdf')`,
      ),
    );
  });

  it('rejects an empty relative_path', () => {
    expectRejected(() =>
      run(
        `INSERT INTO attachments (transaction_id, relative_path, original_filename, mime_type)
         VALUES (?, '', 'a.pdf', 'application/pdf')`,
        transactionId,
      ),
    );
  });
});

describe('shared_caps', () => {
  it('accepts a valid row', () => {
    const row = temp.sqlite.prepare(`SELECT * FROM shared_caps WHERE id = ?`).get(sharedCapId) as {
      name: string;
      cap_amount_minor: number;
    };

    expect(row).toMatchObject({ name: 'RMF/SSF', cap_amount_minor: 50000000 });
  });

  it('rejects a fractional cap amount (INV-1)', () => {
    expectRejected(() =>
      run(`INSERT INTO shared_caps (name, cap_amount_minor) VALUES ('Fractional', 1.5)`),
    );
  });

  it('rejects a duplicate group name', () => {
    expectRejected(() =>
      run(`INSERT INTO shared_caps (name, cap_amount_minor) VALUES ('RMF/SSF', 1)`),
    );
  });
});

describe('deduction_categories', () => {
  it('accepts all three cap shapes (INV-6)', () => {
    const perCount = run(
      `INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, sort_order)
       VALUES ('child_allowance', 'Child allowance', 'per_count', 3000000, 2)`,
    );
    const member = run(
      `INSERT INTO deduction_categories (code, name, cap_type, shared_group_id, sort_order)
       VALUES ('rmf', 'RMF', 'shared_group_member', ?, 3)`,
      sharedCapId,
    );

    expect(categoryId).toBeGreaterThan(0);
    expect(perCount).toBeGreaterThan(0);
    expect(member).toBeGreaterThan(0);
  });

  it('rejects a shared_group_member with no shared_group_id (INV-6)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_categories (code, name, cap_type, sort_order)
         VALUES ('orphan_member', 'Orphan', 'shared_group_member', 9)`,
      ),
    );
  });

  it('rejects a fixed category that points at a shared group (INV-6)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, shared_group_id, sort_order)
         VALUES ('confused', 'Confused', 'fixed', 100, ?, 9)`,
        sharedCapId,
      ),
    );
  });

  it('rejects a fixed category with no cap amount', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_categories (code, name, cap_type, sort_order)
         VALUES ('no_cap', 'No cap', 'fixed', 9)`,
      ),
    );
  });

  it('accepts a shared_group_member with its own sub-cap on top of the group total (INV-6, TC-0001 #10)', () => {
    const withSubCap = run(
      `INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, shared_group_id, sort_order)
       VALUES ('health_insurance_self', 'Health insurance (self)', 'shared_group_member', 2500000, ?, 4)`,
      sharedCapId,
    );
    expect(withSubCap).toBeGreaterThan(0);
  });

  it('rejects an unknown cap_type', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, sort_order)
         VALUES ('weird', 'Weird', 'percentage', 100, 9)`,
      ),
    );
  });

  it('rejects a duplicate code', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_categories (code, name, cap_type, cap_amount_minor, sort_order)
         VALUES ('personal_allowance', 'Dup', 'fixed', 100, 9)`,
      ),
    );
  });
});

describe('deduction_entries', () => {
  it('accepts a valid row', () => {
    const id = run(
      `INSERT INTO deduction_entries (tax_year_id, category_id, amount_minor)
       VALUES (?, ?, 6000000)`,
      openYearId,
      categoryId,
    );

    expect(id).toBeGreaterThan(0);
  });

  it('rejects a second entry for the same (tax_year_id, category_id)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_entries (tax_year_id, category_id, amount_minor)
         VALUES (?, ?, 1)`,
        openYearId,
        categoryId,
      ),
    );
  });

  it('rejects a negative amount', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_entries (tax_year_id, category_id, amount_minor)
         VALUES (?, ?, -1)`,
        closedYearId,
        categoryId,
      ),
    );
  });

  it('rejects an entry for a non-existent category (FK)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO deduction_entries (tax_year_id, category_id, amount_minor)
         VALUES (?, 99999, 1)`,
        openYearId,
      ),
    );
  });
});

describe('tax_brackets', () => {
  it('accepts a bounded bracket and an open-ended top bracket', () => {
    const first = run(
      `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
       VALUES (0, 15000000, 0, 1)`,
    );
    const top = run(
      `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
       VALUES (500000000, NULL, 3500, 2)`,
    );

    expect(first).toBeGreaterThan(0);
    expect(top).toBeGreaterThan(0);
  });

  it('rejects a rate above 100% (10000 bp)', () => {
    expectRejected(() =>
      run(
        `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
         VALUES (0, 100, 10001, 8)`,
      ),
    );
  });

  it('rejects an upper bound at or below the lower bound', () => {
    expectRejected(() =>
      run(
        `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
         VALUES (100, 100, 500, 8)`,
      ),
    );
  });

  it('rejects a duplicate sort_order', () => {
    expectRejected(() =>
      run(
        `INSERT INTO tax_brackets (lower_bound_minor, upper_bound_minor, rate_bp, sort_order)
         VALUES (900, NULL, 500, 1)`,
      ),
    );
  });
});

describe('audit_log', () => {
  it('accepts a valid mutation record (INV-4)', () => {
    const id = run(
      `INSERT INTO audit_log (entity_type, entity_id, action, before_json, after_json)
       VALUES ('transactions', ?, 'update', '{"amount_minor":100}', '{"amount_minor":200}')`,
      transactionId,
    );

    expect(id).toBeGreaterThan(0);
  });

  it('rejects a record with neither a before nor an after state', () => {
    expectRejected(() =>
      run(
        `INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('transactions', 1, 'touch')`,
      ),
    );
  });

  it('rejects malformed JSON in before_json', () => {
    expectRejected(() =>
      run(
        `INSERT INTO audit_log (entity_type, entity_id, action, before_json)
         VALUES ('transactions', 1, 'update', 'not json')`,
      ),
    );
  });
});

describe('Drizzle schema parity with the migrated database', () => {
  const tables: Table[] = [
    schema.taxYears,
    schema.transactions,
    schema.attachments,
    schema.sharedCaps,
    schema.deductionCategories,
    schema.deductionEntries,
    schema.taxBrackets,
    schema.auditLog,
  ];

  it.each(tables.map((table) => [getTableName(table), table] as const))(
    '%s columns match the DDL',
    (name, table) => {
      const declared = Object.values(getTableColumns(table))
        .map((column) => column.name)
        .sort();
      const actual = (
        temp.sqlite.prepare(`SELECT name FROM pragma_table_info(?)`).all(name) as {
          name: string;
        }[]
      )
        .map((row) => row.name)
        .sort();

      expect(declared).toEqual(actual);
    },
  );
});
