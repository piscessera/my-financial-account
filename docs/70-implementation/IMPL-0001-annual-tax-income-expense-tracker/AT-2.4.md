# AT-2.4 — `attachments` repository (`add`/`list`)

- **Plan:** PLAN-0001 · **Phase:** P2 · **Commit:** `fe40b14`
- **TC results:** TC-0001 #1's attachment part pass
  (`src/main/repositories/__tests__/attachments.test.ts`, 5 cases).

## What was done

- `src/main/repositories/attachments.ts` — `addAttachment(sqlite, dataFolderPath, input)` copies
  `sourceFilePath` into `<dataFolderPath>/attachments/<transactionId>/`, dedupes a filename
  collision with a `-2`/`-3`/… suffix, and records a row (`relative_path` stored with forward
  slashes regardless of host OS); `listAttachments(sqlite, transactionId)` reads them back,
  oldest first. No remove method — matches the project's "no hard delete" convention already
  used by `transactions.void`.
- Mixes filesystem work with the usual raw-connection/prepared-statement/`recordMutation`
  pattern; audit-logs as `create` (`attachment` is already in `auditLog.ts`'s
  `AuditEntityType` union from AT-1.7).
- 140 tests pass (135 prior + 5 new); lint + `tsc --noEmit` clean.

## Deviations from design

None. One implementation-level call: filename-collision handling (a `-2` suffix) isn't spelled
out in ANA-0001 — needed because `add` can be called twice with same-named source files (e.g.
two attachments both named `receipt.pdf`) and nothing else prevents that collision on disk.

## Notes for follow-up tasks

- API for AT-2.5 (IPC wiring) / AT-2.6-2.7 (Entry screen): `addAttachment(sqlite,
  dataFolderPath, {transactionId, sourceFilePath, mimeType, originalFilename?})`,
  `listAttachments(sqlite, transactionId)`. `dataFolderPath` is the same folder
  `dataLocation.ts` (AT-1.6) already tracks — the IPC handler should pass it through, not
  re-derive it.
