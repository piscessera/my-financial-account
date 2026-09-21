---
id: TC-0005
type: test-cases
title: Monthly recurring checklist for general transactions — test cases
status: active
created: 2026-09-21
updated: 2026-09-21
links: [ANA-0005, REQ-0005]
---

# TC-0005: Monthly recurring checklist for general transactions — test cases

## Test matrix

| # | Case | Scope | Method | Expected result |
|---|------|-------|--------|-----------------|
| 1 | Migration 003 creates `recurring_templates` and `recurring_monthly_logs` tables with constraints | db/schema | automated | Schema tables created; CHECK and UNIQUE constraints reject invalid day (<1 or >31) or invalid status |
| 2 | CRUD operations for recurring templates | repositories/recurring | automated | Create, list, update, and deactivate templates succeed and log audit entries |
| 3 | Monthly checklist generation for active month | repositories/recurring | automated | Returns all active templates with accurate status (pending, completed, skipped) for specified yearMonth |
| 4 | Recording a recurring item creates general transaction and monthly log | repositories/recurring | automated | A non-tax transaction (`tax_relevant = false`) is created; log links `transaction_id`; item status becomes `completed` |
| 5 | Skipping a recurring item marks skipped without creating transaction | repositories/recurring | automated | Log is created with status `skipped`; no transaction inserted |
| 6 | Undo completed/skipped recurring item | repositories/recurring | automated | Log is deleted; created transaction is voided or removed; status reverts to `pending` |
| 7 | Deactivated template handling | repositories/recurring | automated | Inactive template does not appear in new months' checklist but historical logs remain intact |
| 8 | UI Monthly Checklist and Manage Modal render and trigger actions | renderer/components | automated | Renders checklist widget, triggers record/skip/undo, opens manage template modal |
