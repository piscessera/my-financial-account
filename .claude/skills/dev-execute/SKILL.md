---
name: dev-execute
description: USER-ONLY continuous plan executor — runs one or more approved, ready plans until every task is complete. Dependency-aware, parallel streams (max 2) each on its own git branch + worktree, sync-before-commit, review gates, serialized merge queue into main. Resumable after any pause.
disable-model-invocation: true
---

# dev-execute — continuous plan execution (autopilot)

**Trigger:** only the user's `/dev-execute [PLAN-id | all]`. Arguments: `$ARGUMENTS`.
If none given, list plans passing the readiness check and ask which to execute.
**Resumable:** state = PLAN checkboxes + `.claude/runs/*.state`; re-issuing the command resumes.

## 0. Continuity model

- Primary engine: **this loop** — keep working until completion or an escalation pause.
- Booster: the Stop hook (`.claude/hooks/stop-continuity.sh`) blocks a stop while a stream is
  `executing` — max 3 continuations per run (`continuations:` counter in the state file; reset it
  to 0 on start/resume), states older than 12 h are ignored. After that the run pauses cleanly.

## 1. Readiness check (per plan) — refuse and say exactly what's missing if any fails

- `PLAN-NNNN` exists, status `active`, plan gate **approved** (decision in its log).
- Stage B complete: every task has TC links, files touched, done-criteria, `Depends` (— if none),
  and the plan's **Hot files** list is filled.
- Linked `ANA`/`TC` are `active`; no open gate for this plan in `docs/INDEX.md`.
- Two plans whose hot files overlap are **not** run concurrently — the second one waits.

## 2. Stream setup (per plan; max 2 concurrent)

1. `.claude/runs/PLAN-NNNN.state` exists and is `executing`/`paused` → **resume**, skip setup.
2. `git fetch origin` (if a remote exists) → `git switch main` → `git pull --ff-only`.
3. Branch `dev/PLAN-NNNN-slug` from main; `git worktree add .worktrees/PLAN-NNNN <branch>`.
4. Write state: `plan:`, `branch:`, `worktree:`, `status: executing`, `started: <ISO>`, `continuations: 0`.
5. Create `docs/70-implementation/IMPL-NNNN-slug/README.md` from `.claude/templates/IMPL.md`
   (allocate the IMPL id now) if it doesn't exist.
6. Build the task **DAG** from PLAN phase order + `Depends`. READY = every dependency Done.
   A blocked task is never dispatched. Within a plan, tasks run sequentially.

## 3. Execution loop (all streams together, while READY tasks exist)

1. Each cycle, take the first READY task of **every** stream that has one.
2. **Build the dispatch payload per `dev-standard/orchestrator.md` §12** — allocate IDs first;
   paste the project line, task row, linked TC rows, ANA excerpt + affected INV rows, PROTO
   screen path(s), read list, worktree path. `[core]` tasks → `model: opus`.
   Never tell the agent to "read the ANA/TC/IMPL".
3. Dispatch all those **implementer** agents as parallel Agent-tool calls in a single message.
   As each returns, verify it (step 4) while the others keep running.
4. Verify: run the full relevant suites in the worktree; confirm PLAN checkbox, TC results, and
   the `AT-x.y.md` note exist and the note has no code/test output pasted in.
5. **Sync-before-commit:** if `main` advanced → `git merge main` into the branch → resolve
   (dispatch implementer with the conflicted files + design excerpt) → re-run tests → then commit.
6. Commit on the branch (conventional, refs AT + TC); push if origin exists.
7. One daily-log line per completed task (`date +%H:%M`); repeat from 1.
8. No READY tasks but open tasks remain → report the block; never jump the DAG.

## 4. Phase boundary

- Exit criteria met → run the **mechanical gate**:
  `bash .claude/scripts/gate.sh --plan PLAN-NNNN --phase Pn --dir .worktrees/PLAN-NNNN`.
  Fail → treat like a failing task (fix on the branch, max 3 attempts, then escalate).
- Mechanical PASS → dispatch **qa-reviewer** only if the phase is the last one, touched
  schema/data model/auth, has FAIL history, or the user asked (dev-review cadence). Payload:
  gate output + PLAN rows + TC rows of the phase + commit range + PROTO screens.
  Otherwise the phase is PASS (`gate: mechanical PASS` in the log) — no REV file.
- FAIL → fix attempts on the branch (max 3 per finding set) → re-review failed items only.
- Still FAIL after 3 → pause stream, escalate (state `paused`).
- PASS → merge procedure.

## 5. Merge procedure (global merge queue — ONE merge into main at a time)

1. Take the merge lock (other streams wait).
2. Re-run the sync check: merge main into the branch, resolve, re-test.
3. `git switch main` → `git merge --no-ff dev/PLAN-NNNN-slug` → `bash .claude/scripts/gate.sh` on main.
4. Green → push (if origin), remove worktree, delete branch, state → `done`.
   Not green → abort the merge, keep branch + worktree, escalate.
5. Every other stream syncs `main` into its branch before its next commit.

## 6. Escalation — pause the stream and report (don't improvise)

Test failure unfixable in 3 attempts or outside task scope · semantic conflict · scope change
beyond the ≤10-min mini pass · missing external dependency · dependency deadlock. Pausing keeps
branch + worktree + `status: paused`; report exactly what's blocked. `/dev-execute` resumes.

## 7. Completion

All tasks Done + reviews PASS + merged: PLAN → `implemented`, INDEX updated (you are the
writer), PARKING-LOT rows from every REV of this plan added, state files removed, final report (tasks, commits, test counts, verdicts).

## 8. Hard safety rules

- Never `push --force`, never rewrite `main`, never commit secrets.
- Never weaken or skip a test to get green.
- Feature branches never edit shared files (`docs/INDEX.md`, `docs/90-daily-logs/`, `CLAUDE.md`,
  `.claude/`).
- `/dev-execute` approval covers implement+review+merge **for that plan's scope only**.
