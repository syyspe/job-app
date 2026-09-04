---
brief: none — skipped by agreement (focused test file, no open design questions)
branch: attachment-list-tests
date: 2026-09-04
---

# AttachmentList tests — Plan

`src/components/AttachmentList.tsx` is the one component with no test beside
it. The remove path (`onRemove(attachment.id)`) and the upload handler's
input reset (`event.target.value = ''`) are both untested, so a regression in
either lands silently. Removing an attachment is untested end-to-end too:
`e2e/applications.spec.ts` attaches a file and then deletes the whole
application, so the "Remove file" button is never clicked at any level.

## Affected files

- `src/components/AttachmentList.test.tsx` — new; the unit tests below.
- `e2e/applications.spec.ts` — two lines added to the existing spec, covering
  the remove click it currently skips.

No production code changes.

## Work order

1. Add `src/components/AttachmentList.test.tsx`, matching the style of the
   three sibling tests: import `test`/`expect`/`vi` from `vitest`, render with
   Testing Library, query by accessible role/name, stub the callbacks with
   `vi.fn()`.
2. Define a module-level `attachments: Attachment[]` fixture with two entries
   (distinct `id` and `originalName`), mirroring the fixture style in
   `ApplicationList.test.tsx`.
3. Write the five tests listed below.
4. In `e2e/applications.spec.ts`, between the `resume.txt` link assertion
   (line 32) and the `Delete application` click, click the detail panel's
   "Remove file" button and assert the link is gone
   (`await expect(detail.getByRole('link', { name: 'resume.txt' }))
   .not.toBeVisible()`). Then attach a second file, so the delete step still
   runs against a row that has an attachment — the same path it exercises
   today, including the server's cascade unlink.
5. Run both verification commands; commit.

## Tests

New, in `src/components/AttachmentList.test.tsx`:

- **renders a link for each attachment** — both `originalName` values appear
  as links (`getByRole('link', { name: ... })`), guarding the list rendering
  the remove buttons hang off.
- **removing an attachment reports its id** — click the second row's "Remove
  file" button; `onRemove` was called with that row's `id`, not the first
  row's. Both rows have identically named buttons, so reach the right one
  through its row: `within(screen.getByRole('listitem', { name: ... }))` or
  index into `getAllByRole('button', { name: 'Remove file' })` — whichever
  reads cleaner against the real DOM.
- **choosing a file reports the file** — `user.upload` the file onto the
  "Attach a file" input; `onUpload` was called once with that `File`.
- **the input is cleared after an upload** — after the same `user.upload`, the
  input's `value` is `''`, so re-picking the same file fires `change` again.
  This is the assertion that pins `event.target.value = ''`; without it the
  line can be deleted with every other test still green.
- **a change with no file reports nothing** — the `if (file)` guard holds and
  `onUpload` was not called. Without it the guard can be dropped with every
  other test still green, and `undefined` reaches the FormData in
  `uploadAttachment`. `user.upload(input, [])` fires no `change` event at all,
  so this one test uses `fireEvent.change(input, { target: { files: [] } })`
  — the only way to reach the guard.

The file input is `visually-hidden` but labelled "Attach a file", so
`getByLabelText('Attach a file')` is the accessible handle — no test id
needed.

Updated, in `e2e/applications.spec.ts`:

- **add, edit, attach a file, and delete an application** — gains a "Remove
  file" click and a not-visible assertion on the link, then a second attach,
  between the first attach and the delete. This is the end-to-end counterpart
  to the unit test above: it proves the click reaches the API and the row
  re-renders without the attachment, which a `vi.fn()` callback can't show.
  The second attach keeps the delete running against a row that still has an
  attachment, so the server's cascade unlink stays covered at browser level.

Verification commands: `npm test` — expect `Test Files N passed / Tests N
passed` with no `failed` line. Then `npm run test:e2e` — expect `N passed`.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
