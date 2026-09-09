---
brief: brief/sort-direction-control.md
branch: sort-direction-control
date: 2026-09-08
---

# An unambiguous sort direction control — Plan

## Context

`ApplicationSort` renders the sort direction as one button whose label *is* the
current state (`Ascending` / `Descending`). A button label conventionally names
what clicking it does, so the control reads two ways at once and the two
readings imply opposite outcomes. Flipping the label to the action is the same
ambiguity in reverse and loses the ability to see the current direction at all.

The fix, per `brief/sort-direction-control.md`: show state and action as
separate visible things by replacing the toggle button with a two-option radio
group in a `<fieldset>`/`<legend>`. The selected radio *is* the current
direction; the unselected one *is* the action; both are on screen at once, and
the grouping and its name come from native semantics rather than ARIA.

Two open questions in the brief are settled here so the build session doesn't
decide by taste: **plain radios, not a segmented control**, and the legend reads
**`Direction`**.

## Affected files

- `src/components/ApplicationSort.tsx` — drop `toggleDirection` and the toggle
  `<button>`; render a `<fieldset><legend>Direction</legend>` with two radios.
  Stays presentational and stateless: `sort` in, `onChange` out. The `Sort by`
  `<select>` is untouched.
- `src/components/ApplicationSort.test.tsx` — replace the two direction tests
  (accessible-name assertion and the flip test) with radio-based ones.
- `src/App.css` — one new `.sort-bar fieldset` rule next to the existing
  `.sort-bar` rules (lines 93–111).

Not touched: `src/lib/sorting.ts` (comparators and the deadline-empties-last
rule), `src/components/ApplicationsView.tsx` (the `sort`/`setSort` wiring is
unchanged), `e2e/` (no spec references the sort bar).

## Work order

Red-green-refactor, per `.claude/skills/simple-code/SKILL.md`.

1. **Red** — rewrite the direction tests in `ApplicationSort.test.tsx` against
   the radio group (see Tests below). They fail against the current button.
2. **Green** — in `ApplicationSort.tsx`, delete `toggleDirection` and replace
   the `<button>` with:

   ```tsx
   <fieldset>
     <legend>Direction</legend>
     <label>
       <input
         type="radio"
         name="sort-direction"
         value="asc"
         checked={sort.direction === 'asc'}
         onChange={() => onChange({ ...sort, direction: 'asc' })}
       />
       Ascending
     </label>
     <label>
       <input
         type="radio"
         name="sort-direction"
         value="desc"
         checked={sort.direction === 'desc'}
         onChange={() => onChange({ ...sort, direction: 'desc' })}
       />
       Descending
     </label>
   </fieldset>
   ```

   Write both radios out literally rather than mapping over a const array —
   two similar blocks beat an abstraction here, and the file stays far inside
   the size limits. Clicking the already-selected radio fires no change event,
   which is exactly the no-op the brief asks for; no guard is needed.
3. **Style** — add to `src/App.css`, immediately after the `.sort-bar label`
   rule:

   ```css
   .sort-bar fieldset {
     display: inline-flex;
     align-items: center;
     gap: 8px;
     border: 0;
     padding: 0;
     margin: 0;
   }
   ```

   That is the whole styling change. The existing `.sort-bar label`
   (`inline-flex`, `gap: 8px`) already spaces each radio from its text, and
   native radios bring their own focus ring and checked state — no
   `.visually-hidden` inputs, no `.button` overrides, nothing to keep in step
   with `:focus-visible`.
4. Run the verification commands below, then commit code, test, and CSS
   together.

## Tests

All queries by accessible role and name, per CLAUDE.md's convention.

- **Updated:** `the select and the direction radios have accessible names` —
  `getByRole('combobox', { name: 'Sort by' })` still visible; the group is
  reachable as `getByRole('group', { name: 'Direction' })`; with
  `direction: 'desc'`, `getByRole('radio', { name: 'Descending' })` is checked
  and `{ name: 'Ascending' }` is not. This covers "current direction is
  reported as selected" and the labelled-group requirement.
- **Updated:** the old `clicking the direction button flips it` test becomes
  `choosing the other direction calls onChange with it` — from
  `direction: 'desc'`, `user.click(getByRole('radio', { name: 'Ascending' }))`
  calls `onChange` with `{ field: 'createdAt', direction: 'asc' }`.
- **New:** `choosing the direction already in effect does not call onChange` —
  from `direction: 'desc'`, clicking `Descending` leaves `onChange`
  uncalled (`expect(onChange).not.toHaveBeenCalled()`).
- **Unchanged:** the `choosing a field calls onChange with the new field` test.
- Verification commands: `npm test`, `npm run lint`, `npm run test:e2e`
  (all three are named in the brief's done-criteria). Healthy output is
  `Test Files N passed / Tests N passed` with no `failed` line, and `N passed`
  from Playwright.

Worth one look in `npm run dev` + `npm run dev:server` that the bar still reads
cleanly on one line, since the fieldset is the first one in the app.

## Risks / rollback

Nothing hard to reverse — three files, one commit, `git revert` restores the
button.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
