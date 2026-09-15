import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase, type DatabaseHandle } from '../client';

/**
 * Opens a migrated database in a throwaway temp directory (a real file, not `:memory:`,
 * so the migration runner is exercised the way the app uses it).
 */
export function openTempDatabase(): DatabaseHandle & { dispose(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'mfa-db-'));
  const handle = openDatabase(join(dir, 'test.db'));
  return {
    ...handle,
    dispose() {
      handle.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
