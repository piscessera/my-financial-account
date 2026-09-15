# AT-1.2 — Configure Vitest for main-process code

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `ccaad19`
- **TC results:** — (no TC cases linked to this task)

## What was done

- `vitest.config.ts`: Node environment, `include: ['src/main/**/*.test.ts']` — scopes the
  runner to main-process/calculation-engine code per CLAUDE.md §Project (renderer UI tests are
  out of scope here).
- `src/main/__tests__/sample.test.ts`: trivial smoke test (`1 + 1 === 2`) proving the harness
  runs; later tasks (AT-1.3+) add real tests next to their `src/main/` modules and this file can
  be deleted then.
- Verified `npm test` (`vitest run`) passes 1 file / 1 test, and `npm run lint` stays clean.

## Deviations from design

(none)

## Notes for follow-up tasks

- `src/main/` now exists — AT-1.3 (Drizzle schema/migrations) and AT-1.4 (money helper) both
  land their code + `*.test.ts` files under here; Vitest picks them up automatically via the
  `include` glob, no config changes needed.
