/**
 * AT-1.7 — `audit_log` repository / `recordMutation()` (INV-4).
 *
 * The done-criterion of the task: one row per call, with entity, action, before, after and
 * timestamp all set. The transaction-composition cases are here too, because every later
 * repository (AT-2.2 onwards) relies on that behaviour.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDatabase } from '../../db/__tests__/helpers';
import {
  AuditLogError,
  createAuditLogRepository,
  listEntityHistory,
  listRecentMutations,
  parseEntry,
  recordMutation,
} from '../auditLog';

type TempDb = ReturnType<typeof openTempDatabase>;

let temp: TempDb;

beforeEach(() => {
  temp = openTempDatabase();
});

afterEach(() => {
  temp.dispose();
});

function countRows(): number {
  const row = temp.sqlite.prepare(`SELECT COUNT(*) AS n FROM audit_log`).get() as { n: number };
  return row.n;
}

const SAMPLE_BEFORE = { id: 7, amountMinor: 5000000, note: 'ACME January' };
const SAMPLE_AFTER = { id: 7, amountMinor: 5500000, note: 'ACME January' };

describe('recordMutation', () => {
  it('writes exactly one row per call, with every field set', () => {
    const row = recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 7,
      action: 'update',
      before: SAMPLE_BEFORE,
      after: SAMPLE_AFTER,
    });

    expect(countRows()).toBe(1);
    expect(row.entityType).toBe('transaction');
    expect(row.entityId).toBe(7);
    expect(row.action).toBe('update');
    expect(JSON.parse(row.beforeJson as string)).toEqual(SAMPLE_BEFORE);
    expect(JSON.parse(row.afterJson as string)).toEqual(SAMPLE_AFTER);
    // UTC ISO-8601 with milliseconds, straight from the column default (the DB clock).
    expect(row.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(row.occurredAt))).toBe(false);
    expect(row.id).toBeGreaterThan(0);
  });

  it('adds one row per call and never rewrites an earlier one', () => {
    const first = recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 7,
      action: 'create',
      after: SAMPLE_AFTER,
    });
    const second = recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 7,
      action: 'update',
      before: SAMPLE_BEFORE,
      after: SAMPLE_AFTER,
    });
    const third = recordMutation(temp.sqlite, {
      entityType: 'tax_year',
      entityId: 2,
      action: 'close',
      before: { status: 'open' },
      after: { status: 'closed' },
    });

    expect(countRows()).toBe(3);
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(second.id).toBeGreaterThan(first.id);
  });

  it('records a creation with before = null and a deletion with after = null', () => {
    const created = recordMutation(temp.sqlite, {
      entityType: 'deduction_entry',
      entityId: 3,
      action: 'create',
      after: { amountMinor: 1000 },
    });
    const deleted = recordMutation(temp.sqlite, {
      entityType: 'deduction_entry',
      entityId: 3,
      action: 'delete',
      before: { amountMinor: 1000 },
    });

    expect(created.beforeJson).toBeNull();
    expect(created.afterJson).not.toBeNull();
    expect(deleted.beforeJson).not.toBeNull();
    expect(deleted.afterJson).toBeNull();
  });

  it('rejects a call with neither before nor after, writing nothing', () => {
    expect(() =>
      recordMutation(temp.sqlite, {
        entityType: 'setting',
        entityId: 1,
        action: 'update',
      }),
    ).toThrowError(AuditLogError);
    expect(countRows()).toBe(0);
  });

  it('rejects a non-integer entity id and a malformed timestamp', () => {
    expect(() =>
      recordMutation(temp.sqlite, {
        entityType: 'transaction',
        entityId: 1.5,
        action: 'update',
        after: SAMPLE_AFTER,
      }),
    ).toThrowError(/integer row id/);
    expect(() =>
      recordMutation(temp.sqlite, {
        entityType: 'transaction',
        entityId: 1,
        action: 'update',
        after: SAMPLE_AFTER,
        occurredAt: '2026-09-15 10:00:00',
      }),
    ).toThrowError(/ISO-8601/);
    expect(countRows()).toBe(0);
  });

  it('rejects a snapshot that cannot be serialized, writing nothing', () => {
    const cyclic: Record<string, unknown> = { id: 1 };
    cyclic.self = cyclic;

    expect(() =>
      recordMutation(temp.sqlite, {
        entityType: 'transaction',
        entityId: 1,
        action: 'update',
        after: cyclic,
      }),
    ).toThrowError(AuditLogError);
    expect(countRows()).toBe(0);
  });

  it('stores snapshot keys canonically sorted so column order is not a change', () => {
    const row = recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 9,
      action: 'update',
      before: { note: 'b', amountMinor: 1, id: 9 },
      after: { id: 9, amountMinor: 1, note: 'b' },
    });

    expect(row.beforeJson).toBe(row.afterJson);
    expect(row.beforeJson).toBe('{"amountMinor":1,"id":9,"note":"b"}');
  });

  it('accepts an explicit occurredAt (used by the import path)', () => {
    const row = recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 4,
      action: 'import',
      after: SAMPLE_AFTER,
      occurredAt: '2026-01-02T03:04:05.678Z',
    });

    expect(row.occurredAt).toBe('2026-01-02T03:04:05.678Z');
  });

  it('writes JSON the SQLite json_valid() CHECK accepts', () => {
    recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 7,
      action: 'update',
      before: SAMPLE_BEFORE,
      after: SAMPLE_AFTER,
    });

    const row = temp.sqlite
      .prepare(`SELECT json_extract(after_json, '$.amountMinor') AS amount FROM audit_log LIMIT 1`)
      .get() as { amount: number };
    expect(row.amount).toBe(5500000);
  });
});

describe('composition inside a caller transaction (INV-2/INV-4)', () => {
  it('commits the entity row and its audit row together', () => {
    const yearId = Number(
      temp.sqlite.prepare(`INSERT INTO tax_years (year, status) VALUES (2025, 'open')`).run()
        .lastInsertRowid,
    );

    const create = temp.sqlite.transaction((amountMinor: number) => {
      const id = Number(
        temp.sqlite
          .prepare(
            `INSERT INTO transactions (tax_year_id, kind, income_section, date, amount_minor)
             VALUES (?, 'income', '40_1', '2025-01-31', ?)`,
          )
          .run(yearId, amountMinor).lastInsertRowid,
      );
      recordMutation(temp.sqlite, {
        entityType: 'transaction',
        entityId: id,
        action: 'create',
        after: { id, amountMinor },
      });
      return id;
    });

    const id = create(123456);
    expect(countRows()).toBe(1);
    expect(listEntityHistory(temp.sqlite, 'transaction', id)).toHaveLength(1);
  });

  it('rolls the audit row back when the caller transaction fails', () => {
    const attempt = temp.sqlite.transaction(() => {
      recordMutation(temp.sqlite, {
        entityType: 'transaction',
        entityId: 42,
        action: 'update',
        before: SAMPLE_BEFORE,
        after: SAMPLE_AFTER,
      });
      throw new Error('business rule rejected the edit');
    });

    expect(() => attempt()).toThrowError(/business rule/);
    expect(countRows()).toBe(0);
  });
});

describe('reads', () => {
  it('returns one entity history oldest-first with parsed sides', () => {
    recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 7,
      action: 'create',
      after: SAMPLE_BEFORE,
    });
    recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 7,
      action: 'update',
      before: SAMPLE_BEFORE,
      after: SAMPLE_AFTER,
    });
    recordMutation(temp.sqlite, {
      entityType: 'transaction',
      entityId: 8,
      action: 'create',
      after: { id: 8 },
    });

    const history = listEntityHistory(temp.sqlite, 'transaction', 7);
    expect(history.map((entry) => entry.action)).toEqual(['create', 'update']);
    expect(history[0].before).toBeNull();
    expect(history[1].before).toEqual(SAMPLE_BEFORE);
    expect(history[1].after).toEqual(SAMPLE_AFTER);
  });

  it('lists recent mutations newest-first and honours the limit', () => {
    for (let i = 1; i <= 5; i += 1) {
      recordMutation(temp.sqlite, {
        entityType: 'setting',
        entityId: i,
        action: 'update',
        after: { value: i },
      });
    }

    const recent = listRecentMutations(temp.sqlite, 2);
    expect(recent.map((entry) => entry.entityId)).toEqual([5, 4]);
    expect(() => listRecentMutations(temp.sqlite, 0)).toThrowError(AuditLogError);
  });

  it('parseEntry turns a raw row into its before/after objects', () => {
    const row = recordMutation(temp.sqlite, {
      entityType: 'tax_year',
      entityId: 1,
      action: 'reopen',
      before: { status: 'closed' },
      after: { status: 'open' },
    });

    expect(parseEntry(row).before).toEqual({ status: 'closed' });
    expect(parseEntry(row).after).toEqual({ status: 'open' });
  });
});

describe('createAuditLogRepository', () => {
  it('binds the same behaviour to one connection', () => {
    const repo = createAuditLogRepository(temp.sqlite);
    const row = repo.record({
      entityType: 'deduction_entry',
      entityId: 2,
      action: 'update',
      before: { amountMinor: 1 },
      after: { amountMinor: 2 },
    });

    expect(countRows()).toBe(1);
    expect(repo.listEntityHistory('deduction_entry', 2)).toHaveLength(1);
    expect(repo.listRecent()[0].id).toBe(row.id);
  });
});
