/**
 * App database singleton (AT-2.5).
 *
 * Every earlier task (AT-1.6 onward) opened its own short-lived `openDatabase()` connection
 * per call. IPC handlers need one connection that stays open for the app's lifetime instead —
 * opened once the data folder is known (at startup if `dataLocation.get()` already resolves
 * one, or right after `dataLocation.createInFolder()` on first run) and closed on quit.
 *
 * This module owns exactly that one connection. It is Electron-agnostic (no `electron`
 * import) so it stays unit-testable under Vitest; `electron/main.ts` is the only caller.
 */
import { openDatabase, type DatabaseHandle } from './client';
import { resolveDbPath } from '../dataLocation';

let current: DatabaseHandle | null = null;

/** Opens (or re-opens, closing whatever was open first) the DB at `folderPath`. */
export function openAppDatabase(folderPath: string): DatabaseHandle {
  if (current) current.close();
  current = openDatabase(resolveDbPath(folderPath));
  return current;
}

/** The open connection, or `null` if `openAppDatabase` hasn't been called yet. */
export function getAppDatabase(): DatabaseHandle | null {
  return current;
}

export function closeAppDatabase(): void {
  current?.close();
  current = null;
}
