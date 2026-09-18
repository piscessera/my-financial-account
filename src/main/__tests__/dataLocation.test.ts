import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Named-import friendly partial mock: only `rmSync` is ever swapped out (per-test, via
// `failRmPath`), so TC-0002 #12 (old-folder cleanup failure) can be exercised without a real,
// platform-specific file lock. Every other export — including this file's own `rmSync` import
// above — passes straight through to the real module.
let failRmPath: string | null = null;
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    rmSync: (...args: Parameters<typeof actual.rmSync>) => {
      if (failRmPath !== null && args[0] === failRmPath) {
        throw new Error('EPERM: mocked file lock (TC-0002 #12)');
      }
      return actual.rmSync(...args);
    },
  };
});

import {
  changeFolder,
  createInFolder,
  getDataLocationInfo,
  readDataLocationConfig,
  resolveDbPath,
  targetHasExistingDb,
} from '../dataLocation';
import { openDatabase } from '../db/client';
import { listEntityHistory } from '../repositories/auditLog';

let configDir: string;
let dataDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'mfa-config-'));
  dataDir = mkdtempSync(join(tmpdir(), 'mfa-data-'));
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

describe('getDataLocationInfo', () => {
  it('returns null when no folder has been configured yet', () => {
    expect(getDataLocationInfo(configDir)).toBeNull();
  });
});

describe('createInFolder', () => {
  it('creates+migrates the DB, remembers the folder, and can be read back', () => {
    const info = createInFolder(configDir, dataDir);

    expect(info.folderPath).toBe(dataDir);
    expect(info.dbFilePath).toBe(resolveDbPath(dataDir));
    expect(existsSync(info.dbFilePath)).toBe(true);
    expect(info.sizeBytes).toBeGreaterThan(0);

    expect(readDataLocationConfig(configDir)).toEqual({ folderPath: dataDir });
    expect(getDataLocationInfo(configDir)).toEqual(info);
  });

  it('creates the target folder if it does not exist yet', () => {
    const freshFolder = join(dataDir, 'nested', 'my-tax-data');
    const info = createInFolder(configDir, freshFolder);
    expect(existsSync(info.dbFilePath)).toBe(true);
  });
});

describe('targetHasExistingDb', () => {
  it('returns false for a folder with no DB file (TC-0002 #4)', () => {
    expect(targetHasExistingDb(dataDir)).toBe(false);
  });

  it('returns true for a folder that already has a DB file (TC-0002 #4)', () => {
    const otherConfigDir = mkdtempSync(join(tmpdir(), 'mfa-config-'));
    try {
      createInFolder(otherConfigDir, dataDir);
      expect(targetHasExistingDb(dataDir)).toBe(true);
    } finally {
      rmSync(otherConfigDir, { recursive: true, force: true });
    }
  });
});

describe('changeFolder', () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), 'mfa-target-'));
    rmSync(targetDir, { recursive: true, force: true }); // fresh, non-existent path by default
  });

  afterEach(() => {
    failRmPath = null;
    rmSync(targetDir, { recursive: true, force: true });
  });

  it('moves the DB into an empty target folder and removes the original (TC-0002 #3)', () => {
    createInFolder(configDir, dataDir);
    const sourceDbPath = resolveDbPath(dataDir);

    const result = changeFolder(configDir, dataDir, targetDir, 'move');

    expect(result.mode).toBe('move');
    expect(result.info.folderPath).toBe(targetDir);
    expect(existsSync(resolveDbPath(targetDir))).toBe(true);
    expect(existsSync(sourceDbPath)).toBe(false);
    expect(readDataLocationConfig(configDir)).toEqual({ folderPath: targetDir });
  });

  it('creates the target folder if it does not exist yet (TC-0002 #3a)', () => {
    createInFolder(configDir, dataDir);
    const nestedTarget = join(targetDir, 'nested', 'my-tax-data');

    const result = changeFolder(configDir, dataDir, nestedTarget, 'move');

    expect(existsSync(resolveDbPath(nestedTarget))).toBe(true);
    expect(result.info.folderPath).toBe(nestedTarget);
  });

  it('switches to a folder that already has a valid DB, without copying (TC-0002 #5)', () => {
    createInFolder(configDir, dataDir); // current
    const otherConfigDir = mkdtempSync(join(tmpdir(), 'mfa-config-'));
    try {
      createInFolder(otherConfigDir, targetDir); // target already has its own DB
      const sourceDbPath = resolveDbPath(dataDir);

      const result = changeFolder(configDir, dataDir, targetDir, 'switch');

      expect(result.mode).toBe('switch');
      expect(result.info.folderPath).toBe(targetDir);
      expect(existsSync(sourceDbPath)).toBe(true); // untouched — no copy, no delete
      expect(readDataLocationConfig(configDir)).toEqual({ folderPath: targetDir });
    } finally {
      rmSync(otherConfigDir, { recursive: true, force: true });
    }
  });

  it('move refuses to overwrite an existing DB at the target (TC-0002 #6, INV-7)', () => {
    createInFolder(configDir, dataDir);
    const otherConfigDir = mkdtempSync(join(tmpdir(), 'mfa-config-'));
    try {
      createInFolder(otherConfigDir, targetDir); // target already has a DB

      expect(() => changeFolder(configDir, dataDir, targetDir, 'move')).toThrow(
        /already exists/i,
      );
      expect(readDataLocationConfig(configDir)).toEqual({ folderPath: dataDir });
      expect(existsSync(resolveDbPath(dataDir))).toBe(true);
    } finally {
      rmSync(otherConfigDir, { recursive: true, force: true });
    }
  });

  it('records an audit row for a move (TC-0002 #8, INV-4)', () => {
    createInFolder(configDir, dataDir);
    changeFolder(configDir, dataDir, targetDir, 'move');

    const handle = openDatabase(resolveDbPath(targetDir));
    try {
      const history = listEntityHistory(handle.sqlite, 'data_location', 1);
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('update');
      expect(history[0].before).toEqual({ folderPath: dataDir });
      expect(history[0].after).toEqual({ folderPath: targetDir, mode: 'move' });
    } finally {
      handle.close();
    }
  });

  it('records an audit row for a switch (TC-0002 #9, INV-4)', () => {
    createInFolder(configDir, dataDir);
    const otherConfigDir = mkdtempSync(join(tmpdir(), 'mfa-config-'));
    try {
      createInFolder(otherConfigDir, targetDir);
      changeFolder(configDir, dataDir, targetDir, 'switch');

      const handle = openDatabase(resolveDbPath(targetDir));
      try {
        const history = listEntityHistory(handle.sqlite, 'data_location', 1);
        expect(history).toHaveLength(1);
        expect(history[0].after).toEqual({ folderPath: targetDir, mode: 'switch' });
      } finally {
        handle.close();
      }
    } finally {
      rmSync(otherConfigDir, { recursive: true, force: true });
    }
  });

  it('fails safely when the target is not writable, leaving the config untouched (TC-0002 #10, INV-6)', () => {
    createInFolder(configDir, dataDir);
    const blockerFile = join(tmpdir(), `mfa-blocker-${Date.now()}`);
    writeFileSync(blockerFile, 'not a folder');
    const unwritableTarget = join(blockerFile, 'nested'); // mkdirSync must fail: parent is a file

    try {
      expect(() => changeFolder(configDir, dataDir, unwritableTarget, 'move')).toThrow();
      expect(readDataLocationConfig(configDir)).toEqual({ folderPath: dataDir });
      expect(existsSync(resolveDbPath(dataDir))).toBe(true);
    } finally {
      rmSync(blockerFile, { force: true });
    }
  });

  it('never touches the source or the config if the copied DB fails to open (TC-0002 #11, INV-6)', () => {
    createInFolder(configDir, dataDir);
    const sourceDbPath = resolveDbPath(dataDir);
    writeFileSync(sourceDbPath, 'not a real sqlite file'); // simulate a corrupt source

    expect(() => changeFolder(configDir, dataDir, targetDir, 'move')).toThrow();
    expect(readDataLocationConfig(configDir)).toEqual({ folderPath: dataDir });
    expect(existsSync(sourceDbPath)).toBe(true);
  });

  it('reports a cleanup warning (not a failure) when removing the old folder fails (TC-0002 #12)', () => {
    createInFolder(configDir, dataDir);
    failRmPath = resolveDbPath(dataDir);

    const result = changeFolder(configDir, dataDir, targetDir, 'move');

    expect(result.oldFolderCleanupWarning).toBeDefined();
    expect(result.info.folderPath).toBe(targetDir);
    expect(readDataLocationConfig(configDir)).toEqual({ folderPath: targetDir });
  });

  it('persists across a simulated restart (TC-0002 #13)', () => {
    createInFolder(configDir, dataDir);
    changeFolder(configDir, dataDir, targetDir, 'move');

    expect(readDataLocationConfig(configDir)).toEqual({ folderPath: targetDir });
    expect(getDataLocationInfo(configDir)?.folderPath).toBe(targetDir);
  });

  it('refuses to change to the same folder it is already using (TC-0002 #14, INV-7)', () => {
    createInFolder(configDir, dataDir);
    expect(() => changeFolder(configDir, dataDir, dataDir, 'move')).toThrow(
      /already the current data folder/i,
    );
  });
});
