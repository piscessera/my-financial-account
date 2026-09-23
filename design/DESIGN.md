# My Financial Account — UX/UI Design System Specification

**Status:** Canonical Reference  
**Visual Direction:** Direction B — "Slate & Amber" (Modern Fintech)  
**Primary Stack:** Electron + React (Vite) + Vanilla CSS (`src/renderer/styles.css`)  
**Typography:** Sarabun (Body/UI) · Chakra Petch (Headings/Brand) · JetBrains Mono (Numbers/Tabular)  
**Target Platform:** Windows Desktop Application (1040px max content width)  

---

## 1. Overview & Design Philosophy

**My Financial Account** is a personal finance and annual Thai personal income tax tracker (ภ.ง.ด. 91). The UX/UI balances the reliability of a ledger with the speed and clarity of a modern fintech tool.

### Core Design Principles
1. **Numbers Do the Talking:** Financial figures must be crisp, mono-spaced (`tabular-nums`), right-aligned in tables, and immediately scan-able.
2. **Semantic Clarity over Decoration:** Functional states (due vs. refund, open vs. closed year, active vs. voided) strictly use semantic colors (`--good`, `--bad`, `--amber`). Semantic colors are never overridden by brand accent hues.
3. **Auditability & Safe Interaction:** Irreversible operations (closing a tax year, database folder changes, voiding entries) require plain-language confirmation. Closed years switch the UI to an unambiguous read-only state with reversal entry workflows.
4. **Thai-First Typography & Localization:** Official Thai tax terminology (เช่น เงินได้พึงประเมิน, ภาษีหัก ณ ที่จ่าย, สิทธิลดหย่อน) and Thai month abbreviations (`ม.ค.`–`ธ.ค.`) are first-class citizens. Text line-heights prevent clipping of Thai tone marks and diacritics.

---

## 2. Color System & Design Tokens

The application uses CSS Custom Properties declared in `:root` with automatic and manual dark mode support via `[data-theme='dark']` and `@media (prefers-color-scheme: dark)`.

### Token Palette

| Token | Light Mode | Dark Mode | Semantic Role / Usage |
|---|---|---|---|
| `--bg` | `#eef0f4` | `#11141b` | Main application background behind cards |
| `--surface` | `#ffffff` | `#191d26` | Card panels, modals, form input backgrounds |
| `--surface-2` | `#e4e8f0` | `#20242f` | Secondary controls, inactive chips, table group rows, sub-nav bars |
| `--line` | `#d7dbe4` | `#2b303c` | Borders, dividers, subtle separators |
| `--ink` | `#1b1f27` | `#e6e8ee` | Primary text, titles, prominent numeric values |
| `--ink-soft` | `#5b6270` | `#9ba2b0` | Secondary labels, captions, metadata, table headers |
| `--accent` | `#3450c9` | `#7c92ff` | Brand indigo; active navigation, primary action buttons, focus rings |
| `--accent-ink`| `#ffffff` | `#0c1020` | High-contrast text on top of `--accent` |
| `--accent-soft`| `#e3e8fb` | `#232a44` | Active nav link background, focus glow, selected item background |
| `--amber` | `#c97f1f` | `#e2a24b` | Tax bracket highlights, reversal transaction pills, warnings |
| `--amber-soft`| `#f7e8d2` | `#3a2c16` | Amber badge background, cautionary banner background |
| `--good` | `#28935f` | `#5fce93` | Tax refund claimable, active status pills, positive balance, open year dot |
| `--good-soft` | `#e2f5ea` | `#193225` | Soft green background for refund tiles and active status |
| `--bad` | `#c8402f` | `#f0796a` | Tax payable due, negative balance, validation error borders, destructive buttons |
| `--bad-soft` | `#fbe6e2` | `#3a1f1c` | Soft red background for tax payable tiles and input error states |
| `--shadow` | `0 1px 2px rgba(20,24,33,0.06), 0 8px 24px -14px rgba(20,24,33,0.25)` | `0 1px 2px rgba(0,0,0,0.35), 0 8px 24px -14px rgba(0,0,0,0.6)` | Subtle elevation for panels, tiles, and modal dialogs |

---

## 3. Typography System

The application imports Google Fonts:
- **Headings & Brand:** `Chakra Petch` (weights 600, 700)
- **Body & Controls:** `Sarabun` (weights 400, 500, 600)
- **Numeric & Code:** `JetBrains Mono` (weights 500, 600)

```css
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=Sarabun:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');
```

### Type Scale & Application

| Size | Weight | Font Family | Usage |
|---|---|---|---|
| **24px** | 700 | Chakra Petch | Page headers (`.page-head h1`) |
| **20px** | 600 | JetBrains Mono / Chakra Petch | Stat tile values (`.tile .v`), modal titles |
| **16px** | 700 | Chakra Petch | App brand title (`.app-nav .brand`), section headings |
| **14px** | 400 / 500 | Sarabun | Form inputs, select dropdowns, primary table body cells |
| **13.5px** | 500 / 600 | Sarabun | Navigation links, buttons (`.btn`), general UI text |
| **13px** | 400 / 500 | Sarabun | Filter chips, history log text, dropzone instructions |
| **12.5px** | 500 / 600 | Sarabun | Form field labels, table headers (`thead th`), month header rows |
| **12px** | 500 / 600 | JetBrains Mono / Sarabun | Stat tile labels (`.tile .k`), error messages, action links |
| **11–11.5px**| 600 | JetBrains Mono / Sarabun | Status pills (`.pill`), category tags (`.tag`), audit timestamps |

### Rules for Number Formatting
- Every number, monetary amount, percentage, date, tax calculation row, and ID must have class `.num` (or use `JetBrains Mono` with `font-variant-numeric: tabular-nums`).
- Currency amounts in THB must format to two decimal places (e.g., `120,000.00`).
- Negative values format with a minus sign (e.g., `-1,500.00`) and use `--bad` or `--ink-soft` depending on context.

---

## 4. Spacing, Elevation & Layout Grid

### Spacing Scale
Layouts use flex/grid `gap` rather than uncoordinated element margins:
`4px` · `6px` · `8px` · `10px` · `12px` · `14px` · `16px` · `20px` · `24px` · `28px` · `32px` · `48px`

### Border Radii
- **Pills, Chips, Status Dots:** `999px` (fully rounded)
- **Panels & Cards:** `14px`
- **Stat Tiles:** `12px`
- **Buttons, Form Inputs, Controls:** `8px`–`9px`

### Layout Structure
- **App Shell Navigation (`.app-nav`):** Sticky top bar (`padding: 14px 28px`), flex alignment containing Brand, Navigation Links, and Year Switcher Pill.
- **Page Container (`.page`):** Centered layout `max-width: 1040px; margin: 0 auto; padding: 32px 24px 96px;`.
- **Panels (`.panel`):** Background `--surface`, border `1px solid var(--line)`, radius `14px`, box shadow `--shadow`, padding `22px`. Subsequent panels stack with `margin-top: 20px`.
- **Stat Tiles Grid (`.tiles`):** 4 columns (`grid-template-columns: repeat(4, 1fr); gap: 14px;`). Collapses to 2 columns under `760px`.
- **Form Grid (`.form-grid`):** 2 columns (`grid-template-columns: 1fr 1fr; gap: 16px 20px;`). Span-2 fields use `grid-column: 1 / -1`. Collapses to 1 column under `640px`.

---

## 5. Component Library & Visual Patterns

### 5.1 App Shell & Navigation
- **Navigation Links (`.app-nav .links a`):** `color: var(--ink-soft); font-weight: 500; padding: 8px 12px; border-radius: 8px;`.
  - Active state: `.active` (`background: var(--accent-soft); color: var(--accent); font-weight: 600;`).
- **Year Switcher Pill (`.year-pill`):** Compact rounded pill (`background: var(--surface-2); border-radius: 999px;`). Contains:
  - Year selector dropdown.
  - Status indicator dot (`.status-dot.open` = green `--good`, `.status-dot.closed` = muted `--ink-soft`).

### 5.2 Stat Tiles (`.tile`)
Used on Dashboard and Summary for key financial metrics:
- Default: `background: var(--surface); border: 1px solid var(--line);`
- Accent variant (`.tile.accent`): `background: var(--accent-soft); color: var(--accent);`
- Good/Refund variant (`.tile.good`): `background: var(--good-soft); color: var(--good);`
- Bad/Payable variant (`.tile.bad`): `background: var(--bad-soft); color: var(--bad);`

### 5.3 Buttons (`.btn`)
- **Primary (`.btn-primary`):** `background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 3px rgba(52,80,201,0.3);`
  - Hover: `transform: translateY(-1px); box-shadow: 0 3px 8px rgba(52,80,201,0.4);`
- **Ghost / Secondary (`.btn-ghost`):** `background: var(--surface-2); color: var(--ink); border: 1px solid var(--line);`
- **Danger Outline (`.btn-danger-outline`):** `background: transparent; border: 1px solid var(--bad); color: var(--bad);`
- **Disabled State (`:disabled, .disabled`):** `opacity: 0.45; cursor: not-allowed; transform: none !important;`

### 5.4 Form Controls & Fields (`.field`)
- Label: `font-size: 12.5px; color: var(--ink-soft); font-weight: 500;`
- Input / Select: `border: 1px solid var(--line); border-radius: 8px; background: var(--surface); padding: 9px 12px; font-size: 14px;`
- Focus State: `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); outline: none;`
- Error State (`.err`): `border-color: var(--bad); background: var(--bad-soft);`
- Error Message (`.error-msg`): `font-size: 12px; color: var(--bad);`

### 5.5 Chips & Selectors (`.chip`, `.chip-row`)
- Chip row: `display: flex; flex-wrap: wrap; gap: 8px;`
- Inactive chip: `background: var(--surface-2); border: 1px solid var(--line); color: var(--ink-soft); border-radius: 999px;`
- Active chip: `background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600;`

### 5.6 Ledger Tables (`table`, `.month-ledger`)
- **Structure:** Headers (`thead th`) use `font-size: 12.5px; color: var(--ink-soft); border-bottom: 1.5px solid var(--line);`.
- **Row alignment:** Text left-aligned, monetary columns right-aligned with `.num`, status/dates centered.
- **Month separator rows (`tr.month-row td`):** `background: var(--surface-2); font-weight: 700; color: var(--ink-soft);` with month summary right-aligned.
- **Status Pills (`.pill`):**
  - `.pill.active`: `background: var(--good-soft); color: var(--good);` (Active transaction)
  - `.pill.voided`: `background: var(--surface-2); color: var(--ink-soft); text-decoration: line-through;` (Voided transaction)
  - `.pill.reversal`: `background: var(--amber-soft); color: var(--amber);` (Compensating reversal entry)
- **Inline Row Actions (`.row-action`):** Borderless action buttons (`color: var(--accent);` or `.muted`).

### 5.7 Deduction Headroom Rows & Caps
- Display statutory deduction cap caption next to entered value.
- Compare entered deduction against cap limit.
- Exceeded cap warning indicated in real-time.

### 5.8 Charts & Data Visualizations
- **Monthly Trend Chart (`MonthlyTrendChart`):** SVG bar/line chart displaying monthly income vs expense. Hover tooltips with formatted currency.
- **Category Donut Chart (`CategoryDonutChart`):** SVG donut visualization of expense categories and deduction items with colored legends and percentage breakdowns.

### 5.9 Warning Banners & Lock State (`LockWarningBanner`)
- Displayed prominently when a tax year is locked/filed.
- Background: `--amber-soft` or `--bad-soft` with contrasting border.
- Informs the user that entries are immutable and corrections require reversal entries.

### 5.10 Modals & Dialogs
- Overlay backdrop with subtle blur/darkening.
- Centered dialog container with `--surface` background, radius `14px`, box shadow `--shadow`.
- Header with title and close button, body area, actions footer right-aligned with primary/ghost buttons.

---

## 6. Thai Localization & Domain Terminology

Standard terms used across screens:
- **Income / รายได้:** ค่าจ้าง, เงินเดือน, โบนัส, ฟรีแลนซ์, ปันผล, ดอกเบี้ย
- **Expenses / ค่าใช้จ่าย:** ค่าใช้จ่ายทั่วไป, ประกันสังคม, กองทุนลดหย่อน
- **Thai Tax Summary (ภ.ง.ด. 91):**
  - `เงินได้พึงประเมิน` (Total Assessable Income)
  - `หักค่าใช้จ่ายตามกฎหมาย` (Statutory Expense Deduction: 50% max 100,000 THB)
  - `หักค่าลดหย่อน` (Total Allowances & Deductions)
  - `เงินได้สุทธิ` (Net Taxable Income)
  - `ภาษีที่คำนวณได้` (Calculated Income Tax)
  - `ภาษีหัก ณ ที่จ่าย` (Withholding Tax / WHT)
  - `ภาษีที่ต้องชำระเพิ่ม` (Additional Tax Payable)
  - `ภาษีที่ชำระไว้เกิน (ขอคืนได้)` (Tax Refund Claimable)
- **Thai Month Abbreviations:** `ม.ค.`, `ก.พ.`, `มี.ค.`, `เม.ย.`, `พ.ค.`, `มิ.ย.`, `ก.ค.`, `ส.ค.`, `ก.ย.`, `ต.ค.`, `พ.ย.`, `ธ.ค.`

---

## 7. Responsive & Desktop Standards

- **Target Viewport:** Desktop application window (optimal at 1280×800, min-width 800px).
- **Breakpoint 760px:** Stat tiles grid collapses from 4 to 2 columns.
- **Breakpoint 640px:** Form grids collapse from 2 columns to 1 column.
- **Dark Mode Support:** Responsive to OS dark mode preference and manual override via settings (`light` / `dark` / `system`).

---

## 8. Role & Skill Adherence Rules

Every sub-agent and skill interacting with the UI must respect this design system:
1. **`ux-prototyper`:** Prototype mockups (`docs/40-prototypes/`) must use the exact tokens, typography pairings, and layout classes specified in `DESIGN.md`.
2. **`solution-analyst`:** ANA specifications must reference `DESIGN.md` component patterns for new screens and UI changes.
3. **`implementer`:** UI components in `src/renderer/` must use classes and variables from `src/renderer/styles.css` matching `DESIGN.md`. No inline magic color hexes or ad-hoc margins.
4. **`qa-reviewer`:** UI reviews must verify typography, semantic color separation, tabular numbers, and responsive behavior against `DESIGN.md`.
