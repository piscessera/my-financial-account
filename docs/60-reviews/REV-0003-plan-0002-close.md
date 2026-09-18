---
id: REV-0003
type: review
title: PLAN-0002 close — change data folder acceptance review
status: implemented
mode: review
created: 2026-09-19
updated: 2026-09-19
links: [PLAN-0002, ANA-0002, TC-0002, REQ-0002]
---

# REV-0003: PLAN-0002 close — change data folder acceptance review

> Mode: review (acceptance). Read-only; findings cite evidence (file:line, test output, doc
> link). **Self-review**: dispatched by the same session that implemented PLAN-0002 — a true
> independent `qa-reviewer` dispatch is blocked by PL-0008 (open since PLAN-0001's close; the
> user chose self-review over fixing the hook first or skipping the gate, same choice offered
> at PLAN-0001's close).

## Scope

All of PLAN-0002 (AT-1.1–AT-3.1, 5 tasks, 3 phases): commits `bb03672`, `52ac507`, `7a178fd`,
`0b1ac54`, `ecb44b3`. Reviewed against REQ-0002's 8 ACs, ANA-0002's design (incl. INV-6/INV-7),
and TC-0002's 15 cases.

## Checklist

| # | Item | Pass/Fail | Evidence / note |
|---|------|-----------|-----------------|
| 1 | Every AC has ≥1 passing TC case | ✅ | TC-0002: 8/8 ACs covered, 15/15 cases `pass` |
| 2 | Every invariant (INV-6, INV-7) has ≥1 passing case and holds in code | ✅ | INV-6: TC #10/#11 (`dataLocation.test.ts`); INV-7: TC #6/#14; both pass |
| 3 | Move never overwrites an existing DB at target | ✅ | `dataLocation.ts:212-216`, TC #6 pass |
| 4 | Config is only rewritten after the target DB is verified open | ✅ | `dataLocation.ts:201-230` — `openDatabase` (verify) precedes `writeDataLocationConfig` in both branches |
| 5 | Audit row written for every change (INV-4) | ✅ | `recordFolderChangeAudit` called before config write in both modes; TC #8/#9 pass |
| 6 | Full mechanical gate passes | ✅ | `bash .claude/scripts/gate.sh --plan PLAN-0002` → PASS (validate-docs/tests(239)/lint/plan-rows/TC-results all PASS, 0 open) |
| 7 | UI matches ANA-0002's specified flow (no PROTO round was offered/needed) | ✅ | Verified in browser pane against a stubbed `window.api`: button, empty-target confirm, existing-DB warn (exactly 2 choices), cancel, error path — all match `Settings.tsx` AT-3.1 |

## Findings

| # | Type | Finding | Evidence | Suggested action | PARKING-LOT row |
|---|------|---------|----------|-------------------|-----------------|
| 1 | note | On a real Electron run, the app's live DB connection (`appDatabase.ts`) still points at the *old* folder while `changeFolder`'s move mode tries to delete the old DB file (`electron/main.ts`'s handler calls `openAppDatabase` only *after* `changeFolder` returns). On Windows this likely means `rmSync` on the old file fails almost every time a move is used (the file is still open), surfacing as `oldFolderCleanupWarning` rather than a clean delete. Not a correctness bug — the warning path (ANA-0002 decision #2) already exists and degrades safely (move still succeeds, config still correct, old connection gets closed/replaced by the subsequent `openAppDatabase` call) — but it means the "clean" no-warning move path may rarely trigger in practice on Windows. | `dataLocation.ts:218-241` (rmSync inside `changeFolder`), `electron/main.ts` (`openAppDatabase` called only after `changeFolder` resolves) | Consider closing/re-opening the live connection *around* `changeFolder`'s move (close before, reopen after) in a follow-up task, so cleanup can usually succeed instead of routinely warning. Not blocking — TC #12 already covers and expects the warning path. | PL-0012 |
| 2 | note | `changeFolder`'s move mode creates the target directory (`mkdirSync`) before `copyFileSync`; if the copy itself then fails (e.g. mid-copy disk-full), an empty target directory is left behind. Harmless (never touches the source or config — AC-7 holds) but slightly untidy. | `dataLocation.ts:218-219` | No action needed — cosmetic only, not a correctness or data-safety issue. | PL-0013 |

## Verdict

**PASS with notes.** No defects; 2 informational notes (both already safely handled by the
existing design, not requiring rework before shipping).

## Code-quality checklist (review mode)

| Item | Pass/Fail/n.a. | Evidence |
|------|----------------|----------|
| authorization + negative test | n.a. | single-user local app, no auth surface anywhere in this codebase |
| input validation / allow-list / uploads | Pass | `targetFolderPath` always comes from the OS folder-picker dialog (`dataLocation:chooseFolder`), never raw renderer text input — same trust boundary as every existing `dataLocation:*`/`attachments:chooseFile` channel |
| migrations reversible · exact money types · indexes | n.a. | no schema/migration change; no money field touched |
| no N+1 on list views | n.a. | not a list-rendering feature |
| failure paths surfaced · no secrets | Pass | every throw path leaves the config untouched (TC #10/#11); no credentials/secrets involved; `oldFolderCleanupWarning` surfaced to the UI, not swallowed |
| UTF-8 round-trip | n.a. | no CSV/text-encoding surface touched |
