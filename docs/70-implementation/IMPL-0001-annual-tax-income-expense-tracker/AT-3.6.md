# AT-3.6 — Settings screen

- **Plan:** PLAN-0001 · **Phase:** P3 · **Commit:** `559c90f`
- **TC results:** TC-0001 #42 pass (verified manually, see below).

## What was done

- `Settings.tsx` — data-location panel (`window.api.dataLocation.get()`'s folder path,
  DB file path, last-modified, size — read-only, no sync control anywhere, TC-0001 #42),
  category table (`settings.getCaps()`, every category including archived) with edit/archive/
  reactivate actions, an "+ add category" panel (name, cap-shape chip picker, cap amount, and
  for `shared_group_member` an existing-group dropdown), and the tax-bracket table with
  per-row rate editing.
- Wired into `App.tsx`'s local-state screen switcher alongside Entry/Deductions.

## Verification

Same sandbox limitation as AT-2.6/2.7/3.5 (no Electron display server): built the renderer,
loaded it against a stubbed `window.api` seeded with PROTO-0001's own example rows (personal
allowance, per-count children, a shared-group sub-cap, an archived "ช้อปดีมีคืน" category, three
tax brackets). Confirmed via `get_page_text`: the data-location panel shows folder path +
last-modified + size with no sync affordance anywhere in the rendered output; the category
table shows all four rows with correct cap-type labels and the archived row's "เปิดใช้อีกครั้ง"
(reactivate) action instead of "แก้ไข"/"เก็บถาวร"; clicking "+ เพิ่มหมวดหมู่ใหม่" opens the
add-category form with the cap-shape chip row, matching PROTO-0001's `settings.html` states.

183/183 Vitest tests unaffected (renderer isn't in the Vitest glob); lint, `tsc --noEmit`,
`vite build` all clean.

## Deviations from design

- **No "create a new shared-cap group" affordance.** PROTO-0001's "+ add category" example
  (Easy e-Receipt 2569) is a `fixed` category, not `shared_group_member`, so it doesn't actually
  exercise this gap — but a `shared_group_member` category can only be *attached* to an
  **existing** `shared_caps` row here (a dropdown), never create a new group. ANA-0001's
  `settings` API list has `updateSharedCap` but no `createSharedCap`, so this isn't a shortcut —
  it's the literal designed surface. If creating new shared-cap groups from the UI becomes a
  real requirement, that needs a `createSharedCap` repository/IPC addition first (a GAP/REQ
  decision), not an improvisation at the screen layer.
- Bracket editing here only changes `rate_bp` (percent), not the lower/upper bounds — the
  `updateBracket` repository function (AT-3.1) supports bounds too, but PROTO-0001's own bracket
  table only shows a rate column with a single "แก้ไข" action, so bounds-editing wasn't built as
  part of matching that screen; `updateBracket`'s `bounds` parameter is available for a later
  task if bound-editing turns out to be needed.
- "เปลี่ยนโฟลเดอร์..." (change folder) from the mockup was **not** made interactive: PROTO-0001's
  own link just points at `onboarding.html`, and there is no existing "re-run onboarding
  mid-session" flow in this app to hook it to (PL-0007 already flags that `createInFolder` has
  no first-run-only guard, i.e. building this affordance safely needs that gap addressed first).
  This screen shows the current location read-only, matching TC-0001 #42's actual requirement
  (display, not change).

## Notes for follow-up tasks

- If "change data folder" becomes a real requirement, resolve PL-0007 first (validate/guard
  `dataLocation:createInFolder`), then wire a button here that calls `chooseFolder()` +
  `createInFolder()` + a full app reload (the existing `App.tsx` bootstrap already re-reads
  `dataLocation.get()` on mount, so a reload is sufficient — no new bootstrap logic needed).
