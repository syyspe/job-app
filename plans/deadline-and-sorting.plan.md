---
brief: brief/deadline-and-sorting.md
branch: deadline-and-sorting
date: 2026-09-04
---

# Deadline date, record timestamps, and a sortable applications list — Plan

## Context

An application row has `dateApplied` but no deadline, no record of when it was
created or last touched, and the list renders in raw API order. So "what's due
soonest", "what did I add last" and "what's still a draft" can't be read off
the screen. `brief/deadline-and-sorting.md` has the full reasoning; this plan
is the work order for it.

Three decisions the brief left open, settled here:

- **Timestamp display**: the raw stored string (`2026-09-04 12:34:56`). No
  formatting helper, no locale dependence in tests.
- **Blank deadline in a list row**: rendered as nothing at all — the ` · due …`
  suffix is simply absent.
- **Migration hook**: the new migration runs from the `npm run seed` CLI,
  beside `migrateApplicationsToUser`, which is the only migration hook this
  repo has. Server boot still only calls `openDatabase`.

## Design decisions worth knowing before you start

- **Column definitions are identical in the fresh schema and the migration.**
  All three columns are `TEXT NOT NULL DEFAULT ''` in `db/index.ts` *and* in
  the `ALTER TABLE`s, so a fresh and a migrated database have the same table.
  The `''` default is never relied on for the timestamps — every INSERT writes
  `datetime('now')` explicitly, which is what the brief asks for.
- **The timestamp source is SQL `datetime('now')`, not JS.** A single
  statement's `datetime('now')` evaluates once, so
  `VALUES (…, datetime('now'), datetime('now'))` gives `created_at` and
  `updated_at` the same instant by construction (brief item 5).
- **Second resolution means tests must not race the clock.** Route tests hold
  the `Database` handle, so a test that needs to observe a timestamp move
  backdates the row first (`UPDATE applications SET created_at = …,
  updated_at = '2020-01-01 00:00:00' WHERE id = ?`) and then asserts the value
  changed / didn't. Never `sleep`, never compare two `datetime('now')` values
  taken in the same second.
- **`touchApplication(db, id)` is deliberately not user-scoped.** Every call
  site has already proven ownership: `updateHandler` via the row it just
  fetched with `AND user_id = ?`, upload via `checkApplicationExists`, removal
  via `findOwnedAttachment`. Say so in a one-line comment on the helper, the
  way `unlinkIfExists` documents its own assumption.
- **Sorting is client-side.** `ApplicationsView` already holds the full list;
  the comparator is a pure function in `src/lib/` so it can be unit-tested
  without rendering.

## Affected files

Server:

- `server/db/index.ts` — three columns on `applications`: `deadline`,
  `created_at`, `updated_at`, each `TEXT NOT NULL DEFAULT ''`.
- `server/types.ts` — `Application` gains `deadline`, `createdAt`, `updatedAt`.
- `server/models/application.ts` — `ApplicationRow` gains the three columns,
  `toApplication` maps them, plus a new `matchesInput(row, input)` used by the
  no-op PUT rule.
- `server/lib/validation.ts` — `ApplicationInput` gains `deadline`;
  `validateInput` accepts it missing/empty and rejects a non-string.
- `server/lib/applications.ts` — **new**: `touchApplication(db, id)`.
- `server/lib/seed.ts` — **new** `migrateApplicationDates(db)`, guarded by the
  same `table_info` check `migrateApplicationsToUser` uses.
- `server/seed.ts` — call it.
- `server/routes/applications.ts` — INSERT writes both timestamps; UPDATE
  writes `deadline` and touches `updated_at` only when something changed.
- `server/routes/attachments.ts` — upload and removal call `touchApplication`;
  download does not.

Client:

- `src/types.ts` — mirror `server/types.ts`; `ApplicationInput` gains
  `deadline`.
- `src/lib/sorting.ts` — **new**: `SORT_FIELDS`, `SortField`, `Sort`,
  `sortApplications`.
- `src/components/ApplicationSort.tsx` — **new**: the `<select>` + direction
  button.
- `src/components/ApplicationsView.tsx` — holds `sort` state, renders
  `ApplicationSort` above `ApplicationList`, passes the sorted array down.
- `src/components/ApplicationForm.tsx` — a `Deadline` date field;
  `emptyInput` gains `deadline: ''`.
- `src/components/ApplicationDetail.tsx` — `toInput` gains `deadline`; renders
  the two timestamps read-only.
- `src/components/ApplicationList.tsx` — row gains ` · due <deadline>` when
  there is one.
- `src/App.css` — a `.sort-bar` rule and a `.timestamps` rule.

## Work order

Red-green-refactor throughout (`simple-code`): the failing test first, then the
smallest code that passes it.

1. **Schema and types.** Add the three columns to `SCHEMA` in
   `server/db/index.ts`. Add `deadline: string`, `createdAt: string`,
   `updatedAt: string` to `Application` in `server/types.ts` and in
   `src/types.ts`; add `deadline: string` to `ApplicationInput` in
   `src/types.ts`. Extend `ApplicationRow` and `toApplication` in
   `server/models/application.ts`. This breaks every `Application` fixture in
   the test files — fix them as you go, that's expected.

2. **Validation.** In `server/lib/validation.ts`, add `deadline: string` to
   `ApplicationInput` and to `validateInput`:

   ```ts
   const deadline = b.deadline ?? ''
   if (typeof deadline !== 'string') return null
   ```

   `validateInput` is already at the edge of `simple-code`'s complexity limit
   with six inline `typeof … ? … : ''` ternaries. Before adding the seventh
   field, extract them:

   ```ts
   function text(value: unknown): string {
     return typeof value === 'string' ? value : ''
   }
   ```

   and use it for the six existing fields. This is the one refactor in the
   plan; don't take on any others.

3. **`touchApplication`.** New `server/lib/applications.ts`, named export,
   explicit return type, `.ts` on relative imports, matching `files.ts`'s
   shape:

   ```ts
   /** Callers have already checked the application belongs to the session user. */
   export function touchApplication(db: Database.Database, id: number): void {
     db.prepare("UPDATE applications SET updated_at = datetime('now') WHERE id = ?").run(id)
   }
   ```

4. **POST sets both timestamps.** `createHandler` writes `deadline` in the
   column list and appends `created_at, updated_at` with
   `VALUES (…, datetime('now'), datetime('now'))`.

5. **PUT: deadline, and the no-op rule.** Add `matchesInput(row, input)` to
   `server/models/application.ts` — a flat `&&` chain over the seven input
   fields. Restructure `updateHandler` to:
   - `SELECT * FROM applications WHERE id = ? AND user_id = ?`; 404 when
     missing (this replaces the `result.changes === 0` check),
   - `UPDATE … SET company = ?, role = ?, date_applied = ?, deadline = ?,
     status = ?, link = ?, notes = ? WHERE id = ? AND user_id = ?`,
   - `if (!matchesInput(existing, input)) touchApplication(db, id)`,
   - re-select the row and respond as it does now.

   Keep `updateHandler` under 40 lines; if it doesn't fit, the SELECT belongs
   in a small module-private helper, not a comment.

6. **Attachments touch the parent.** `uploadHandler` calls
   `touchApplication(db, applicationId)` after the INSERT; `removeHandler`
   calls `touchApplication(db, row.application_id)` after the DELETE.
   `downloadHandler` is untouched.

7. **Migration.** `migrateApplicationDates(db)` in `server/lib/seed.ts`:

   ```ts
   export function migrateApplicationDates(db: Database.Database): void {
     const columns = db.pragma('table_info(applications)') as { name: string }[]
     if (columns.some((column) => column.name === 'deadline')) return

     db.exec(`
       ALTER TABLE applications ADD COLUMN deadline TEXT NOT NULL DEFAULT '';
       ALTER TABLE applications ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
       ALTER TABLE applications ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
       UPDATE applications
          SET created_at = datetime('now'), updated_at = datetime('now');
     `)
   }
   ```

   One guard covers all three because they are always added together. No table
   rebuild — no foreign key is changing. Call it from `server/seed.ts` after
   `migrateApplicationsToUser(db, userId)`.

8. **The comparator.** New `src/lib/sorting.ts`:

   ```ts
   export const SORT_FIELDS = ['status', 'dateApplied', 'deadline', 'createdAt', 'updatedAt'] as const
   export type SortField = (typeof SORT_FIELDS)[number]
   export interface Sort { field: SortField; direction: 'asc' | 'desc' }
   export function sortApplications(applications: Application[], sort: Sort): Application[]
   ```

   - Returns a new array (`[...applications].sort(…)`) — never sorts in place.
   - `status` compares `STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)`
     (pipeline order, brief item 14). Every other field is a plain string
     compare, which is correct for `YYYY-MM-DD` and for
     `YYYY-MM-DD HH:MM:SS`.
   - A blank `deadline` sorts last in *both* directions: when the field is
     `deadline`, decide on blankness before applying the direction factor. Only
     `deadline` gets this rule — leave `dateApplied` alone.
   - `Array.prototype.sort` is stable, so ties keep server order.

9. **The sort control.** New `src/components/ApplicationSort.tsx`, props
   `{ sort, onChange }`:
   - `<label>Sort by<select>…</select></label>`, one `<option>` per entry in
     `SORT_FIELDS` with readable text: Status, Date applied, Deadline, Created,
     Updated.
   - `<button type="button">` whose text is the *current* direction —
     `Ascending` or `Descending` — and which flips it on click. That text is
     the accessible name, so a test reads
     `getByRole('button', { name: 'Descending' })` before the click and
     `'Ascending'` after.
   - Wrap both in `<div className="sort-bar">`.

10. **Wire it into the view.** In `ApplicationsView`, add
    `const [sort, setSort] = useState<Sort>({ field: 'createdAt', direction: 'desc' })`
    — that default is brief item 13. Render

    ```tsx
    <div>
      <ApplicationSort sort={sort} onChange={setSort} />
      <ApplicationList applications={sortApplications(applications, sort)} … />
    </div>
    ```

    The wrapping `<div>` matters: `.layout` is a two-column grid at ≥900px, and
    a third direct child would break the layout. Sort state lives here, not in
    `useApplications` — the hook owns server data, this is view state.

11. **Forms.** In `ApplicationForm`, add `deadline: ''` to `emptyInput` and a
    field directly after the applied-date one, using the existing `TextField`
    (no side effect, unlike the applied date):
    `<TextField label="Deadline" type="date" value={input.deadline}
    onChange={(value) => setInput({ ...input, deadline: value })} />` — not
    `required`, for any status (brief item 3). One component serves both the
    add and the edit form, so this covers brief item 8 once. Add `deadline` to
    `toInput` in `ApplicationDetail`.

12. **Detail timestamps.** In `ApplicationDetail`, render the two stored
    strings read-only inside the form's `children` slot, above
    `<AttachmentList>`:

    ```tsx
    <p className="timestamps">
      Created {application.createdAt} · Updated {application.updatedAt}
    </p>
    ```

    No input for either (brief item 8); they aren't in `ApplicationInput`, so
    there's nothing to submit.

13. **List row.** Append ` · due {deadline}` to the row button's text when
    `application.deadline` is non-empty, and nothing when it's empty. The row
    text is the button's accessible name, so existing
    `getByRole('button', { name: /Acme/ })` queries keep working.

14. **CSS.** `src/App.css`: `.sort-bar { display: flex; gap: 8px;
    align-items: center; margin-bottom: 12px; }` plus a select style — the
    existing `form input, form select` rule is scoped to `form` and won't reach
    this control. A small muted `.timestamps` rule. Lowercase-hyphenated names,
    no BEM, matching the file.

## Tests

Written first, per step. All unit/component tests sit beside their code.

House style to follow exactly: flat `test('lowercase sentence', …)` calls — the
repo has **no** `describe` blocks anywhere; `test`/`expect`/`vi` imported from
`vitest` explicitly (globals are off); server tests start with the
`// @vitest-environment node` pragma; queries by accessible role/name, except a
date input, which has no role — those use `getByLabelText` + `fireEvent.change`
(see the existing `'Date applied'` tests). Server route tests boot the real app
on `app.listen(0)` and drive it with `fetch` plus the `loginAs` cookie — there
is no supertest and no `vi.mock` of `src/lib/api`; component tests stub the
global with `vi.stubGlobal('fetch', …)` and `vi.unstubAllGlobals()` in
`afterEach`.

New — `src/lib/sorting.test.ts` (pure function, no fixtures beyond a
module-level `Application[]`):

- Each of the five fields sorts ascending, and descending, over a fixture of
  three applications (brief item 16: every field, both directions).
- `status` follows `STATUSES` order, not alphabetical — a fixture where the two
  differ (e.g. `draft` vs `applied`) proves it.
- Blank deadlines sort last ascending *and* descending.
- The input array is not mutated.

New — `src/components/ApplicationSort.test.tsx`:

- The select and the button both have accessible names
  (`getByRole('combobox', { name: 'Sort by' })`,
  `getByRole('button', { name: 'Descending' })`); choosing a field and clicking
  the button each call `onChange` with the expected `Sort`.

Updated — `server/routes/applications.test.ts`:

- POST sets `createdAt` and `updatedAt` to the same value.
- POST/PUT round-trip a `deadline`, and GET returns it.
- A deadline is accepted when missing, when empty, and for a non-draft status;
  a non-string `deadline` is a 400.
- Client-supplied `createdAt`/`updatedAt` in the POST body are ignored — the
  response carries real timestamps, not the sent ones. Same for PUT.
- PUT with a changed field moves `updatedAt` and leaves `createdAt` — backdate
  the row first (see "Design decisions"). The test file already reopens the db
  file mid-test (`openDatabase(join(root, 'app.db'))`) in the ownership test;
  reuse that to run the backdating `UPDATE`.
- PUT with every field identical to the stored row moves neither.
- The existing `'create, list, update, delete round trip'` and the two
  validation tests need `deadline` added to their bodies (or deliberately
  omitted, in the "accepts a missing deadline" case).

Updated — `server/routes/attachments.test.ts`:

- Uploading an attachment moves the parent application's `updatedAt`
  (backdate, upload, re-read via `GET /api/applications`).
- Removing one does the same.
- Downloading one does not.

Updated — `server/lib/seed.test.ts`:

- Against the hand-built legacy schema in its `beforeEach` (which has no
  `deadline` column and no timestamps), `migrateApplicationDates` adds the
  three columns and keeps the existing row, with both timestamps backfilled to
  a non-empty value.
- Running it twice is a no-op the second time (mirrors the existing
  `'migrating twice is a no-op the second time'`).

Updated — fixtures, to keep typechecking: the module-level `Application`
literals in `src/components/ApplicationList.test.tsx`,
`ApplicationsView.test.tsx`, `ApplicationDetail.test.tsx`,
`ApplicationForm.test.tsx` and `src/App.test.tsx` gain the three new fields
(and `deadline` on any `ApplicationInput` literal). Note
`ApplicationForm.test.tsx`'s `expect(onSubmit).toHaveBeenCalledWith({…})`
asserts the *whole* input object — it fails until `deadline` is added to the
expectation.

Updated — behaviour the brief names, in the component tests:

- `ApplicationList.test.tsx` — the row shows ` · due <date>` when there is a
  deadline, and the row's accessible name contains no "due" text when there
  isn't. Its two-application fixture (Acme/Globex) is the ready-made pair.
- `ApplicationForm.test.tsx` — a labelled `Deadline` date input exists,
  `fireEvent.change` on it flows into the submitted input, and it isn't
  required for a non-draft status.
- `ApplicationDetail.test.tsx` — both timestamps are rendered, and there is no
  input for either.
- `ApplicationsView.test.tsx` — with a stubbed list response in a deliberately
  wrong order, the rows render newest-`createdAt` first on mount (brief item
  13). Assert order with the existing idiom:
  `screen.getAllByRole('button').map((button) => button.textContent)`.

Verification command: `npm test` — must end `Test Files N passed / Tests N
passed` with no `failed` line. Also run `npm run build` (the type changes touch
both copies of the domain types) and `npm run lint`.

End-to-end: `npm run test:e2e` should still pass untouched — the new form field
is optional and the row text only grows when a deadline exists. If a spec does
break, fix the spec, don't weaken the feature.

## Risks / rollback

- **Existing databases.** `openDatabase` runs `CREATE TABLE IF NOT EXISTS`
  only, so a database created before this change gains the columns solely by
  running `npm run seed`. Until then every `/api/applications` query fails on
  the missing column. That's the pre-existing shape of migrations here (the
  same is true of `user_id`), and CLAUDE.md already tells the user to run
  `npm run seed` against a pre-auth database — but say it in the PR
  description.
- Everything else is additive and reverts with the branch.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
