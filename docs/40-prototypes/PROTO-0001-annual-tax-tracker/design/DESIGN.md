# PROTO-0001: Annual tax income/expense tracker — UX/UI guideline

Linked: ANA-0001 · REQ-0001

This file is the shared visual language for every screen built in this prototype (Dashboard,
income/expense entry, deductions, settings, year summary). It exists so screens stay visually
consistent instead of each one inventing its own colors/spacing. Pick one style direction below
(or ask for a mix); once chosen, it becomes the baseline for the actual clickable mockups.

## Structural guideline (applies regardless of style direction)

- **Type scale:** 12 / 12.5 / 14 / 16 / 19 / 24 / 30px. Headings use the display face; body and
  form fields use the body face; every column of numbers uses the mono face with
  `font-variant-numeric: tabular-nums`.
- **Spacing scale:** 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48px — layouts use flex/grid `gap`, not
  per-element margins.
- **Components used across screens:**
  - **Stat tile** — label (12px, muted) over a value (19–24px, mono). Used on the Dashboard and
    year summary.
  - **Ledger table** — right-aligned Thai numeral columns (tabular-nums), a status pill per row
    (`active` / `voided` / `reversal`) using semantic color, never the accent hue.
  - **Cap/headroom row** — name + statutory cap caption + input, used identically on the
    Deductions screen and (read-only) in Settings.
  - **Confirmation strip** — used for "close tax year" and "reopen year": states plainly what
    will happen before the irreversible-feeling action.
- **Semantic color is separate from the accent color:** "additional tax due" and "refund owed"
  always use the same bad/good colors regardless of which direction below is picked.

## Style direction A — "Ledger Jade" (continues the earlier rough mockup)

Calm, trustworthy, ledger-like. This is the direction already sketched informally during
requirement discovery (`tax_mockup.html`), refined here into a named system.

| Token | Light | Dark |
|---|---|---|
| Background | `#f2f4f2` | `#121815` |
| Surface | `#ffffff` | `#1a2320` |
| Ink (text) | `#17231e` | `#e9efec` |
| Ink, muted | `#56635b` | `#a2b0a9` |
| Accent (jade) | `#0f6b5c` | `#3ba98d` |
| Gold (bracket highlight) | `#a9772f` | `#d9a856` |
| Good (refund) | `#1f7a4d` | `#5fc78d` |
| Bad (due) | `#b23b3b` | `#e0796f` |

**Type:** Kanit (headings — geometric, Thai-native, confident) · IBM Plex Sans Thai (body) ·
IBM Plex Mono (all numbers).
**Feel:** a well-kept paper ledger digitized — quiet, few flourishes, numbers do the talking.

## Style direction B — "Slate & Amber" (modern fintech)

Cooler, more "app-like" — closer to a banking/fintech product than a ledger book.

| Token | Light | Dark |
|---|---|---|
| Background | `#eef0f4` | `#11141b` |
| Surface | `#ffffff` | `#191d26` |
| Ink (text) | `#1b1f27` | `#e6e8ee` |
| Ink, muted | `#5b6270` | `#9ba2b0` |
| Accent (indigo) | `#3450c9` | `#7c92ff` |
| Amber (bracket highlight) | `#c97f1f` | `#e2a24b` |
| Good (refund) | `#28935f` | `#5fce93` |
| Bad (due) | `#c8402f` | `#f0796a` |

**Type:** Sarabun (body — the face most Thai official/government documents already use, so
numbers and forms feel familiar) · Chakra Petch (headings — squared-off, technical) · JetBrains
Mono (numbers).
**Feel:** brisk, structured, closer to a banking app than a personal notebook.

## Style direction C — "Warm Merit" (ledger-book warmth)

Warmer and more personal — leans into "sanuk"-adjacent Thai bookkeeping (สมุดบัญชี) rather than
a cold dashboard, while keeping all figures perfectly legible.

| Token | Light | Dark |
|---|---|---|
| Background | `#f5efe4` | `#1c1712` |
| Surface | `#fffdf9` | `#26201a` |
| Ink (text) | `#2b2118` | `#efe6d9` |
| Ink, muted | `#7a6c58` | `#b3a48d` |
| Accent (mustard-gold) | `#b8862b` | `#e0ab52` |
| Deep teal (secondary/bracket) | `#2d6e6a` | `#5fada7` |
| Good (refund) | `#3f7d5c` | `#72c79a` |
| Bad (due) | `#8c3a3a` | `#e07b6f` |

**Type:** Taviraj (headings — a Thai-aware serif, gives the ledger a handwritten-record
feeling) · Sarabun (body) · JetBrains Mono (numbers).
**Feel:** approachable, a bit like a well-kept personal account book rather than corporate
software — best if the app should feel personal rather than institutional.

## Recommendation

**Direction A (Ledger Jade)** — it already exists as a working mockup you've seen and reacted
to positively-enough to iterate on, it reads clearly in both themes, and jade/green has a
natural association with money without being a cliché (unlike the red/gold "prosperity" palette
many finance apps default to). Recommend keeping it unless one of B/C's *feel* matches what you
want better than "calm ledger."

## Decision
**Direction: B — Slate & Amber.** No per-token overrides. Applied as-is to all prototype
screens in `../` (Sarabun body, Chakra Petch headings, JetBrains Mono numbers; indigo accent,
amber bracket-highlight, semantic good/bad kept separate from the accent hue).
