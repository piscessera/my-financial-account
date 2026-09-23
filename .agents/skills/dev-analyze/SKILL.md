---
name: dev-analyze
description: Analyze an approved requirement and design the solution — produces the ANA design document AND the TC test-case document (mandatory, every acceptance criterion gets at least one case so coding can build unit tests against them). Stops at the design gate. Use after a REQ is approved, or in S-mode directly after a GAP for small fixes.
---

# dev-analyze — analysis, design, test cases

**Input:** approved `REQ-NNNN` (M/L) or `GAP-NNNN` (S-mode) + allocated `ANA`/`TC` ids.
**Output:** `ANA-NNNN` + `TC-NNNN`, design gate pending.

## Steps

1. Load `dev-standard`. Read the REQ (or GAP) and everything it links; then read the actual code
   it touches — design against reality, not assumptions.
2. Write `docs/20-analysis/ANA-NNNN-slug.md` from the template:
   - context & current behavior (cite the files read),
   - solution overview (stack per CLAUDE.md §Project),
   - **invariants** (`INV-1…n`): domain rules that must always hold — for a financial app at
     minimum: money stored as integer minor units or decimal (never float) with a stated
     rounding rule; posted transactions immutable (corrections = reversal entries); every
     balance derivable from its entries and reconciled by a test; every mutation leaves an
     audit trail (who/when/what); currency explicit on every amount,
   - data model changes, backend/API changes, UI changes (pages, components, states adhering to `DESIGN.md`),
   - hosting/runtime constraints from AGENTS.md applied explicitly,
   - **dependencies & risks** (external deps get explicit items),
   - decision table (decision → reason → date).
3. Write `docs/30-test-cases/TC-NNNN-slug.md` from the template. **Mandatory:**
   - every AC (or GAP fix) has ≥1 case,
   - each case: Given/When/Then + level (Unit/Manual) + maps-to (AC, INV-n, or design point),
   - **every invariant has ≥1 case** (`Maps to: INV-n`) — property/edge tests for money math,
   - edge cases the design implies (empty state, failure path, permission, boundary),
   - `Unit` cases must be implementable in the project's test runners.
4. Classify/confirm size. **S-mode:** intake+analyze in one session, task list may live in the
   ANA (no separate PLAN); ask only what the GAP didn't answer.
5. **GATE** — "ANA-NNNN + TC-NNNN (n cases) ready. approve / change: … / hold". If UI-visible,
   offer the prototype loop (`dev-prototype`).
6. Close: files, summary, ids, log line (dev-standard §7).

## Rules

- Every nontrivial claim about current behavior cites the file/code read.
- If analysis reveals the requirement is bigger/different than assumed, stop and say so.
- Keep the ANA focused: it is later **excerpted** into dispatch payloads (dev-standard/orchestrator.md §12), so
  use clear section headings per design area — an implementer should be able to receive one
  section and act on it.
