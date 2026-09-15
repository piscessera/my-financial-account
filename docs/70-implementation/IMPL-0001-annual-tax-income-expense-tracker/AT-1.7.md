# AT-1.7 — `audit_log` repository + `recordMutation()` helper

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `78c81cd`
- **TC results:** none linked (INV-4 is exercised end-to-end by TC-0001 #23/#24 in AT-2.2); this
  task's criterion is covered by `src/main/repositories/__tests__/auditLog.test.ts` (15 cases).

## What was done

- `src/main/repositories/auditLog.ts` — single writer of `audit_log` (INV-4): validates, serializes
  the snapshots, inserts exactly one row, returns it. Reads for the history UI:
  `listEntityHistory()`, `listRecentMutations(limit)`, `parseEntry()`;
  `createAuditLogRepository(sqlite)` binds the same functions to one connection.
- Guard rails (`AuditLogError` *before* any insert, so a rejected call writes nothing): missing
  before *and* after (mirrors the `audit_log_has_a_side` CHECK), non-integer `entityId`, non-ISO
  `occurredAt`, unserializable snapshot.
- Done-criterion: `writes exactly one row per call, with every field set` (COUNT = 1 + all fields);
  others cover repeated calls and atomic rollback. 98 tests pass; lint + `tsc --noEmit` clean.

## Deviations from design

None functionally. Two judgement calls: sorted-key snapshot JSON (column order can never look
like a change in a diff) and an optional `occurredAt` override (default = DB clock), for imports.

## Notes for follow-up tasks

API for AT-2.1 / AT-2.2 / AT-3.1 / AT-4.x — `recordMutation(sqlite, input): AuditLogRow`, where
`sqlite` is the **raw** connection (`handle.sqlite`) and `input` is `{ entityType, entityId,
action, before?, after?, occurredAt? }`: `entityType: 'transaction' | 'attachment' |
'deduction_entry' | 'deduction_category' | 'tax_year' | 'setting'`; `action: 'create' | 'update'
| 'delete' | 'void' | 'reverse' | 'close' | 'reopen' | 'import'`; `entityId: number`; `before`/
`after`: `Record<string, unknown> | null`, omit `before` on create / `after` on delete (at least
one required); `occurredAt`: UTC `…Z`, omitted in production code.

- **Compose it inside your own transaction** so entity write + audit row are one commit (INV-2):
  `const save = sqlite.transaction((inp) => { const before = sel.get(id); upd.run(...);
  const after = sel.get(id); recordMutation(sqlite, {...}); return after; });` It throws rather
  than returning an error, so a bad call rolls the whole mutation back; inside a
  `handle.db.transaction(...)` callback it works too — same connection.
- Extend the `AuditEntityType`/`AuditAction` unions for a new entity or verb (the columns are free
  text; the unions only keep typos out).
