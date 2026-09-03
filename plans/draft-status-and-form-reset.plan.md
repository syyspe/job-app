---
brief: brief/draft-status-and-form-reset.md
branch: draft-status-and-form-reset
date: 2026-09-03
---

# Draft status, and clearing the add form after a submit — Plan

## Context

Two problems with adding applications, from `brief/draft-status-and-form-reset.md`:

- `ApplicationForm` keeps every typed value after a submit, so the next
  application starts from the last one's values and a forgotten field creeps
  in silently.
- There is no status for an application you are drafting but have not sent,
  so a half-written one has to be recorded as `applied` — which is wrong and
  makes "how many have I actually sent" unanswerable.

They land together because a not-yet-sent application is exactly what a
freshly-cleared add form describes. Outcome: `draft` is a real status that
tolerates an empty date, and the add form resets to an empty draft after each
submit while the edit form keeps showing what was just saved.

## Affected files

- `src/types.ts` — add `'draft'` as the first entry of `STATUSES`.
- `server/types.ts` — the same edit; the two lists are duplicated by hand and
  both are read (form dropdown vs. `validateInput`). Missing this one makes
  every draft submit 400.
- `src/ApplicationForm.tsx` — `emptyInput.status` → `'draft'`; clear on submit
  for the add case; date `required` conditional on status; date-sets-status.
- `server/applications.ts` — `validateInput` (line 62) makes the date
  mandatory only for non-draft statuses.
- `src/ApplicationForm.test.tsx`, `server/applications.test.ts` — new tests.
- `e2e/applications.spec.ts` — one added assertion that the add form clears.

No database migration: `status` and `date_applied` are plain `TEXT NOT NULL`
with no CHECK constraint (`server/db.ts:11-19`), and a dateless draft stores
`''`, not `NULL`. Existing rows are untouched.

## Work order

Red-Green-Refactor per `simple-code`: each step's test first, then the change.

1. **`draft` in both status lists.** Add `'draft'` ahead of `'applied'` in
   `STATUSES` in `src/types.ts` and `server/types.ts`. It leads the list so it
   also leads the form's dropdown.

2. **Server: date required only when not a draft.** In `validateInput`, split
   the current `if (!company || !role || !dateApplied) return null` into:

   ```ts
   if (!company || !role) return null
   if (!STATUSES.includes(status as (typeof STATUSES)[number])) return null
   if (status !== 'draft' && !dateApplied) return null
   ```

   Status validity is checked before the date rule so an unknown status still
   400s rather than reaching the date branch.

3. **Add form starts as an empty draft.** `emptyInput.status` → `'draft'` in
   `src/ApplicationForm.tsx`. One constant serves both the initial state and
   the post-submit reset.

4. **Date input required only when not a draft.**
   `required={input.status !== 'draft'}` on the date `<input>` (line 89-94).

5. **Setting a date on a draft switches it to `applied`.** In
   `handleDateChange`, only when the current status is `draft` *and* the new
   value is non-empty — clearing a date must not flip anything, and an
   application already at `interview` must keep its status when its date is
   corrected (the same component is the edit form):

   ```ts
   function handleDateChange(event: ChangeEvent<HTMLInputElement>) {
     const dateApplied = event.target.value
     const applyingDraft = input.status === 'draft' && dateApplied !== ''
     setInput({
       ...input,
       dateApplied,
       status: applyingDraft ? 'applied' : input.status,
     })
   }
   ```

6. **Clear the add form on submit.** In `handleSubmit`, after `onSubmit(input)`:

   ```ts
   if (!initial) setInput(emptyInput)
   ```

   `initial` is absent only for the add form (`App.tsx:56`); the edit form
   always passes it (`ApplicationDetail.tsx:33-37`), so save leaves the values
   on screen. The reset fires at submit time, not on API success —
   `onSubmit` is `=> void` and there is no failure signal today, so a failed
   create loses the typed values. Known and accepted in the brief; error
   handling is separate work.

## Tests

- New in `src/ApplicationForm.test.tsx`:
  - the add form clears after submit — fill every field, submit, then assert
    Company/Role/Link/Notes are empty, `getByLabelText('Date applied')` has
    value `''`, and the Status combobox reads `draft`.
  - the edit form keeps its values after save — render with an `initial`,
    click Save, assert the fields still hold the saved values.
  - setting a date on a draft switches the status to `applied`.
  - changing the date on a non-draft leaves the status alone — render with
    `initial` at `interview`, change the date, assert still `interview`.
  - the date input is not required while the status is `draft`, and is
    required once it is not (`.not.toBeRequired()` / `.toBeRequired()`;
    jest-dom is already wired in `src/setupTests.ts`).
- New in `server/applications.test.ts`:
  - POST with `status: 'draft'` and `dateApplied: ''` → 201, and the returned
    application has `dateApplied: ''`.
  - POST with `status: 'applied'` and `dateApplied: ''` → 400.
- Updated: none expected. The existing form test sets the date *before*
  selecting `interview`, so the new auto-switch is overwritten by the explicit
  selection and its assertion still holds.
- Updated `e2e/applications.spec.ts`: after clicking "Add application", assert
  the Company textbox is empty. The spec fills a date before submitting, so
  the row still lands on `applied` and the rest of the spec is unaffected.
- Verification command: `npm test` (expect `Test Files N passed / Tests N
  passed`, no `failed` line). Also `npm run lint`, and `npm run test:e2e`
  (expect `N passed`) since the e2e spec changes.

## Manual check

`npm run dev` + `npm run dev:server` (needs `.env`): add an application with
no date while the status is `draft` — it saves and appears in the list, and
the form comes back empty on `draft`. Then set a date on a fresh form and
watch the status flip to `applied`; open an existing `interview` row, correct
its date, and confirm the status stays `interview`.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
