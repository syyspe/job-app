---
brief: brief/edit-form-layout.md
branch: edit-form-layout
date: 2026-09-03
---

# Edit form: button styling, and where Save sits — Plan

## Context

Expanding an application renders `ApplicationDetail` as three stacked
widgets: the form (Save last, inside `<form>`), the attachment list, then
Delete. Save ends up stranded in the middle of the panel, split from Delete
by the attachment UI. The buttons don't match either — only
`button[type='submit']` is styled (`index.css:48`), so Delete and Remove fall
back to browser chrome and the file picker shows native "Choose file" chrome
CSS can't reach. Worse, `App.css:50`'s `li > button` rule — written to make an
application row look like a clickable row — also catches every attachment
"Remove", stripping its button affordance, and `App.css:43`'s `li` card border
lands on attachment items too.

Outcome: fields → attachments → one action row with Save and Delete, and one
button family across Save, Delete, Remove and the file picker. Presentational
and structural only; no behaviour changes.

Two decisions settled with the user, closing the brief's open questions:
attachments render nothing when empty (as today), and destructive actions get
the neutral secondary look rather than a red variant — no new color tokens.

## Approach

**Ordering** is structural. `ApplicationForm` gets two optional slots:

- `children` — rendered between the fields and the action row.
- `actions` — rendered inside the action row, after the submit button.

`ApplicationDetail` passes `<AttachmentList>` as children and `Delete` as
actions; `App.tsx`'s add form passes neither and is unchanged. Save stays
`type="submit"` inside `<form>`, so Enter-to-submit still works, and DOM order
equals visual order, so tab order follows for free. No CSS `order`.

**Buttons** move from type selectors to a class family. Classes, not element
selectors, because the file picker's control is a `<label>` — a class is the
only way it shares one rule with the `<button>`s:

- `.button` — base: `inline-flex`, `align-items: center`, `font: inherit`,
  `padding: 6px 12px`, `border: 1px solid var(--border)`, `border-radius: 4px`,
  transparent background, `color: inherit`, `cursor: pointer`.
- `.button-primary` — accent tint for the submit button: `color: var(--accent)`,
  `background: var(--accent-bg)`, `border-color: transparent`.

Delete, Remove and the file-picker label take `.button` alone.
`button[type='submit']` is deleted from `index.css`; the bare `button { font:
inherit; cursor: pointer }` reset stays.

**List selectors** get scoped at the source, not counter-ruled. The
application row button takes `.row-button` and `li > button` becomes
`.row-button`; the `li` card rule becomes `.application-item`; attachment
items get their own `.attachment-item` rule. The global `ul` reset stays — both
lists want it.

**File input** becomes a visually-hidden `<input type="file">` inside its
`<label className="button">`. Use the 1px clip pattern, not `display: none` —
the input must stay focusable and labelled so `getByLabel('Attach a file')`
and Playwright's `setInputFiles` keep working. `.button:focus-within` carries
the focus ring.

`ApplicationForm`'s dead `onCancel` prop and its Cancel button are deleted —
no caller passes it, no test references it, and it sits in the button row
being reworked.

## Affected files

- `src/ApplicationForm.tsx` — add optional `children` and `actions` props;
  render `children` between the last field and the action row; wrap the action
  row in `<div className="form-actions">` with `actions` after the submit
  button; submit button gets `className="button button-primary"`; delete
  `onCancel` and the Cancel button.
- `src/ApplicationDetail.tsx` — pass `<AttachmentList>` as the form's children
  and the Delete button (`className="button"`) as `actions`; the wrapper
  `<div>` and the standalone Delete below the form both go away.
- `src/AttachmentList.tsx` — `ul` gets `className="attachment-list"`, each `li`
  `className="attachment-item"`; Remove gets `className="button"`; the file
  `<label>` gets `className="button"` and its input `className="visually-hidden"`.
- `src/ApplicationList.tsx` — row `<button>` gets `className="row-button"`;
  `ul`/`li` get `application-list`/`application-item`.
- `src/index.css` — replace `button[type='submit']` with `.button`,
  `.button-primary`, `.button:focus-within`, and `.visually-hidden`.
- `src/App.css` — `li > button` → `.row-button`; `li` → `.application-item`;
  add `.attachment-item` (flex row, `align-items: center`,
  `justify-content: space-between`, gap, no card border) and `.form-actions`
  (`display: flex`, `gap: 8px`, `align-self: flex-start`), replacing
  `form button { align-self: flex-start }`.
- `src/ApplicationDetail.test.tsx` — new.

## Work order

1. **Red** — write `src/ApplicationDetail.test.tsx`: render `ApplicationDetail`
   with one attachment and assert (a) buttons in DOM order are
   `['Remove', 'Save', 'Delete']`, (b) `Save` and `Delete` share a parent
   element, (c) `getByLabelText('Attach a file')` exists. It fails today on
   order and on the shared parent.
2. **Green** — add the `children` and `actions` slots to `ApplicationForm`,
   drop `onCancel`/Cancel, and rewire `ApplicationDetail` to pass attachments
   and Delete through them. Run `npm test`.
3. Restructure the file picker in `AttachmentList` (hidden input inside the
   labelled button) and add the list/item classes there and in
   `ApplicationList`.
4. CSS: add `.button`, `.button-primary`, `.visually-hidden` to `index.css`
   and delete the `button[type='submit']` rule; in `App.css` rescope
   `li > button` and `li`, and add `.attachment-item` and `.form-actions`.
5. Apply the class names to every control: Save (`button button-primary`),
   Delete, Remove, file label (`button`), row button (`row-button`).
6. `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. Eyeball the
   detail view with `npm run dev` + `npm run dev:server` to confirm the three
   button styles and the attachment row read as intended.

## Tests

- New: `src/ApplicationDetail.test.tsx` — order of the action controls, Save
  and Delete in one row, file picker present and labelled. This is the guard
  for brief items 1, 2 and 7.
- Updated: none. `ApplicationForm.test.tsx` never referenced `onCancel`, and
  every existing query is by accessible role/name, all of which are preserved.
- Verification command: `npm test`, then `npm run test:e2e` —
  `e2e/applications.spec.ts` drives Save, `Attach a file` and Delete by
  accessible name and is the real regression check for the hidden file input.

## Notes

- The brief attributes the gap under Save to `form`'s 32px `margin-bottom`,
  but `App.css:61`'s `li form { margin: 12px 0 0 }` already zeroes it inside a
  row. No change needed there; the restructure fixes the stranding regardless.
- Moving `AttachmentList` inside `<form>` puts its `<label>` under
  `form label { display: flex; flex-direction: column }`. `.button` sets
  `display: inline-flex` and wins on specificity (0-1-0 vs 0-0-2), but the
  build should confirm it renders as a pill, not a column.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
