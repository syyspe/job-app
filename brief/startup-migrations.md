---
slug: startup-migrations
date: 2026-09-07
---

# Run schema migrations from openDatabase, not from the seed CLI

## Problem

An existing database silently serves rows with a stale schema, and the
frontend crashes on them.

`migrateApplicationDates` (`server/lib/seed.ts:57`) adds the `deadline`,
`created_at` and `updated_at` columns that `deadline-and-sorting` introduced.
It is only ever called from `server/seed.ts`, the `npm run seed` CLI. A
database that was already seeded before that PR never gets the call: the
columns stay missing, `SELECT * FROM applications` returns rows without them,
`toApplication` maps them to `undefined`, and `sortApplications` dies on
`a[field].localeCompare(b[field])` (`src/lib/sorting.ts:14`) as soon as the
list renders.

This is the live state of the working database (`/projects/tests/job-app.db`,
7 rows, columns `id, user_id, company, role, date_applied, status, link,
notes`) — the app is unusable against it right now.

The migration itself is correct. The bug is that running it is optional, and
nothing about a schema change makes you remember to re-run a CLI whose name
says "seed". Every future column addition has the same failure mode.

## What done looks like

1. `openDatabase` runs the schema DDL and then the migrations, so every
   entry point — `server/index.ts`, `server/seed.ts`, and tests — gets a
   current schema by construction. No caller can forget.
2. A `migrate(db)` function holds the ordered list of migrations to apply.
   It lives in `server/lib/` (not `lib/seed.ts` — migrating is no longer a
   seeding concern), and `server/db/index.ts` calls it.
3. `migrateApplicationDates` moves to that module unchanged, keeping its own
   column-existence guard so re-running is a no-op.
4. `migrateApplicationsToUser` stays in the seed CLI. It needs a user id to
   assign pre-auth rows to, which `openDatabase` has no way to know.
5. `server/seed.ts` no longer calls `migrateApplicationDates` — `openDatabase`
   already did it by the time the CLI has a handle.
6. A test proves the fix at the seam that failed: open a database whose
   `applications` table predates the dates columns, and the rows read back
   through `openDatabase` have `deadline`, `created_at` and `updated_at`.
7. Starting the server against the live database serves all 7 rows with the
   three fields populated, and the applications list renders and sorts
   without the `localeCompare` TypeError.
8. README's "Running the server" / seed section says migrations run
   automatically on open, so the `npm run seed` step is about the seed user
   and pre-auth rows only.

## Approach

- `openDatabase` gains one line: `migrate(db)` after `db.exec(SCHEMA)`, before
  returning. `CREATE TABLE IF NOT EXISTS` handles a fresh database, `migrate`
  handles an existing one, and on a fresh database every migration's guard
  sees its column already present and returns early.
- `migrate` is a plain ordered call list, and each migration keeps the
  self-guarding shape `migrateApplicationDates` already has (return early if
  the column exists). Rejected a `user_version` pragma ledger: it is real
  machinery for a repo with one migration on this path, and the existing
  guards already make the migrations idempotent. It becomes the right answer
  the first time a migration can't self-detect — a data backfill or a rename —
  and not before.
- Migrations move out of `lib/seed.ts` because that file's other two exports
  are about the seed user. Leaving schema migration there is what made it
  look like a seed-time concern in the first place.
- Rejected a client-side guard in `sortApplications` for a missing field. The
  server is the boundary that guarantees the row shape; a fallback there
  would paper over exactly the class of bug this brief exists to remove, and
  `simple-code` rules out defending against states that can't occur once the
  schema is always current.
- Rejected fixing the live database by hand with `npm run seed`. It works, but
  it fixes one database once and leaves the next schema change to fail the
  same way.

## Out of scope

- No migration CLI, no `npm run migrate`, no up/down or rollback support.
- No change to `migrateApplicationsToUser`'s behavior or to the pre-auth
  migration path — it moves nowhere and keeps working as it does.
- No change to `sortApplications` or any client code.
- No backfill of meaningful `created_at` values for the 7 existing rows.
  There is no record of when they were really created; `datetime('now')` at
  migration time is what the existing migration writes and that stands.

## Open questions

None outstanding — the two forks (where migrations run, how they're tracked)
were settled during the brief interview.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/startup-migrations.plan.md` before writing
any code.
