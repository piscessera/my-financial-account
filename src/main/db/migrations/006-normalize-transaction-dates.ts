/**
 * Migration 006 — Normalize transaction dates and recurring logs to Christian Era (CE / ค.ศ.).
 *
 * If any transactions or recurring monthly logs were saved with Buddhist Era years (>= 2400, e.g. 2569),
 * normalize them back to standard ISO Gregorian / Christian Era dates (e.g. 2026).
 */
export const MIGRATION_006_SQL = `
UPDATE transactions
SET date = printf('%04d', CAST(substr(date, 1, 4) AS INTEGER) - 543) || substr(date, 5)
WHERE CAST(substr(date, 1, 4) AS INTEGER) >= 2400;

UPDATE recurring_monthly_logs
SET year_month = printf('%04d', CAST(substr(year_month, 1, 4) AS INTEGER) - 543) || substr(year_month, 5)
WHERE CAST(substr(year_month, 1, 4) AS INTEGER) >= 2400;
`;
