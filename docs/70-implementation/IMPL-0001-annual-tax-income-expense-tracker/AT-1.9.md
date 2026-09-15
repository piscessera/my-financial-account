# AT-1.9 — Static no-network guard

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `6e3b199`
- **TC results:** #26 manual (static guard only) — proxy: eslint.config.mjs rule; a
  full "monitor running app for outbound requests" manual check is still outstanding

## What was done
- Added `no-restricted-imports`, `no-restricted-globals`, and a `no-restricted-syntax`
  `require(...)` selector to `eslint.config.mjs`, forbidding `http`/`https`/`net`
  (plain and `node:`-prefixed) imports/requires and the global `fetch`, applied to the
  whole codebase (not scoped to renderer only).
- Added a documented `allowedNetworkModules` allowlist array + comment block explaining
  the exception mechanism (cite the approving REQ/ANA/ADR, don't just eslint-disable).
- Verified: added a temp violating file (`import https` + `fetch()`, and separately a
  `require('net')` CJS file) — lint failed with the expected rule messages on both — then
  removed the temp files and re-ran `npm run lint` and `npm run test` clean.

## Deviations from design
TC-0001 #26 is `Level: Manual` (runtime network-activity monitoring), while this task's
done-criterion is a static lint check. Implemented the static guard as specified in the
PLAN row; this is a compile-time proxy, not a substitute for the manual runtime
verification TC #26 describes. Recorded TC #26 as `manual (static guard only)` rather
than `pass`, since the lint rule cannot observe actual network activity (e.g. a
transitive dependency calling `XMLHttpRequest` or a native module). Flagging as an open
question for the orchestrator/reviewer: should the manual runtime check still be run
separately before release, or does the static guard satisfy #26 for this phase's gate?

## Notes for follow-up tasks
No new network module names should be added to source without updating
`allowedNetworkModules` in `eslint.config.mjs` with a citing comment — the rule fails
closed by default.
