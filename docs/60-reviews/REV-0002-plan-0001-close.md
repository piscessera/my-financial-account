---
id: REV-0002
type: review
title: PLAN-0001 close — Phases P2–P5 (all remaining tasks) and overall acceptance
status: implemented
mode: review
created: 2026-09-18
updated: 2026-09-18
links: [PLAN-0001, ANA-0001, TC-0001, REQ-0001]
---

# REV-0002: PLAN-0001 close — Phases P2–P5 and overall acceptance

> Mode: review (acceptance gate, feature close). Read-only; findings cite file:line / doc link.

## Scope and a disclosure about who wrote this

PLAN-0001's phases P2–P5 (AT-2.1 through AT-5.6, 29 tasks; P1/AT-1.x was already reviewed in
REV-0001). This review was written by the same orchestrator session that implemented every one
of these tasks inline — **not an independent `qa-reviewer` dispatch**. Sub-agent dispatch has
been blocked for this entire run by a hook bug ([PL-0008](../PARKING-LOT.md)):
`.claude/hooks/guard-shared-files.js`'s `SHARED` pattern for `.claude/` is unanchored, and this
session's worktree lives at `.claude/worktrees/<slug>/`, so every path here contains a `.claude/`
segment — a dispatched `qa-reviewer` cannot write its own REV report any more than the
`implementer` role could write code earlier in this run. The user was asked directly whether to
self-review, skip review, or fix the hook first, and chose self-review. This document is that
self-review: it checks the same things an independent reviewer's checklist would, with the same
evidence-citation discipline, but it is not independent and should be weighted accordingly.

Commits read: every commit from `daf4dd2` (AT-2.1) through `b5c4133` (the TC #23/#33 gap
closure) on `claude/plan-0001-dev-execute-86520c` — 60 commits total, all already on `main`.
Docs read: `PLAN-0001` (all Stage B rows, all ☑), `TC-0001` (all 49 cases, 0 empty `Result`
cells as of this review), all 29 `IMPL-0001/AT-{2,3,4,5}.*.md` notes, `PARKING-LOT.md`.

## Verification re-run (not re-derived from memory)

```
$ bash .claude/scripts/gate.sh --plan PLAN-0001
=== mechanical gate (2026-09-18 22:11) dir=.../plan-0001-dev-execute-86520c plan=PLAN-0001
- validate-docs: PASS (8 docs, 0 error(s), 22 warning(s) -- all warnings are pre-existing
  IMPL-note line-count style notes, none new to this review, none blocking)
- tests: PASS (226 tests)
- lint: PASS
- plan rows: PASS (0 open)
- TC results: 0 case(s) without a result
=== gate: PASS (4 step(s))
```

First run of this command (before this REV document itself was added to `docs/INDEX.md`)
correctly FAILed `validate-docs` on "REV-0002 exists on disk but has no row" — fixed by adding
the INDEX row in the same pass, then re-run clean above. Left in as a demonstration the gate
output here is a real re-run, not copied from an earlier phase's result.

`npm run lint`, `npx tsc --noEmit`, and `npx vite build` (renderer + electron main + preload)
were each re-run clean immediately before writing this document.

## Checklist

| # | Item | Pass/Fail | Evidence / note |
|---|------|-----------|------------------|
| 1 | Every PLAN-0001 Stage B row is ☑ | ✅ | `PLAN-0001` Stage B table, all 36 rows |
| 2 | Every TC-0001 case has a `Result` | ✅ | Gate output above; #23/#33 backfilled this session (`b5c4133`) |
| 3 | INV-1..INV-8 each have a passing test | ✅ | INV-1: `money.test.ts`; INV-2/2b: `transactionsLifecycle.test.ts`; INV-3: `taxYearsLifecycle.test.ts` #32; INV-4: `auditLog.test.ts` + every repo's audit assertions; INV-5: `schema.test.ts` (backfilled #33); INV-6: `deductions.test.ts` #6-#10; INV-7: `taxYearsReadPath.test.ts` #27; INV-8: `computeYear.test.ts` #35 |
| 4 | `TAX-2025` reference figure reproduced end-to-end | ✅ | `brackets.test.ts` #11 (73,766.21), `computeYear.test.ts` #13 (20,197.50 refund), `Summary.tsx` manually verified against the same figures (AT-4.7 IMPL note) |
| 5 | No circular-import regressions from the `taxYears.ts`↔`transactions.ts` split | ✅ | `vite build` succeeds (bundler would fail/warn on a true cycle); 226 tests import both modules together without runtime `undefined` errors |
| 6 | Closed-year immutability holds at every write path | ✅ | `transactions.updateTransaction` (INV-2b, TC #18), `taxYears.getYearResult`/`calc:exportSummary` (INV-7, TC #27), `csv.parseForPreview` (TC #46) all reject/ignore a closed year independently — not one shared gate that could be bypassed by calling a different path |
| 7 | No hard-delete path exists anywhere | ✅ | `transactions.voidTransaction` only sets `status`; `attachments.ts` has no delete function at all; grep confirms no `DELETE FROM` in any repository except migrations' FK cascade comments |

## Findings

| # | Type | Finding | Evidence | Suggested action | PARKING-LOT row |
|---|------|---------|----------|-------------------|------------------|
| 1 | note | Exported CSVs (`exportLedger`/`exportSummary`) are plain UTF-8 with no BOM. Windows Excel's "double-click to open a .csv" path uses the system ANSI codepage unless a UTF-8 BOM is present, so Thai text in `note`/`source_payer` would likely render as mojibake if a user opens the file directly in Excel (re-importing it back into this app is unaffected — `parseForPreview` reads with explicit `'utf8'`). | `src/main/repositories/csv.ts:90,118` (`writeFileSync(..., 'utf8')`, no `﻿` prefix) | Prepend a UTF-8 BOM to both export functions' output | → PL-0011 |
| 2 | note | `csvField`'s quoting (`csv.ts:54`) escapes `,`/`"`/newlines but doesn't neutralize a value that starts with `=`, `+`, `-`, or `@` — the classic CSV-formula-injection vector (a `note` or `source_payer` containing e.g. `=1+1` would be interpreted as a formula if the exported file is opened in Excel/Sheets). Low real-world severity here (single-user local app, exporting the user's own data to open on their own machine — this isn't a multi-tenant or untrusted-input scenario), but cheap to close and matches OWASP CSV-injection guidance. | `src/main/repositories/csv.ts:54-57` | Prefix a leading `'` (or a leading `\t`) on any field starting with `=+-@` before quoting | → PL-0011 (same fix touches the same function as #1) |
| 3 | note | Two mid-plan design decisions (reversal sign convention, PL-0009; per-row vs. per-file `tax_year` in CSV import) were resolved by this orchestrator during implementation rather than being escalated to the user as scope questions. Both are documented inline (module doc comments) and in their tasks' IMPL notes with the reasoning, and neither contradicts ANA-0001/TC-0001 — they fill gaps the design left genuinely open. Flagged here only so the pattern is visible at close, not because either decision looks wrong on inspection. | `src/main/repositories/transactions.ts` module header; `IMPL-0001/AT-5.3.md` §Deviations | No action — informational | n/a (already resolved, not a new parking-lot item) |

No defects found. No rework required.

## Verdict

`PASS with notes` — 0 blocking defects. Two notes (PL-0011: CSV BOM + formula-injection
hardening) are quality-of-life/hardening items appropriate for a pre-release pass, not
correctness bugs; nothing in TC-0001's acceptance criteria requires either. Every invariant
(INV-1..INV-8) has independent test coverage at the layer where it's actually enforced, not just
an end-to-end happy-path check. The mechanical gate is green with zero open TC results.

## Code-quality checklist (review mode)

| Item | Pass/Fail/n.a. | Evidence |
|------|----------------|----------|
| authorization + negative test | n.a. | Single-user desktop app, no login/roles (unchanged from REV-0001's finding) |
| input validation / allow-list / uploads | PASS (existing gap noted, not new) | Every repository validates its own shape (e.g. `transactions.ts` `assertCreateInput`, `csv.ts` `validateRow`); IPC path arguments (`attachments:add`, `csv:*`) still come from native OS dialogs only, not arbitrary renderer input — the unvalidated-renderer-path-argument gap from REV-0001 ([PL-0007](../PARKING-LOT.md)) is unchanged, not worsened, by P2-P5 |
| migrations reversible · exact money types · indexes | PASS | No new migrations in P2-P5 (schema was P1-only); every new money field is `*Minor` integer satang, verified by `assertSatang`/CHECK constraints |
| no N+1 on list views | PASS | Every list operation (`listByYear`, `listCategories`, `listEntries`, `getBrackets`) is one prepared-statement query; no per-row follow-up queries anywhere in `src/main/repositories/` |
| failure paths surfaced · no secrets | PASS | Every renderer screen catches IPC errors and surfaces `err.message`; no credentials/tokens anywhere in this local-only app |
| UTF-8 round-trip | PASS in-app, note for external tools | Thai text round-trips correctly through SQLite TEXT columns and the app's own CSV re-import (explicit `'utf8'`); Finding #1 above covers the external-Excel-viewing gap |
