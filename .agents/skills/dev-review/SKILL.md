---
name: dev-review
description: Run a quality gate in three modes — review (acceptance gate on a phase or feature against its exit criteria, incl. a code-quality checklist), audit (standards/compliance sweep incl. parking-lot closure), verify (does the code still match its design after later changes). Produces a REV report with a PASS/FAIL verdict. Read-only; never reviews work it authored.
---

# dev-review — review / audit / verify

**Input:** dispatch payload (dev-standard/orchestrator.md §12): mode, scope excerpt (PLAN rows + TC rows of the
scope, commit range, PROTO screens), allocated `REV-NNNN` id, output of the mechanical gate.
**Output:** REV report + verdict.

## When a model review runs (cadence — token discipline)

Every phase first passes the **mechanical gate** (no model):
`bash .claude/scripts/gate.sh --plan PLAN-NNNN --phase Pn --dir <worktree>` — validate-docs ·
tests · lint · secrets scan · phase rows ☑ · TC results present. The orchestrator runs it and
pastes the summary block into the reviewer payload.

A **qa-reviewer** dispatch happens only when:
- the phase is the **last** phase of the feature (feature-close review — always), or
- the phase changed a **schema / data model / auth-permission surface**, or
- the phase has a **FAIL history** (re-review of failed items only), or
- the user asks.

Other phases: mechanical gate PASS = phase PASS, logged as `gate: mechanical PASS` — no REV
file. Size L still gets one **audit** at feature close (not per phase).

## Modes & checklists

**review** (acceptance gate):
- process: PLAN rows in scope done, exit criteria met; every Unit TC case has a real passing
  test; UI matches the accepted PROTO and adheres to `DESIGN.md` (tokens, typography, tabular numbers,
  semantic colors); traceability chain unbroken; no unrelated changes in the commit range;
- **invariants first:** every ANA `INV-n` still holds — its TC case passes and the code/DB
  constraint named in the ANA exists; a weakened or deleted invariant test is a **defect**;
- **code quality** (each item: pass / fail / n.a. with evidence):
  - authorization: every new route/action/endpoint is covered by a policy/guard, and a test
    proves the negative case (wrong user / role → denied),
  - input: every write path validates input; no mass-assignment of client-supplied fields
    without an allow-list; uploads validated (type, size, name),
  - data: migrations reversible; no destructive migration without a data-preservation step;
    indexes for new query paths; money/amount fields use exact types (integer minor units or
    decimal — never float),
  - queries: no N+1 on list views (test with lazy-loading prevention or query-count assertion),
  - failure paths: errors surfaced to the user, not swallowed; no secrets in logs/commits,
  - text: UTF-8 end-to-end (Thai text round-trips) where user text is stored.

**audit** (standards sweep — feature close, and on demand):
- `validate-docs` clean; docs linked; INDEX accurate,
- formatter/linter clean; Conventional Commits,
- hosting/runtime constraints (CLAUDE.md §Project) respected,
- daily log present for all work done,
- **parking lot closure:** every `note`/`idea` from every REV of this feature has a row in
  `docs/PARKING-LOT.md` (with owner if open); every REQ out-of-scope item likewise; nothing
  "noted" only inside a REV.

**verify** (after later changes touch a shipped feature):
- code still matches ANA decisions; TC tests still pass; no regression vs REV history.

## Steps

1. Load `dev-standard`. **Separation of duties:** never review work you authored in this
   session — tell the orchestrator to dispatch a fresh reviewer.
2. **Read-only** — the PreToolUse guard enforces this; you may write only your REV file.
   Run tests/lint via Bash; read code, docs. Read only the payload's scope + commits in range.
3. Write `docs/60-reviews/REV-NNNN-slug.md` from the template: checklist table + findings
   (**defect** blocks / **note** fix later / **idea**). Every note/idea ends with a proposed
   PARKING-LOT row (source, item, suggested owner) so the orchestrator can paste it. **No pasted
   test output** — cite the command + summary line. Target ≤ 120 lines.
4. Verdict: `PASS` / `PASS with notes` / `FAIL` (+ required rework; re-review only failed items).
5. **GATE** — verdict + findings; user accepts or orders rework.
6. Close: verdict, findings summary, PARKING-LOT rows, id, log line (dev-standard §7).

## Rules

- Findings cite evidence: file:line, test command + result line, doc link — no vibes.
- Effort scales with size (S: one pass; feature close: full checklist).
