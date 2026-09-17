---
id: REV-0001
type: review
title: PLAN-0001 Phase P1 — Foundation (scaffolding, data layer, onboarding, audit)
status: implemented
mode: review
created: 2026-09-17
updated: 2026-09-17
links: [PLAN-0001, ANA-0001, TC-0001]
---

# REV-0001: PLAN-0001 Phase P1 — Foundation (scaffolding, data layer, onboarding, audit)

> Mode: review (acceptance gate). Read-only; findings cite file:line / doc link.

## Scope

PLAN-0001 Phase P1, tasks AT-1.1 … AT-1.9 (all ☑). Model review triggered by the
schema/data-model cadence (L size): AT-1.3 established the whole DB schema.

Commits read: `b9818c7` `ccaad19` `8eaab0e` `964db04` `78c81cd` `f7a3c2f` `83231ae` `ea13ba2`
(plus `6e3b199`, the AT-1.9 lint-guard commit — an ancestor of HEAD but missing from the
payload's range; no other P1 code commit was found outside the range).
Docs: ANA-0001 §Data model changes / §Invariants / §Decisions, PLAN-0001 P1, TC-0001 rows
#8–#10 / #26 / #31 / #41, all nine AT-1.x IMPL notes, PARKING-LOT.md.
Extra files read beyond the payload list: `src/main/db/migrate.ts`, `src/main/db/client.ts`
header, `src/main/db/__tests__/schema.test.ts`, `src/main/db/seedData/taxYear2025.ts`,
`vitest.config.ts`, `package.json`, `eslint.config.mjs`, `tsconfig.electron.json`,
`electron/main.ts`, `electron/preload.ts`, `src/renderer/App.tsx`,
`src/renderer/pages/Onboarding.tsx`, `src/main/lockFile.ts`, and TC-0001 rows #8/#9/#10
(INV-6 is unreviewable without them). `npm run lint` / `npx tsc` were blocked by the
review-agent's read-only guard, so lint/test results are the orchestrator's gate block and the
`tsconfig.electron.json` claim was verified by inspection.

Mechanical gate (verbatim, not re-derived):

```
=== mechanical gate (2026-09-17 22:12) dir=.../missing-ui-dev-startup-f0830b plan=PLAN-0001 phase=P1
- validate-docs: PASS (validate-docs: 6 docs, 0 error(s), 7 warning(s))
- tests: PASS (109 tests passed)
- lint: PASS
- secrets: skipped (not configured)
- plan rows P1: PASS (0 open)
- TC results: 46 case(s) without a result in TC-0001 (informational — cases belong to later phases P2-P5, not P1; not a P1 gate failure)
=== gate: PASS (4 step(s))
```

## Checklist

| # | Item | Pass/Fail | Evidence / note |
|---|------|-----------|-----------------|
| 1 | All P1 plan rows done, per their stated done-criteria | PASS | AT-1.1…1.9 ☑; each has an IMPL note with commit + test evidence |
| 2 | P1 exit criteria met | PARTIAL | `npm test` passes (110 after fix); onboarding/2nd-launch flow and TC #26/#41 are recorded `manual (structural/static only)`, not `pass` — see N1/N2 |
| 3 | INV-1 money as integer satang, no float | PASS | `src/main/calc/money.ts:132-144` digit-string+BigInt rounding; every `*_minor` column INTEGER with `typeof(...)='integer'` CHECK; TC #31 passes |
| 4 | INV-4 audit log, single writer | PASS | `src/main/repositories/auditLog.ts:196-219` exactly one row per call; `audit_log_has_a_side` CHECK; `idx_audit_log_entity` |
| 5 | INV-5 currency explicit | PASS | `currency TEXT NOT NULL DEFAULT 'THB' CHECK (currency='THB')`; scope reasoning in `schema.ts:10-15`, ANA-consistent |
| 6 | INV-6 deduction cap shapes storable as designed | **FAIL → FIXED** | D1 (below) — resolved in commit `7cdcc0b` |
| 7 | INV-2/2b/3/7/8 columns present for later phases | PASS | `status`/`closed_at`/`frozen_result_json`/`reversal_of_id`/`tax_relevant`+`general_category` with conditional CHECKs |
| 8 | Schema matches ANA §Data model changes (8 tables, indexes) | PASS (after D1 fix) | all 8 tables + the 3 ANA indexes + 3 extra FK indexes; parity test asserts column-set match with `schema.ts` |
| 9 | Every Unit TC case in scope has a real passing test | PASS | only #31 is Unit-level in P1; `src/main/calc/__tests__/money.test.ts` |
| 10 | UI matches accepted PROTO-0001 | n.a. | AT-1.6's criterion is behavioral; `Onboarding.tsx` carries the PROTO copy intent; styling is AT-4.x |
| 11 | Traceability chain unbroken | PASS | REQ→ANA→TC→PLAN rows→commits (Conventional Commits, task id in each subject)→IMPL notes |
| 12 | No unrelated changes in range | PASS | each commit touches only its task's files |
| 13 | ANA-0001 decision 14 (optional seed) actually implemented | PASS | `seedData/taxYear2025.ts:12-17` empty set; `seed.ts` skip-if-populated; `createInFolder` seeds then hands off to a Dashboard rendering an empty state |
| 14 | IMPL deviation claims verified | PASS | `tsconfig.electron.json:7` `rootDir: "electron"` + `electron/main.ts` importing `../src/main/*` → AT-1.6's claim is correct: `npm run build`'s `tsc -p tsconfig.electron.json` step cannot succeed (TS6059). See N3 |

## Findings

### D1 — defect (blocking) — RESOLVED

The schema made INV-6's shared-group **sub-cap** impossible to store
(`src/main/db/migrations/001-initial-schema.ts`, original `deduction_categories_cap_amount_matches_cap_type`
CHECK forced `shared_group_member.cap_amount_minor` to `NULL`). ANA-0001 §Deduction cap shapes
states a `shared_group_member` "also carries its own `cap_amount_minor` as a sub-cap … on top of
each member's own sub-cap", and TC-0001 #10 requires exactly this (health insurance's own 25,000
sub-cap inside a 100,000 shared group with life insurance, which has none). The wrong shape was
also codified in a passing `schema.test.ts` case.

**Resolution (commit `7cdcc0b`):** the CHECK now only requires `cap_amount_minor IS NOT NULL`
for `fixed`/`per_count`; a `shared_group_member`'s `cap_amount_minor` is unconstrained by
`cap_type` (still governed by the column's own non-negative-integer-or-NULL CHECK). Added an
acceptance test (`schema.test.ts`: "accepts a shared_group_member with its own sub-cap on top of
the group total (INV-6, TC-0001 #10)"); corrected `seed.ts`'s doc comment; appended a correction
note to `AT-1.3.md` rather than rewriting its original record. 110/110 tests pass, lint/tsc
clean. Verified directly by the orchestrator (narrow, mechanically-checked fix — new test
exercises exactly the TC-0001 #10 scenario); not re-dispatched to `qa-reviewer` for a full
re-review pass.

### N1 — note: TC #41's owed manual verification is untracked

TC-0001 #41 is recorded `manual (structural only)`; P1's exit criteria name it as `pass`. → PL-0004.

### N2 — note: AT-1.9's guard coverage holes

`eslint.config.mjs` blocks `http`/`https`/`net` imports and bare `fetch`/`require('http')`, but
not `window.fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, or Electron's own
`net`/`session`. → PL-0005.

### N3 — note: `npm run build` is broken (claim confirmed)

`tsconfig.electron.json`'s `rootDir: "electron"` + `electron/main.ts` importing `../src/main/*`
→ TS6059 at `npm run build`'s third step. → PL-0006.

### N4 — note: IPC handlers take unvalidated renderer-supplied paths

`dataLocation:createInFolder` / `lockFile:check` accept any string path from the renderer with
no validation, and `createInFolder` has no "first run only" guard. → PL-0007.

### N5 — note: ANA-0001 §Invariants cited stale TC numbers — RESOLVED

Fixed alongside D1 in commit `7cdcc0b` (INV-1 → #23, #31; INV-3 → #32; INV-5 → #33).

### I1 — idea: pin the reversal sign convention in the DB

`transactions.amount_minor` has `CHECK (… <> 0)` but no sign convention; deciding it in P2 and
expressing it as a CHECK would keep INV-2b enforceable in the DB, not only in code. → PL-0009.

### Positives worth recording

`money.ts` refuses fractional `number` input and does all rounding on digit strings via `BigInt`
— the strongest available reading of INV-1. `auditLog.ts` is genuinely a single writer with
canonical sorted-key JSON, and throws *inside* the caller's transaction so "no audit row, no
edit" holds. `migrate.ts` has a downgrade guard, per-migration transactions, and
`journal_mode=DELETE` (a correct call for a Drive-synced folder).

## Verdict

`PASS` — the one blocking defect (D1) was fixed in commit `7cdcc0b` and verified (new test
targets the exact TC-0001 #10 scenario; full suite green; lint/tsc clean). Everything else in
P1 was already sound; the mechanical gate result stands.

Not rework, but owed before feature close: N1–N4/I1 as PARKING-LOT rows PL-0004…PL-0007, PL-0009
(orchestrator writes — see below), and TC-0001 #41's real two-launch click-through.

## Code-quality checklist (review mode)

| Item | Pass/Fail/n.a. | Evidence |
|------|----------------|----------|
| authorization + negative test | n.a. | single-user desktop app, no login/roles; the only trust boundary is IPC — see N4 |
| input validation / allow-list / uploads | PARTIAL | money boundary validates hard; DB CHECKs validate every row; IPC path arguments unvalidated (N4); no uploads in P1 |
| migrations reversible · exact money types · indexes | PASS | append-only runner, downgrade guard, per-migration transaction; no destructive step (greenfield); all money INTEGER satang; 3 ANA indexes + 3 FK indexes |
| no N+1 on list views | n.a. | no list views yet; `listEntityHistory`/`listRecentMutations` are single indexed queries |
| failure paths surfaced · no secrets | PASS | Onboarding surfaces `createInFolder` errors via `role="alert"`; migration failures throw with `cause`; no secrets in the range. Minor: `App.tsx`'s `dataLocation.get()` call has no `.catch()` — one-line fix in P2's routing task |
| UTF-8 round-trip | PASS | Thai UI copy renders from source (`Onboarding.tsx`); `deduction_categories.name`/`description` are TEXT and `seed.test.ts` round-trips named rows; full user-text round-trip is P2 (`transactions.note`) |
