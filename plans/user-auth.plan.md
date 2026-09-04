---
brief: brief/user-auth.md
branch: user-auth
date: 2026-09-04
---

# User authentication and per-user applications — Plan

## Context

`/api` is completely open: any caller that reaches it can read, edit and
delete every application and attachment, and `applications` has no owner
column at all. This adds database-backed sessions, scopes every row to the
session's user in SQL, and puts a login gate in front of the React app, so the
API stops being safe only by virtue of running on localhost.

Three questions the brief left open are settled here: **sessions do not
expire** (a row lives until logout — sweeping old rows is a later brief), the
seeded credentials are **read from `.env`** as `SEED_USERNAME`/`SEED_PASSWORD`,
and `App.tsx` **splits** so the auth shell and the applications UI are separate
components rather than one 100-line function.

scrypt is a one-way KDF over a per-user random salt stored beside
the hash; session tokens are random bytes validated by a `sessions` lookup; the
cookie is unsigned, because a forged token still has to match a row. A pepper
was considered and rejected: `.env` and `DB_PATH` live on the same machine, so
it only helps if the database leaks and the environment does not, and losing it
would lock out every account with no password-reset endpoint in scope.

Two things confirmed against the installed tooling while planning:

- Playwright's readiness probe accepts any status `>= 200 && < 404`
  (`isURLAvailable` in `playwright-core/lib/coreBundle.js`), so the existing
  `url: http://localhost:3001/api/applications` health check keeps working once
  that route answers 401. Neither Playwright config needs a new health URL.
- Node's `--env-file-if-exists` does **not** override variables already in the
  environment (verified on Node 24.20.0), so `npm run seed` under Playwright's
  `env:` block seeds the temp database, not the developer's real one.

## Affected files

### Server

- `server/db/index.ts` — move the DDL to a module-level `SCHEMA` constant and
  add `users` and `sessions`; `applications` gains
  `user_id INTEGER NOT NULL REFERENCES users(id)`. Keeps `openDatabase` short.
- `server/types.ts` — add `User { id, username }`.
- `server/models/user.ts` — **new.** `UserRow` + `toUser`.
- `server/lib/passwords.ts` — **new.** `hashPassword`, `verifyPassword`,
  `createSessionToken` (`node:crypto` only).
- `server/lib/cookies.ts` — **new.** `SESSION_COOKIE` and
  `readSessionCookie(header)`. Express 5 parses no cookies; writing them uses
  the built-in `res.cookie`/`res.clearCookie`, so only reading needs a helper.
- `server/lib/seed.ts` — **new.** `createUser(db, username, password)`,
  `seedUser(db, username, password)`, `migrateApplicationsToUser(db, userId)`.
  Tests reuse `createUser`.
- `server/seed.ts` — **new.** Thin CLI entry point, mirroring `index.ts`:
  reads `DB_PATH`, `SEED_USERNAME`, `SEED_PASSWORD`, opens the database,
  seeds, migrates.
- `server/middleware/auth.ts` — **new.** `requireSession(db)`; also carries the
  `declare global { namespace Express { interface Request { userId: number } } }`
  augmentation.
- `server/routes/auth.ts` — **new.** `createAuthRouter(db)`: `POST /login`,
  `POST /logout`, `GET /me`.
- `server/app.ts` — mount order becomes auth router → `requireSession` →
  existing routers, so the line that protects everything is visible in one file.
- `server/routes/applications.ts` — every statement scoped by `req.userId`.
- `server/routes/attachments.ts` — scoped through the parent application.
- `server/test/auth.ts` — **new.** `loginAs(baseUrl, username, password)`
  returning a `cookie` header string. `fetch` keeps no cookie jar, so the route
  tests pass the cookie by hand.

### Client

- `src/types.ts` — add `User` (hand-kept in step with `server/types.ts`).
- `src/lib/api.ts` — `credentials: 'same-origin'` on every call, an exported
  `UnauthorizedError`, and `login`/`logout`/`getCurrentUser`.
- `src/components/LoginForm.tsx` — **new**, with its test beside it.
- `src/components/ApplicationsView.tsx` — **new.** Everything `App` owns today
  (applications state, `expandedId`, the five handlers, `reload`) moves here,
  behind a local `useApplications(onUnauthorized)` hook so neither function
  passes 40 lines.
- `src/App.tsx` — becomes the auth shell: `user`, `loaded`, login/logout, and
  the `<main>`/`<h1>` frame.
- `src/App.css` — a rule for the session bar (username + Log out).

### E2E and docs

- `e2e/login.ts` — **new.** `logIn(page)` helper (not a spec, so Playwright's
  `*.spec.ts` match ignores it).
- `e2e/auth.spec.ts` — **new.**
- `e2e/smoke.spec.ts`, `e2e/layout.spec.ts`, `e2e/applications.spec.ts` — log
  in instead of bare `page.goto('/')`.
- `playwright.config.ts`, `playwright.prod.config.ts` — seed before the API
  server starts.
- `package.json` — `"seed": "node --env-file-if-exists=.env server/seed.ts"`.
- `CLAUDE.md`, `README.md` — the seed command and the new files.

## Work order

Red-green-refactor throughout: the failing test first, then the smallest code
that passes it.

1. **Schema and password helpers.** `SCHEMA` constant in
   `server/db/index.ts` with `users` (`username TEXT NOT NULL UNIQUE`) and
   `sessions` (`token TEXT PRIMARY KEY`, `user_id ... ON DELETE CASCADE`,
   `created_at`), both created before `applications`, which gains
   `user_id INTEGER NOT NULL REFERENCES users(id)`. Add `server/lib/passwords.ts`
   — `hashPassword` returns `"<salt hex>:<scrypt hex>"` from a 16-byte random
   salt and a 64-byte key; `verifyPassword` re-derives and compares with
   `timingSafeEqual`; `createSessionToken` is `randomBytes(32).toString('hex')`.
   Add `server/models/user.ts` and `User` in both `types.ts` files.

2. **Seeding and the legacy migration.** `server/lib/seed.ts`:
   `createUser` inserts a hashed row and returns the new id; `seedUser(db,
   username, password)` calls `createUser(db, username, password)` unless
   that username already exists, in which case it returns the existing id
   (so seeding is re-runnable — though re-running with a different password
   in `.env` does not change an existing user's password);
   `migrateApplicationsToUser` returns immediately when
   `db.pragma('table_info(applications)')` already reports a `user_id` column,
   and otherwise rebuilds the table (see Risks for the exact sequence).
   `server/seed.ts` reads `DB_PATH`, `SEED_USERNAME`, `SEED_PASSWORD`, throws
   the same fail-fast error shape as `index.ts` when any is missing, and
   calls the two in order. Wire up `npm run seed`.

3. **Cookies and session middleware.** `server/lib/cookies.ts`, then
   `requireSession(db)`: read the cookie, look the token up in `sessions`, 401
   `{ error: 'unauthorized' }` when there is no row, otherwise set
   `req.userId` and continue.

4. **Auth routes and wiring.** `createAuthRouter(db)` with `/login`,
   `/logout`, and `/me` (the last one behind `requireSession` inline, since it
   is mounted on the public router). Login answers a single
   `401 { error: 'invalid credentials' }` for an unknown username, a wrong
   password, and a malformed body alike — one branch, no way to probe which
   usernames exist. On success it inserts the session row, sets the cookie
   `httpOnly, sameSite: 'lax', path: '/'` (no `secure` — localhost, per the
   brief) and returns the user. Then reorder `server/app.ts`:

   ```ts
   app.use(express.json())
   app.use('/api', createAuthRouter(db))
   app.use('/api', requireSession(db))
   app.use('/api', createApplicationsRouter(db, uploadsDir))
   app.use('/api', createAttachmentsRouter(db, uploadsDir))
   ```

   Add `server/test/auth.ts`.

5. **Scope the applications router.** `req.userId` joins every statement:
   list and create as you would expect; update becomes
   `WHERE id = ? AND user_id = ?`, so a foreign id falls through the existing
   `changes === 0` path to 404. Delete gains the same clause and now returns
   **404 when nothing matched** instead of today's unconditional 204 — no
   existing test asserts 204 for a missing id, and 404 matches the brief's
   "someone else's row looks absent". The hoisted attachments statement becomes
   a join so ownership stays in the `WHERE` clause rather than being re-checked
   in JS:

   ```sql
   SELECT a.* FROM attachments a
     JOIN applications app ON app.id = a.application_id
    WHERE a.application_id = ? AND app.user_id = ?
   ```

   Its type becomes `Database.Statement<[number, number], AttachmentRow>`.

6. **Scope the attachments router.** `checkApplicationExists` becomes an
   ownership check (`SELECT 1 FROM applications WHERE id = ? AND user_id = ?`,
   404 otherwise). Download and remove select through the same join on
   `a.id`, 404 when it returns nothing.

7. **Fix the app-level test.** `app.use('/api', requireSession)` sits above the
   routers, so an unmatched `/api` path now 401s before it can 404. Update
   `server/app.test.ts`'s "does not swallow an unmatched /api route" test to log
   in first, keeping it a test about the SPA fallback rather than about auth.

8. **Client API layer.** `credentials: 'same-origin'` on every `fetch` in
   `src/lib/api.ts`; `checkOk` throws `UnauthorizedError` on 401 before its
   existing message handling; add `login`, `logout`, and `getCurrentUser`
   (which returns `null` on 401 rather than throwing, because "not logged in"
   is the expected answer there).

9. **LoginForm.** `src/components/LoginForm.tsx` takes
   `onLogin: (username, password) => Promise<void>`, holds the two fields and
   an error string, and renders "Invalid username or password" in a
   `role="alert"` when `onLogin` rejects. Accessible handles the e2e specs and
   tests query by: textbox "Username", `getByLabel('Password')` (a password
   input has no `textbox` role), button "Log in".

10. **Split App.** Move the current body of `App` into
    `src/components/ApplicationsView.tsx`, with the state and handlers in a
    local `useApplications(onUnauthorized)` hook and the component left as
    JSX. Each handler wraps its work in the hook's `run` helper, which catches
    `UnauthorizedError` and calls `onUnauthorized` while re-throwing anything
    else. `App` then holds `user` and `loaded`, calls `getCurrentUser()` on
    mount, and renders `LoginForm` or the session bar plus `ApplicationsView`.
    `loaded` exists so a logged-in user reloading the page does not see the
    login form flash before `/api/me` answers.

11. **E2E.** New `e2e/credentials.ts` holds arbitrary test-only credentials,
    unrelated to any real login. `e2e/login.ts` fills them and waits for the
    "Log out" button; the three existing specs call it in place of
    `page.goto('/')`. New `e2e/auth.spec.ts`: the login form appears when
    logged out, a reload keeps the session, and logging out brings the form
    back. Both Playwright configs prefix their API `command` with
    `npm run seed && ` and add `SEED_USERNAME`/`SEED_PASSWORD` (from
    `e2e/credentials.ts`) to the `env:` block alongside `DB_PATH`, which
    wins over `.env`.

12. **Docs.** `CLAUDE.md`: add `npm run seed` to Commands, noting it reads
    `SEED_USERNAME`/`SEED_PASSWORD` from `.env` and must run once against a
    fresh or pre-auth database before the server will work; update the
    Architecture section, which currently says `src/components/` holds "the
    four presentational components" (now six) and does not list the new
    server files. `README.md`: a seeding step in "Running the server",
    `SEED_USERNAME`/`SEED_PASSWORD` alongside the other required `.env`
    variables, and a note that the login can only be set before the first
    `npm run seed` run against a given database. `.env.example` gets
    placeholder `SEED_USERNAME`/`SEED_PASSWORD` lines.

## Tests

- New: `server/lib/passwords.test.ts` — a hash verifies against its own
  password, a wrong password does not, and two hashes of the same password
  differ (the salt is per-user).
- New: `server/lib/seed.test.ts` — the important one. Build a legacy-shaped
  `applications` table by hand with rows and attachments, run `seedUser` +
  `migrateApplicationsToUser`, and assert every application survived with
  `user_id` set, the attachments survived, and `user_id` is now `NOT NULL`.
  Also: seeding twice does not create a second user.
- New: `server/routes/auth.test.ts` — login sets an httpOnly cookie and
  returns the user; a wrong password and an unknown username give the same
  401; `/me` returns the user with the cookie and 401 without; logout clears
  the session so the cookie stops working.
- Updated: `server/routes/applications.test.ts` — log in during `beforeEach`
  and pass the cookie. New cases: every route 401s with no cookie; a second
  user created with `createUser` cannot see, update, or delete the first
  user's application (list is empty, update and delete are 404).
- Updated: `server/routes/attachments.test.ts` — same cookie plumbing, plus:
  a second user cannot upload to, download, or delete the first user's
  attachment, and cannot delete the parent application.
- Updated: `server/app.test.ts` — the unmatched-`/api` test logs in first.
- Updated: `src/App.test.tsx` — stub `fetch` by URL (`/api/me` and
  `/api/applications`). Renders the login form when `/api/me` is 401, and the
  applications when it is not.
- New: `src/components/LoginForm.test.tsx` — submitting calls `onLogin` with
  both values; a rejected `onLogin` shows the alert.
- New: `src/components/ApplicationsView.test.tsx` — takes over the "loads and
  renders applications from the API" coverage, plus: a 401 from the API calls
  `onUnauthorized`.
- Updated: the three existing e2e specs; new `e2e/auth.spec.ts`.
- Verification command: `npm test` (expect `Test Files N passed / Tests N
  passed`, no `failed` line), then `npm run test:e2e` (expect `N passed`).
  `npm run lint` and `npm run build` should also stay clean.

## Risks / rollback

**The table rebuild in `migrateApplicationsToUser` is the one genuinely
destructive step.** SQLite cannot `ALTER TABLE ... ADD COLUMN` a `NOT NULL`
column that references another table, so the table has to be rebuilt, and
`DROP TABLE applications` with `foreign_keys = ON` would cascade every
attachment row away. Follow SQLite's documented rebuild sequence exactly:

```ts
db.pragma('foreign_keys = OFF')
db.transaction(() => {
  // CREATE TABLE applications_new (... user_id INTEGER NOT NULL REFERENCES users(id))
  // INSERT INTO applications_new SELECT id, company, role, date_applied,
  //   status, link, notes, ? FROM applications
  // DROP TABLE applications
  // ALTER TABLE applications_new RENAME TO applications
})()
db.pragma('foreign_key_check')
db.pragma('foreign_keys = ON')
```

`better-sqlite3` ignores a `foreign_keys` pragma issued inside a transaction,
which is why both pragmas sit outside it. `server/lib/seed.test.ts` covers
attachment survival specifically, because that is what a wrong sequence
silently destroys.

Rollback: back up `DB_PATH` before the first real `npm run seed`
(`cp "$DB_PATH" "$DB_PATH.bak"`). The migration is idempotent — it no-ops once
`user_id` exists — but it is not reversible in place.

Everything else is ordinary code and reverts with the branch. No new
dependencies.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
