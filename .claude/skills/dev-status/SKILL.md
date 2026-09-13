---
name: dev-status
description: Report the current pipeline status — active features with size/status/phase progress, executing streams, open gates waiting on the user, and parked items. Read-only report; use when the user asks "where are we?", starts a new session, or wants to decide what to work on next.
---

# dev-status — pipeline overview

**Input:** a status question. **Output:** a status report; nothing persistent.

## Steps

1. Load `dev-standard`. Read `docs/INDEX.md`; for each active feature its PLAN checkboxes,
   REV verdicts, pending gates. Do not read ANA/TC/IMPL bodies.
2. Report, in order:
   - **Executing now** — streams from `.claude/runs/*.state` (paused + blockers first),
   - **Active features** — one line each: `REQ-id title · size · status · phase progress · last activity`,
   - **Open gates** — decisions waiting on the user,
   - **Parked items** — parked GAPs/ideas, so nothing rots silently,
   - **Recently closed/archived** — brief.
3. If asked what to do next: recommend by priority (open gates → in-flight phases → parked).

## Rules

- Read-only; no log entry unless the user makes a decision during the discussion.
- If INDEX and the docs disagree, report the discrepancy instead of guessing.
