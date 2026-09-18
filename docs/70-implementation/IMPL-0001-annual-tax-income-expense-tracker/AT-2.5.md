# AT-2.5 — IPC wiring for `taxYears`/`transactions`/`attachments`

- **Plan:** PLAN-0001 · **Phase:** P2 · **Commit:** `cd255eb`
- **TC results:** none linked. Done-criterion is a manual smoke test (see below).

## What was done

- **`src/main/db/appDatabase.ts`** (new, not in this task's original files-touched list — see
  Deviations): a single long-lived DB connection singleton. Every earlier task opened its own
  short-lived `openDatabase()` per call; IPC handlers need one connection that lives for the
  app's session instead. Opened at `app.whenReady()` if `dataLocation.get()` already resolves a
  folder (a returning install), or right after `dataLocation.createInFolder()` on first run;
  closed on `app.on('will-quit')`.
- **`src/main/ipc/index.ts`** (new): `createDomainIpcHandlers(ctx)` returns a plain
  channel → handler object (`taxYears:*`, `transactions:*`, `attachments:*`) built on the AT-2.1/
  2.2/2.3/2.4 repositories. Deliberately has **no `electron` import** — requiring `electron`
  under Vitest doesn't give you `ipcMain` (it resolves to a path string outside an actual
  Electron process), so a module that imports it can't be unit-tested. `electron/main.ts` is the
  only file that loops `ipcMain.handle(channel, handler)` over this map.
- **`electron/main.ts`**: registers the domain handlers (via the loop above), opens/closes the
  app database at the right lifecycle points, and adds `requireOpenSqlite()`/
  `currentDataFolderPath()` guards that throw a clear error if a domain channel is somehow
  invoked before onboarding completes.
- **`electron/preload.ts`**: exposes `taxYears`/`transactions`/`attachments` on `window.api`,
  matching ANA-0001 §API/backend changes' listed surface exactly (`close`/`reopen` excluded —
  P4, once the calc engine exists).
- **`transactions.ts`**: added `listByYear(sqlite, taxYearId)` — ANA-0001's IPC surface lists
  `transactions.listByYear(yearId)`, but neither AT-2.2 nor AT-2.3 had added it yet.
- **Done-criterion ("manual smoke test creates a transaction end-to-end from a scratch renderer
  call")**: `src/main/ipc/__tests__/index.test.ts` exercises the channel → handler map directly
  (tax year → transaction → update → history → attachment, in sequence) — the automatable half
  of that criterion. An actual `ipcRenderer.invoke` round-trip through a running Electron window
  needs a display server this sandbox doesn't have (same limitation noted since AT-1.1/AT-1.6/
  AT-1.8's manual checks) — **owed as a manual check before the first `/dev-release`**, added to
  `docs/PARKING-LOT.md` as PL-0010.
- 145 tests pass (140 prior + 5 new); lint clean; `tsc --noEmit` (main tsconfig) clean.

## Deviations from design

- **Files touched beyond the plan row** (`src/main/db/appDatabase.ts`, `electron/main.ts`,
  `src/main/repositories/transactions.ts`): the plan row only lists `electron/preload.ts` and
  `src/main/ipc/index.ts`, but wiring real handlers requires an open DB connection somewhere
  (new) and a place that actually calls `ipcMain.handle` (main.ts, already an established hot
  file from AT-1.1/1.6/1.8) and the missing `listByYear` (transactions.ts, minimal addition).
  None of this changes any earlier task's behavior.
- **Attachment mime type**: ANA-0001's IPC signature is `attachments.add(transactionId,
  filePath)` — no mime type parameter, but the AT-2.4 repository requires one. `ipc/index.ts`
  infers it from the file extension (`guessMimeType`, small lookup table + `application/
  octet-stream` fallback) so the IPC layer matches the documented surface while the repository
  stays strict.
- `npm run build`'s `tsc -p tsconfig.electron.json` step still fails (pre-existing, PL-0006) —
  this task's new files reproduce the same `rootDir` mismatch as everything else under
  `src/main` that `electron/*.ts` imports; not a new problem, not fixed here (still targeted at
  the first `/dev-release`, per PL-0006's existing resolution note).

## Notes for follow-up tasks

- AT-2.6/2.7 (Entry screen) call `window.api.transactions.*`/`window.api.attachments.*`
  directly — the preload surface is complete for everything P2 needs.
- AT-3.4 (deductions/settings IPC) and AT-4.5 (calc/close/reopen IPC) should follow the same
  shape: add channels to a `createDomainIpcHandlers`-style map (either extend this one or add a
  sibling file), register in `main.ts`'s existing loop, expose on `preload.ts`. Don't duplicate
  the `getSqlite`/`getDataFolderPath` context plumbing — reuse `DomainIpcContext`.
