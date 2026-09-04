---
slug: deadline-and-sorting
date: 2026-09-04
---

# Deadline date, record timestamps, and a sortable applications list

## Problem

An application has a `dateApplied` but no deadline, so the one date that
actually drives what to do next — when the posting closes — lives nowhere.
Nor is there any record of when a row was created or last touched. And the
list renders in whatever order the API returns, which means neither "what's
due soonest", "what did I add last", nor "what's still a draft" can be read
off the screen. These belong together: dates you can't sort by answer half
the question, and a sort control is worth building once against the full set
of dates rather than three times.

## What done looks like

1. `applications` carries `deadline`, `created_at` and `updated_at` columns,
   and `Application` carries `deadline`, `createdAt` and `updatedAt` on both
   the client and server copies of the types.
2. `ApplicationInput` carries `deadline` only. The two timestamps are
   server-set and are not accepted from the client on POST or PUT — sending
   them changes nothing.
3. The deadline is optional — blank is a valid value for any status,
   including non-draft. `validateInput` accepts it missing or empty and
   rejects a non-string.
4. Existing databases gain all three columns without losing rows, guarded by
   a `table_info` check the way `migrateApplicationsToUser` is, with
   timestamps backfilled to a real value rather than left blank.
5. Creating an application sets `createdAt` and `updatedAt` to the same
   instant. Updating one moves `updatedAt` and leaves `createdAt` alone.
6. A PUT whose fields are all identical to what's stored leaves `updatedAt`
   where it is.
7. Uploading an attachment, or removing one, moves the parent application's
   `updatedAt`. Downloading one does not.
8. The add form and the edit form each have an `<input type="date">`
   deadline field with a visible label, alongside the existing applied-date
   field. Neither form has an input for either timestamp.
9. A deadline set in either form round-trips: POST/PUT persist it, GET
   returns it.
10. The detail view shows the deadline, the created timestamp and the updated
    timestamp.
11. Each list row shows the deadline alongside company, role and status — and
    reads sensibly when there isn't one. The timestamps stay off the row.
12. Above the list: a `<select>` choosing the sort field — status, applied
    date, deadline, created, updated — and a button toggling
    ascending/descending. Both have accessible names.
13. The list sorts by created date, newest first, on first render.
14. Sorting by status follows the pipeline order in `STATUSES`, not
    alphabetical.
15. Applications with no deadline sort last, in both directions.
16. `npm test` passes, with tests covering the sort comparator for every
    field in both directions, blank-deadline placement, the default sort,
    that POST sets both timestamps equal, that PUT moves only `updatedAt`,
    that a no-op PUT moves neither, that attachment upload and removal move
    the parent's `updatedAt`, and that client-supplied timestamps are
    ignored.

## Approach

`deadline TEXT NOT NULL DEFAULT ''` in the schema, matching how `link` and
`notes` model "optional" — empty string rather than nullable, so nothing
downstream has to handle `null`. `created_at` and `updated_at` are
`TEXT NOT NULL` holding `datetime('now')` output (UTC, second resolution),
the format `users.created_at` already uses.

The timestamps are written explicitly by the route or model rather than by a
SQL `DEFAULT (datetime('now'))` clause. Two reasons: `updated_at` needs
setting on update anyway, so a default only covers half the job; and SQLite
forbids a non-constant default in `ALTER TABLE ... ADD COLUMN`, so a
defaulted schema and a migrated database would end up with different column
definitions for the same table. Writing the value in code keeps the two paths
identical and makes the behaviour testable without a clock stub.

Migration is a guarded `ALTER TABLE ... ADD COLUMN` per column, then an
`UPDATE` backfilling both timestamps on existing rows to the migration's own
instant — legacy rows have no better answer available, and leaving them blank
would sort them somewhere arbitrary.  A table rebuild isn't needed here;
`migrateApplicationsToUser` only did one because it was adding a foreign key.

`updatedAt` means "this application changed", not "these columns changed", so
attachments move it too: an upload or a removal touches the parent row, a
download doesn't. Both handlers already hold the application id — the upload
from the route param, the removal from the row `findOwnedAttachment` returns
— so it's one statement each rather than new plumbing. That makes three call
sites writing the same timestamp, which is what `server/lib/` is for: a
`touchApplication(db, id)` helper both routers import, since CLAUDE.md rules
out one router importing another.

The no-op rule in item 6 compares the validated input against the stored row
field by field and skips the timestamp write when they match. It applies to
the application's own fields only — an attachment change is never a no-op.

Sorting is client-side, in `ApplicationsView` where the applications state
already lives — the full list is fetched already, so a sort query parameter
would add a round trip and a server-side ordering to keep in step with the
client's for no gain at this scale. Sort field and direction are two pieces of
local state feeding one comparator.

Status sorts by index into the `STATUSES` array. Alphabetical order on those
six values is meaningless ("applied, draft, interview, offer, rejected,
screening"); the array is already in pipeline order and is already the single
source of truth for the set.

Rejected: converting the list to a `<table>` with sortable column headers.
`aria-sort` on `<th>` is the better sorting affordance, but each row expands
into a full `ApplicationDetail` form, which in a table means a second `<tr>`
with a `colSpan` cell per application — a component restructure riding along
on a feature diff. If the rows get cramped once the deadline lands on them,
that's its own brief.

## Out of scope

- Converting the list to a table (above).
- Overdue/past-due highlighting or any date-relative styling.
- Filtering, searching, or multi-column sort.
- Persisting the chosen sort across reloads.
- Sorting by company, role, or any field other than the five named.
- Editing either timestamp by hand, or exposing them to the API as input.
- Relative time display ("3 days ago") — the stored format is what's shown.
- An audit trail of what changed; `updatedAt` records only that something did.
- Reminders or notifications off the back of a deadline.

## Open questions

- How the timestamps are formatted in the detail view — raw stored string, or
  date only.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/deadline-and-sorting.plan.md` before
writing any code.
