# Parking lot

The single ledger for everything deferred: review **notes** and **ideas** (from REV files),
parked GAPs, out-of-scope items from REQs. Nothing is "noted" anywhere else.
Rule: an `open` row always has an owner (a plan id, a GAP id, or a person) — `validate-docs`
fails otherwise. Audit mode checks that every REV note/idea landed here and that closed rows
say where they went.

| PL-id | Source | Item | Owner | Status | Target / resolution |
|-------|--------|------|-------|--------|---------------------|
| PL-0001 | REQ-0001 out-of-scope | Personal budget/spending allocation tracking (Food, Shopping, Fund, Insurance categories from the existing workbook) | orchestrator | open | Candidate for a phase-2 requirement after REQ-0001 closes |
| PL-0002 | REQ-0001 out-of-scope | Net worth / asset / investment portfolio / insurance-policy tracking (the workbook's `*-Asset` sheets) | orchestrator | open | Candidate for a phase-2 requirement after REQ-0001 closes |
