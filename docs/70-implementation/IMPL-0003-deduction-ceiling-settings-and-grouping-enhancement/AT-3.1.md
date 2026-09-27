---
id: IMPL-0003-AT-3.1
type: implementation-task
task: AT-3.1
plan: PLAN-0008
status: complete
created: 2026-09-27
updated: 2026-09-27
links: [PLAN-0008, TC-0011]
---

# AT-3.1: Settings UI for Shared Cap Groups and Category Customization

## What changed
- Enhanced `src/renderer/pages/Settings.tsx` under the Deduction Caps section:
  1. Added Shared Cap Groups management table displaying group name, total cap amount, and member categories summary with Edit/Delete buttons.
  2. Added inline panel for creating new shared cap groups (`+ เพิ่มกลุ่มเพดานร่วมใหม่`) and editing existing shared cap groups with baht/satang parsing.
  3. Upgraded Deduction Categories table edit modal/panel to support modifying `name`, `description`, `capType` (fixed, per_count, shared_group_member), and `sharedGroupId` dropdown selector.
  4. Preserved accounting invariants and closed tax year restrictions (INV-7).

## Verification
- Unit & renderer tests passing via Vitest (30 files, 305 tests).
- TypeScript and Vite build passed without errors.
- ESLint passed cleanly.
