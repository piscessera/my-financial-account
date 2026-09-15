/**
 * Database client (AT-1.3) — the single place that opens the SQLite file.
 *
 * Only the Electron **main** process may call this; the renderer reaches the database
 * exclusively through the typed IPC surface (CLAUDE.md §Project).
 */
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import { migrateToLatest, type MigrateResult } from './migrate';
import * as schema from './schema';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  /** Drizzle handle — use for typed reads/writes. */
  readonly db: AppDatabase;
  /** Raw driver — use for explicit money-affecting SQL and for pragmas. */
  readonly sqlite: BetterSqlite3.Database;
  readonly migration: MigrateResult;
  close(): void;
}

export interface OpenDatabaseOptions {
  /** Skip `migrateToLatest` (used by tests that want to observe an un-migrated file). */
  readonly migrate?: boolean;
  readonly readonly?: boolean;
}

/**
 * Applies the connection pragmas every connection must have.
 *
 * `journal_mode` is deliberately left at the default (`delete`) rather than WAL: the
 * database file lives in a Google Drive-synced folder (CLAUDE.md §Project), and WAL
 * spreads committed state across `-wal`/`-shm` side files that a file syncer can copy
 * out of step with the main file. A single self-contained `.db` file is what Drive's
 * version history can actually roll back to.
 */
function applyPragmas(sqlite: BetterSqlite3.Database): void {
  sqlite.pragma('foreign_keys = ON'); // FKs are OFF by default in SQLite.
  sqlite.pragma('journal_mode = DELETE');
  sqlite.pragma('synchronous = FULL');
  sqlite.pragma('busy_timeout = 5000');
}

/** Opens (creating if needed) the database at `filePath` and brings it to the latest schema. */
export function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): DatabaseHandle {
  const sqlite = new BetterSqlite3(filePath, { readonly: options.readonly ?? false });
  try {
    applyPragmas(sqlite);
    const migration =
      options.migrate === false
        ? { from: 0, to: 0, applied: [] as readonly string[] }
        : migrateToLatest(sqlite);

    const db = drizzle(sqlite, { schema });
    return {
      db,
      sqlite,
      migration,
      close: () => sqlite.close(),
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}
