/**
 * Launch-time lock-file guard (AT-1.8).
 *
 * The data folder is a Drive-synced plain file, not a real multi-writer database — nothing
 * stops two machines (or two windows) from having it open at once. This is a soft, best-effort
 * warning, not an actual lock: at launch, read whatever `.lock` file is already in the data
 * folder; if it looks recent (<5 min old), another instance might genuinely still be running,
 * so the caller shows a warning banner. Either way, overwrite it with this launch's own
 * hostname+timestamp. A stale or absent lock is silent — the normal case on every ordinary
 * restart.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

const LOCK_FILENAME = '.lock';
const RECENT_THRESHOLD_MS = 5 * 60 * 1000;

export interface LockInfo {
  readonly hostname: string;
  /** UTC ISO-8601 timestamp of when this instance last claimed the lock. */
  readonly timestamp: string;
}

export interface LockCheckResult {
  /** `true` if the lock we found was left by a possibly-still-running instance. */
  readonly warn: boolean;
  /** Whatever lock was there before this call claimed it, or `null` if none existed. */
  readonly previous: LockInfo | null;
}

function lockFilePath(folderPath: string): string {
  return path.join(folderPath, LOCK_FILENAME);
}

function readLockFile(folderPath: string): LockInfo | null {
  const file = lockFilePath(folderPath);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockInfo>;
    if (typeof parsed.hostname !== 'string' || typeof parsed.timestamp !== 'string') return null;
    return { hostname: parsed.hostname, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}

function isRecent(timestamp: string, now: number): boolean {
  const then = Date.parse(timestamp);
  return !Number.isNaN(then) && now - then < RECENT_THRESHOLD_MS;
}

/** Reads + overwrites the lock file in `folderPath`. `now` is injectable for tests. */
export function checkAndClaimLock(folderPath: string, now: number = Date.now()): LockCheckResult {
  const previous = readLockFile(folderPath);
  const warn = previous !== null && isRecent(previous.timestamp, now);
  writeFileSync(
    lockFilePath(folderPath),
    JSON.stringify({ hostname: hostname(), timestamp: new Date(now).toISOString() }, null, 2),
  );
  return { warn, previous };
}
