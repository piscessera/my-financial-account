# AT-3.5 — Deductions screen

- **Plan:** PLAN-0001 · **Phase:** P3 · **Commit:** `1c4e996`
- **TC results:** none linked. Done-criterion is manual (see below).

## What was done

- `Deductions.tsx` — one flat category list (see Deviations below), each row showing its cap
  description, a `count` input for `per_count` categories, a "กลุ่ม: raw/cap" line for
  `shared_group_member` categories, and over-cap styling (red border/background) when
  `cappedByOwnCap` is true. Reuses `calc/deductions.ts`'s `computeDeductions()` directly for all
  of this — the UI layer does no cap arithmetic of its own.
- Extracted `useWorkingTaxYear` (Entry.tsx's year-resolution hook) into
  `src/renderer/lib/useWorkingTaxYear.ts`, now shared by both screens — this is the second
  caller, which is what justified pulling it out rather than leaving it duplicated.
- Added `deductions:listEntries` to the IPC layer (`src/main/ipc/index.ts` +
  `electron/preload.ts`) — needed so the screen can show a year's already-saved entries;
  `deductions.listEntries()` already existed at the repository layer since AT-3.1, just wasn't
  wired to IPC yet.
- `App.tsx` — minimal local-state screen switching (`entry` | `deductions`) so this screen is
  reachable; still not a real router.

## Verification

Same sandbox limitation as AT-2.6/2.7/3.4 (no Electron display server): built the renderer,
loaded it against a stubbed `window.api` seeded with PROTO-0001's own example figures (personal
allowance, 2 children, a life+health shared group with one sub-capped member, a donation).
Confirmed via `get_page_text`: per-category cap descriptions render correctly for all three
shapes, the shared-group running total shows "43,262.00 / 100,000.00" (the *capped* sum —
18,262 + the health category's own 25,000-sub-cap-limited amount, not its raw 30,996 entry —
proving the UI reads `computeDeductions()`'s output rather than raw entered amounts), and the
over-capped health-insurance row shows "เกินเพดาน" with the red-accented input, matching
PROTO-0001's `deductions.html` over-cap example panel.

145/145 → 183/183 Vitest tests unaffected (renderer isn't in the Vitest glob); lint,
`tsc --noEmit`, `vite build` all clean.

## Deviations from design

- **No semantic grouping** ("ส่วนบุคคลและครอบครัว", "ประกันและการออมเพื่อเกษียณ", …): the mockup
  groups categories under headings that have no field anywhere in the schema
  (`deduction_categories` has `sort_order` only, no group-label column). Rather than invent
  grouping metadata the design never specified, this renders one flat list ordered the same way
  `listCategories()` already orders rows. If category grouping becomes a real requirement, it
  needs a schema change (a new column or a lookup table) — a GAP/REQ decision, not a UI-layer
  improvisation.
- The mockup shows some categories as statutory "auto-applied" (personal allowance always
  60,000, no input) or with law-derived caps (donation = 10% of post-deduction income). Neither
  concept exists in the schema (`cap_type` is only fixed/per_count/shared_group_member, and caps
  are plain stored amounts, not formulas) — every category in this screen is a normal editable
  row, matching what AT-3.1/AT-3.2 actually built.

## Notes for follow-up tasks

- AT-3.6 (Settings screen) is where categories actually get created/archived — Deductions only
  lists active ones (AC-17) and edits entries, never categories themselves.
- If category grouping is wanted later, it's a schema/design decision (new REQ or GAP), not
  something to retrofit into this component's props.
