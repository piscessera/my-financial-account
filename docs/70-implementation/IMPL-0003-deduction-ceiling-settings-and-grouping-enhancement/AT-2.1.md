# AT-2.1 — IPC Handlers and Preload Exposure for Shared Caps and Category Updates

- **Plan:** PLAN-0008 · **Phase:** P2 · **Commit:** `pending`
- **TC results:** #1 pass (`index.test.ts::settings:updateCategory`), #4 pass (`index.test.ts::settings:createSharedCap`), #5 pass (`index.test.ts::settings:updateSharedCap`), #6 pass (`index.test.ts::settings:deleteSharedCap`)

## What was done
- Added IPC handler mappings for `settings:createSharedCap`, `settings:updateSharedCap`, and `settings:deleteSharedCap` in `src/main/ipc/index.ts`.
- Exposed typed methods `createSharedCap`, `updateSharedCap`, `deleteSharedCap`, and extended `updateCategory` under `window.api.settings` in `electron/preload.ts`.
- Added end-to-end IPC integration tests in `src/main/ipc/__tests__/index.test.ts`.

## Deviations from design
(none)

## Notes for follow-up tasks
- Phase P2 complete. Next is Phase P3 (AT-3.1 Settings UI).
