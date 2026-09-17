# AT-1.6 — `dataLocation` API + Onboarding screen

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `83231ae`
- **TC results:** #41 manual — first-run/second-launch persistence needs a real Electron window
  across two app launches, which the sandbox here can't run (no display server, same limitation
  AT-1.1 flagged); verified structurally instead (see below).

## What was done

- `src/main/dataLocation.ts` — pure fs logic, no `electron` import: `getDataLocationInfo(configDir)`
  (AC-19, read-only status or `null`), `createInFolder(configDir, folderPath)` (AC-18: creates+
  migrates the DB via `openDatabase`, seeds it via `seedDatabase`/`TAX_YEAR_2025_SEED` from
  AT-1.5, writes `data-location.json` remembering the folder), `readDataLocationConfig`.
- `electron/main.ts` — registers `dataLocation:get`/`:chooseFolder`/`:createInFolder` on
  `ipcMain`, resolving the config dir via `app.getPath('userData')` (outside the Drive-synced
  data folder, per CLAUDE.md storage constraint) and the folder picker via
  `dialog.showOpenDialog`. `electron/preload.ts` exposes them as `window.api.dataLocation.*`.
- `src/renderer/pages/Onboarding.tsx` — choose/change folder, then "เริ่มใช้งาน" calls
  `createInFolder`. `src/renderer/App.tsx` calls `dataLocation.get()` on mount: `null` → renders
  Onboarding; otherwise renders a Dashboard placeholder (the real Dashboard is AT-4.6) — this is
  the routing AT-1.6's done-criterion needs, not the Dashboard itself.
- `src/renderer/global.d.ts` — `window.api: PreloadApi`, typed from `electron/preload.ts`
  (both folders share one `tsconfig.json` program, so the cross-directory type import works).
- 3 new tests in `src/main/__tests__/dataLocation.test.ts` (no config → `null`; create+read-back
  round-trip; creates a nested target folder that doesn't exist yet). Suite: 108/108 passed;
  lint and `tsc --noEmit` clean.
- Structural verification (no display server available): `npm run dev` builds `dist-electron/
  main.js` and `preload.js` clean via vite-plugin-electron (proves `electron/main.ts`'s new
  cross-import from `src/main/dataLocation.ts` bundles fine); renderer dev server serves
  `index.html`/`App.tsx`/`Onboarding.tsx` with no transform errors.

## Deviations from design

- **`electron/main.ts` now imports from `src/main/`** (it didn't before). `tsc --noEmit` (root
  `tsconfig.json`, includes both `src` and `electron`) is clean, and vite's own build bundles it
  fine — but `tsconfig.electron.json` has `rootDir: "electron"`, so `npm run build`'s final
  `tsc -p tsconfig.electron.json` step would reject this import as outside `rootDir`. Not fixed
  here (out of this task's scope — `npm run build`/packaging is explicitly TBD per CLAUDE.md);
  flagged below for whoever finalizes packaging.
- Dashboard placeholder in `App.tsx` is intentionally minimal (folder path only) — building the
  real Dashboard is AT-4.6, not this task.

## Notes for follow-up tasks

- **Known landmine, not yet hit:** `tsconfig.electron.json`'s `rootDir: "electron"` will break
  `npm run build` the first time it actually runs now that `electron/main.ts` imports outside
  that folder. Fix before the first `/dev-release` (e.g. drop `rootDir`, add `"src"` to
  `include`) — low risk, `outDir` structure changes but vite's own bundle (what `package.json`'s
  `main` field actually points at) is unaffected either way.
- AT-1.8 (lock-file guard) and AT-3.6 (Settings' data-location panel) both read
  `getDataLocationInfo`/the `data-location.json` convention established here.
- `window.api` typing pattern (`global.d.ts` importing `PreloadApi` from `electron/preload.ts`)
  is the one every later IPC-exposing task (AT-2.5 etc.) should reuse, not reinvent.
