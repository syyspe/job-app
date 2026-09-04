---
slug: deadline-and-sorting
date: 2026-09-04
---

# Deadline date and a sortable applications list

## Problem

An application has a `dateApplied` but no deadline, so the one date that
actually drives what to do next — when the posting closes — lives nowhere.
And the list renders in whatever order the API returns, which means neither
"what's due soonest" nor "what's still a draft" can be read off the screen.
The two are worth doing together: a deadline you can't sort by answers half
the question.

## What done looks like

1. `applications` carries a `deadline` column, and `Application` /
   `ApplicationInput` carry a `deadline` field, on both the client and
   server copies of the types.
2. The deadline is optional — blank is a valid value for any status,
   including non-draft. `validateInput` accepts it missing or empty and
   rejects a non-string.
3. Existing databases gain the column without losing rows, guarded by a
   `table_info` check the way `migrateApplicationsToUser` is.
4. The add form and the edit form each have a `<input type="date">`
   deadline field with a visible label, alongside the existing applied-date
   field.
5. A deadline set in either form round-trips: POST/PUT persist it, GET
   returns it, and the detail view shows it.
6. Each list row shows the deadline alongside company, role and status —
   and reads sensibly when there isn't one.
7. Above the list: a `<select>` choosing the sort field (status, applied
   date, deadline) and a button toggling ascending/descending. Both have
   accessible names.
8. Sorting by status follows the pipeline order in `STATUSES`, not
   alphabetical.
9. Applications with no deadline sort last, in both directions.
10. `npm test` passes, with tests covering the sort comparator for all
    three fields in both directions, blank-deadline placement, and the
    validation change.

## Approach

`deadline TEXT NOT NULL DEFAULT ''` in the schema, matching how `link` and
`notes` model "optional" — empty string rather than nullable, so nothing
downstream has to handle `null`. The migration is a guarded
`ALTER TABLE ... ADD COLUMN`, which is enough here because the column is
appended with a default; the table rebuild `migrateApplicationsToUser` does
was only needed for adding a foreign key.

Sorting is client-side, in `ApplicationsView` where the applications state
already lives — the full list is fetched already, so a sort query parameter
would add a round trip and a server-side ordering to keep in step with the
client's for no gain at this scale. Sort field and direction are two pieces
of local state feeding one comparator.

Status sorts by index into the `STATUSES` array. Alphabetical order on those
six values is meaningless ("applied, draft, interview, offer, rejected,
screening"); the array is already in pipeline order and is already the
single source of truth for the set.

Rejected: converting the list to a `<table>` with sortable column headers.
`aria-sort` on `<th>` is the better sorting affordance, but each row expands
into a full `ApplicationDetail` form, which in a table means a second
`<tr>` with a `colSpan` cell per application — a component restructure
riding along on a feature diff. If the rows get cramped once the deadline
lands on them, that's its own brief.

## Out of scope

- Converting the list to a table (above).
- Overdue/past-due highlighting or any date-relative styling.
- Filtering, searching, or multi-column sort.
- Persisting the chosen sort across reloads.
- Sorting by company, role, or any field other than the three named.
- Reminders or notifications off the back of a deadline.

## Open questions

- What the sort control defaults to on first render. Keeping the API's
  current order is the smallest change; defaulting to deadline-soonest is
  the more useful one. The plan picks one.
- Whether the detail view needs the deadline rendered separately once it's
  already on the row and in the edit form.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/deadline-and-sorting.plan.md` before
writing any code.
