---
slug: 032-collapsible-add-form
date: 2026-11-04
---

# Collapsible "Add an application" form

## Problem

Applications are now almost always created through Claude Desktop (the MCP
server, 018), so the manual "Add an application" form in
`src/components/ApplicationsView.tsx` hasn't been used for a long time. It's
still always fully rendered, and that takes up space it doesn't earn. On
mobile it's worst: the layout stacks, form first (007), so the whole form
sits above the list you actually came to read.

## What done looks like

1. The "Add an application" panel starts **collapsed on every page load**,
   on wide and narrow viewports alike. Only its heading and an open/close
   control show.
2. One click (or keypress) on that control opens the form, and the same
   control closes it again. The control is exposed accessibly (a role and
   name, plus its expanded state) so tests can query it with `getByRole`.
3. On a wide viewport the **two-column layout stays**. The collapsed form
   shrinks to its heading and toggle in the left column, and the list
   doesn't move.
4. On a narrow viewport the collapsed panel is a short bar above the list,
   so the list starts near the top of the screen.
5. After a successful add the form **stays open** and resets as it does
   today, so several applications can be added in a row.
6. Unit tests cover: collapsed by default, opening, closing, and staying
   open after an add. Existing e2e specs that fill in the add form open it
   first and still pass.

## Approach

The open/closed state is local component state, initially `false`. Nothing
is persisted, so every load starts collapsed. The plan decides the control:
native `<details>`/`<summary>` versus a button with `aria-expanded`. Either
works if it meets item 2. Styling reads tokens from `index.css`, and new
rules go in the CSS file that owns the panel.

Rejected: remembering the last open/closed state per browser. Starting
collapsed every time is what the user asked for, and it needs no storage.
Rejected: letting the list take the full width when the form is collapsed.
The user preferred to keep the two columns stable.

## Out of scope

- The edit form inside an expanded application row (`ApplicationDetail`).
- Persisting the open/closed state.
- Any change to the form's fields or behaviour beyond hiding and showing it.

## Open questions

- `<details>`/`<summary>` or a button with `aria-expanded`? This is a plan
  decision. Note that a collapsed `<details>` keeps its form fields in the DOM
  but hidden, which matters for tests and e2e.
- CLAUDE.md's "UI: not decided yet" line. This is a small reshape and not a
  visual direction, so the plan should say whether it touches that line
  (probably not).

---

**Next stage:** run `/sdlc`.
