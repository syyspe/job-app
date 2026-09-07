---
brief: brief/startup-migrations.md
branch: startup-migrations
date: 2026-09-07
---

# Run schema migrations from openDatabase — Plan

## Context

`migrateApplicationDates` (`server/lib/seed.ts:57`) adds the `deadline`,
`created_at` and `updated_at` columns that `deadline-and-sorting` introduced,
but it is only ever called from `server/seed.ts` — the `npm run seed` CLI. A
database seeded before that PR never gets the call, so `SELECT *` returns rows
without those columns, `toApplication` (`server/models/application.ts:19`)
maps them to `undefined`, and `sortApplications` (`src/lib/sorting.ts:14`)
throws a `TypeError` on `a[field].localeCompare(b[field])` as soon as the list
renders.

This is the live working database right now — confirmed: `/projects/tests/job-app.db`
has `id, user_id, company, role, date_applied, status, link, notes`, 7 rows,
1 user. The app is unusable against it.

The migration is correct; running it is optional. Moving migrations into
`openDatabase` makes a current schema a property of opening the database, so
no entry point — `server/index.ts`, `server/seed.ts`, or any test — can skip
it, and every future column addition inherits the same guarantee.

## Approach

`openDatabase` gains one line: `migrate(db)` after `db.exec(SCHEMA)`.
`CREATE TABLE IF NOT EXISTS` covers a fresh database; `migrate` covers an
existing one; on a fresh database each migration's own column guard sees its
column already present and returns early.

`migrate` is a plain ordered call list. No `user_version` ledger — the
existing guards already make each migration idempotent, and a ledger is real
machinery for one migration on this path. It becomes right the first time a
migration can't self-detect (a backfill or a rename), not before.

### The ordering fix

Putting `migrate` in `openDatabase` puts it *before* `migrateApplicationsToUser`,
which stays in the seed CLI (it needs a user id `openDatabase` can't know).
That migration rebuilds `applications` from a hardcoded 8-column DDL
(`server/lib/seed.ts:28`) with no date columns — so on a genuinely pre-auth
database it would drop the three columns `migrate` had just added.

Fix: widen its `applications_new` DDL and `INSERT … SELECT` to the full
current column set, matching `SCHEMA`'s `applications` table exactly. The two
migrations then compose, and a rebuilt table converges on the same defaults a
fresh one gets. Its `user_id` guard, transaction, `foreign_keys` handling and
`foreign_key_check` are untouched.

The precondition this creates — `migrateApplicationsToUser` needs a table that
already has the date columns — is exactly what `openDatabase` now guarantees
for its one real caller, `server/seed.ts`.

## Affected files

- `server/lib/migrations.ts` — **new.** Exports `migrate(db)` (the ordered
  list) and `migrateApplicationDates`, moved verbatim from `lib/seed.ts`.
  Migrating is not a seeding concern; leaving it in `seed.ts` is what made it
  look like one.
- `server/db/index.ts` — `openDatabase` calls `migrate(db)` after
  `db.exec(SCHEMA)`, before returning.
- `server/lib/seed.ts` — `migrateApplicationDates` removed (moved).
  `migrateApplicationsToUser`'s `applications_new` DDL and `INSERT … SELECT`
  widened to carry `deadline`, `created_at`, `updated_at`.
- `server/seed.ts` — drops the `migrateApplicationDates` import and call;
  `openDatabase` already ran it by the time the CLI has a handle.
- `server/lib/migrations.test.ts` — **new.** The two dates tests move here
  from `seed.test.ts`.
- `server/lib/seed.test.ts` — the two dates tests removed (moved). The
  legacy fixture calls `migrate(db)` before `migrateApplicationsToUser`,
  mirroring the real order now that the rebuild copies the date columns.
- `server/db/index.test.ts` — **new.** The seam test.
- `README.md` — "Running the server" notes that migrations run on open, so
  `npm run seed` is about the seed user and pre-auth rows only.

## Work order

1. Create `server/lib/migrations.ts`: move `migrateApplicationDates` across
   unchanged (guard included), and add `export function migrate(db)` whose
   body is the ordered call list — currently one call.
2. `server/db/index.ts`: import `migrate` and call it after `db.exec(SCHEMA)`.
3. Move the two dates tests out of `server/lib/seed.test.ts` into a new
   `server/lib/migrations.test.ts`, importing from `./migrations.ts`. Keep the
   same legacy-table fixture shape.
4. `server/lib/seed.ts`: delete `migrateApplicationDates`; widen
   `migrateApplicationsToUser`'s rebuild to the full current column set —
   `id, user_id, company, role, date_applied, deadline, status, link, notes,
   created_at, updated_at`, with `created_at`/`updated_at` defaulting to
   `(datetime('now'))` as `SCHEMA` has them.
5. `server/lib/seed.test.ts`: call `migrate(db)` in the fixture (or at the top
   of each `migrateApplicationsToUser` test) so the legacy table has the date
   columns the widened rebuild copies. Add an assertion that the rebuilt row
   still carries its `deadline`/`created_at`/`updated_at` — that is the
   regression this step guards.
6. `server/seed.ts`: drop the `migrateApplicationDates` import and call.
7. Add `server/db/index.test.ts` — the seam test (below).
8. Update README's "Running the server" seed paragraph.
9. `npm run lint`, `npm test`, `npm run build`.

## Tests

- New: `server/db/index.test.ts` — build a database file whose `applications`
  table predates the date columns (the `seed.test.ts` fixture DDL, plus
  `user_id`, and one row), close it, then `openDatabase` that path and assert
  the row reads back with `deadline === ''` and non-empty `created_at` /
  `updated_at`. This is the seam that actually failed. A second case: calling
  `openDatabase` twice on the same path does not throw and does not change
  `created_at`.
- New: `server/lib/migrations.test.ts` — the two moved cases (legacy database
  gains the columns and backfills; migrating twice is a no-op), unchanged
  except for the import path.
- Updated: `server/lib/seed.test.ts` — dates tests removed; fixture runs
  `migrate(db)` first; a new assertion that the `migrateApplicationsToUser`
  rebuild preserves the date columns.
- Verification command: `npm test` (`Test Files N passed / Tests N passed`,
  no `failed` line). Also `npm run lint` and `npm run build`.

## Manual verification (brief item 7)

The live database is the reason this exists, so verify against it after the
tests pass:

1. Back it up first: `cp /projects/tests/job-app.db /tmp/job-app.db.bak`.
2. `npm run dev:server` — `openDatabase` migrates on start.
3. `npm run dev` in a second terminal, log in, and confirm the applications
   list renders all 7 rows and sorting by `deadline` / `createdAt` /
   `updatedAt` works with no `localeCompare` TypeError.
4. Confirm the columns landed:
   `node -e "console.log(new (require('better-sqlite3'))('/projects/tests/job-app.db',{readonly:true}).pragma('table_info(applications)').map(c=>c.name).join(', '))"`

## Risks / rollback

The migration writes to the live database on first server start. It is
additive (`ALTER TABLE ADD COLUMN` plus a timestamp backfill) and runs inside
a transaction, so a failure leaves the file untouched — but take the backup in
step 1 before the first run anyway, since there is no down migration.

`migrateApplicationsToUser`'s widened rebuild is the riskier edit: it drops
and renames a table. It only runs on a pre-auth database (its `user_id` guard
returns early otherwise), so it will not touch the live database at all — the
seed test is the only place it executes.

Rollback is `git revert` plus, if the columns are unwanted, restoring the
backup.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
