import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { hostname } from 'node:os';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkAndClaimLock } from '../lockFile';

let folder: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'mfa-lock-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('checkAndClaimLock', () => {
  it('is silent (no warning) when no lock file exists yet', () => {
    const result = checkAndClaimLock(folder, Date.parse('2026-09-17T10:00:00.000Z'));
    expect(result).toEqual({ warn: false, previous: null });
  });

  it('claims the lock with the current hostname + timestamp', () => {
    const now = Date.parse('2026-09-17T10:00:00.000Z');
    checkAndClaimLock(folder, now);
    const written = JSON.parse(readFileSync(join(folder, '.lock'), 'utf8'));
    expect(written).toEqual({ hostname: hostname(), timestamp: '2026-09-17T10:00:00.000Z' });
  });

  it('is silent when the existing lock is stale (>= 5 minutes old)', () => {
    const firstClaim = Date.parse('2026-09-17T10:00:00.000Z');
    checkAndClaimLock(folder, firstClaim);

    const fiveMinutesLater = firstClaim + 5 * 60 * 1000;
    const result = checkAndClaimLock(folder, fiveMinutesLater);
    expect(result.warn).toBe(false);
    expect(result.previous).toEqual({ hostname: hostname(), timestamp: '2026-09-17T10:00:00.000Z' });
  });

  it('warns when the existing lock is recent (< 5 minutes old)', () => {
    const firstClaim = Date.parse('2026-09-17T10:00:00.000Z');
    checkAndClaimLock(folder, firstClaim);

    const fourMinutesLater = firstClaim + 4 * 60 * 1000;
    const result = checkAndClaimLock(folder, fourMinutesLater);
    expect(result.warn).toBe(true);
    expect(result.previous?.timestamp).toBe('2026-09-17T10:00:00.000Z');
  });
});
