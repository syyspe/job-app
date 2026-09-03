---
slug: external-data-dir
date: 2026-09-03
---

# Move DB and uploads out of the repo, make paths configurable

## Problem

`server/index.ts` defaults `DATA_DIR` to `server/data`, a directory inside
the repo (gitignored, but still inside it). The SQLite DB and uploaded
attachment files both live under that one path today. That doesn't fit a
normal deploy where app code and persistent data are separate, and it's
fragile locally too — nothing stops a clean checkout or repo wipe from
taking the data with it.

## What done looks like

1. `DB_PATH` (full path to the sqlite file) and `UPLOADS_DIR` (full path to
   the uploads folder) are two independent, required env vars — no
   `DATA_DIR`, no implicit default location.
2. `server/index.ts` fails fast with a clear error message at startup if
   either `DB_PATH` or `UPLOADS_DIR` is unset.
3. `server/db.ts` and `server/attachments.ts` (and anywhere else `dataDir`
   currently threads through) are updated to take the DB file path and
   uploads dir path directly, rather than a shared `dataDir` they each
   subpath into.
4. `.env.example` is added with placeholder (non-existent-path) values, e.g.
   `DB_PATH=<path to db file>` and `UPLOADS_DIR=<path to uploads directory>`.
5. `npm run dev:server` loads `.env` automatically (Node's native
   `--env-file=.env`, no new dependency) so local dev works from a copied
   `.env.example` → `.env`.
6. README documents the two required env vars and the `.env.example` →
   `.env` setup step.
7. `server/data/` (and its gitignore entry/comment) is retired — nothing
   defaults there or creates it anymore.
8. Existing tests that reference `dataDir` / `server/data` are updated to
   use temp `DB_PATH`/`UPLOADS_DIR` values instead.

## Approach

- Replace the single `dataDir` parameter threaded through `db.ts` /
  `app.ts` / `attachments.ts` with two explicit values: a DB file path and
  an uploads dir path. Callers stop doing `join(dataDir, 'uploads')`
  themselves.
- `server/index.ts` reads `process.env.DB_PATH` and
  `process.env.UPLOADS_DIR`, throws synchronously if either is missing
  (fail fast, no default) — rejected the "default to a fixed path outside
  the repo" alternative because it's an implicit convention nobody would
  remember, versus an explicit one-time `.env` setup.
- `.env.example` values are non-existent placeholders (`<path to db
  file>`, `<path to uploads directory>`), not real-looking paths like
  `../job-app-data/...` — rejected using a real-looking default path
  because it invites accidentally running against a path that happens to
  exist.
- `dev:server` script becomes `node --watch --env-file=.env server/index.ts`.

## Out of scope

- No migration tooling for existing local data under `server/data/` — this
  is a personal dev project, not a deployed instance with data to
  preserve.
- No support for loading `.env` in `npm test` or `build` — tests construct
  their own temp `DB_PATH`/`UPLOADS_DIR` directly rather than relying on
  env vars.
- No OS-specific default data directory (XDG, `~/Library`, etc.) — that's
  the "implicit default" option this brief explicitly rejected.

## Open questions

None outstanding — resolved during the brief interview (env var shape,
default/fail-fast behavior, placeholder style for `.env.example`).

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/external-data-dir.plan.md` before writing
any code.
