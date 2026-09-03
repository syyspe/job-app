---
slug: edit-form-layout
date: 2026-09-03
---

# Edit form: button styling, and where Save sits

## Problem

Expanding an application shows `ApplicationDetail` (`ApplicationDetail.tsx:30`),
and it reads as three unrelated widgets stacked on top of each other rather
than one form.

**The buttons don't match.** `index.css:52` styles `button[type='submit']`
only — an accent-tinted pill. Every other control in the detail view misses
it: "Delete" (`ApplicationDetail.tsx:44`) and "Remove"
(`AttachmentList.tsx:31`) are `type="button"` and fall back to the browser's
default grey chrome, and the file picker is a bare `<input type="file">`
(`AttachmentList.tsx:39`) whose "Choose file" button is native OS chrome that
CSS can't reach at all. Three different-looking buttons in one panel.

"Remove" is worse than unstyled. `App.css:52`'s `li > button` rule exists to
make an application row in the list look like a clickable row — full width,
left-aligned, no border, no background. Attachments are also an `li` with a
direct `button` child, so every "Remove" is caught by that selector and
renders as bare full-width text with no button affordance. The same
unscoped selector also gives each attachment the `li` card border from
`App.css:43`.

**Save is in the middle.** `ApplicationDetail` renders the form, then the
attachments, then Delete. Save is the last thing inside `<form>`, so the
order on screen is: fields, **Save**, attachment list, "Choose file",
**Delete**. Add a file and Save is visibly stranded mid-panel, with 32px of
`form`'s `margin-bottom` (`App.css:12`) below it, above a list it has nothing
to do with. The two actions that apply to the whole application end up split
by the attachment UI.

Worth doing now: it's the view you land on for every edit, the fix is
presentational, and the `li > button` collision is a live bug that gets
harder to unpick as more list UI accretes.

## What done looks like

1. In the expanded detail view the order on screen is: fields, attachments
   (list + file picker), then an action row with Save and Delete.
2. Save and Delete sit next to each other in that one action row, at the
   bottom.
3. Save, Delete, Remove and the file picker's control read as one button
   family — consistent shape, padding and font. Destructive actions may be
   visually distinct from Save; unstyled-browser-default is not.
4. The file picker is styled rather than a raw `<input type="file">` — no
   native "Choose file" chrome.
5. "Remove" is no longer hit by `App.css`'s `li > button` rule, and
   application rows in the list still look exactly as they do today.
6. Attachment `li`s are styled deliberately, not by inheriting the
   application-row card border.
7. Tab order matches visual order, and every control keeps the accessible
   name its tests query by — `Save`, `Delete`, `Remove`, `Attach a file`.
8. `npm test` and `npm run test:e2e` pass unchanged. `e2e/applications.spec.ts`
   drives Save, `Attach a file` and Delete by accessible name, so it is the
   regression check for item 7.

## Approach

- **Ordering is structural, not CSS.** Save must stay a `type="submit"`
  inside the `<form>` to keep Enter-to-submit working, so it can't simply be
  moved out to sit beside Delete in `ApplicationDetail`. Two ways round it:
  give `ApplicationForm` a `children` slot rendered between the fields and
  the action row (detail passes `<AttachmentList>`, add form passes nothing),
  or an `actions` slot so the caller supplies Delete into the existing button
  row. The children slot looks cleaner — one new optional prop, the add form
  is unchanged — but the plan makes the call.
- Rejected: reordering with CSS `order` on a flex container. It moves the
  paint order and leaves tab order and screen-reader order following the
  DOM, which breaks item 7 for exactly the users who'd notice.
- **Scope the row selector.** `li > button` is doing a job for
  `ApplicationList` and catching `AttachmentList` by accident. Fix it at the
  source — a class on the application-row button, or scoping the list — not
  by adding a counter-rule that un-does it for attachments.
- **Buttons get one shared rule.** Today only `button[type='submit']` is
  styled, which is why type is accidentally load-bearing for appearance. A
  base `button` rule plus a modifier for the accent/primary and one for
  destructive is the shape; whether that's element selectors or classes is a
  plan decision, but appearance should stop keying off `type`.
- **File input:** the standard trick is a visually-hidden `<input
  type="file">` inside its `<label>`, with the label styled as the button.
  That keeps `getByLabel('Attach a file')` working in the e2e spec — the
  input must stay focusable and labelled, not `display: none`.
- No new dependencies. This is CSS in `App.css`/`index.css` plus small
  structural edits to `ApplicationForm`, `AttachmentList` and
  `ApplicationDetail`.
- `ApplicationForm`'s `onCancel` prop (`ApplicationForm.tsx:41`) is dead — no
  caller passes it, so the Cancel button never renders. Deleting it while
  reworking that button row is in scope; it's three lines and it's in the way.

## Out of scope

- The add form's layout on `App.tsx:57`. It picks up the shared button
  styling, but its structure doesn't change.
- Any change to what the form submits, validates or does on submit.
- Attachment behaviour: upload still fires on file selection, remove still
  fires immediately, no confirm step on Delete or Remove.
- A design system, tokens beyond the `--accent`/`--border` set already in
  `index.css`, or a component library.
- Responsive/mobile layout work beyond not regressing what's there.

## Open questions

- ~~Whether Delete belongs in the same row as Save or set apart from it.~~
  Settled after the brief was drafted: Delete sits directly next to Save in
  the one action row. No separator, no spacer, no confirm step — keep it
  simple.
- Whether the attachment list needs an empty state, or just renders nothing
  when there are no files, as today.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/edit-form-layout.plan.md` before writing
any code.
