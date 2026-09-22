---
brief: brief/admin-users.md
branch: admin-users
date: 2026-09-22
---

# An admin page for managing users — Plan

## Context

Accounts only exist because `npm run seed` made one. A second person means
shell access and a CLI run; a forgotten password can't be changed from the app
at all, because nothing but the seed ever writes a password hash. Every user is
equal, so there's nowhere to hang the ability to manage accounts.

This adds a `role` column (`'admin'` | `'basic'`), an admin-only `/api/users`
router, and an admin page the nav switches to. Applications stay strictly
per-user — no route gains an admin bypass. The outcome: the seed user can
create, re-role, reset and delete accounts from the browser.

The brief's three open questions are settled:

- **No admin after a migration** — the migration only adds the column with
  `DEFAULT 'basic'`. `npm run seed` is what grants admin, and the README says
  so. Nothing promotes anyone implicitly.
- **Password rules** — non-empty, nothing more. The seed has never had a rule
  and this doesn't invent one; a blank-password account is still refused.
- **Delete friction** — an inline two-step button. "Delete" becomes "Confirm
  delete" + "Cancel" for that row. No `window.confirm` (jsdom doesn't implement
  it), so it tests with `getByRole` like everything else.

## Affected files

### Types and validation

- `server/types.ts`, `src/types.ts` — add `ROLES = ['admin', 'basic'] as const`
  and `type Role`, modelled exactly on `STATUSES`/`Status`; `User` gains
  `role: Role`. The two files are hand-kept twins — change both.
- `server/lib/validation.ts` — `isRole(value): value is Role` beside the
  existing `STATUSES` check, and `validateUserInput(body)` returning
  `{ username, password, role } | null` (all three required, username and
  password non-empty, role in `ROLES`).

### Schema, seed, models

- `server/db/index.ts` — `users` gains `role TEXT NOT NULL DEFAULT 'basic'`.
- `server/lib/migrations.ts` — `migrateUserRole(db)`: return early if
  `table_info(users)` already has `role`, else one `ALTER TABLE users ADD
  COLUMN role TEXT NOT NULL DEFAULT 'basic'`. Same shape as
  `migrateApplicationArchived`. Call it from `migrate()`.
- `server/lib/users.ts` (new) — `setUserRole(db, userId, role)` and
  `adminCount(db)`. Both are needed by the seed *and* the users router, which
  is what `server/lib/` is for.
- `server/lib/seed.ts` — `seedUser` calls `setUserRole(id, 'admin')` on both
  branches, so the seeded user is an admin whether it was just created or
  already existed. `createUser` keeps its three parameters and its current
  INSERT — the column default makes a new user basic, and the router promotes
  after creating.
- `server/models/user.ts` — `UserRow` gains `role: Role`; `toUser` maps it.

### API

- `server/middleware/auth.ts` — add `requireAdmin(db)`: reads `req.userId`
  (set by `requireSession`), looks up the role, `403 { error: 'forbidden' }`
  if it isn't `'admin'`.
- `server/routes/users.ts` (new) — `createUsersRouter(db, uploadsDir)`:
  - `GET /users` → every user as `toUser`, ordered by id.
  - `POST /users` → `validateUserInput`; `400 { error: 'username taken' }` if
    the username exists (a real boundary — user input against a UNIQUE
    column); else `createUser` + `setUserRole`, `201` with the new user.
  - `PUT /users/:id/role` and `PUT /users/:id/password` — two narrow
    sub-resources rather than one `PUT /users/:id`, mirroring the existing
    `PUT /applications/:id/archived`. Each handler stays a few lines. `404`
    when the id is unknown.
  - `DELETE /users/:id` → the cascade, below.
- `server/app.ts` — mount after `requireSession`, so the mount order still
  reads as the whole protection story:
  `app.use('/api', requireAdmin(db), createUsersRouter(db, uploadsDir))`.
- `server/routes/auth.ts` — nothing to change: `/me` returns `toUser(row)`,
  which now carries the role.

Guard rails, both server-side, both `400` with a message in `error` (the app's
vocabulary is 400/401/404 and the front end just toasts `error` — a new 409
would buy nothing a reader can see):

- `DELETE /users/:id` where `id === req.userId` → `'cannot delete yourself'`.
  This also means an admin can never be the last one deleted: you must be an
  admin to reach the route, and you can't delete yourself.
- `PUT /users/:id/role` demoting an admin when `adminCount(db) === 1` →
  `'cannot demote the last admin'`.

The cascade, explicit because `applications.user_id` has no `ON DELETE
CASCADE`:

1. Select the user's attachment rows (join `attachments` → `applications` on
   `user_id`) and keep their `stored_name`s.
2. In one `db.transaction`: `DELETE FROM applications WHERE user_id = ?` (which
   cascades `attachments` — that FK does have `ON DELETE CASCADE`), then
   `DELETE FROM users WHERE id = ?` (which cascades `sessions`, logging the
   user out everywhere). `changes === 0` on the users delete → `404`.
3. After the transaction commits, `unlinkIfExists(join(uploadsDir, storedName))`
   for each — same order as `deleteHandler` in `server/routes/applications.ts`.

### Front end

- `src/lib/api.ts` — `listUsers`, `createUser`, `setUserRole`,
  `resetUserPassword`, `deleteUser`, all in the existing
  `fetch` + `credentials: 'same-origin'` + `parseJson`/`checkOk` shape.
- `src/components/AdminView.tsx` (new) — a local `useUsers` hook that is a
  direct copy of `useApplications`'s structure in `ApplicationsView.tsx`: the
  `run(task, successMessage)` wrapper with `UnauthorizedError` → `onUnauthorized`,
  `reload()`, one handler per action. Layout uses the existing `.layout` grid:
  create panel left, list right.
- `src/components/UserForm.tsx` (new) — username, password, role `<select>`,
  submit. Same markup idiom as `LoginForm`/`ApplicationForm`.
- `src/components/UserList.tsx` (new) — `<ul>` of `UserRow`s, plus the empty
  state.
- `src/components/UserRow.tsx` (new) — one row: username, role `<select>`,
  "Reset password" revealing an input + "Save", and the two-step delete.
  Row-local `useState` only; every mutation goes up through props.
- `src/components/NavBar.tsx` — export `type View = 'applications' | 'admin'`;
  props gain `view` and `onViewChange`. Render the toggle **only** when
  `user.role === 'admin'`: label "Admin" while the applications view is
  showing, "Applications" while the admin view is.
- `src/App.tsx` — `const [view, setView] = useState<View>('applications')`;
  render `AdminView` or `ApplicationsView`; reset to `'applications'` on
  logout. `AdminView` takes the same `onUnauthorized={() => setUser(null)}`.
- `src/admin.css` (new), imported in `App.tsx` beside `applications.css` — owns
  the admin surface only (user rows, the role control, the confirm cluster),
  reading tokens from `index.css`. **Read the `frontend-design` skill before
  writing this file and the markup it styles**; invent no values.

### Docs

- `CLAUDE.md` — the Architecture section enumerates "six presentational
  components" and "the three CSS files". Update both counts, name `admin.css`'s
  scope in the same sentence shape as the others, and add `server/lib/users.ts`.
- `README.md` — the seed section (around lines 55–77) currently says the seed
  "only ever creates the user once". It now also makes that user an admin every
  run, which is the documented way an upgraded database gets its first admin.
  Add a short paragraph on what the Admin page does and who sees it.

## Work order

Red-green-refactor throughout — the failing test first, then the smallest code
that passes it.

1. **Types and schema.** `ROLES`/`Role`/`User.role` in both `types.ts` files;
   `role` in the `users` schema; `migrateUserRole` + its `migrate()` call;
   `UserRow`/`toUser`. Test: migration adds the column with the default and is
   idempotent.
2. **Seed grants admin.** `server/lib/users.ts`, then `seedUser` promoting on
   both branches. Test: seeding a fresh user and re-seeding an existing one
   both leave `role = 'admin'`.
3. **`requireAdmin`.** Middleware plus the mount in `app.ts`. Test (in the new
   route test file): no session → 401, basic session → 403, on every
   `/api/users` route.
4. **`validateUserInput` / `isRole`.** Unit-level via the route tests: empty
   password, unknown role, missing username → 400.
5. **List and create.** `GET`/`POST /api/users` and the taken-username 400.
6. **Role and password updates.** Both sub-resource PUTs, then the
   last-admin-demotion guard.
7. **Delete.** Self-delete guard first, then the cascade — assert the
   applications rows, the attachment rows *and* the files on disk are gone, and
   that an untouched second user keeps theirs.
8. **API client.** The five functions in `src/lib/api.ts`.
9. **Admin UI.** `UserForm`, `UserRow`, `UserList`, then `AdminView` wiring
   them to the hook — each with its test beside it.
10. **Nav and view switch.** `NavBar`'s toggle (admins only) and `App.tsx`'s
    `view` state. Update `sampleUser` in `src/App.test.tsx` and the user literal
    in `NavBar.test.tsx` for the new `role` field.
11. **`admin.css`** — after reading `frontend-design`.
12. **E2E**, then **docs** (`CLAUDE.md`, `README.md`).

## Tests

- New: `server/routes/users.test.ts` — the whole router, in the
  `applications.test.ts` shape (`openDatabase` on a `mkdtempSync` root,
  `createUser`, `createApp`, `app.listen(0)`, `loginAs` for cookies). Seed one
  admin and one basic user in `beforeEach`. Covers: 401 with no session and 403
  with a basic user's cookie, each asserted across all five routes (`GET`,
  `POST`, both `PUT`s, `DELETE`) so a later route can't be added without one;
  then create/list round trip, taken username, empty
  password, unknown role, self-delete refused, last-admin demotion refused, and
  the delete cascade including files on disk.
- New: `src/components/AdminView.test.tsx`, `UserForm.test.tsx`,
  `UserList.test.tsx`, `UserRow.test.tsx` — query by role/name; the two-step
  delete asserts that "Delete" alone doesn't call `onDelete` and "Confirm
  delete" does.
- New: `e2e/admin.spec.ts` — log in as the seeded (admin) user, open Admin,
  create `basic-${Date.now()}` (unique so a retry can't hit "username taken"),
  log out, log in as that user, then assert both halves of the lockout:
  - no Admin control is visible in the nav, and
  - `page.request.get('/api/users')` — which carries that session's cookie —
    comes back `403`. The control being hidden is a UI choice; the 403 is the
    actual gate, and this is the only test that exercises it through the real
    stack.
- New: `src/components/NavBar.test.tsx` cases (added to the existing file) —
  the Admin control renders for `role: 'admin'` and is absent for
  `role: 'basic'`, asserted with `queryByRole` like the existing logged-out
  case.
- Updated: `server/lib/migrations.test.ts` (the `users` table and
  `migrateUserRole`), `server/lib/seed.test.ts` (the admin promotion — its
  `beforeEach` builds a pre-role `users` table by hand),
  `server/routes/auth.test.ts` (`/me` carries the role), and `src/App.test.tsx`
  (the `role` field on `sampleUser`, plus a case that a basic user's App
  renders the applications view and no Admin control).
- Updated: `e2e/login.ts` — add `logInAs(page, username, password)`; `logIn`
  delegates to it with the seeded credentials, so existing specs don't change.
- Verification command: `npm test` (expect `Test Files N passed / Tests N
  passed`, no `failed` line), then `npm run lint` and `npm run test:e2e`
  (`N passed`).

## Risks / rollback

- The migration is additive and idempotent — an existing database gains a
  column with a default and nothing else. Reverting the code leaves the column
  in place, harmless.
- `DELETE /api/users/:id` is the only genuinely irreversible thing here: it
  destroys another user's applications and their uploaded files. The transaction
  is all-or-nothing on the rows; the `unlink` loop runs after it commits, so a
  crash mid-unlink leaves orphaned files, not orphaned rows — the direction
  `unlinkIfExists` already accepts as drift.
- Upgrading a live database: after pulling, `npm run seed` must run once or
  nobody is an admin. That's the documented step, not a silent promotion.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
