/**
 * `audit_log` repository (AT-1.7, INV-4).
 *
 * INV-4: "Every mutation (transaction create/edit/reversal, deduction entry change, settings
 * change, tax-year close/reopen) writes an `audit_log` row (entity, action, before→after,
 * timestamp). Single repository layer is the only writer; every write path inserts to
 * `audit_log`."
 *
 * This module is that single writer. Every later repository (transactions, deduction
 * entries, tax years, settings) calls {@link recordMutation} from inside its **own**
 * better-sqlite3 transaction, so the business row and its audit row commit or roll back
 * together (INV-2 — an edit is never visible without its audit trail):
 *
 * ```ts
 * const update = sqlite.transaction((input: EditInput) => {
 *   const before = selectRow.get(input.id);
 *   updateRow.run(input);
 *   const after = selectRow.get(input.id);
 *   recordMutation(sqlite, {
 *     entityType: 'transaction', entityId: input.id, action: 'update', before, after,
 *   });
 *   return after;
 * });
 * update(input); // one atomic commit
 * ```
 *
 * Conventions this file follows (same as `db/client.ts` / `db/migrate.ts`):
 * - it takes the **raw** `better-sqlite3` connection, not the Drizzle handle, because the
 *   money-affecting write paths use explicit SQL. Passing `handle.sqlite` from inside a
 *   `handle.db.transaction(...)` callback is also correct: Drizzle's better-sqlite3 driver
 *   runs on that very connection, so the raw insert joins the open transaction.
 * - statements are prepared once per connection and cached (see {@link statementsFor}).
 *
 * Deliberately **not** done here: no diffing or trimming of the snapshots. The row stores
 * the full before/after entity as the repository saw it; readers diff at display time. An
 * audit row is evidence — it must stand alone, without replaying later schema changes.
 */
import type BetterSqlite3 from 'better-sqlite3';

import type { AuditLogRow } from '../db/schema';

/**
 * Entities that can be audited. Add a member when a new repository starts writing — the
 * column itself is free text, the union is what keeps typos out of the history.
 */
export type AuditEntityType =
  | 'transaction'
  | 'attachment'
  | 'deduction_entry'
  | 'deduction_category'
  | 'tax_year'
  | 'setting'
  | 'data_location'
  | 'recurring_template'
  | 'recurring_monthly_log';

/**
 * What happened to the entity.
 * - `create` / `update` / `delete` — the ordinary CRUD of an open tax year.
 * - `void` / `reverse` — the correction path for a closed year (INV-3): the original row is
 *   never silently edited, so these carry the reversal's own id as `entityId`.
 * - `close` / `reopen` — tax-year status transitions.
 * - `import` — a row created by the CSV/Excel import path rather than by hand.
 */
export type AuditAction =
  'create' | 'update' | 'delete' | 'void' | 'reverse' | 'close' | 'reopen' | 'import';

/** A snapshot of an entity as stored in `before_json` / `after_json`. */
export type AuditSnapshot = Record<string, unknown>;

export interface RecordMutationInput {
  readonly entityType: AuditEntityType;
  /** The `rowid` of the affected entity. */
  readonly entityId: number;
  readonly action: AuditAction;
  /** State before the mutation. Omit (or `null`) for a creation. */
  readonly before?: AuditSnapshot | null;
  /** State after the mutation. Omit (or `null`) for a deletion. */
  readonly after?: AuditSnapshot | null;
  /**
   * Override the timestamp (UTC ISO-8601, `YYYY-MM-DDTHH:MM:SS.sssZ`). Defaults to the
   * column default — the database clock — which is what production code should use.
   */
  readonly occurredAt?: string;
}

/** Thrown when a caller hands {@link recordMutation} something unloggable. */
export class AuditLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditLogError';
  }
}

const UTC_ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface Statements {
  readonly insert: BetterSqlite3.Statement;
  readonly insertAt: BetterSqlite3.Statement;
  readonly selectById: BetterSqlite3.Statement;
  readonly selectByEntity: BetterSqlite3.Statement;
  readonly selectRecent: BetterSqlite3.Statement;
}

const INSERT_COLUMNS = 'entity_type, entity_id, action, before_json, after_json';

/**
 * Prepared statements are per-connection and cheap to reuse; a `WeakMap` keyed by the
 * connection keeps them out of the way of test databases that open and close freely.
 */
const statementCache = new WeakMap<BetterSqlite3.Database, Statements>();

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    insert: sqlite.prepare(`INSERT INTO audit_log (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?)`),
    insertAt: sqlite.prepare(
      `INSERT INTO audit_log (${INSERT_COLUMNS}, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    selectById: sqlite.prepare(`SELECT * FROM audit_log WHERE id = ?`),
    selectByEntity: sqlite.prepare(
      `SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY id ASC`,
    ),
    selectRecent: sqlite.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`),
  };
  statementCache.set(sqlite, statements);
  return statements;
}

/**
 * Serialize a snapshot with **sorted keys**, so a before/after pair of the same entity
 * differs only where the data differs (column order must not show up as a change).
 * The `audit_log` CHECK requires `json_valid()`; an object literal always satisfies it.
 */
function toJson(snapshot: AuditSnapshot, side: 'before' | 'after'): string {
  if (typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new AuditLogError(`audit_log ${side} must be a plain object, got ${typeof snapshot}.`);
  }

  let json: string | undefined;
  try {
    json = JSON.stringify(snapshot, sortKeys);
  } catch (error) {
    throw new AuditLogError(
      `audit_log ${side} could not be serialized to JSON: ${(error as Error).message}`,
    );
  }
  if (json === undefined) {
    throw new AuditLogError(`audit_log ${side} could not be serialized to JSON.`);
  }
  return json;
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  // `Object.keys` order is insertion order for string keys; rebuilding sorted makes the
  // serialized form canonical. Applied at every level by the replacer's recursion.
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    if (source[key] !== undefined) sorted[key] = source[key];
  }
  return sorted;
}

function assertValidInput(input: RecordMutationInput): void {
  if (typeof input.entityType !== 'string' || input.entityType.length === 0) {
    throw new AuditLogError('audit_log entityType is required.');
  }
  if (typeof input.action !== 'string' || input.action.length === 0) {
    throw new AuditLogError('audit_log action is required.');
  }
  if (!Number.isSafeInteger(input.entityId)) {
    throw new AuditLogError(
      `audit_log entityId must be an integer row id, got ${String(input.entityId)}.`,
    );
  }
  if (input.before == null && input.after == null) {
    throw new AuditLogError(
      `audit_log needs at least one of before/after (${input.entityType} ${input.action}): ` +
        'a row with neither records nothing (INV-4).',
    );
  }
  if (input.occurredAt !== undefined && !UTC_ISO_8601.test(input.occurredAt)) {
    throw new AuditLogError(
      `audit_log occurredAt must be UTC ISO-8601 (YYYY-MM-DDTHH:MM:SS.sssZ), got "${input.occurredAt}".`,
    );
  }
}

/**
 * Write **exactly one** `audit_log` row for one mutation and return it.
 *
 * Call it from inside the caller's own transaction so the entity write and its audit row
 * are one atomic commit (see the module header for the shape). Standalone use — outside any
 * transaction — is equally valid for mutations that are themselves a single statement.
 *
 * @throws {AuditLogError} if neither `before` nor `after` is given, if the ids/timestamp are
 * malformed, or if a snapshot cannot be serialized. Throwing inside the caller's transaction
 * rolls the whole mutation back, which is the intended behaviour: no audit row, no edit.
 */
export function recordMutation(
  sqlite: BetterSqlite3.Database,
  input: RecordMutationInput,
): AuditLogRow {
  assertValidInput(input);

  const beforeJson = input.before == null ? null : toJson(input.before, 'before');
  const afterJson = input.after == null ? null : toJson(input.after, 'after');
  const statements = statementsFor(sqlite);

  const info =
    input.occurredAt === undefined
      ? statements.insert.run(input.entityType, input.entityId, input.action, beforeJson, afterJson)
      : statements.insertAt.run(
          input.entityType,
          input.entityId,
          input.action,
          beforeJson,
          afterJson,
          input.occurredAt,
        );

  return toAuditLogRow(statements.selectById.get(Number(info.lastInsertRowid)));
}

/** Raw `audit_log` table row, snake_case as SQLite returns it. */
interface RawAuditLogRow {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  before_json: string | null;
  after_json: string | null;
  occurred_at: string;
}

function toAuditLogRow(raw: unknown): AuditLogRow {
  const row = raw as RawAuditLogRow;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    occurredAt: row.occurred_at,
  };
}

/** An `audit_log` row with its JSON sides parsed back into objects. */
export interface AuditEntry extends AuditLogRow {
  readonly before: AuditSnapshot | null;
  readonly after: AuditSnapshot | null;
}

/** Parse the JSON sides of a row — for the history/audit UI, never for a write path. */
export function parseEntry(row: AuditLogRow): AuditEntry {
  return {
    ...row,
    before: row.beforeJson === null ? null : (JSON.parse(row.beforeJson) as AuditSnapshot),
    after: row.afterJson === null ? null : (JSON.parse(row.afterJson) as AuditSnapshot),
  };
}

/** Full history of one entity, oldest first. */
export function listEntityHistory(
  sqlite: BetterSqlite3.Database,
  entityType: AuditEntityType,
  entityId: number,
): AuditEntry[] {
  return statementsFor(sqlite)
    .selectByEntity.all(entityType, entityId)
    .map((raw) => parseEntry(toAuditLogRow(raw)));
}

/** The `limit` most recent entries across all entities, newest first. */
export function listRecentMutations(sqlite: BetterSqlite3.Database, limit = 50): AuditEntry[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new AuditLogError(`audit_log limit must be a positive integer, got ${String(limit)}.`);
  }
  return statementsFor(sqlite)
    .selectRecent.all(limit)
    .map((raw) => parseEntry(toAuditLogRow(raw)));
}

/**
 * Object form of this module, for call sites that would rather hold a repository than pass
 * the connection every time. It is the same functions bound to one connection — there is
 * still exactly one writer.
 */
export interface AuditLogRepository {
  record(input: RecordMutationInput): AuditLogRow;
  listEntityHistory(entityType: AuditEntityType, entityId: number): AuditEntry[];
  listRecent(limit?: number): AuditEntry[];
}

export function createAuditLogRepository(sqlite: BetterSqlite3.Database): AuditLogRepository {
  return {
    record: (input) => recordMutation(sqlite, input),
    listEntityHistory: (entityType, entityId) => listEntityHistory(sqlite, entityType, entityId),
    listRecent: (limit) => listRecentMutations(sqlite, limit),
  };
}
