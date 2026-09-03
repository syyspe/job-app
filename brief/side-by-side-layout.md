---
slug: side-by-side-layout
date: 2026-09-03
---

# List beside the add form, and buttons that say what they delete

## Problem

**Everything is one column.** `main` is `max-width: 720px` (`App.css:2`) and
`App.tsx:57` renders the add form and then the list, stacked. The form is six
fields tall — company, role, date, status, link, notes — plus a 32px
`form` margin (`App.css:11`), so the first application row starts well below
the fold on a laptop. Adding an application and then checking it landed means
scrolling past the whole form; so does reading the list at all. On a wide
screen the right two-thirds of the window is empty while the user scrolls.

**Two buttons, similar words, different blast radius.** Expanding a row
renders `ApplicationDetail`, which is one `<li>` containing: an attachment
list where each file has **Remove** (`AttachmentList.tsx:32` → deletes that
attachment), and below it the form action row with **Save** and **Delete**
(`ApplicationDetail.tsx:37` → deletes the entire application, files and all).
Nothing on either button says what it acts on. They sit ~40px apart inside
the same card, and the only way to tell them apart is to already know. This
was misread as duplicate buttons on first look, which is the failure mode:
one of them is unrecoverable and neither confirms.

Worth doing now: the layout is the first thing anyone sees, both fixes are
presentational, and the button ambiguity is a data-loss trap that gets
cheaper to fix before more actions accrete in that row.

## What done looks like

1. On a wide viewport the add form and the application list sit side by side
   in two columns, with the list's first row visible without scrolling past
   the form.
2. Below a breakpoint the two columns stack back to today's single-column
   order — form first, then list — and stay usable at narrow widths.
3. The attachment button reads **Remove file**; the application action reads
   **Delete application**. Save is unchanged.
4. Expanding a row still works the same way, and the detail form still lays
   out correctly inside the narrower column.
5. `npm test` passes, with the assertions that query `Delete` and `Remove` by
   accessible name updated to the new names — `ApplicationDetail.test.tsx:25`,
   `:37`, `:52` and `ApplicationList.test.tsx:61`, `:80`, `:81`.
6. `npm run test:e2e` passes. `e2e/applications.spec.ts:34` clicks
   `name: 'Delete'`; Playwright's role-name match is substring by default so
   it should still hit "Delete application", but the spec gets checked rather
   than assumed.
7. No new dependencies.

## Approach

- **Two columns via CSS grid on a wrapper inside `main`.** `main` grows past
  720px (roughly 1100–1200px) and gets `grid-template-columns` splitting form
  and list, collapsing to one column under a `min-width` media query. The
  form column can be the narrower of the two — the list is what benefits from
  the space.
- Rejected: making the form a sticky sidebar or a modal. Both are bigger
  changes than the problem needs, and a modal would put the add form behind a
  click it isn't behind today.
- **The columns are a layout concern, not a component one.** Prefer wrapping
  the two existing children in `App.tsx:54–69` with layout elements over
  pushing layout props into `ApplicationForm` or `ApplicationList`.
- **Widening `main` affects the detail form too** — it now renders inside the
  narrower list column rather than the full 720px. Check the expanded row at
  the new column width; the fields are `flex-direction: column` already
  (`App.css:8`) so this should be a check, not a change.
- **Relabelling is two string edits** plus the tests that assert on them.
  Keep the labels literal about scope: "Remove file", "Delete application".
- Rejected for now: a confirm step on "Delete application". Clear labelling
  is the cheap fix; a confirm dialog is its own brief.
- The empty-list case (`ApplicationList.tsx:24`, `No applications yet.`)
  moves into the right column — check it doesn't look stranded.

## Out of scope

- Any change to what the form submits, validates, or does on submit.
- Delete/Remove behaviour: both still fire immediately, no confirmation, no
  undo.
- Button styling, colours, or a destructive-action variant — `edit-form-layout`
  settled the button family and this brief only changes two labels.
- Search, sort, filter, or pagination on the list.
- A design system or tokens beyond the set in `index.css`.

## Open questions

- The exact breakpoint, and the column split. A judgement call for the plan;
  the constraint is item 2, not a specific number.
- Whether `h1` spans both columns or sits above the grid. Almost certainly
  above; not worth a decision here.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/side-by-side-layout.plan.md` before
writing any code.
