---
name: dev-log
description: Append a work-log entry to the daily log (docs/90-daily-logs/YYYY-MM-DD.md). Fires as the closing step of every other skill, or directly when the user says "log this". Keeps the daily log as the decision record of the project.
---

# dev-log — daily log entry

**Input:** a completed work unit. **Output:** one appended entry (orchestrator writes it).

## Steps

1. Format per `dev-standard` §6. Target: `docs/90-daily-logs/YYYY-MM-DD.md` (today, from
   `date +%F`); create if missing. Time from `date +%H:%M` — never from memory.
2. Append (never rewrite), ≤ 4 lines:

```markdown
## HH:MM · <skill> (<primary ID>) — <role>
- <what was produced/done>
- decision: <key decision, if any>
- next: <next step, if any>
```

3. Single-writer rule: dispatched agents return their log line; the orchestrator appends it.
4. Fold into the work commit or `docs: daily log <date>`.

## Rules

- Log decisions **when made**, not at day end.
- No-pipeline work gets a one-liner (`## HH:MM · ad-hoc — <what>`).
- Never edit or reorder old entries; corrections are new entries.
