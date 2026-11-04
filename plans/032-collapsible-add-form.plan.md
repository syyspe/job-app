---
brief: brief/032-collapsible-add-form.md
branch: 032-collapsible-add-form
date: 2026-11-04
---

# Collapsible "Add an application" form — Plan

Context: the add form in `ApplicationsView` is rarely used now that applications
arrive via the MCP server. It always renders in full, and on mobile it pushes
the list down. It should start collapsed on every load, behind an accessible
toggle, without changing the two-column layout.

## Decisions

- **Control: a `<button aria-expanded aria-controls>` inside the `<h2>`**, not
  `<details>`/`<summary>`. This is the WAI disclosure-heading pattern. It
  matches the list rows' existing `row-button[aria-expanded]` idiom and
  styling hooks. It also gives a plain `getByRole('button', { name: 'Add an
  application' })` with a queryable expanded state. That name doesn't collide
  with the submit button's "Add application": Testing Library matches names
  exactly, and Playwright's substring match doesn't hit it either.
- **Hide, don't unmount:** the form's wrapper gets `hidden={!open}`, so a
  half-typed draft survives close and reopen. Hidden fields are out of the
  accessibility tree, so `getByRole` doesn't find them while the panel is
  collapsed (tests can assert on that with `queryByRole`).
- State is `useState(false)` in a local `AddPanel` component in
  `ApplicationsView.tsx` (extracted during build to keep `ApplicationsView`
  under the 40-line lint limit), with no persistence. After
  an add, nothing touches `open`, so the form stays open and `ApplicationForm`
  resets itself as it does today.
- CSS: the rules go in `App.css`, which already owns `.panel` / `.panel h2`.
  The panel gets a modifier class (`add-panel`) and reads tokens from
  `index.css`. The toggle fills the heading's width, has no button chrome, and
  ends in a chevron (`::after`) that rotates on `[aria-expanded='true']`. When
  collapsed, the h2's bottom margin goes away so the panel is a short bar.
  `.layout`'s `align-items: start` already keeps the wide-view left column
  short, and the list doesn't move.
- CLAUDE.md's `UI:` line stays untouched. This is a small reshape, not a
  visual direction, so there's no Contracts section.

## Affected files

- `src/components/ApplicationsView.tsx` — a local `AddPanel` with the `open`
  state, a toggle button in the h2, and the form wrapped in `<div id="add-application-form" hidden={!open}>`.
- `src/App.css` — `.add-panel` toggle and chevron rules, and the collapsed
  h2 margin.
- `src/components/ApplicationsView.test.tsx` — new tests. The
  `addApplication` helper clicks the toggle open first (no test calls it
  twice).
- `e2e/applications.spec.ts`, `e2e/archive.spec.ts`, `e2e/layout.spec.ts`,
  `e2e/pagination.spec.ts` — open the panel before filling the form.
  Pagination opens it once, before its add loop, since it stays open.

## Work order

1. Unit tests in `ApplicationsView.test.tsx` (they fail first): collapsed by
   default, opening, closing, staying open after an add.
2. `ApplicationsView.tsx`: state, toggle and hidden wrapper. Run `npm test`.
3. `App.css` styling. Check it by eye at about 1280px and about 400px.
4. Update the four e2e specs. Run `npm run lint`, `npm run build`, then the
   e2e suite (check the ports first, per CLAUDE.md).

## Tests

- New (ApplicationsView.test.tsx):
  - On first render the toggle has `aria-expanded="false"` and there's no
    Company textbox.
  - A click sets `aria-expanded="true"` and the fields appear.
  - A second click collapses it again.
  - After a successful add, the toggle is still expanded and Company is
    empty.
- Updated: the `addApplication` helper, and the four e2e specs listed above.
  `layout.spec.ts` keeps its wide/narrow assertions on the submit button
  after opening.
- Verification command: `npm test` (the gate), plus `npm run lint`,
  `npm run build` and `npm run test:e2e` (or `test:e2e:prod` if 5173 or 3001
  is taken).

---

**Next stage:** run `/sdlc`.
