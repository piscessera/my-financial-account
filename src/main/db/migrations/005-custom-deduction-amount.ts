/**
 * Migration 005 — Custom tax deductible amount per transaction (REQ-0008, ANA-0008).
 *
 * Adds `deduction_amount_minor INTEGER` (nullable satang integer) to table `transactions`.
 */
export const MIGRATION_005_SQL = `
ALTER TABLE transactions ADD COLUMN deduction_amount_minor INTEGER;
`;
