---
brief: brief/external-data-dir.md
branch: external-data-dir
date: 2026-09-03
---

# Move DB and uploads out of the repo — Plan

## Context

`server/index.ts` today defaults a single `DATA_DIR` env var to `server/data`
inside the repo, and every module that touches disk (`db.ts`,
`attachments.ts`, `applications.ts`) re-derives its own path by joining
`dataDir` with a hardcoded subpath (`app.db`, `uploads/`). That couples app
code and persistent data to one directory and one env var, with an implicit
default nobody would remember for a real deploy. This plan splits `dataDir`
into two explicit, required values — `DB_PATH` (full path to the sqlite
file) and `UPLOADS_DIR` (full path to the uploads folder) — threaded
directly rather than derived, with no default and a fail-fast startup check.

## Affected files

- `server/db.ts` — `openDatabase(dataDir)` → `openDatabase(dbPath)`; opens
  `dbPath` directly instead of `join(dataDir, 'app.db')`; `mkdirSync` targets
  `dirname(dbPath)` instead of `dataDir` itself.
- `server/attachments.ts` — `createAttachmentsRouter(db, dataDir)` →
  `createAttachmentsRouter(db, uploadsDir)`; drops the
  `join(dataDir, 'uploads')` derivation, uses `uploadsDir` as given.
- `server/applications.ts` — `createApplicationsRouter(db, dataDir)` →
  `createApplicationsRouter(db, uploadsDir)`; `deleteHandler`'s
  `join(dataDir, 'uploads', attachment.stored_name)` → `join(uploadsDir,
  attachment.stored_name)`. Easy to miss since it's not visible from
  `app.ts`/`index.ts` — it's the third independent place (besides
  `attachments.ts` and its multer storage) that reconstructs the uploads
  path today.
- `server/app.ts` — `createApp(db, dataDir)` → `createApp(db, uploadsDir)`,
  forwarded unchanged to both routers.
- `server/index.ts` — reads `process.env.DB_PATH` and
  `process.env.UPLOADS_DIR`; throws synchronously with a clear message if
  either is unset (no `??` default); passes them separately to
  `openDatabase` / `createApp`; startup log line reports both paths.
- `package.json` — `dev:server` becomes `node --watch --env-file=.env
  server/index.ts` (Node 24.20.0 has stable `--env-file`, no
  `--experimental` prefix, no new dependency).
- `.env.example` (new) — `DB_PATH=<path to db file>` and
  `UPLOADS_DIR=<path to uploads directory>`, placeholder non-existent
  values. `.gitignore` already allows it through (`!.env.example`).
- `server/data/` (on disk, not tracked) — currently holds a real local
  `app.db` (confirmed present, currently gitignored). Delete this directory
  as part of retiring it — once the `.gitignore` entry below is removed,
  leaving it in place would expose it to `git add`/commits.
- `.gitignore` — remove the `# Server data (SQLite db + uploaded files)` /
  `server/data/` entry; nothing defaults there anymore so nothing needs
  ignoring.
- `README.md` — add a short "Running the server" section documenting
  `DB_PATH` and `UPLOADS_DIR` as required env vars and the `.env.example` →
  `.env` copy step (README currently has no server/env-var docs at all).
- `server/applications.test.ts`, `server/attachments.test.ts` — `beforeEach`
  derives `dbPath` and `uploadsDir` from one shared `mkdtempSync` root
  instead of one `dataDir`; calls become `openDatabase(dbPath)` /
  `createApp(db, uploadsDir)`. `attachments.test.ts`'s four
  `join(dataDir, 'uploads', ...)` assertion sites become `join(uploadsDir,
  ...)`. `afterEach`'s `rmSync` still targets the one temp root, unchanged.
- `playwright.config.ts` — `env: { DATA_DIR: dataDir }` → `env: { DB_PATH:
  join(dataDir, 'app.db'), UPLOADS_DIR: join(dataDir, 'uploads') }`, still
  built from one `mkdtempSync` root.

## Work order

1. `server/db.ts`: rename param to `dbPath`, open it directly, `mkdirSync`
   on `dirname(dbPath)`.
2. `server/attachments.ts`: rename param to `uploadsDir`, drop the `join`
   derivation.
3. `server/applications.ts`: rename param to `uploadsDir` in
   `createApplicationsRouter` and `deleteHandler`, drop the `'uploads'`
   join.
4. `server/app.ts`: rename `createApp`'s second param to `uploadsDir`,
   forward unchanged.
5. `server/index.ts`: read `DB_PATH`/`UPLOADS_DIR`, throw if either is
   missing, wire through, update the startup log line.
6. `package.json`: update `dev:server` script.
7. Add `.env.example`.
8. Delete the `server/data/` directory from disk (local dev DB/uploads,
   currently gitignored — remove before the next step exposes it).
9. `.gitignore`: remove the `server/data/` entry and its comment.
10. `README.md`: add the env var / setup section.
11. Update `server/applications.test.ts` and `server/attachments.test.ts`
    per the Affected files note above.
12. Update `playwright.config.ts`'s server `env` block.

## Tests

- Updated: `server/applications.test.ts`, `server/attachments.test.ts` (temp
  `dbPath`/`uploadsDir` instead of `dataDir`), `playwright.config.ts`.
- No new automated test for the fail-fast check: `server/index.ts` is a
  side-effecting entrypoint script, not currently unit-tested, and adding
  test scaffolding for it is beyond this brief's scope. Verify manually
  instead (see below).
- Verification command: `npm test` (must show `Test Files N passed / Tests
  N passed`, no `failed` line).
- Manual verification: `npm run build` (typecheck); run `node
  server/index.ts` with neither env var set and confirm a clear synchronous
  error, not a silent default; copy `.env.example` → `.env` with real temp
  paths, run `npm run dev:server`, confirm it starts and logs both paths;
  optionally `npm run test:e2e` to confirm `playwright.config.ts`'s env
  wiring still boots the real server.

## Risks / rollback

Pure refactor, no data migration tooling — out of scope per the brief. The
one destructive step is deleting the local `server/data/` directory (a real
`app.db`, currently gitignored, no other tracked state depends on it) so it
can't slip past the removed `.gitignore` entry into a commit. Everything
else is reversible via `git revert`.

---

**Next stage:** commit this plan *before* writing code — and stop there.
Implementation (Stage 3) starts in a fresh session, not this one: `/model
sonnet`, then work the order above, run the verification command, and hand
the change to the `verifier` subagent (Stage 4) before opening a PR.
