---
slug: draft-status-and-form-reset
date: 2026-09-03
---

# Draft status, and clearing the add form after a submit

## Problem

Two things about adding applications, one a papercut and one a gap.

The add form (`ApplicationForm` at `App.tsx:56`) keeps whatever you typed
after you submit. Add one application, and its company, role, date, link and
notes are all still sitting in the form. The next one you add starts from the
last one's values, so a field you forget to overwrite creeps into the new
application silently — the form gives no sign anything was carried over.

Separately, there is nowhere to put an application you are working on but
have not sent. The status list starts at `applied`, so the only way to track
a half-written application is to record it as already applied, which is
wrong, and which also makes "how many have I actually sent" unanswerable.
These two are one change because a not-yet-applied application is exactly
what a freshly-cleared form should be describing.

## What done looks like

1. `draft` is a status, listed first in `STATUSES`, ahead of `applied`.
2. Submitting the **add** form clears every field back to empty: company,
   role, date applied, link and notes blank, status back to `draft`.
3. The **edit** form (`ApplicationDetail.tsx:33`, the same component) does
   not clear on save — it keeps showing the values that were just saved.
4. "Date applied" may be left empty while the status is `draft`, in the form
   and at the API.
5. "Date applied" is still mandatory for every other status, in the form and
   at the API — a non-draft application without a date is rejected as it is
   today.
6. Setting a date in the form while the status is `draft` switches the
   status to `applied` automatically.
7. Existing applications are untouched, and the statuses they already hold
   keep working.

## Approach

- `draft` goes into both `STATUSES` lists — `src/types.ts` and
  `server/types.ts` are duplicated by hand today, and both are read: the
  form builds its dropdown from the client list, and `validateInput`
  (`server/applications.ts:73`) rejects anything not in the server list. Miss
  the server one and every draft submit 400s. Not merging the two lists here;
  that is its own change.
- No database migration. `status` is a plain `TEXT NOT NULL` column with no
  CHECK constraint (`server/db.ts:16`), so a new value needs nothing from
  the schema. `date_applied` is likewise `TEXT NOT NULL` and stores `''` for
  a dateless draft rather than `NULL` — keeps the column's shape and needs no
  migration.
- The date requirement becomes conditional on status in both places that
  enforce it today: the `required` attribute on the date input
  (`ApplicationForm.tsx:93`) and the `if (!company || !role || !dateApplied)`
  guard in `validateInput`. The server keeps its own check rather than
  trusting the form.
- Clearing is scoped to the add case. `ApplicationForm` already distinguishes
  the two uses by whether an `initial` prop was passed — the add form passes
  none — so the reset can key off that rather than a new prop. If that reads
  as too implicit when the plan is written, an explicit prop is fine; the
  behaviour is what matters.
- The reset happens as the form submits, not after the API confirms.
  `onSubmit` is typed `=> void` and the app has no error handling anywhere
  today, so there is no success signal to wait for. Noted as a known cost:
  if a create fails, the typed values are gone. Wiring up failure handling is
  a separate piece of work.
- The date-sets-status rule fires **only when the status is currently
  `draft`**. The same component is the edit form for existing rows, so an
  application already at `interview` must not drop back to `applied` because
  its date was corrected.

## Out of scope

- De-duplicating the two `STATUSES` lists into one shared module.
- Error handling for a failed create, and keeping the typed values when one
  fails.
- Filtering, sorting or grouping the list by status; drafts appear in the
  same list as everything else.
- Any status transition beyond the one in item 6 — clearing a date does not
  move a status back to `draft`, and nothing else auto-changes.
- Backfilling or reinterpreting existing rows.

## Open questions

- ~~Whether the auto-switch in item 6 should fire only from `draft` or from
  any status.~~ Settled: draft-only, confirmed after the brief was drafted.
  The edit form shares the component, so correcting the date on a row that
  is already at `interview` must leave its status alone.
- What the date input should do visually when a draft has no date. Nothing
  deliberate is planned; whatever an empty `<input type="date">` renders is
  accepted.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/draft-status-and-form-reset.plan.md`
before writing any code.
