/**
 * Drizzle schema (AT-1.3) — the typed mirror of `migrations/001-initial-schema.ts`.
 *
 * The migration SQL is authoritative for DDL (constraints, defaults, indexes); this file
 * exists so main-process code gets column/row types and a type-safe query builder. If you
 * change one, change the other in the same commit — `schema.test.ts` asserts that the
 * column set of every table here matches the real table in a migrated database.
 *
 * Money (INV-1): every `*_minor` column is `integer` satang. Never `real`.
 * Currency (INV-5): only `transactions` carries a `currency` column, exactly as ANA-0001
 * §Data model changes specifies. The other amount-bearing tables (`shared_caps`,
 * `deduction_categories`, `deduction_entries`, `tax_brackets`) hold statutory Thai figures
 * in an app that is THB-only by definition, so a per-row currency there would be a column
 * that can only ever hold one value; the CHECK on `transactions.currency` is where the
 * invariant is actually enforceable against user input.
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const UTC_NOW = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export type TaxYearStatus = 'open' | 'closed';
export type ExpenseMethod = 'lump_sum' | 'actual';
export type TransactionKind = 'income' | 'expense';
export type IncomeSection = '40_1' | '40_2' | '40_5_8';
export type GeneralCategory = 'food' | 'shopping' | 'housing' | 'other';
export type TransactionStatus = 'active' | 'voided';
export type TransactionSource = 'manual' | 'import';
export type CapType = 'fixed' | 'per_count' | 'shared_group_member';

export const taxYears = sqliteTable('tax_years', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  year: integer('year').notNull().unique(),
  status: text('status').$type<TaxYearStatus>().notNull(),
  expenseMethod: text('expense_method').$type<ExpenseMethod>(),
  lumpSumRateBp: integer('lump_sum_rate_bp'),
  closedAt: text('closed_at'),
  frozenResultJson: text('frozen_result_json'),
  createdAt: text('created_at').notNull().default(UTC_NOW),
  updatedAt: text('updated_at').notNull().default(UTC_NOW),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taxYearId: integer('tax_year_id')
      .notNull()
      .references(() => taxYears.id),
    kind: text('kind').$type<TransactionKind>().notNull(),
    taxRelevant: integer('tax_relevant', { mode: 'boolean' }).notNull().default(true),
    incomeSection: text('income_section').$type<IncomeSection>(),
    generalCategory: text('general_category').$type<GeneralCategory>(),
    /** Calendar date, `YYYY-MM-DD`. */
    date: text('date').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('THB'),
    whtMinor: integer('wht_minor').notNull().default(0),
    sourcePayer: text('source_payer'),
    payerTaxId: text('payer_tax_id'),
    note: text('note'),
    status: text('status').$type<TransactionStatus>().notNull().default('active'),
    reversalOfId: integer('reversal_of_id'),
    source: text('source').$type<TransactionSource>().notNull().default('manual'),
    createdAt: text('created_at').notNull().default(UTC_NOW),
    updatedAt: text('updated_at').notNull().default(UTC_NOW),
  },
  (table) => ({
    byTaxYear: index('idx_transactions_tax_year').on(table.taxYearId),
    byReversalOf: index('idx_transactions_reversal_of').on(table.reversalOfId),
  }),
);

export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    transactionId: integer('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    relativePath: text('relative_path').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    addedAt: text('added_at').notNull().default(UTC_NOW),
  },
  (table) => ({
    byTransaction: index('idx_attachments_transaction').on(table.transactionId),
  }),
);

export const sharedCaps = sqliteTable('shared_caps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  capAmountMinor: integer('cap_amount_minor').notNull(),
});

export const deductionCategories = sqliteTable(
  'deduction_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    capType: text('cap_type').$type<CapType>().notNull(),
    capAmountMinor: integer('cap_amount_minor'),
    sharedGroupId: integer('shared_group_id').references(() => sharedCaps.id),
    sortOrder: integer('sort_order').notNull().default(0),
    description: text('description').notNull().default(''),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    bySharedGroup: index('idx_deduction_categories_shared_group').on(table.sharedGroupId),
  }),
);

export const deductionEntries = sqliteTable(
  'deduction_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taxYearId: integer('tax_year_id')
      .notNull()
      .references(() => taxYears.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => deductionCategories.id),
    amountMinor: integer('amount_minor').notNull(),
    count: integer('count'),
    updatedAt: text('updated_at').notNull().default(UTC_NOW),
  },
  (table) => ({
    byYearCategory: uniqueIndex('idx_deduction_entries_year_category').on(
      table.taxYearId,
      table.categoryId,
    ),
  }),
);

export const taxBrackets = sqliteTable('tax_brackets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lowerBoundMinor: integer('lower_bound_minor').notNull(),
  /** `null` = the open-ended top bracket. */
  upperBoundMinor: integer('upper_bound_minor'),
  rateBp: integer('rate_bp').notNull(),
  sortOrder: integer('sort_order').notNull().unique(),
});

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    occurredAt: text('occurred_at').notNull().default(UTC_NOW),
  },
  (table) => ({
    byEntity: index('idx_audit_log_entity').on(table.entityType, table.entityId),
  }),
);

export type TaxYearRow = typeof taxYears.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type SharedCapRow = typeof sharedCaps.$inferSelect;
export type DeductionCategoryRow = typeof deductionCategories.$inferSelect;
export type DeductionEntryRow = typeof deductionEntries.$inferSelect;
export type TaxBracketRow = typeof taxBrackets.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
