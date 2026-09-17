# AT-1.8 — Launch-time lock-file guard

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `ea13ba2`
- **TC results:** none linked to this row (Done-criterion is itself "manual check").

## What was done

- `src/main/lockFile.ts` — `checkAndClaimLock(folderPath, now?)`: reads any existing `.lock`
  file in the data folder, reports `warn: true` if it's < 5 minutes old, then overwrites it with
  this launch's own `{ hostname, timestamp }`. `now` is injectable for deterministic tests. Not
  a real lock (file-synced folder, no cross-machine coordination possible) — a best-effort
  freshness check only, as the PLAN row specifies.
- Wired through `ipcMain.handle('lockFile:check', ...)` in `electron/main.ts` and exposed as
  `window.api.lockFile.check(folderPath)` in `electron/preload.ts`.
- `src/renderer/components/LockWarningBanner.tsx` — shown once `App.tsx` learns the data folder
  and the check comes back `warn: true`; silent otherwise (stale or absent lock, the normal
  case). Runs after Onboarding too (a freshly-created folder has no `.lock` yet, so it claims
  silently — no spurious warning on first run).
- 4 tests in `src/main/__tests__/lockFile.test.ts`: no lock → silent; claims correctly; stale
  (>=5 min) → silent; recent (<5 min) → warns, with the previous lock's info returned. Suite:
  109/109 passed; lint and `tsc --noEmit` clean. `npm run dev` build clean; the Electron window
  itself launched this time (GPU/disk-cache errors in the log are sandboxed-environment noise,
  not app errors) — first task in this plan where the actual window came up.

## Deviations from design

- None.

## Notes for follow-up tasks

- This closes out **Phase P1** — every P1 task (AT-1.1 through AT-1.9) is now done. Next is the
  mechanical gate, then Phase P2 (AT-2.1 `tax_years` repository is the first P2 task, deps
  already satisfied).
