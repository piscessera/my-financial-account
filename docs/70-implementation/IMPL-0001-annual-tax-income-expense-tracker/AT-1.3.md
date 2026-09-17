# AT-1.3 — Drizzle schema + migration runner (8 core tables)

- **Plan:** PLAN-0001 · **Phase:** P1 · **Commit:** `8eaab0e`
- **TC results:** none linked. Done-criterion met by `migrate.test.ts` (8 tables + indexes in a
  temp-file DB) and `schema.test.ts` (≥1 valid insert and ≥1 rejected constraint violation per
  table), both in `src/main/db/__tests__/`. 63 tests pass; lint + `tsc --noEmit` clean.

## What was done

- Added `better-sqlite3` 11.x + `drizzle-orm` 0.36 (`@types/better-sqlite3` dev-only), no drizzle-kit.
- `db/migrations/001-initial-schema.ts` — authoritative DDL for all 8 ANA tables, the three ANA
  indexes, plus FK-lookup indexes on `attachments`, `transactions.reversal_of_id`,
  `deduction_categories.shared_group_id`.
- `db/migrate.ts` — append-only migrations keyed on `PRAGMA user_version`, one transaction each,
  idempotent, with a downgrade guard against files written by a newer schema.
- `db/client.ts` — `openDatabase(path)`: pragmas (`foreign_keys=ON`, `journal_mode=DELETE`,
  `synchronous=FULL`, `busy_timeout`), migrate, return `{ db, sqlite }`.
- `db/schema.ts` — Drizzle mirror for typed queries; a parity test asserts column-set match.

## Deviations from design

- **DDL is hand-written SQL, not drizzle-kit-generated.** Drizzle cannot express the conditional
  CHECKs carrying INV-2b/INV-6; parity with `schema.ts` is enforced by a test instead.
- **INV-5:** only `transactions` carries a `currency` CHECK, exactly as the ANA lists it — the
  other amount tables hold statutory THB figures in a THB-only app (reasoning in `schema.ts`).
- **CHECKs beyond the ANA's literal columns** (ANA-consistent, but interpretation):
  `tax_years` closed⇔`closed_at`; `lump_sum_rate_bp` only with `expense_method='lump_sum'`,
  0–10000bp; `typeof='integer'` on every `*_minor`, `amount_minor <> 0`; `date GLOB YYYY-MM-DD`;
  non-tax rows may not carry `income_section`; cap_amount/shared_group must match `cap_type`;
  `tax_brackets.sort_order` UNIQUE and `upper > lower`; `audit_log` needs ≥1 of before/after,
  both valid JSON. `shared_caps.name` UNIQUE; `deduction_categories.description` is
  `NOT NULL DEFAULT ''` (ANA marks nullables explicitly and did not mark it).
- `journal_mode=DELETE`, not WAL: WAL side-files can sync out of step in a Drive-synced folder.

## Notes for follow-up tasks

- Open via `openDatabase(filePath)`; tests use `db/__tests__/helpers.ts::openTempDatabase()`.
- `amount_minor` sign is unconstrained beyond non-zero — the reversal task must fix the
  convention (negative amount vs. flipped `kind`) at repository level.
- AT-1.5 seeding: `sort_order` unique; `shared_group_member` rows may carry their own
  `cap_amount_minor` sub-cap or leave it NULL (see correction below).

## Correction (2026-09-17, REV-0001)

The original `deduction_categories_cap_amount_matches_cap_type` CHECK forced `shared_group_member`
rows to have `cap_amount_minor IS NULL`, contradicting ANA-0001 §Deduction cap shapes (a member
may carry its own sub-cap on top of the group total) and making TC-0001 #10 unimplementable.
Fixed directly in migration 001 (not a new migration — nothing had shipped yet): the CHECK now
only requires `cap_amount_minor IS NOT NULL` for `fixed`/`per_count`; `shared_group_member`'s
`cap_amount_minor` is unconstrained by cap_type (still NULL-or-non-negative-integer per the
column's own CHECK). `schema.test.ts` gained an acceptance test for a member with a sub-cap;
`seed.ts`'s doc comment corrected to match.
