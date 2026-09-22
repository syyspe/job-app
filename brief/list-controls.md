---
slug: list-controls
date: 2026-09-22
---

# Redesign the list controls: sorting, and where "Show archived" belongs

## Problem

`ApplicationSort` (`src/components/ApplicationSort.tsx`) packs three controls
into one bordered strip above the list, and the strip is doing three unrelated
jobs at once.

**It's a panel pretending to be chrome.** `.sort-bar` (`App.css:103`) takes
`--surface`, a `--line` border and `--r-sm` — the same treatment as `.panel`
and the same as an application row. Visually it claims equal weight with the
content it filters. It isn't content; it's the handle on the content.

**Three widget vocabularies in one line.** A `<select>`, a radio `fieldset`,
and a checkbox sit side by side at the same size, in the same muted colour,
separated only by a `--s-4` gap. Nothing in the layout says which control
changes the *order* and which changes *what's in the list*. Wrapping is
unmanaged (`flex-wrap: wrap` with no ordering intent), so at narrow widths the
three break apart arbitrarily.

**"Ascending"/"Descending" is system vocabulary, and it costs the most space
of anything in the bar.** Two radios plus a "Direction" legend — three text
labels — to express one binary. And the words don't answer the question the
user actually has: with `Sort by: Deadline`, "Ascending" means soonest first,
but you have to work that out. Nobody sorts a job tracker thinking in
ascending.

**"Show archived" is not a sort control.** It filters which applications
exist in the list; the other two decide the order of whatever's there. It's in
this bar because this bar is where the leftover controls went. It also renders
unconditionally, including when there is nothing archived to show — a control
that can only ever be a no-op.

Worth fixing now because archive just moved into the detail panel (#33), so
archiving is a deliberate act taken from inside an application. Where its
counterpart — seeing the archived ones again — lives is now a live question
rather than a detail nobody had reached.

## What done looks like

1. The controls above the list no longer read as a panel. The list rows are
   the heaviest thing on the surface; the controls sit quieter than them, and
   the bar carries no border or raised background of its own.
2. Sort direction is one control, not a legend plus two radios.
3. Direction is expressed in the user's terms, not `asc`/`desc` — and the
   wording reflects the field in effect, so choosing `Deadline` doesn't ask
   the user to translate "ascending" into "soonest first".
4. `Sort` in `src/lib/sorting.ts` keeps its `'asc' | 'desc'` values and
   `sortApplications` is unchanged. This is a display and layout change; the
   sort model underneath it stays.
5. "Show archived" is out of the sort bar, and sits where the archived
   applications themselves are affected.
6. When nothing is archived, no archived control renders at all.
7. The archived control says how many there are.
8. Turning archived rows on and off is still reachable by keyboard, with a
   visible focus ring, and still has an accessible name a test can query by
   role.
9. The empty state and the archived control agree: "Nothing tracked yet" never
   shows while there are archived applications that the filter is hiding.
10. Every colour, size and space comes from a token in `index.css`. Rules for
    the bar stay in `App.css`; anything that becomes part of the list surface
    goes in `applications.css` — not both.
11. The controls hold together from ~360px up to the full layout width, with
    a deliberate wrap or stack order rather than whatever `flex-wrap` does.
12. Updated: `ApplicationSort.test.tsx` (whole file — the direction radios and
    the checkbox are both gone), `ApplicationsView.test.tsx:151`, and
    `e2e/archive.spec.ts:20`, which all query the checkbox by name today.
13. `npm test`, `npm run lint` and `npm run test:e2e` all pass.

## Approach

- **Direction becomes one button whose label names what pressing it does** —
  "Sort oldest first", which after the press reads "Sort newest first". Per
  field: newest/oldest for the three date fields, soonest/latest for
  `deadline`, and earliest/latest stage for `status`. That's a label map
  keyed by field and direction, next to `FIELD_LABELS`. `FIELD_LABELS` itself
  is display formatting living in a component; `src/lib/` is where this repo
  keeps that (`dates.ts`, `status.ts`, `roles.ts`), so both maps likely move
  there.
- **Rejected: folding direction into the select** as ten directional options
  ("Newest first", "Oldest first", "Deadline soonest", …). It removes a
  control, but a ten-item dropdown to express a five-by-two grid is worse to
  scan than five plus a toggle, and it puts each field's two orderings far
  apart in the list.
- **Rejected: sortable column headers.** The list is a stack of cards, not a
  table. There are no columns to click.
- **"Show archived" moves to the foot of the list**, where the archived rows
  would appear — "Show 4 archived", toggling to "Hide archived". It reads as
  a continuation of the list rather than a filter you have to find first, it
  carries the count, and it can simply not exist when the count is zero. The
  count is already available: `ApplicationsView` holds the unfiltered
  `applications` array and does the filtering itself.
- **Alternative, if the foot is wrong:** keep it above the list but break it
  out of the sort bar as its own affordance — visually distinct and clearly
  about *what's listed* rather than *in what order*. This is the conservative
  version of the same separation.
- **The bar loses its box.** No border, no surface fill; it aligns with the
  rows below it so the eye reads one column. The `<select>` stays the one
  bordered thing there, because it's the one control with a value to show.
- Direction and archived both already live as state in `ApplicationsView` and
  are threaded down as props. Nothing about that changes — no new state, no
  new plumbing.

## Out of scope

- The sort model: `SORT_FIELDS`, the `Sort` shape, `sortApplications`, and the
  `createdAt`/`desc` default all stay as they are.
- Persisting sort or filter choice across reloads.
- Any new filter — status, date range, search. This is about the controls that
  exist, not about adding more.
- The application rows, the detail panel, the add form, and the nav.
- The `.button` tiers settled in #33. New controls pick an existing tier; they
  don't introduce one.
- New dependencies, including icon sets. Controls stay text — an unlabelled
  ↑/↓ glyph is exactly the ambiguity this brief is removing.

## Open questions

- A button labelled with the action ("Sort oldest first") never states the
  order currently in effect — it's implied by the select plus the button's
  offer. Is that enough, or does the current order need to be visible too?
- Does the archived toggle belong at the foot of the list or above it? The
  foot is the recommendation; the deciding factor is whether a long list
  makes it unfindable.
- With the archived toggle at the foot, what does the surface show when every
  application is archived? Today that's the "Nothing tracked yet" empty state,
  which is wrong, and point 9 says it has to change — but the wording is open.
- Does `ApplicationSort` keep its name once the archived checkbox leaves, and
  does the archived toggle belong to `ApplicationList` or stay a sibling
  rendered by `ApplicationsView`?

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/list-controls.plan.md` before writing any
code.
