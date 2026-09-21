---
slug: archive-applications
date: 2026-09-21
---

# Archiving applications

## Problem

Every application ever tracked stays in the list forever. Closed-out ones —
rejected, withdrawn, gone quiet — pile up and crowd out the handful that are
actually live, and deleting them is the only way to clear them, which throws
away the history. There needs to be a way to put an application aside without
losing it.

## What done looks like

1. An application can be marked archived, and an archived one can be
   unarchived, from a button on its row in the list.
2. Archived applications are hidden from the list by default.
3. A "Show archived" checkbox in the sort bar reveals them, mixed into the
   same list and visually distinguishable from the active ones.
4. The checkbox starts unchecked on every page load — the setting is not
   remembered across reloads.
5. Archived state survives a restart: it's a column on the application row,
   and existing databases pick it up without manual intervention.
6. Archived state is independent of `status` — archiving a rejected
   application keeps it rejected.

## Approach

A boolean `archived` column on `applications`, defaulting to false, added
through the existing startup-migration mechanism in `server/lib/migrations.ts`
so existing databases upgrade themselves. It joins `Application` in both
copies of the domain types.

The toggle gets its own endpoint rather than riding the existing update route:
the control is a button on a collapsed row, which has no form state to submit,
and `ApplicationInput` stays the shape the edit form posts.

Filtering is client-side in `ApplicationsView` — the list endpoint keeps
returning everything and the view filters before sorting, the same way sorting
already works. No query parameter on `/api/applications`.

Rejected: making `archived` a seventh `Status` value. `status` is a position
in the pipeline and archiving is orthogonal to it — folding the two together
overwrites the outcome when you archive, leaves nothing to restore on
unarchive, and would put "archived" into the sort-by-status ordering and the
status spine colours.

## Out of scope

- Bulk archive / unarchive.
- An archived-only view, tab, or count badge.
- Auto-archiving on any status change or after any period of inactivity.
- Remembering the checkbox across reloads.

## Open questions

- Does the empty state need a variant for "everything you have is archived",
  or is the existing "Nothing tracked yet" copy good enough there?

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/archive-applications.plan.md` before
writing any code.
