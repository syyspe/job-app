---
slug: sort-direction-control
date: 2026-09-08
---

# An unambiguous sort direction control

## Problem

`ApplicationSort` renders the sort direction as a single button whose label is
the current state — `Ascending` or `Descending`. A button's label conventionally
names what clicking it does, so the control reads two ways at once: "click to
sort descending" or "you are sorted descending, click to flip". Nothing on
screen settles it, and the two readings imply opposite outcomes.

Flipping the label to the action it performs (`Sort ascending` while descending)
does not fix this — it is the same ambiguity in reverse, and it costs the user
the ability to see which direction is currently in effect at all. The fix has to
show state and action as separate, visible things.

Worth doing now because the sort bar was just styled (`c7d8961`) and is the
only place in the app where a control's label carries state, so the fix stays
contained to one component and its test.

## What done looks like

1. The sort bar shows which direction is currently in effect without the user
   having to click anything or reason about it.
2. The way to change direction is visibly distinct from the way current
   direction is displayed — no control whose label is its own state.
3. Choosing a direction calls `onChange` with that direction. Choosing the
   direction already in effect is a no-op or a harmless repeat, not a flip.
4. Keyboard reachable, and the whole control is announced as a labelled group
   by a screen reader.
5. `ApplicationSort.test.tsx` queries the control by accessible role and name
   (per the repo convention) and covers: current direction is reported as
   selected, and picking the other one calls `onChange` with it.
6. `npm test`, `npm run lint`, and `npm run test:e2e` pass.

## Approach

Replace the toggle button with a two-option radio group — `Ascending` and
`Descending` — inside a `<fieldset>` with a `<legend>` naming it, so the
grouping and its label come from native semantics rather than ARIA attributes.
A radio group is the one shape where state and action are the same widget
without being the same words: the selected option *is* the current direction,
and the unselected one *is* the action, and both are visible at once.

The component stays presentational and stateless — `sort` in, `onChange` out,
exactly as now. Only the markup for direction changes; the `Sort by` select and
`ApplicationsView`'s wiring are untouched.

Styling follows the sort bar's existing rules in `src/App.css`; a segmented
appearance (the two options butted together, the selected one filled) is
cosmetic and can drop to plain radios if it fights the existing `.button`
styles.

Rejected: keeping one button and adding an arrow glyph (`↓`/`↑`). An arrow has
the same state-versus-action ambiguity as the word, plus it is the one bit of
the control a screen reader user gets least from.

Rejected: keeping one button and disambiguating in `aria-label` or `title`
only. That fixes the control for assistive tech and leaves the sighted user
with the ambiguity that prompted this.

## Out of scope

- The `Sort by` select and the set of sortable fields.
- The sorting logic in `src/lib/sorting.ts` — the deadline-empties-last rule
  and the comparators stay exactly as they are.
- Persisting sort choice across reloads.
- Per-column sort controls on the list itself.

## Open questions

- Does the segmented styling earn its CSS, or are two plain radios with the
  existing label spacing enough? The plan should decide rather than leaving it
  to taste at build time.
- Legend wording: `Direction`, `Order`, or `Sort direction`. Whichever reads
  best next to the existing `Sort by` label.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/sort-direction-control.plan.md` before
writing any code.
