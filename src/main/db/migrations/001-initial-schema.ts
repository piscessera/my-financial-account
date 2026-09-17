/**
 * Migration 001 — initial schema (AT-1.3, ANA-0001 §Data model changes).
 *
 * The DDL below is the **authoritative** definition of the database. `schema.ts` mirrors it
 * as Drizzle table objects for type-safe queries, but Drizzle never generates DDL for this
 * project: SQLite CHECK constraints (especially the conditional ones that carry INV-2b and
 * INV-6) are expressed more precisely and more reviewably as plain SQL, and CLAUDE.md
 * §Project requires money-affecting SQL to stay explicit.
 *
 * Conventions used throughout:
 * - Money: every `*_minor` column is INTEGER satang (INV-1). No REAL/NUMERIC anywhere.
 * - Booleans: INTEGER 0/1 with an explicit CHECK (SQLite has no boolean type).
 * - Timestamps: TEXT, ISO-8601 UTC with milliseconds, e.g. `2026-09-15T08:30:00.000Z`.
 * - Dates (calendar, no time): TEXT `YYYY-MM-DD`.
 */

export const UTC_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export const MIGRATION_001_SQL = `
-- ---------------------------------------------------------------------------
-- tax_years
-- ---------------------------------------------------------------------------
CREATE TABLE tax_years (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  year               INTEGER NOT NULL UNIQUE,
  status             TEXT    NOT NULL CHECK (status IN ('open', 'closed')),
  expense_method     TEXT             CHECK (expense_method IN ('lump_sum', 'actual')),
  lump_sum_rate_bp   INTEGER          CHECK (lump_sum_rate_bp IS NULL
                                             OR (lump_sum_rate_bp >= 0 AND lump_sum_rate_bp <= 10000)),
  closed_at          TEXT,
  frozen_result_json TEXT             CHECK (frozen_result_json IS NULL OR json_valid(frozen_result_json)),
  created_at         TEXT    NOT NULL DEFAULT (${UTC_NOW}),
  updated_at         TEXT    NOT NULL DEFAULT (${UTC_NOW}),

  -- INV-2b: a closed year must record when it was closed; an open year must not.
  CONSTRAINT tax_years_closed_at_matches_status CHECK (
    (status = 'closed' AND closed_at IS NOT NULL)
    OR (status = 'open' AND closed_at IS NULL)
  ),
  -- A lump-sum rate is meaningful only for the lump-sum expense method.
  CONSTRAINT tax_years_lump_sum_rate_requires_method CHECK (
    (expense_method = 'lump_sum' AND lump_sum_rate_bp IS NOT NULL)
    OR ((expense_method IS NULL OR expense_method <> 'lump_sum') AND lump_sum_rate_bp IS NULL)
  )
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
CREATE TABLE transactions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_year_id      INTEGER NOT NULL REFERENCES tax_years (id) ON DELETE RESTRICT,
  kind             TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
  tax_relevant     INTEGER NOT NULL DEFAULT 1 CHECK (tax_relevant IN (0, 1)),
  income_section   TEXT             CHECK (income_section IN ('40_1', '40_2', '40_5_8')),
  general_category TEXT             CHECK (general_category IN ('food', 'shopping', 'housing', 'other')),
  date             TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount_minor     INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor <> 0),
  currency         TEXT    NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  wht_minor        INTEGER NOT NULL DEFAULT 0 CHECK (typeof(wht_minor) = 'integer' AND wht_minor >= 0),
  source_payer     TEXT,
  payer_tax_id     TEXT,
  note             TEXT,
  status           TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  reversal_of_id   INTEGER          REFERENCES transactions (id) ON DELETE RESTRICT,
  source           TEXT    NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
  created_at       TEXT    NOT NULL DEFAULT (${UTC_NOW}),
  updated_at       TEXT    NOT NULL DEFAULT (${UTC_NOW}),

  -- ANA: income_section is required when tax_relevant = true AND kind = 'income'.
  CONSTRAINT transactions_income_section_required CHECK (
    NOT (tax_relevant = 1 AND kind = 'income') OR income_section IS NOT NULL
  ),
  -- ANA: general_category is required when tax_relevant = false; a general (non-tax)
  -- transaction carries no tax section.
  CONSTRAINT transactions_general_category_required CHECK (
    tax_relevant = 1 OR (general_category IS NOT NULL AND income_section IS NULL)
  ),
  -- ...and conversely a tax-relevant transaction is not a general-spending one.
  CONSTRAINT transactions_general_category_only_when_general CHECK (
    tax_relevant = 0 OR general_category IS NULL
  ),
  -- A row cannot be a reversal of itself (INV-2b).
  CONSTRAINT transactions_reversal_not_self CHECK (
    reversal_of_id IS NULL OR reversal_of_id <> id
  )
);

CREATE INDEX idx_transactions_tax_year ON transactions (tax_year_id);
CREATE INDEX idx_transactions_reversal_of ON transactions (reversal_of_id);

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
CREATE TABLE attachments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id    INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  relative_path     TEXT    NOT NULL CHECK (length(relative_path) > 0),
  original_filename TEXT    NOT NULL CHECK (length(original_filename) > 0),
  mime_type         TEXT    NOT NULL CHECK (length(mime_type) > 0),
  added_at          TEXT    NOT NULL DEFAULT (${UTC_NOW})
);

CREATE INDEX idx_attachments_transaction ON attachments (transaction_id);

-- ---------------------------------------------------------------------------
-- shared_caps  (created before deduction_categories, which references it)
-- ---------------------------------------------------------------------------
CREATE TABLE shared_caps (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE CHECK (length(name) > 0),
  cap_amount_minor INTEGER NOT NULL CHECK (typeof(cap_amount_minor) = 'integer' AND cap_amount_minor >= 0)
);

-- ---------------------------------------------------------------------------
-- deduction_categories  (INV-6: fixed | per_count | shared_group_member)
-- ---------------------------------------------------------------------------
CREATE TABLE deduction_categories (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT    NOT NULL UNIQUE CHECK (length(code) > 0),
  name             TEXT    NOT NULL CHECK (length(name) > 0),
  cap_type         TEXT    NOT NULL CHECK (cap_type IN ('fixed', 'per_count', 'shared_group_member')),
  cap_amount_minor INTEGER          CHECK (cap_amount_minor IS NULL
                                           OR (typeof(cap_amount_minor) = 'integer' AND cap_amount_minor >= 0)),
  shared_group_id  INTEGER          REFERENCES shared_caps (id) ON DELETE RESTRICT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  description      TEXT    NOT NULL DEFAULT '',
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_builtin       INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),

  -- INV-6: a shared_group_member points at its group; other shapes never do.
  CONSTRAINT deduction_categories_shared_group_matches_cap_type CHECK (
    (cap_type = 'shared_group_member' AND shared_group_id IS NOT NULL)
    OR (cap_type <> 'shared_group_member' AND shared_group_id IS NULL)
  ),
  -- INV-6: fixed = own ceiling, per_count = amount per unit; both need an amount.
  -- shared_group_member's cap_amount_minor is its own OPTIONAL sub-cap (ANA-0001 §Deduction
  -- cap shapes), on top of the group total from shared_caps -- e.g. health insurance keeps its
  -- own 25,000 sub-cap inside a 100,000 shared group, while life insurance in the same group
  -- has none (NULL is still valid for a member).
  CONSTRAINT deduction_categories_cap_amount_matches_cap_type CHECK (
    cap_type = 'shared_group_member' OR cap_amount_minor IS NOT NULL
  )
);

CREATE INDEX idx_deduction_categories_shared_group ON deduction_categories (shared_group_id);

-- ---------------------------------------------------------------------------
-- deduction_entries
-- ---------------------------------------------------------------------------
CREATE TABLE deduction_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_year_id  INTEGER NOT NULL REFERENCES tax_years (id) ON DELETE RESTRICT,
  category_id  INTEGER NOT NULL REFERENCES deduction_categories (id) ON DELETE RESTRICT,
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor >= 0),
  count        INTEGER          CHECK (count IS NULL OR (typeof(count) = 'integer' AND count >= 0)),
  updated_at   TEXT    NOT NULL DEFAULT (${UTC_NOW})
);

CREATE UNIQUE INDEX idx_deduction_entries_year_category
  ON deduction_entries (tax_year_id, category_id);

-- ---------------------------------------------------------------------------
-- tax_brackets  (seeded by AT-1.5 from TAX-2025)
-- ---------------------------------------------------------------------------
CREATE TABLE tax_brackets (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  lower_bound_minor INTEGER NOT NULL CHECK (typeof(lower_bound_minor) = 'integer' AND lower_bound_minor >= 0),
  upper_bound_minor INTEGER          CHECK (upper_bound_minor IS NULL
                                            OR typeof(upper_bound_minor) = 'integer'),
  rate_bp           INTEGER NOT NULL CHECK (typeof(rate_bp) = 'integer' AND rate_bp >= 0 AND rate_bp <= 10000),
  sort_order        INTEGER NOT NULL UNIQUE,

  CONSTRAINT tax_brackets_upper_above_lower CHECK (
    upper_bound_minor IS NULL OR upper_bound_minor > lower_bound_minor
  )
);

-- ---------------------------------------------------------------------------
-- audit_log  (INV-4)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT    NOT NULL CHECK (length(entity_type) > 0),
  entity_id   INTEGER NOT NULL,
  action      TEXT    NOT NULL CHECK (length(action) > 0),
  before_json TEXT             CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json  TEXT             CHECK (after_json IS NULL OR json_valid(after_json)),
  occurred_at TEXT    NOT NULL DEFAULT (${UTC_NOW}),

  -- A mutation always has at least one side; a row with neither records nothing.
  CONSTRAINT audit_log_has_a_side CHECK (
    before_json IS NOT NULL OR after_json IS NOT NULL
  )
);

CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
`;
