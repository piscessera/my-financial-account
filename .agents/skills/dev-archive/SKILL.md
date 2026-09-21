---
name: dev-archive
description: Archive closed or superseded documents — moves them into docs/archive/ with a manifest entry and INDEX tombstones, compresses closed months of daily logs into summaries, and commits. Triggered by feature close ("close REQ-x"), month-end housekeeping, or a cleanup request. Nothing is ever deleted; archiving is reversible.
---

# dev-archive — archiving

**Input:** a close/archive request. **Output:** moved docs, updated MANIFEST + INDEX, one commit.

## Triggers

- **Feature close:** "close REQ-x" → the chain (REQ/ANA/TC/PLAN/REV/IMPL/PROTO/GAP) is marked
  `implemented`/closed; archive now or at month-end (user picks).
- **Month-end:** sweep closed features + that month's daily logs.
- **Cleanup pass:** propose candidates from INDEX first.

## Steps

1. Load `dev-standard` §9. From INDEX list candidates (`implemented`+closed, or `superseded`).
   **Propose the list and wait for approval** before moving anything.
2. Move files preserving type folders: `docs/archive/<TYPE>/…` (IMPL moves as a folder;
   superseded revisions keep suffixes, e.g. `ANA-0006-r1.md`).
3. Append rows to `docs/archive/MANIFEST.md`: date · from → to · why · linked feature.
4. Tombstone INDEX rows: `status: archived`, `archived_to: …` (row stays; counters untouched).
   *(The archivist may write these tombstone rows as part of the approved move — the one
   exception to the single-writer rule — and reports them itemized.)*
5. **Log compression (month-end):** merge a closed month's logs into `YYYY-MM-summary.md`
   (entries verbatim), move originals to `docs/archive/logs/`.
6. One commit: `docs: archive <scope> (<n> docs, manifest updated)`.
7. Close: moved list, summary, log line (dev-standard §7).

## Rules

- Active features' documents are never archived.
- Flag any active doc still referencing an archived one instead of silently archiving.
