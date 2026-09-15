# Parking lot

The single ledger for everything deferred: review **notes** and **ideas** (from REV files),
parked GAPs, out-of-scope items from REQs. Nothing is "noted" anywhere else.
Rule: an `open` row always has an owner (a plan id, a GAP id, or a person) — `validate-docs`
fails otherwise. Audit mode checks that every REV note/idea landed here and that closed rows
say where they went.

| PL-id | Source | Item | Owner | Status | Target / resolution |
|-------|--------|------|-------|--------|---------------------|
| PL-0001 | REQ-0001 out-of-scope (narrowed 2026-09-13, PROTO-0001 feedback) | Category-based budgeting/allocation for general (non-tax) transactions — % of income per category, spending limits, savings/investment allocation (Fund, Insurance, etc. from the existing workbook). Simple *recording* of general transactions with a fixed category (Food/Shopping/Housing/Other) was pulled into REQ-0001 (AC-13/14/15) — only the budgeting/allocation layer on top remains parked here. | orchestrator | open | Candidate for a phase-2 requirement after REQ-0001 closes |
| PL-0002 | REQ-0001 out-of-scope | Net worth / asset / investment portfolio / insurance-policy tracking (the workbook's `*-Asset` sheets) | orchestrator | open | Candidate for a phase-2 requirement after REQ-0001 closes |
| PL-0003 | IMPL-0001 AT-1.9 (PLAN-0001) | TC-0001 #26 ("no outbound network calls") is a Manual-level case describing runtime monitoring of the running app; AT-1.9 only delivered a static ESLint guard (recorded as `manual (static guard only)`). A one-time manual check (run the built app with a network monitor/proxy, confirm zero outbound traffic) is still needed before the first `/dev-release`. | orchestrator | open | Run before REQ-0001's first `/dev-release` pre-flight |
