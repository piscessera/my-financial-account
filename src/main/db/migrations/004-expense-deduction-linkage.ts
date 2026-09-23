/**
 * Migration 004 — Expense to tax deduction linkage (REQ-0007, ANA-0007).
 *
 * Adds `deduction_category_id INTEGER REFERENCES deduction_categories(id) ON DELETE SET NULL`
 * to table `transactions`.
 */
export const MIGRATION_004_SQL = `
ALTER TABLE transactions ADD COLUMN deduction_category_id INTEGER REFERENCES deduction_categories (id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_deduction_category ON transactions (tax_year_id, deduction_category_id);
`;
