/**
 * Data-location logic (AT-1.6, AC-18/AC-19).
 *
 * Pure Node/fs logic, no `electron` import — Electron-specific glue (the folder-picker dialog,
 * resolving Electron's userData dir) lives in `electron/main.ts`, which calls these functions.
 * The remembered folder is a small JSON config file kept in `configDir` — Electron's userData
 * directory, deliberately **outside** the Google Drive-synced data folder (CLAUDE.md storage
 * constraint), so the app always knows where to look even before that folder syncs down.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import { openDatabase } from './db/client';
import { seedDatabase } from './db/seed';
import { TAX_YEAR_2025_SEED } from './db/seedData/taxYear2025';
import { ATTACHMENTS_DIRNAME } from './repositories/attachments';
import { recordMutation } from './repositories/auditLog';

export const DB_FILENAME = 'my-financial-account.db';
const CONFIG_FILENAME = 'data-location.json';

export interface DataLocationConfig {
  readonly folderPath: string;
}

/** Thrown when a caller hands `changeFolder` an invalid target or state (AT-1.1). */
export class DataLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataLocationError';
  }
}

/** Read-only status the Onboarding/Settings screens display (AC-19). */
export interface DataLocationInfo {
  readonly folderPath: string;
  readonly dbFilePath: string;
  readonly sizeBytes: number;
  readonly lastModified: string;
}

function configFilePath(configDir: string): string {
  return path.join(configDir, CONFIG_FILENAME);
}

export function resolveDbPath(folderPath: string): string {
  return path.join(folderPath, DB_FILENAME);
}

/** True if `targetFolderPath` already has a DB file at it (REQ-0002 AC-4's warn condition). */
export function targetHasExistingDb(targetFolderPath: string): boolean {
  return existsSync(resolveDbPath(targetFolderPath));
}

/** The remembered folder, or `null` if none is configured (or the file is missing/malformed). */
export function readDataLocationConfig(configDir: string): DataLocationConfig | null {
  const file = configFilePath(configDir);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DataLocationConfig>;
    if (typeof parsed.folderPath !== 'string' || parsed.folderPath.length === 0) return null;
    return { folderPath: parsed.folderPath };
  } catch {
    return null;
  }
}

function writeDataLocationConfig(configDir: string, folderPath: string): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configFilePath(configDir), JSON.stringify({ folderPath }, null, 2));
}

/**
 * Current data-location status (`dataLocation.get()`, AC-19, read-only): the remembered
 * folder plus its DB file's size/last-modified. `null` means onboarding has not completed yet
 * (no config, or the DB file the config points at is missing) — the renderer's signal to show
 * the Onboarding screen instead of the Dashboard.
 */
export function getDataLocationInfo(configDir: string): DataLocationInfo | null {
  const config = readDataLocationConfig(configDir);
  if (!config) return null;
  const dbFilePath = resolveDbPath(config.folderPath);
  if (!existsSync(dbFilePath)) return null;
  const stats = statSync(dbFilePath);
  return {
    folderPath: config.folderPath,
    dbFilePath,
    sizeBytes: stats.size,
    lastModified: stats.mtime.toISOString(),
  };
}

/**
 * First-run only (`dataLocation.createInFolder()`, AC-18): creates+migrates the DB in
 * `folderPath`, seeds it (today's built-in `TAX_YEAR_2025_SEED` is empty — ANA-0001 decision
 * 14 — so this inserts zero rows), and remembers the folder so every later launch resolves
 * straight to it via {@link getDataLocationInfo}.
 */
export function createInFolder(configDir: string, folderPath: string): DataLocationInfo {
  mkdirSync(folderPath, { recursive: true });
  const handle = openDatabase(resolveDbPath(folderPath));
  try {
    seedDatabase(handle.sqlite, TAX_YEAR_2025_SEED);
  } finally {
    handle.close();
  }
  writeDataLocationConfig(configDir, folderPath);

  const info = getDataLocationInfo(configDir);
  if (!info) {
    throw new Error('createInFolder: failed to read back the data location it just created.');
  }
  return info;
}

export type ChangeFolderMode = 'move' | 'switch';

export interface ChangeFolderResult {
  readonly info: DataLocationInfo;
  readonly mode: ChangeFolderMode;
  /**
   * Set only when `mode: 'move'` succeeded but removing the *original* folder's data
   * afterward failed (e.g. a locked file) — the move itself already committed (the config
   * points at the verified new folder), so this is a cleanup warning, not a failure (ANA-0002
   * decision #2).
   */
  readonly oldFolderCleanupWarning?: string;
}

function requireInfo(configDir: string): DataLocationInfo {
  const info = getDataLocationInfo(configDir);
  if (!info) {
    throw new DataLocationError('changeFolder: failed to read back the data location it just wrote.');
  }
  return info;
}

function recordFolderChangeAudit(
  sqlite: BetterSqlite3.Database,
  currentFolderPath: string,
  targetFolderPath: string,
  mode: ChangeFolderMode,
): void {
  recordMutation(sqlite, {
    entityType: 'data_location',
    // Sentinel id — the data-location config is a singleton with no DB row of its own.
    entityId: 1,
    action: 'update',
    before: { folderPath: currentFolderPath },
    after: { folderPath: targetFolderPath, mode },
  });
}

function copyAttachmentsIfPresent(currentFolderPath: string, targetFolderPath: string): void {
  const source = path.join(currentFolderPath, ATTACHMENTS_DIRNAME);
  if (!existsSync(source)) return;
  cpSync(source, path.join(targetFolderPath, ATTACHMENTS_DIRNAME), { recursive: true });
}

/**
 * Repoints the configured data folder after setup (REQ-0002, ANA-0002).
 *
 * `mode: 'switch'` points the config at a folder that already has its own valid DB — no file
 * copy; the target DB is opened (and migrated, same as any other reopen) to confirm it is
 * usable before the config is rewritten.
 *
 * `mode: 'move'` copies the current DB (and any `attachments/` folder) into `targetFolderPath`,
 * opens the copy to verify it, records the audit row, and only *then* rewrites the config and
 * deletes the original — so a failure at any earlier step leaves `data-location.json` (and
 * therefore the whole app) still pointed at the original, working folder (AC-7/INV-6). It
 * never overwrites an existing DB at the target (AC-4/INV-7) — the caller must resolve that
 * conflict (offer `switch`, or cancel) before calling `move`.
 */
export function changeFolder(
  configDir: string,
  currentFolderPath: string,
  targetFolderPath: string,
  mode: ChangeFolderMode,
): ChangeFolderResult {
  if (path.resolve(currentFolderPath) === path.resolve(targetFolderPath)) {
    throw new DataLocationError('changeFolder: the selected folder is already the current data folder.');
  }

  if (mode === 'switch') {
    if (!targetHasExistingDb(targetFolderPath)) {
      throw new DataLocationError(
        `changeFolder: mode "switch" requires an existing database at "${targetFolderPath}".`,
      );
    }
    const handle = openDatabase(resolveDbPath(targetFolderPath));
    try {
      recordFolderChangeAudit(handle.sqlite, currentFolderPath, targetFolderPath, mode);
    } finally {
      handle.close();
    }
    writeDataLocationConfig(configDir, targetFolderPath);
    return { info: requireInfo(configDir), mode };
  }

  // mode === 'move'
  if (targetHasExistingDb(targetFolderPath)) {
    throw new DataLocationError(
      `changeFolder: a database already exists at "${targetFolderPath}" — use mode "switch" or choose a different folder.`,
    );
  }

  mkdirSync(targetFolderPath, { recursive: true });
  copyFileSync(resolveDbPath(currentFolderPath), resolveDbPath(targetFolderPath));
  copyAttachmentsIfPresent(currentFolderPath, targetFolderPath);

  // Verify the copy is a real, openable database before touching the original or the config.
  const handle = openDatabase(resolveDbPath(targetFolderPath));
  try {
    recordFolderChangeAudit(handle.sqlite, currentFolderPath, targetFolderPath, mode);
  } finally {
    handle.close();
  }

  writeDataLocationConfig(configDir, targetFolderPath);

  let oldFolderCleanupWarning: string | undefined;
  try {
    rmSync(resolveDbPath(currentFolderPath), { force: true });
    const oldAttachments = path.join(currentFolderPath, ATTACHMENTS_DIRNAME);
    if (existsSync(oldAttachments)) rmSync(oldAttachments, { recursive: true, force: true });
  } catch (error) {
    oldFolderCleanupWarning = `Could not remove the old data at "${currentFolderPath}": ${
      (error as Error).message
    }`;
  }

  return {
    info: requireInfo(configDir),
    mode,
    ...(oldFolderCleanupWarning ? { oldFolderCleanupWarning } : {}),
  };
}
