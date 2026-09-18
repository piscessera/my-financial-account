import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createInFolder,
  getDataLocationInfo,
  readDataLocationConfig,
  resolveDbPath,
  targetHasExistingDb,
} from '../dataLocation';

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
