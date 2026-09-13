---
name: dev-investigate
description: Investigate an issue or enhancement for impact and gap analysis before any work is scoped — traces affected code/docs/tests, produces a GAP document with impact matrix, root cause (for bugs), options with effort/risk, and a recommendation. Ends at a decision gate. Use when the user reports a bug, a problem, or asks "can we do X?" without a formed requirement.
---

# dev-investigate — impact & gap analysis

**Input:** a bug report or enhancement idea + allocated `GAP-NNNN` id. **Output:** `GAP-NNNN` + user decision.

## Steps

1. Load `dev-standard`.
2. **Trace impact:** reproduce/locate in code; find every affected area — modules, UI, jobs,
   schema, and *documents/tests of past features* (via INDEX links). Check git history for
   when/how the relevant code arrived (shipped-without-doc findings get flagged).
3. Write `docs/20-analysis/GAP-NNNN-slug.md` from the template:
   - **impact matrix** — area × affected × severity,
   - **gap analysis** — current vs desired,
   - **root cause** (defects) or **capability gap** (enhancements),
   - **options** — ≥2 when nontrivial, each with effort/risk and hosting feasibility,
   - **recommendation** — one clear option + proposed size,
   - outcome section (filled after the gate).
4. **GAP-lite:** for obvious size-S defects, half a page (impact matrix + root cause +
   recommendation) — same ID, same traceability, less ceremony.
5. **GATE** — present the recommendation. User picks: proceed (→ `dev-requirement` creates a
   REQ linked to the GAP) / quick fix (S-path) / park (`parked`) / different option.
6. **In-flight scope changes** during implementation: time-boxed (≤10 min) mini impact pass;
   contained → amendment (new tasks/TCs); bigger → this skill fully.
7. Close: files, summary, id + decision, log line (dev-standard §7).

## Rules

- Investigations never modify code — analysis only.
- "Not affected" areas are recorded explicitly (verified, not assumed).
