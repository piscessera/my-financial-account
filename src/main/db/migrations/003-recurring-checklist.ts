/**
 * Migration 003 — Monthly recurring checklist for general transactions (REQ-0005, ANA-0005).
 *
 * Adds:
 * - `recurring_templates`: Template schedule definitions for recurring general transactions.
 * - `recurring_monthly_logs`: Monthly status (completed | skipped) per template and year-month.
 */
export const MIGRATION_003_SQL = `
CREATE TABLE recurring_templates (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  name                 TEXT    NOT NULL CHECK (length(name) > 0),
  kind                 TEXT    NOT NULL CHECK (kind IN ('income', 'expense')),
  general_category     TEXT    NOT NULL CHECK (general_category IN ('food', 'shopping', 'housing', 'other')),
  due_day              INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
  default_amount_minor INTEGER          CHECK (default_amount_minor IS NULL
                                               OR (typeof(default_amount_minor) = 'integer' AND default_amount_minor >= 0)),
  default_note         TEXT    NOT NULL DEFAULT '',
  is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_recurring_templates_active ON recurring_templates (is_active);

CREATE TABLE recurring_monthly_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id    INTEGER NOT NULL REFERENCES recurring_templates (id) ON DELETE CASCADE,
  year_month     TEXT    NOT NULL CHECK (length(year_month) = 7),
  status         TEXT    NOT NULL CHECK (status IN ('completed', 'skipped')),
  transaction_id INTEGER          REFERENCES transactions (id) ON DELETE SET NULL,
  recorded_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CONSTRAINT recurring_logs_unique_template_month UNIQUE (template_id, year_month)
);

CREATE INDEX idx_recurring_logs_template ON recurring_monthly_logs (template_id);
CREATE INDEX idx_recurring_logs_month ON recurring_monthly_logs (year_month);
`;
