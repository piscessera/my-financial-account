/**
 * Migration 002 — Year-scoped tax brackets, deduction categories, and shared caps (REQ-0004, ANA-0004).
 *
 * Adds `tax_year_id INTEGER REFERENCES tax_years(id) ON DELETE CASCADE` to `shared_caps`,
 * `deduction_categories`, and `tax_brackets`.
 * - `tax_year_id IS NULL`: System baseline template (default for newly created tax years).
 * - `tax_year_id = <id>`: Year-specific configuration.
 *
 * Recreates the tables so that the previous global UNIQUE constraints (`name`, `code`, `sort_order`)
 * become per-year scoped unique constraints.
 */
export const MIGRATION_002_SQL = `
-- ---------------------------------------------------------------------------
-- 1. Recreate shared_caps with tax_year_id
-- ---------------------------------------------------------------------------
CREATE TABLE shared_caps_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_year_id      INTEGER REFERENCES tax_years (id) ON DELETE CASCADE,
  name             TEXT    NOT NULL CHECK (length(name) > 0),
  cap_amount_minor INTEGER NOT NULL CHECK (typeof(cap_amount_minor) = 'integer' AND cap_amount_minor >= 0)
);

INSERT INTO shared_caps_new (id, tax_year_id, name, cap_amount_minor)
  SELECT id, NULL, name, cap_amount_minor FROM shared_caps;

DROP TABLE shared_caps;
ALTER TABLE shared_caps_new RENAME TO shared_caps;
CREATE INDEX idx_shared_caps_tax_year ON shared_caps (tax_year_id);
CREATE UNIQUE INDEX idx_shared_caps_scope_name ON shared_caps (coalesce(tax_year_id, 0), name);

-- ---------------------------------------------------------------------------
-- 2. Recreate deduction_categories with tax_year_id
-- ---------------------------------------------------------------------------
CREATE TABLE deduction_categories_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_year_id      INTEGER REFERENCES tax_years (id) ON DELETE CASCADE,
  code             TEXT    NOT NULL CHECK (length(code) > 0),
  name             TEXT    NOT NULL CHECK (length(name) > 0),
  cap_type         TEXT    NOT NULL CHECK (cap_type IN ('fixed', 'per_count', 'shared_group_member')),
  cap_amount_minor INTEGER          CHECK (cap_amount_minor IS NULL
                                           OR (typeof(cap_amount_minor) = 'integer' AND cap_amount_minor >= 0)),
  shared_group_id  INTEGER          REFERENCES shared_caps (id) ON DELETE RESTRICT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  description      TEXT    NOT NULL DEFAULT '',
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_builtin       INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),

  CONSTRAINT deduction_categories_shared_group_matches_cap_type CHECK (
    (cap_type = 'shared_group_member' AND shared_group_id IS NOT NULL)
    OR (cap_type <> 'shared_group_member' AND shared_group_id IS NULL)
  ),
  CONSTRAINT deduction_categories_cap_amount_matches_cap_type CHECK (
    cap_type = 'shared_group_member' OR cap_amount_minor IS NOT NULL
  )
);

INSERT INTO deduction_categories_new (
  id, tax_year_id, code, name, cap_type, cap_amount_minor,
  shared_group_id, sort_order, description, is_active, is_builtin
)
  SELECT
    id, NULL, code, name, cap_type, cap_amount_minor,
    shared_group_id, sort_order, description, is_active, is_builtin
  FROM deduction_categories;

DROP TABLE deduction_categories;
ALTER TABLE deduction_categories_new RENAME TO deduction_categories;
CREATE INDEX idx_deduction_categories_tax_year ON deduction_categories (tax_year_id);
CREATE INDEX idx_deduction_categories_shared_group ON deduction_categories (shared_group_id);
CREATE UNIQUE INDEX idx_deduction_categories_scope_code ON deduction_categories (coalesce(tax_year_id, 0), code);

-- ---------------------------------------------------------------------------
-- 3. Recreate tax_brackets with tax_year_id
-- ---------------------------------------------------------------------------
CREATE TABLE tax_brackets_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_year_id       INTEGER REFERENCES tax_years (id) ON DELETE CASCADE,
  lower_bound_minor INTEGER NOT NULL CHECK (typeof(lower_bound_minor) = 'integer' AND lower_bound_minor >= 0),
  upper_bound_minor INTEGER          CHECK (upper_bound_minor IS NULL
                                           OR (typeof(upper_bound_minor) = 'integer' AND upper_bound_minor > lower_bound_minor)),
  rate_bp           INTEGER NOT NULL CHECK (typeof(rate_bp) = 'integer' AND rate_bp >= 0 AND rate_bp <= 10000),
  sort_order        INTEGER NOT NULL
);

INSERT INTO tax_brackets_new (
  id, tax_year_id, lower_bound_minor, upper_bound_minor, rate_bp, sort_order
)
  SELECT
    id, NULL, lower_bound_minor, upper_bound_minor, rate_bp, sort_order
  FROM tax_brackets;

DROP TABLE tax_brackets;
ALTER TABLE tax_brackets_new RENAME TO tax_brackets;
CREATE INDEX idx_tax_brackets_tax_year ON tax_brackets (tax_year_id);
CREATE UNIQUE INDEX idx_tax_brackets_scope_sort_order ON tax_brackets (coalesce(tax_year_id, 0), sort_order);
`;
