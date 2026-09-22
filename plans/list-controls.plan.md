---
brief: brief/list-controls.md
branch: list-controls
date: 2026-09-22
---

# Redesign the list controls — Plan

## Context

`ApplicationSort` packs three controls into one bordered strip: a field
`<select>`, a direction radio `fieldset`, and a "Show archived" checkbox. The
strip takes `--surface`, `--line` and `--r-sm` — the same treatment as
`.panel` and as an application row — so chrome claims the same visual weight
as the content it filters. Within it, three widget vocabularies sit side by
side with nothing saying which changes *order* and which changes *what's
listed*. "Ascending"/"Descending" costs three text labels to express one
binary, in system vocabulary that doesn't answer the user's actual question
(with `Sort by: Deadline`, is "Ascending" soonest or latest?). And "Show
archived" isn't a sort control at all — it renders unconditionally, including
when nothing is archived and it can only be a no-op.

Archive moved into the detail panel in #33, so archiving is now a deliberate
act taken from inside an application; where its counterpart lives is a live
question. This is a display and layout change — the sort model underneath
(`SORT_FIELDS`, `Sort`, `sortApplications`) is untouched.

Outcome: the bar loses its box and sits quieter than the rows; direction
becomes one button labelled with what pressing it does, worded per field; and
the archived toggle moves to the foot of the list, carries its count, and
doesn't exist when the count is zero.

Settled with the user (the brief's open questions):

- **Direction:** action label only — `Sort oldest first`, no separate readout
  of the order in effect.
- **Archived toggle:** foot of the list.
- **All-archived empty state:** title "Nothing to show", body
  "N archived applications are hidden."
- `ApplicationSort` keeps its name (it is now purely sort). The archived
  toggle is its own component, a sibling of `ApplicationList` rendered by
  `ApplicationsView` — the list stays about rows.

## Affected files

- `src/lib/sorting.ts` — gains the two display maps: `SORT_FIELD_LABELS`
  (moved verbatim from the component's local `FIELD_LABELS`) and
  `SORT_ORDER_LABELS`, keyed field → direction → the words for that order.
  The model itself (`SORT_FIELDS`, `Sort`, `compareValues`,
  `sortApplications`) is unchanged. They live here rather than in a new
  `src/lib/*.ts` beside `status.ts`/`roles.ts` because both maps are keyed by
  `SortField`, which only this module defines, and the file is 28 lines.
- `src/components/ApplicationSort.tsx` — loses the radio `fieldset` and the
  archived checkbox; props drop to `sort` and `onChange`. The direction
  control becomes one `<button type="button" className="button">` whose label
  is `Sort ${SORT_ORDER_LABELS[sort.field][other]}`, where `other` is the
  direction not currently in effect. Clicking calls
  `onChange({ ...sort, direction: other })`.
- `src/components/ArchivedToggle.tsx` — **new.** Props `count`,
  `showArchived`, `onChange`. Returns `null` when `count === 0`. Renders one
  `<button type="button" className="button archived-toggle">` reading
  `Show ${count} archived` or `Hide archived`, calling
  `onChange(!showArchived)`.
- `src/components/ApplicationList.tsx` — gains one prop,
  `hiddenArchivedCount: number`, used only by `EmptyState`: above zero it
  renders "Nothing to show" / "N archived application(s) is/are hidden."
  instead of "Nothing tracked yet". Rows are untouched.
- `src/components/ApplicationsView.tsx` — stops passing the archived props to
  `ApplicationSort`; memoises `archivedCount` off the unfiltered
  `applications`; passes `hiddenArchivedCount={showArchived ? 0 :
  archivedCount}` to the list and renders `<ArchivedToggle>` after it. No new
  state — `showArchived` and `setShowArchived` are already here.
- `src/App.css` — `.sort-bar` loses `background`, `border`, `border-radius`
  and `padding`; keeps the flex row, `gap`, `margin-bottom`, `--fs-sm` and
  `--ink-muted`, so it aligns with the rows below and reads as one column.
  With exactly two flex items (the `Sort by` label+select, and the direction
  button) `flex-wrap: wrap` has a single deliberate wrap point — the button
  drops below the select at narrow widths and nothing can fragment. Delete
  the now-dead `.sort-bar fieldset` and `.sort-bar legend` rules; keep
  `.sort-bar select` (the one bordered thing in the bar).
- `src/applications.css` — new `.archived-toggle`: `margin-top: var(--s-3)`
  and `font-size: var(--fs-sm)`, everything else inherited from `.button`.
  It belongs to the list surface, so it goes here, not in `App.css`.
- `CLAUDE.md` — the `src/components/` bullet says "ten presentational
  components"; with `ArchivedToggle` it's eleven. Update the count and name it
  beside `ApplicationsView`.

`SORT_ORDER_LABELS` in full:

```ts
export const SORT_ORDER_LABELS: Record<SortField, Record<Sort['direction'], string>> = {
  status: { asc: 'earliest stage first', desc: 'latest stage first' },
  dateApplied: { asc: 'oldest first', desc: 'newest first' },
  deadline: { asc: 'soonest first', desc: 'latest first' },
  createdAt: { asc: 'oldest first', desc: 'newest first' },
  updatedAt: { asc: 'oldest first', desc: 'newest first' },
}
```

So `deadline`/`asc` (soonest first, in effect) offers **Sort latest first**;
`createdAt`/`desc` (the default) offers **Sort oldest first**.

## Work order

Red-green-refactor per `simple-code` — the test for each slice first.

1. **Labels.** Add `SORT_FIELD_LABELS` and `SORT_ORDER_LABELS` to
   `src/lib/sorting.ts`. No test of their own: they're literals, exercised
   through `ApplicationSort.test.tsx`.
2. **Sort bar.** Rewrite `ApplicationSort.test.tsx` whole — the radios and
   the checkbox are both gone. Then rewrite the component against it.
3. **Archived toggle.** Write `ArchivedToggle.test.tsx`, then
   `ArchivedToggle.tsx`.
4. **Empty state.** Add the hidden-archived case to
   `ApplicationList.test.tsx`, then the `hiddenArchivedCount` prop. Every
   existing `ApplicationList` render in that file gains
   `hiddenArchivedCount={0}` — mechanical.
5. **Wiring.** Update the archived test in `ApplicationsView.test.tsx` to
   drive the buttons, add the all-archived case, then rewire the view.
6. **CSS.** `.sort-bar` in `App.css`, `.archived-toggle` in
   `applications.css`. Every value comes from an `index.css` token.
7. **E2E.** Update `e2e/archive.spec.ts`.
8. **Docs.** The component count in `CLAUDE.md`.
9. Run the three commands below.

## Tests

- New: `src/components/ArchivedToggle.test.tsx` — renders nothing at
  `count: 0`; the button's accessible name is `Show 4 archived` when hidden
  and `Hide archived` when shown; clicking calls `onChange` with the flipped
  value.
- New: in `ApplicationList.test.tsx` — an empty list with
  `hiddenArchivedCount: 2` shows "Nothing to show" and the hidden-count line,
  and does *not* show "Nothing tracked yet" (brief point 9).
- New: in `ApplicationsView.test.tsx` — with every application archived and
  the filter off, the surface shows "Nothing to show" and the toggle offers
  to reveal them.
- Updated: `src/components/ApplicationSort.test.tsx`, whole file — the select
  keeps its `Sort by` accessible name and its `onChange`; the direction
  button's name is `Sort oldest first` for `createdAt`/`desc`, `Sort latest
  first` for `deadline`/`asc` and `Sort latest stage first` for
  `status`/`asc`; clicking it calls `onChange` with the flipped direction and
  the same field.
- Updated: `ApplicationsView.test.tsx:151` — `getByRole('checkbox', { name:
  'Show archived' })` becomes the two buttons (`Show 1 archived`, then `Hide
  archived`, which is a fresh query after each click since the name changes).
- Updated: `e2e/archive.spec.ts:20` — the checkbox becomes
  `getByRole('button', { name: /^Show \d+ archived$/ })`; match the count
  loosely, since the e2e specs share one database. `check()`/`uncheck()`
  become `click()`. The tail changes with behaviour: after unarchiving,
  nothing is archived, so assert the toggle is gone (brief point 6) and the
  row is still visible.
- Verification command: `npm test`, plus `npm run lint` and
  `npm run test:e2e` (brief point 13).

Manual check while the dev server is up (`npm run dev` + `npm run dev:server`):
the bar at ~360px and at full width, and that the direction button and the
archived toggle both take a visible focus ring from the keyboard.

## Risks / rollback

Nothing here is hard to reverse — it's one component rewritten, one added, and
two CSS rules. `git revert` on the build commit restores the old bar whole.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
