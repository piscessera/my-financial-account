---
name: dev-plan
description: Turn an approved design into an execution plan — Stage A extracts phases (strategic sequencing with exit criteria and dependencies), Stage B breaks each phase into atomic tasks (≤ ~half day, linked to test cases) with a Depends column and a hot-files list. Stops at the plan gate. Use after design (and prototype, if any) is approved, before coding.
---

# dev-plan — phase extraction + atomic tasks

**Input:** approved `ANA-NNNN` + `TC-NNNN` (+ accepted `PROTO-NNNN`) + allocated `PLAN-NNNN` id.
**Output:** `PLAN-NNNN` (Stage A + Stage B), gate pending.

## Steps

1. Load `dev-standard`. Read ANA, TC, PROTO write-backs, and the code structure involved
   (task sizing must reflect real files, not guesses).
2. **Stage A — phases (strategic):** per phase (P1…Pn): goal, deliverables, **exit criteria**
   (measurable — usually "TC cases #a–#b pass"), dependencies. Schema/foundation first,
   integration/data migration last. Add the plan-level **Dependencies & risks** section.
3. **Stage B — atomic tasks (tactical):** per phase, tasks `AT-<phase>.<seq>`:
   - ≤ ~half a day, one coherent change,
   - `Depends` (AT ids that must be Done first; — if none), files touched, linked TC cases,
     done-criteria, estimate,
   - **unit tests are part of the task** — never a separate "write tests later" task,
   - fill the **Hot files** list: shared files this plan will touch (routes, core models,
     migrations, package manifests) — used by `dev-execute` to avoid running conflicting plans
     concurrently.
4. **Merge rule:** size S → skip this skill; the task list lives in the ANA.
   **Re-run rule:** for L, Stage B per phase may be re-run mid-course (append tasks, re-plan log
   row) without reopening Stage A.
5. **GATE** — "PLAN-NNNN: n phases, m tasks. approve / change: … / hold".
6. Close: files, summary, id, log line (dev-standard §7).

## Rules

- Every task traceable upward: task → TC cases → AC; flag any task without an ancestor.
- Setup/config tasks are real tasks with their own verification criteria.
- Write each task row so it can be **pasted alone** into a dispatch payload (dev-standard/orchestrator.md §12)
  and still be actionable: name the files, the TC ids, and the done-criterion in the row.
