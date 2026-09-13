---
id: PROTO-0001
type: prototype
title: Annual tax income/expense tracker — prototype
status: draft
created: 2026-09-13
updated: 2026-09-13
links: [ANA-0001, REQ-0001]
---

# PROTO-0001: Annual tax income/expense tracker — feedback rounds

Status legend: `waiting re-review` → `accepted` / `rejected` (+reason).
On final acceptance, write-back happens: "§ UX decisions" appended to the linked ANA and
`source: prototype` UI cases added to the linked TC — note it in the last row.

Linked: ANA-0001 · REQ-0001
Prototype: `index.html` + one HTML file per screen (vanilla HTML/CSS, opens from filesystem) —
not yet built; round 1 is a style-direction pick (`design/DESIGN.md`) ahead of building the
screens.

| Round | Date | Feedback | Change applied | Status |
|-------|------|----------|----------------|--------|
| 1 | 2026-09-13 | User asked for a DESIGN.md UX/UI guideline with color/style options to choose from before building screens. | Wrote `DESIGN.md`: 3 named style directions (Ledger Jade / Slate & Amber / Warm Merit) with full light+dark token tables, type pairings, and a shared structural guideline (type scale, spacing scale, shared components). Recommended Direction A. | accepted |
| 2 | 2026-09-13 | User picked Direction B (Slate & Amber). | Recorded the decision in `design/DESIGN.md`; built the 5 clickable screens (`dashboard.html`, `entry.html`, `deductions.html`, `settings.html`, `summary.html`) plus `index.html` and a shared `styles.css`, all using Direction B tokens. Verified rendering via a local static server (light/dark). Screens include empty state (new tax year), a validation-error state, cap-exceeded state, an editable-then-locked transaction with visible history, the close-tax-year confirmation, and a closed/frozen year with a reversal-entry example. | accepted |
| 3 | 2026-09-13 | Add a "payer's tax ID" field to the income entry form, next to source/payer. | Added the field to `entry.html` (optional, 13-digit Thai tax ID). Back-propagated: REQ-0001 AC-1, ANA-0001 `transactions` table (`payer_tax_id` nullable) + decision #8, TC-0001 (case #1 updated, case #1a added for the optional/blank path). | accepted |
| 4 | 2026-09-13 | Group the tax-year ledger by month for easier monthly scanning, while keeping annual figures visible. | Reworked `entry.html`'s ledger into one table with a per-month subtotal header row (spanning all columns) plus an annual totals strip (income/WHT/count) above it, linking to `summary.html` for the full year view. Fixed a `display:flex` on `<td colspan>` rendering bug along the way (moved the flex layout to a nested `<div>`). Noted the grouping in ANA-0001's UI changes section (display-only, no new data/invariant). | waiting re-review |
