/**
 * Migration runner (AT-1.3).
 *
 * Deliberately tiny and dependency-free: migrations are an ordered list of SQL scripts,
 * the applied version lives in SQLite's own `user_version` pragma, and each migration runs
 * inside a transaction. We do not use `drizzle-kit`'s generated migration folder — the DDL
 * in `migrations/` is hand-written so that the CHECK constraints carrying the domain
 * invariants stay explicit and reviewable in diffs (CLAUDE.md §Project).
 *
 * Rules:
 * - Migrations are append-only. Never edit a migration that has shipped; add a new one.
 * - SQLite cannot alter a table's constraints, so a constraint change means a
 *   create-new / copy / drop / rename migration.
 */
import type BetterSqlite3 from 'better-sqlite3';

import { MIGRATION_001_SQL } from './migrations/001-initial-schema';

export interface Migration {
  /** 1-based, contiguous, never reordered. Stored in `PRAGMA user_version`. */
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: '001-initial-schema', sql: MIGRATION_001_SQL },
];

/** The schema version this build of the app expects. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

export function getSchemaVersion(db: BetterSqlite3.Database): number {
  const row = db.pragma('user_version', { simple: true });
  return Number(row);
}

export interface MigrateResult {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly string[];
}

/**
 * Applies every migration newer than the database's current `user_version`.
 * Idempotent: running it on an up-to-date database applies nothing.
 *
 * Throws if the database was written by a newer build of the app (downgrade guard) —
 * the caller must surface that to the user rather than risk writing money rows through
 * a schema it does not understand.
 */
export function migrateToLatest(db: BetterSqlite3.Database): MigrateResult {
  const from = getSchemaVersion(db);

  if (from > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${from} is newer than this app supports (${LATEST_SCHEMA_VERSION}). ` +
        'Update the application before opening this file.',
    );
  }

  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  const applied: string[] = [];

  for (const migration of pending) {
    // better-sqlite3 cannot run `exec` inside a prepared transaction wrapper, so the
    // transaction is driven with explicit statements.
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      // `user_version` does not accept a bound parameter; the value is a trusted integer
      // from MIGRATIONS, not user input.
      db.pragma(`user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
    applied.push(migration.name);
  }

  return { from, to: getSchemaVersion(db), applied };
}
