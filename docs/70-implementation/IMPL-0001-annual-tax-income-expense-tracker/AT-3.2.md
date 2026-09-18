# AT-3.2 — deduction cap-shape calculator

- **Plan:** PLAN-0001 · **Phase:** P3 · **Commit:** `a723b08`
- **TC results:** TC-0001 #6, #7, #8, #9, #10 pass (`src/main/calc/__tests__/deductions.test.ts`,
  6 cases).

## What was done

- `src/main/calc/deductions.ts` — `computeDeductions(categories, entries, sharedCaps)`, a pure
  function (no DB access), same calc-module convention as `calc/money.ts`. Applies all three
  `cap_type` shapes (INV-6): `fixed` (own ceiling), `per_count` (per-unit cap × `count`),
  `shared_group_member` (own optional sub-cap, then the group's sum capped at
  `shared_caps.capAmountMinor`).
- **Key design decision** (not specified beyond "caps their combined contribution" in TC-0001
  #9): a shared-group member's own `effectiveMinor` in the result always reflects only its own
  sub-cap — never a proportional reduction for group overflow. The group cap instead only
  reduces `totalMinor` (the grand total fed to `calc.computeYear()`, AT-4.2). This lets the
  Deductions screen (AT-3.5) show "this member: entered/sub-cap" and "group: raw-sum/group-cap"
  as two independently correct numbers, per its "shared-group running total" done-criterion.
- 170 tests pass (164 prior + 6 new); lint + `tsc --noEmit` clean.

## Deviations from design

None from ANA-0001/TC-0001. The per-member-vs-group-total split above is an implementation
decision filling a gap the design left open (TC-0001 #9 only specifies the grand total's
behavior, not per-member display), documented in the module's own doc comment for AT-3.5 to
read.

## Notes for follow-up tasks

- API for AT-4.2 (`calc.computeYear()`): `computeDeductions(...).totalMinor` is the one number
  it needs; `perCategory`/`sharedGroups` are display-only, for AT-3.5's Deductions screen.
- AT-3.5 should render `sharedGroups[].rawTotalMinor` / `.cappedTotalMinor` for the "shared-group
  running total" bar, and each `perCategory[].cappedByOwnCap` for the per-entry "capped"
  indicator (TC-0001 #7).
