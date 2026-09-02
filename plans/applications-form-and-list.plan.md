---
brief: brief/applications-form-and-list.md
branch: applications-form-and-list
date: 2026-09-02
---

# Add, list and manage job applications — Plan

## Context

Job applications currently live as scattered folders and files, so nothing is
current and "where did that one land?" means digging through directories. The
brief asks for a real record: a form to add an application, one list view, edit
and delete, file attachments that can be downloaded back out, and persistence
across restarts of both browser and server.

`src/` is still the untouched Vite starter and there is no `server/` yet, so
this branch stands up the whole feature: an Express + better-sqlite3 API and a
React UI that replaces the scaffold page.

Decisions taken during planning (they close the brief's open questions):

- **Dev wiring:** two processes. Vite proxies `/api` → `http://localhost:3001`,
  so the frontend only ever calls same-origin relative URLs — no CORS, no API
  base URL, and Playwright keeps pointing at `:5173`.
- **Data location:** `server/data/app.db` and `server/data/uploads/`, both
  gitignored, overridable with a `DATA_DIR` env var so tests get a temp dir.
- **Server runtime:** Node 24.20 runs `.ts` directly via native type stripping
  (verified). No `tsx`/`ts-node`, no bundler for the server. Both tsconfigs
  already set `erasableSyntaxOnly`, which is exactly the constraint that
  requires; server-relative imports therefore carry the `.ts` extension.
- **Edit UX:** clicking a row expands it in place into a detail panel holding
  the edit form, the delete button and the attachment list. No router.
- **Sequencing:** three slices (below), each independently coherent and
  committable, so a partial build still makes sense.

New dependencies (approved this session): `express`, `better-sqlite3`,
`multer`; dev: `@types/express`, `@types/multer`, `@types/better-sqlite3`.

## Affected files

**New — server**

- `server/db.ts` — `openDatabase(dataDir)`: opens SQLite, sets
  `PRAGMA foreign_keys = ON`, creates the two tables if absent, returns the
  handle. Owns the DDL and nothing else.
- `server/applications.ts` — Express router for application CRUD.
- `server/attachments.ts` — Express router for upload / download / remove, plus
  the multer disk-storage config.
- `server/app.ts` — `createApp(db, dataDir)`: `express.json()`, mounts both
  routers under `/api`. Exported for tests; does not listen.
- `server/index.ts` — entry point: resolve `DATA_DIR`, open the db, listen on
  3001. Kept to a handful of lines.
- `server/types.ts` — `Application`, `Attachment`, `STATUSES`.
- `server/applications.test.ts`, `server/attachments.test.ts` — API tests.

**New — frontend**

- `src/types.ts` — the same record shape and `STATUSES` list, duplicated
  deliberately. The brief calls for no shared code between `src/` and `server/`
  beyond the record shape, and the two build under different tsconfigs.
- `src/api.ts` — thin `fetch` wrappers: `listApplications`,
  `createApplication`, `updateApplication`, `deleteApplication`,
  `uploadAttachment`, `deleteAttachment`, `attachmentUrl`.
- `src/ApplicationForm.tsx` — controlled form over the six fields. One
  component serves both add and edit via an `initial` prop.
- `src/ApplicationList.tsx` — the list; a row expands to the detail panel.
- `src/ApplicationDetail.tsx` — edit form + delete + attachments for one row.
- `src/AttachmentList.tsx` — attachment rows (download link, remove) and the
  file input that adds one.
- Component tests beside each: `src/ApplicationForm.test.tsx`,
  `src/ApplicationList.test.tsx`.

**Changed**

- `src/App.tsx` — scaffold markup replaced: loads applications on mount, holds
  `applications` and `expandedId`, renders the add form and the list. Reloads
  the list after each mutation rather than patching state locally.
- `src/App.test.tsx` — scaffold assertion replaced (`vi.stubGlobal('fetch')`,
  assert rows render from the API).
- `src/App.css`, `src/index.css` — scaffold styles replaced with plain layout
  styles for the form and list.
- `vite.config.ts` — add `server.proxy['/api'] → http://localhost:3001`; add
  `'server/**/*.test.ts'` to `test.include`.
- `tsconfig.server.json` (new) + `tsconfig.json` — add the server as a third
  project reference so `tsc -b` typechecks it. Mirror `tsconfig.node.json`
  (`module: nodenext`, `types: ["node"]`, `allowImportingTsExtensions`,
  `erasableSyntaxOnly`), `include: ["server"]`.
- `package.json` — add the deps above and a `"dev:server": "node --watch
  server/index.ts"` script.
- `playwright.config.ts` — `webServer` becomes an array of two (Vite and the
  API), the API entry pointing `DATA_DIR` at a throwaway directory.
- `e2e/smoke.spec.ts` — the "Get started" heading no longer exists; assert the
  app's own heading instead.
- `.gitignore` — add `server/data/`.
- `index.html` — page title.

**Deleted**

- `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, and
  `public/icons.svg` — all referenced only by the scaffold markup that slice 2
  removes. Called out here so the Stage 4 scope pass sees it was planned.

## Data model

```sql
CREATE TABLE applications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company      TEXT NOT NULL,
  role         TEXT NOT NULL,
  date_applied TEXT NOT NULL,                       -- ISO yyyy-mm-dd
  status       TEXT NOT NULL,                       -- see STATUSES
  link         TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE attachments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL
                 REFERENCES applications(id) ON DELETE CASCADE,
  stored_name    TEXT NOT NULL,                     -- randomUUID on disk
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL
);
```

`STATUSES = ['applied', 'screening', 'interview', 'offer', 'rejected']`.

Uploads are written to `<DATA_DIR>/uploads/<stored_name>`; the DB holds the
name, not the bytes. The brief accepts that the DB and `uploads/` can drift, so
deleting an application must delete its files: read the `stored_name`s first,
delete the application row (the cascade clears the attachment rows), then
`unlink` the files.

## API

All under `/api`, JSON in and out. Validation happens here because this is a
real boundary; internal calls are trusted.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/applications` | All applications, each with its `attachments` array |
| POST | `/applications` | Create; 400 if `company`, `role` or `dateApplied` is empty, or `status` is not in `STATUSES` |
| PUT | `/applications/:id` | Replace all six fields; same validation; 404 if absent |
| DELETE | `/applications/:id` | 204; also unlinks the application's files |
| POST | `/applications/:id/attachments` | multipart, field `file`; 10 MB cap, any type |
| GET | `/attachments/:id` | Streams the file back under its original name |
| DELETE | `/attachments/:id` | 204; removes row and file |

## Work order

**Slice 1 — backend CRUD API**

1. Install the approved dependencies; add `server/data/` to `.gitignore` and
   the `dev:server` script.
2. Add `tsconfig.server.json`, reference it from `tsconfig.json`, and add
   `server/**/*.test.ts` to `test.include` in `vite.config.ts`.
3. Red: write `server/applications.test.ts` against a temp `DATA_DIR` — create
   → list → update → delete round trip, plus a 400 on a bad status and a 404 on
   an unknown id. Tests boot `createApp(...)` with `app.listen(0)` and drive it
   with `fetch`; each file gets a `// @vitest-environment node` docblock,
   since the project default is jsdom.
4. Green: `server/types.ts`, `server/db.ts`, `server/applications.ts`,
   `server/app.ts`, `server/index.ts`.

**Slice 2 — form, list, edit, delete**

5. Add the Vite `/api` proxy.
6. Red: `src/ApplicationForm.test.tsx` (fill by accessible role, submit, assert
   the values handed to `onSubmit`) and `src/ApplicationList.test.tsx` (rows
   render; clicking one expands its detail panel).
7. Green: `src/types.ts`, `src/api.ts`, `ApplicationForm`, `ApplicationList`,
   `ApplicationDetail`; rewrite `App.tsx` and replace `src/App.test.tsx`.
8. Replace the scaffold CSS, delete the now-unreferenced scaffold assets, fix
   the `index.html` title and `e2e/smoke.spec.ts`'s heading assertion.

**Slice 3 — attachments**

9. Red: `server/attachments.test.ts` — upload, appears in the application's
   `attachments`, downloads with the original filename and correct bytes,
   removing it clears row and file, deleting the application clears its files
   from disk.
10. Green: `server/attachments.ts`, mounted in `createApp`.
11. `AttachmentList` plus the API wrappers, rendered inside
    `ApplicationDetail`.
12. `e2e/applications.spec.ts`: add → appears in the list → expand and change
    status → attach a file → it is listed with a download link → delete the
    application. Point `playwright.config.ts` at both servers.

`simple-code` applies from the first line of each slice: ≤40-line functions,
≤300-line files, ≤3 parameters, ≤2 nesting levels, no handling for cases that
can't occur, no abstraction ahead of a second caller.

## Tests

- New: `server/applications.test.ts`, `server/attachments.test.ts`,
  `src/ApplicationForm.test.tsx`, `src/ApplicationList.test.tsx`,
  `e2e/applications.spec.ts`.
- Updated: `src/App.test.tsx` (scaffold assertion → API-backed list),
  `e2e/smoke.spec.ts` (scaffold heading → the app's heading).
- Verification command: `npm test` — expect `Test Files N passed / Tests N
  passed` with no `failed` line. Also `npm run build` and `npm run lint` clean,
  and `npm run test:e2e` → `N passed`.

## Verification

1. `npm run build` — `tsc -b` now covers `server/` too via the new reference.
2. `npm run lint`, then `npm test`.
3. `npm run test:e2e`.
4. By hand: `npm run dev:server` and `npm run dev`, then at
   http://localhost:5173 add an application, expand it, edit the status, attach
   a file, download it back, then restart both processes and confirm the record
   and its file are still there — that is requirement 8 from the brief, and it
   is the one thing the test suite exercises only against a temp directory.

## Risks / rollback

- **`better-sqlite3` is a native module.** If no prebuilt binary exists for
  Node 24.20 it will try to compile on install. If that fails, the fallback is
  Node's built-in `node:sqlite` — same SQL, one less dependency, and only
  `server/db.ts` changes. Decide at step 1, not later.
- **Uploaded files are outside git.** `server/data/` is gitignored, so nothing
  a user attaches is recoverable from the repo. That matches the brief (single
  user, local laptop, no deployment) but is worth knowing before relying on it.
- Everything else is additive or replaces scaffold code; rollback is deleting
  the branch.

---

**Next stage:** commit this plan *before* writing code. Then implement the work
order, run the verification command above, and hand the change to the
`verifier` subagent (Stage 4) before opening a PR.
