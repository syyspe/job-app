---
brief: brief/side-by-side-layout.md
branch: side-by-side-layout
date: 2026-09-03
---

# List beside the add form, and scoped button labels — Plan

## Context

`main` is capped at 720px (`App.css:2`) and `App.tsx:57–68` stacks the add
form above the list. The form is six fields tall, so the first application row
starts below the fold on a laptop: adding an application and checking it
landed means scrolling past the form, and on a wide screen two-thirds of the
window sits empty.

Separately, an expanded row puts **Remove** (deletes one attachment,
`AttachmentList.tsx:37`) about 40px from **Delete** (deletes the whole
application and its files, `ApplicationDetail.tsx:38`) inside the same card.
Neither says what it acts on, neither confirms, and one is unrecoverable.

Outcome: two columns above 900px, stacking below it; the two buttons renamed
to say their scope. Presentational and structural only — nothing changes about
what either button does or what the form submits.

Settled with the user, closing the brief's open questions: `h1` stays above
the grid, not inside it; breakpoint 900px with a fixed 320px form column; and
the grid gets a Playwright guard, since jsdom can't test CSS.

## Approach

**Layout lives in `App.tsx` and `App.css`, not in the components.** A single
`<div className="layout">` wraps the existing `ApplicationForm` and
`ApplicationList` children. Both components render one top-level element
each — `<form>`, and either `<ul className="application-list">` or the empty
state `<p>` — so each is one grid item either way, and no props change.

Mobile-first: `.layout` is a plain `display: grid` with `gap: 32px` and
`align-items: start` (so a short list doesn't stretch the form column's
height), and a `@media (min-width: 900px)` query adds
`grid-template-columns: minmax(0, 320px) minmax(0, 1fr)`. Below 900px there is
no `grid-template-columns` at all, so it falls back to one column in DOM
order — form, then list — which is today's layout. `main`'s `max-width` goes
720px → 1120px; with its 20px padding that is 1080px of content, i.e. a 320px
form, a 32px gap, and ~728px of list.

`minmax(0, …)` on both tracks rather than bare `320px 1fr`: grid items default
to `min-width: auto`, so a long unbroken string in a row title (a company name
or a URL) would otherwise blow the track wider than its share.

**`form`'s `margin-bottom: 32px` (`App.css:11`) is deleted.** The grid `gap`
now owns the space between form and list; leaving the margin would double it
to 64px in the stacked case. It is safe to drop: the only other `<form>` is
the detail form, and `li form { margin: 12px 0 0 }` (`App.css:70`) already
overrides it there.

**Relabelling is two string edits.** `Remove` → `Remove file`,
`Delete` → `Delete application`. Save is untouched, as are all class names —
`edit-form-layout` settled the button family and this brief changes labels
only.

The unit tests that query these names need updating: Testing Library matches
an accessible name given as a string **exactly**, so `{ name: 'Delete' }` will
no longer match `Delete application` and those assertions fail. Playwright
matches by substring, so `e2e/applications.spec.ts:34` would still pass
untouched — update it anyway so the spec names the button it actually clicks.

**The detail form now renders in the ~728px list column** rather than a 720px
page — effectively unchanged width, and its fields are already
`flex-direction: column` (`App.css:8`). Expect no change; it is a check at
step 5, not an edit.

## Affected files

- `src/App.tsx` — wrap the `ApplicationForm` and `ApplicationList` elements
  (lines 57–68) in `<div className="layout">`, leaving `<h1>` a direct child
  of `<main>` above it. No prop or handler changes.
- `src/App.css` — `main` `max-width: 720px` → `1120px`; delete
  `margin-bottom: 32px` from the `form` rule; add `.layout` and its
  `min-width: 900px` media query.
- `src/AttachmentList.tsx:37` — `Remove` → `Remove file`.
- `src/ApplicationDetail.tsx:38` — `Delete` → `Delete application`.
- `src/ApplicationDetail.test.tsx` — line 25's test name and line 37's
  expected array → `['Remove file', 'Save', 'Delete application']`; line 52's
  `{ name: 'Delete' }` → `'Delete application'`.
- `src/ApplicationList.test.tsx` — lines 61, 80, 81: `{ name: 'Delete' }` →
  `'Delete application'`.
- `e2e/applications.spec.ts:34` — `{ name: 'Delete' }` →
  `'Delete application'`.
- `e2e/layout.spec.ts` — new; see Tests.

## Work order

1. **Red** — write `e2e/layout.spec.ts` (see Tests). It fails today: at
   1280px the row sits below the Add application button, not right of it.
2. Rename the two labels in `AttachmentList.tsx` and `ApplicationDetail.tsx`,
   and update the four assertion sites in `ApplicationDetail.test.tsx`,
   `ApplicationList.test.tsx` and `e2e/applications.spec.ts`. Run `npm test` —
   green before any layout change.
3. `App.tsx`: wrap the two children in `<div className="layout">`.
4. `App.css`: widen `main`, drop the `form` bottom margin, add `.layout` and
   the media query.
5. `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. Then
   `npm run dev` + `npm run dev:server` and eyeball at ~1280px and ~600px:
   the first row visible without scrolling, an expanded row's detail form
   laying out correctly in the narrower column, and `No applications yet.`
   not looking stranded in an empty right column.

## Tests

- New: `e2e/layout.spec.ts` — add an application (company `Layout Co`, role
  `Engineer`, date `2026-01-15`), then take `boundingBox()` of
  `getByRole('button', { name: 'Add application' })` and
  `getByRole('button', { name: /Layout Co/ })`. At
  `setViewportSize({ width: 1280, height: 800 })` assert the row's `x` is
  greater than the button's `x` (side by side); at
  `{ width: 600, height: 800 }` assert the row's `y` is greater than the
  button's `y + height` (stacked). This is the only guard for brief items 1
  and 2 — jsdom has no layout engine, so a unit test cannot cover them. Use
  a company name distinct from `applications.spec.ts`'s `Acme`: both specs
  share one dev server and one SQLite file across a run.
- Updated: `src/ApplicationDetail.test.tsx` (lines 25, 37, 52),
  `src/ApplicationList.test.tsx` (lines 61, 80, 81),
  `e2e/applications.spec.ts` (line 34) — accessible-name queries follow the
  two renamed buttons. No assertion changes meaning; only the strings move.
- Verification command: `npm test`, then `npm run test:e2e`.

## Notes

- No new dependencies, no component API changes, and `ApplicationForm` /
  `ApplicationList` keep their current props — the brief's "layout is not a
  component concern" constraint.
- Out of scope and deliberately not done here: a confirm step on
  `Delete application`, any colour or destructive-variant styling, and
  sticky-sidebar or modal treatments of the form.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
