---
name: dev-requirement
description: Receive and structure a new requirement — interview the user, write a REQ document with scope and acceptance criteria, propose the size (S/M/L), and stop at the scope gate. Use when the user describes a new feature or capability to build (not bugs — those go to dev-investigate).
---

# dev-requirement — intake

**Input:** a user-stated need (chat) + allocated `REQ-NNNN` id. **Output:** `REQ-NNNN` (gate pending).

> This skill is **interactive** (interview + gate). Run it in the main session, or dispatch
> `requirement-intake` only to draft: the agent returns its clarifying questions and the draft;
> the orchestrator relays questions to the user.

## Steps

1. Load `dev-standard`. Check `docs/INDEX.md` for related docs (existing REQs/GAPs/ANAs in the
   same area — link them, don't duplicate).
2. **Interview** the user. One batch, max ~5 questions: problem & who benefits · expected
   usage/trigger · must-have vs nice-to-have · explicitly out of scope · constraints.
   Do not invent requirements — ask.
3. Write `docs/10-requirements/REQ-NNNN-slug.md` from `.agents/templates/REQ.md`:
   problem, users & triggers, in scope, **out of scope** (parked ideas noted), acceptance
   criteria (`AC-1…AC-n`, testable statements), constraints, size proposal with reasoning.
4. **GATE** — "REQ-NNNN ready, proposed size M. approve / change: … / hold".
5. Close: files, summary, id, log line (dev-standard §7).

## Size S shortcut

Obvious small change: draft the REQ in one pass with the user, propose merging analyze into the
same session (S-path). The user decides at the gate.

## Notes

- A defect report is NOT a requirement — route to `dev-investigate`.
- If the user brings an approved GAP, create the REQ referencing it (`links: [GAP-…]`) and reuse
  the GAP's scope/effort — do not re-investigate.
