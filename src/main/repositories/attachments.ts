/**
 * `attachments` repository (AT-2.4).
 *
 * `add` copies the source file into `<dataFolderPath>/attachments/<transactionId>/` and
 * records a row; `list` reads them back for a transaction. There is **no remove method** by
 * design (ANA-0001/PLAN-0001) — an attachment, once added, stays with the transaction's
 * history the same way a transaction itself is never hard-deleted.
 *
 * Unlike the money-affecting repositories, this one mixes filesystem work (copying into the
 * Google-Drive-synced data folder — CLAUDE.md §Project) with the row bookkeeping; the DB write
 * still follows the same raw-connection/prepared-statement/`recordMutation` pattern as
 * `transactions.ts`.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import type { AttachmentRow } from '../db/schema';
import { recordMutation } from './auditLog';

/** Thrown when a caller hands this repository invalid input. */
export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentError';
  }
}

const ATTACHMENTS_DIRNAME = 'attachments';

export interface AddAttachmentInput {
  readonly transactionId: number;
  /** Absolute path to the file to copy in (e.g. from a native file-picker dialog). */
  readonly sourceFilePath: string;
  readonly mimeType: string;
  /** Defaults to `sourceFilePath`'s own basename. */
  readonly originalFilename?: string;
}

interface Statements {
  readonly insert: BetterSqlite3.Statement;
  readonly selectById: BetterSqlite3.Statement;
  readonly selectByTransaction: BetterSqlite3.Statement;
}

const statementCache = new WeakMap<BetterSqlite3.Database, Statements>();

function statementsFor(sqlite: BetterSqlite3.Database): Statements {
  const cached = statementCache.get(sqlite);
  if (cached) return cached;

  const statements: Statements = {
    insert: sqlite.prepare(
      `INSERT INTO attachments (transaction_id, relative_path, original_filename, mime_type)
       VALUES (?, ?, ?, ?)`,
    ),
    selectById: sqlite.prepare(`SELECT * FROM attachments WHERE id = ?`),
    selectByTransaction: sqlite.prepare(
      `SELECT * FROM attachments WHERE transaction_id = ? ORDER BY added_at ASC, id ASC`,
    ),
  };
  statementCache.set(sqlite, statements);
  return statements;
}

interface RawAttachmentRow {
  id: number;
  transaction_id: number;
  relative_path: string;
  original_filename: string;
  mime_type: string;
  added_at: string;
}

function toAttachmentRow(raw: unknown): AttachmentRow {
  const row = raw as RawAttachmentRow;
  return {
    id: row.id,
    transactionId: row.transaction_id,
    relativePath: row.relative_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    addedAt: row.added_at,
  };
}

/** Store as `attachments/<id>/<name>` with forward slashes, regardless of host OS. */
function toRelativePath(...segments: string[]): string {
  return segments.join('/');
}

/** Appends `-2`, `-3`, … before the extension until the target directory has no collision. */
function uniqueStoredFilename(targetDir: string, desiredName: string): string {
  const ext = path.extname(desiredName);
  const base = desiredName.slice(0, desiredName.length - ext.length);
  let candidate = desiredName;
  let n = 2;
  while (existsSync(path.join(targetDir, candidate))) {
    candidate = `${base}-${n}${ext}`;
    n += 1;
  }
  return candidate;
}

/**
 * Copy `sourceFilePath` into `<dataFolderPath>/attachments/<transactionId>/` and record it.
 * Audit-logs as `create` (INV-4).
 */
export function addAttachment(
  sqlite: BetterSqlite3.Database,
  dataFolderPath: string,
  input: AddAttachmentInput,
): AttachmentRow {
  if (!Number.isSafeInteger(input.transactionId)) {
    throw new AttachmentError(`transactionId must be an integer, got ${String(input.transactionId)}.`);
  }
  if (!existsSync(input.sourceFilePath)) {
    throw new AttachmentError(`Source file does not exist: ${input.sourceFilePath}`);
  }
  if (typeof input.mimeType !== 'string' || input.mimeType.length === 0) {
    throw new AttachmentError('mimeType is required.');
  }
  const originalFilename = input.originalFilename ?? path.basename(input.sourceFilePath);
  if (originalFilename.length === 0) {
    throw new AttachmentError('originalFilename must not be empty.');
  }

  const targetDir = path.join(dataFolderPath, ATTACHMENTS_DIRNAME, String(input.transactionId));
  mkdirSync(targetDir, { recursive: true });
  const storedFilename = uniqueStoredFilename(targetDir, originalFilename);
  copyFileSync(input.sourceFilePath, path.join(targetDir, storedFilename));
  const relativePath = toRelativePath(ATTACHMENTS_DIRNAME, String(input.transactionId), storedFilename);

  const run = sqlite.transaction(() => {
    const info = statementsFor(sqlite).insert.run(
      input.transactionId,
      relativePath,
      originalFilename,
      input.mimeType,
    );
    const raw = statementsFor(sqlite).selectById.get(Number(info.lastInsertRowid));
    if (raw === undefined) throw new AttachmentError('Insert succeeded but the row could not be read back.');
    const row = toAttachmentRow(raw);
    recordMutation(sqlite, {
      entityType: 'attachment',
      entityId: row.id,
      action: 'create',
      after: row as unknown as Record<string, unknown>,
    });
    return row;
  });
  return run();
}

/** All attachments for one transaction, oldest first. No remove method exists (by design). */
export function listAttachments(sqlite: BetterSqlite3.Database, transactionId: number): AttachmentRow[] {
  return statementsFor(sqlite)
    .selectByTransaction.all(transactionId)
    .map(toAttachmentRow);
}
