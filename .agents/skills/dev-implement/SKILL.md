---
name: dev-implement
description: Execute an approved plan task-by-task — for each atomic task writes the code and its unit tests together, runs the test suites, makes one conventional commit per task, and updates the PLAN checkbox, TC results, and a per-task IMPL note. Stops on failure, scope change, or phase completion. Use after the plan gate is approved.
---

# dev-implement — code + unit tests per atomic task

**Input:** dispatch payload (dev-standard/orchestrator.md §12): task row(s), linked TC cases, ANA excerpt,
PROTO screen(s) for UI tasks, worktree path, allocated IDs.
**Output:** working code + passing unit tests, one commit per task, updated PLAN/TC, one
`IMPL-NNNN-slug/AT-x.y.md` note per task.

## Steps (per task)

1. Read the payload. Do **not** open the whole ANA/TC/PLAN or other tasks' IMPL notes — the task
   row + TC cases + ANA excerpt are the contract. Read only code files in the payload's read
   list, plus the minimum extra you concretely need (report what you read).
2. Implement the code **and** its unit tests together (every linked `Unit` TC case gets a test).
   UI tasks must match the accepted PROTO screen(s) and `DESIGN.md` — tokens, components, states,
   layout, wording. If you can't, stop.
3. Run the full relevant suites in the worktree; all must pass. Match the project's formatter /
   linter (AGENTS.md §Project).
4. Commit: conventional message referencing the AT + TC ids, e.g.
   `feat(tasks): add due-date filter (AT-2.3, TC-0002 #14-#16)`. Never commit `.env`/secrets.
5. Update, in the worktree:
   - PLAN task checkbox `☐ → ☑`,
   - TC `Result` + `Test ref` (`pass` + `file::test name`, or `manual` + reason — no silent gaps),
   - **IMPL note:** create `docs/70-implementation/IMPL-NNNN-slug/AT-x.y.md` from
     `.agents/templates/IMPL-task.md`. **≤ 40 lines. No code, no diffs, no test output** — cite
     the commit hash and test names instead (git holds the detail). Then append one row to the
     folder's `README.md` task table.
6. Continue to the next task in the payload unless a stop condition hits.

## Stop conditions (report to orchestrator, don't improvise)

- a test fails and the cause isn't the current task,
- a scope change appears → ≤10-min mini impact pass (see `dev-investigate`): contained →
  propose a PLAN amendment; bigger → return to orchestrator for `dev-investigate`,
- the phase's exit criteria are met → phase report (L: audit comes next via `dev-review`),
- a UI task cannot match the accepted prototype,
- you need an ID or document you were not given.

## Rules

- No task is "done" with failing or skipped tests. Fix or stop. Never weaken a test to get green.
- Respect hosting constraints in CLAUDE.md §Project.
- Return (dev-standard §7): per task — what was done, commit hash, test counts, TC results set;
  3–5 bullet summary; stop condition if any; one log line.
