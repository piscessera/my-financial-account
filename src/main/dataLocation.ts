/**
 * Data-location logic (AT-1.6, AC-18/AC-19).
 *
 * Pure Node/fs logic, no `electron` import — Electron-specific glue (the folder-picker dialog,
 * resolving Electron's userData dir) lives in `electron/main.ts`, which calls these functions.
 * The remembered folder is a small JSON config file kept in `configDir` — Electron's userData
 * directory, deliberately **outside** the Google Drive-synced data folder (CLAUDE.md storage
 * constraint), so the app always knows where to look even before that folder syncs down.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { openDatabase } from './db/client';
import { seedDatabase } from './db/seed';
import { TAX_YEAR_2025_SEED } from './db/seedData/taxYear2025';

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
