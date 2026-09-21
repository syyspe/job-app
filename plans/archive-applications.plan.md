---
brief: brief/archive-applications.md
branch: archive-applications
date: 2026-09-21
---

# Archiving applications — Plan

## Context

Every application ever tracked stays in the list forever; closed-out ones
crowd out the live handful, and deleting is the only way to clear them, which
throws the history away. This adds an `archived` flag — a boolean column, a
per-row toggle, and a "Show archived" checkbox that reveals hidden rows —
independent of `status`, so archiving a rejected application keeps it
rejected.

Two questions settled during planning:

- **Empty state:** no "everything is archived" variant. `ApplicationList`
  keeps its single "Nothing tracked yet" state, which is what shows when the
  filter hides everything. The checkbox sits directly above it.
- **`updatedAt`:** archiving does **not** touch it. It keeps meaning "when
  the application's details last changed", so filing a row away doesn't
  reshuffle a list sorted by Updated. `touchApplication()` is not called from
  the new endpoint.

## Affected files

**Server**

- `server/db/index.ts` — `archived INTEGER NOT NULL DEFAULT 0` on the
  `applications` CREATE TABLE.
- `server/lib/migrations.ts` — new `migrateApplicationArchived(db)`, same
  shape as `migrateApplicationDates`: read `table_info(applications)`, return
  early if `archived` is already there, else `ALTER TABLE applications ADD
  COLUMN archived INTEGER NOT NULL DEFAULT 0`. Call it from `migrate()`.
- `server/types.ts` — `archived: boolean` on `Application`.
- `server/models/application.ts` — `archived: number` on `ApplicationRow`;
  `toApplication` maps `archived: row.archived === 1`. `matchesInput` is
  **unchanged** — `archived` is not part of `ApplicationInput`.
- `server/routes/applications.ts` — `archiveHandler`, mounted as
  `router.put('/applications/:id/archived', ...)`.

**Client**

- `src/types.ts` — `archived: boolean` on `Application`. `ApplicationInput`
  unchanged, so the edit form can never clear the flag.
- `src/lib/api.ts` — `setArchived(id, archived)`: `PUT` to
  `/api/applications/${id}/archived`, JSON body, returns the updated
  `Application`. Same `credentials: 'same-origin'` + `parseJson` shape as
  `updateApplication`.
- `src/components/ApplicationsView.tsx` — `handleSetArchived` in
  `useApplications`; `showArchived` state in `ApplicationsView`; filter before
  sort in the existing `useMemo`.
- `src/components/ApplicationSort.tsx` — the "Show archived" checkbox, plus
  its two props.
- `src/components/ApplicationList.tsx` — the per-row Archive/Unarchive button
  and `data-archived` on the `<li>`.
- `src/applications.css` — `.row-head`, `.row-archive`, and the archived-row
  rules.

## Design notes the build needs

**The endpoint.** `PUT /api/applications/:id/archived`, body
`{ archived: boolean }`, responding with the full updated `Application`
(attachments included, via the router's existing `attachments` statement) so
the client can reload exactly as it does after a `PUT`. `400` when
`req.body.archived` isn't a boolean, `404` when `findOwnedApplication` comes
back undefined — reuse that helper rather than writing a second ownership
query. No `touchApplication` call.

**booleans in sqlite.** better-sqlite3 has no boolean type: bind
`input.archived ? 1 : 0`, read back with `row.archived === 1`. The column is
`INTEGER NOT NULL DEFAULT 0`, so `createHandler` needs no change — it
re-selects the inserted row and gets `archived: false` for free.

**Filtering** happens in `ApplicationsView`, before sorting, in the same
`useMemo`:

```ts
const visibleApplications = useMemo(() => {
  const visible = showArchived
    ? applications
    : applications.filter((application) => !application.archived)
  return sortApplications(visible, sort)
}, [applications, showArchived, sort])
```

`showArchived` is plain `useState(false)` — nothing persisted, so it is
unchecked on every load, which is requirement 4.

**The row button — the one trap here.** `.row-button` is itself a `<button>`,
so the archive control can't nest inside it. Wrap both in a `<div
className="row-head">` inside the `<li>`, with the detail panel still a
sibling below:

```jsx
<li className="application-item" data-status={application.status}
    data-archived={application.archived}>
  <div className="row-head">
    <button type="button" className="row-button" aria-expanded={expanded} …>…</button>
    <button type="button" className="row-archive" onClick={onToggleArchived}>
      {application.archived ? 'Unarchive' : 'Archive'}
    </button>
  </div>
  {expanded && <ApplicationDetail … />}
</li>
```

Do **not** give that button an `aria-label` carrying the company name.
`e2e/applications.spec.ts` and `ApplicationsView.test.tsx` both find a row
with `getByRole('button', { name: /Acme/ })`; an "Archive Acme" label makes
those queries ambiguous and breaks passing tests. Keep the accessible name
"Archive" / "Unarchive" and scope tests to the containing `listitem`, the way
`e2e/applications.spec.ts` already does with
`page.getByRole('listitem').filter({ has: row })`.

The existing `:has(.row-button …)` rules in `applications.css` keep working —
they're descendant selectors, and the new `<div>` doesn't break them.
`.row-head` is `display: flex; align-items: center; gap: var(--s-3)` with
`.row-button` taking `flex: 1; min-width: 0`.

**Archived styling** reads tokens from `index.css`, inventing no values —
follow the `[data-status='rejected']` precedent (which recedes with a thinner
spine and a muted company name, never opacity): a dashed `--line-strong`
border and the `--canvas` background on
`.application-item[data-archived='true']`. The Archive/Unarchive button text
carries the state for screen readers, so the styling is free to be purely
visual.

## Work order

Red-green-refactor per slice, back to front:

1. **Column and migration.** Schema line in `server/db/index.ts`,
   `migrateApplicationArchived` in `server/lib/migrations.ts` wired into
   `migrate()`, with its two tests.
2. **Domain types and mapper.** `archived` on both `types.ts` copies,
   `ApplicationRow`, and `toApplication`. This turns every `Application`
   fixture in the test suite into a type error — fix them in this step (7
   literals across `src/App.test.tsx`, `src/lib/sorting.test.ts`,
   `src/components/ApplicationList.test.tsx`,
   `src/components/ApplicationsView.test.tsx`) by adding `archived: false`.
3. **The endpoint**, with its route tests.
4. **`setArchived` in `src/lib/api.ts`.**
5. **The row button** in `ApplicationList`, with its tests, plus the CSS.
6. **The checkbox** in `ApplicationSort`, with its tests.
7. **Wire it up** in `ApplicationsView`: `handleSetArchived`, `showArchived`,
   the filter, and the view tests.
8. **The e2e spec.**

## Tests

**New**

- `server/lib/migrations.test.ts` — a legacy database gains `archived`
  defaulting to 0, with existing rows unarchived; migrating twice is a no-op.
  The file's `beforeEach` already builds a pre-`deadline` table and one row,
  so both tests call `migrateApplicationArchived(db)` against it.
- `server/routes/applications.archive.test.ts` — a new file rather than
  growing `applications.test.ts` (~220 lines, and the 300-line limit is
  close), copying the harness from `applications.timestamps.test.ts`:
  - a created application comes back `archived: false`;
  - `PUT …/archived` with `true` then `false` round-trips, and the change
    survives a re-`GET` of the list;
  - archiving does not move `updatedAt` (back-date the row first, the way the
    timestamps test does);
  - archiving leaves `status` untouched (requirement 6);
  - a non-boolean `archived` is a 400; an unknown id is a 404; another user's
    application is a 404.
- `src/components/ApplicationList.test.tsx` — the button reads "Archive" on an
  active row and "Unarchive" on an archived one; clicking it reports the
  opposite of the current flag; the archived row carries `data-archived`.
- `src/components/ApplicationSort.test.tsx` — the checkbox has the accessible
  name "Show archived", reflects the prop, and calls `onChange` with the new
  value.
- `src/components/ApplicationsView.test.tsx` — archived applications are
  hidden on load and the checkbox starts unchecked; ticking it reveals them
  mixed into the same list; unticking hides them again.
- `e2e/archive.spec.ts` — add an application, archive it from its row, it
  leaves the list; tick "Show archived", it's back; unarchive it; untick, and
  it stays.

**Updated**

- The four fixture files in work-order step 2 (`archived: false`).

**Verification command:** `npm test` — the gate. Then `npm run lint` and
`npm run build`, and `npm run test:e2e` for the new spec.

## Risks / rollback

The column is additive with a default, so an existing database upgrades
itself on the next open and a revert leaves a harmless unused column behind.
Nothing here is hard to undo.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
