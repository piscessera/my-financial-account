# AT-1.1 — Scaffold Electron+TS+React+Vite app

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `b9818c7`
- **TC results:** — (no TC cases linked to this task)

## What was done

- `package.json`: scripts (`dev`, `build`, `test`, `lint`, `format`), React 18 + Electron 33 +
  Vite 5 + TypeScript 5 + Vitest 2 + ESLint 9 (flat config) + Prettier 3.
- `vite.config.ts` (renderer root `src/renderer`) + `vite-plugin-electron/simple` builds
  `electron/main.ts` and `electron/preload.ts` to `dist-electron/*.js` (CJS output, since the
  package has no `"type": "module"`) and launches Electron in dev.
- `electron/main.ts`: creates a `BrowserWindow`, loads the Vite dev server URL in dev / `dist/
  index.html` in a packaged build; `webPreferences.contextIsolation: true`, `nodeIntegration:
  false`.
- `electron/preload.ts`: empty `contextBridge.exposeInMainWorld('api', {})` stub — later tasks
  (AT-1.6+) add methods here, never expose Node/SQLite directly.
- `src/renderer/{index.html,main.tsx,App.tsx}`: blank React root shell.
- `tsconfig.json` (renderer+electron, noEmit, strict) + `tsconfig.electron.json` (CJS build for
  `electron/`); `eslint.config.mjs` (flat config, typescript-eslint + react-hooks +
  react-refresh + eslint-config-prettier); `.prettierrc.json` + `.prettierignore` (excludes
  `docs/`, `.claude/`, `CLAUDE.md` — this formatter only covers app code).
- `.gitignore`: added `node_modules/`, `dist/`, `dist-electron/`, `release/`.

## Deviations from design

- Used `eslint.config.mjs` (ESLint 9 flat config) instead of `.eslintrc.*` — ESLint 8's
  `.eslintrc` format is deprecated; flat config is current best practice. Same intent (lint
  config file), different filename than the plan row's illustrative list.
- `npm run dev` opens an Electron `BrowserWindow` but this sandbox has no display server, so the
  window's visual contents could not be screenshotted. Verified instead via: `tsc --noEmit`
  (clean), `npm run build` (renderer + main + preload all bundle successfully), and `npm run
  dev` run for ~20s — Vite dev server starts, main/preload rebuild, and the Electron process
  launches (Chromium GPU/network subprocess log lines confirm the app process started; it exits
  only because the sandbox has no GPU/display, not a build error).
- `npm audit` flags dev-tooling CVEs in `electron`/`vite`/`esbuild` (transitively, all
  devDependencies) at the pinned versions — normal for a fresh Electron+Vite scaffold; no fix
  applied here since `npm audit fix --force` would jump to breaking majors. Left for a future
  task/decision, not blocking AT-1.1's done-criterion.

## Notes for follow-up tasks

- `vite-plugin-electron`'s main/preload `outDir` must be an **absolute** path
  (`path.resolve(__dirname, 'dist-electron')`) — a relative `'dist-electron'` resolves against
  the Vite `root` (`src/renderer`) in dev mode and creates a stray nested folder.
- `electron/preload.ts` exports `api` as `{}` — AT-1.6 (`dataLocation`) is the first task to add
  a real method here.
- Root `package.json` has no `"type": "module"` — main/preload build to CommonJS `.js`; keep it
  that way unless a later task has a specific reason to switch (avoids ESM-preload edge cases).
