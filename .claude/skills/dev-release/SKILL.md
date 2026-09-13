---
name: dev-release
description: Ship a merged, reviewed feature set to the deployment target — pre-flight checks, version tag, CHANGELOG entry, build, deploy steps and post-deploy verification, all recorded in a release note. Use when the user says "release", "deploy", "ship it", or after a feature close when the user wants it live. Never auto-runs after merge.
---

# dev-release — build, deploy, verify

**Input:** `main` at a state the user wants live (features `implemented`, reviews PASS).
**Output:** git tag `vX.Y.Z`, `CHANGELOG.md` entry, `docs/80-releases/REL-vX.Y.Z.md` note.
The deploy mechanics themselves come from **CLAUDE.md §Project → Deployment** (fill it in the
first time this skill runs; the skill refuses without it).

## Steps

1. **Pre-flight (mechanical, all must pass):** on `main`, working tree clean ·
   `bash .claude/scripts/gate.sh` PASS · no `executing` stream
   in `.claude/runs/` · every IMPL folder of the included features has its "Setup & config
   notes" section read and turned into deploy steps below.
2. **Version:** semver from Conventional Commits since the last tag (`feat` → minor, `fix` →
   patch, `!`/`BREAKING` → major). Propose; user confirms.
3. **CHANGELOG.md:** one section per version — features / fixes / migrations & config changes
   (from IMPL setup notes) — linking REQ/PLAN ids.
4. **GATE** — "Release vX.Y.Z: n features, m migrations, config changes: …  approve / hold".
   Nothing below runs without `approve`.
5. **Build & deploy:** follow CLAUDE.md §Deployment exactly (build artifacts, upload/deploy,
   run migrations, config/env changes, scheduler/cron entries, cache clears). Record each
   command and result in the release note. Stop on the first failure — never improvise a fix on
   the target.
6. **Post-deploy verification:** smoke checks listed in CLAUDE.md §Deployment (health URL,
   login, one read + one write path); run TC cases marked `Manual` + `release-smoke` if any.
7. **Tag & record:** `git tag -a vX.Y.Z -m "…"` (push if origin); write
   `docs/80-releases/REL-vX.Y.Z.md` (what shipped, deploy log, verification results, rollback
   note); orchestrator adds the INDEX row + daily-log line.

## Rollback

Every release note states the rollback: previous tag, whether migrations are reversible (from
the review's data checklist), and the exact command sequence. If post-deploy verification fails,
rollback is the default action — the user decides otherwise.

## Rules

- User-triggered only; never chained automatically after `dev-execute` completion.
- Secrets never appear in the release note or CHANGELOG.
- Hosting constraints in CLAUDE.md are hard limits (e.g. no daemons on shared hosting).
