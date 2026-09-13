---
name: dev-prototype
description: Create and iterate a pre-coding UX/UI prototype — static HTML/CSS mockups the user opens in a browser, feedback rounds with a changelog, and on acceptance the UX decisions are written back into the ANA and new UI test cases added to the TC. Use when a UI-visible feature needs visual review before planning.
---

# dev-prototype — UX/UI mockup loop

**Input:** `ANA-NNNN` (approved or drafted) + allocated `PROTO-NNNN` id.
**Output:** accepted `PROTO-NNNN` + write-back into ANA/TC.

> Feedback rounds are **interactive**. Dispatch `ux-prototyper` per round (build / apply
> feedback); the orchestrator collects the user's feedback between rounds.

## Steps

1. Load `dev-standard`. Create `docs/40-prototypes/PROTO-NNNN-slug/`:
   `index.html` (links all screens) · one static HTML/CSS file per screen (vanilla, no build
   step, opens from the filesystem) · `CHANGELOG.md` from the template.
2. Build screens for the ANA §UI changes: realistic sample data, all states the design implies
   (empty, loading, error), happy path clickable end-to-end. Layout, hierarchy, wording, flows —
   not pixel design.
3. **Feedback round loop:** tell the user which files to open → collect feedback → apply →
   append a CHANGELOG row (round, date, feedback, change, `waiting re-review`) → repeat until
   `accepted` or `rejected` (+reason; rejected goes back to `dev-analyze`).
4. **Write-back on acceptance (mandatory):** append "§ UX decisions (from PROTO-NNNN)" to the
   linked ANA; add `source: prototype` UI-acceptance cases to the linked TC; note it in the
   CHANGELOG. Nothing else in those docs may change.
5. Close: files, round history, ids, log line (dev-standard §7).

## Rules

- The accepted prototype is the **UI reference** for `dev-implement` and `dev-review` — don't
  promise in the mockup what the design can't deliver.
- May start before full design approval if the user wants to see screens early — flag it.
