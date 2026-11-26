---
brief: brief/053-agent-access.md
branch: 053-agent-access
date: 2026-11-26
---

# Agent access as its own user flag — Plan

Context: today `/api/agent` and the run panel are gated on `role = 'admin'`
(051). Starting a run spends the runner's credentials and Claude budget, a
separate decision from managing users. This plan adds a per-user
`agent_access` flag. It gates the agent on that flag alone: an admin without
the flag is refused too.

Open question from the brief, settled here: the flag gets **its own
endpoint**, `PUT /api/users/:id/agent-access`, beside the role endpoint. The
role endpoint's last-admin and self-demotion guards don't apply to the flag,
and folding the two into a general update would mix them.

Seed decision (agreed with the user): `seedUser` grants agent access on every
run, the same way it re-grants admin. The seeded user is the bootstrap
account, so a fresh install has someone who can run the agent. The catch:
if that admin turns their own flag off, the next `npm run seed` turns it back
on, just as it does for the role.

## Affected files

- `server/db/index.ts`: `SCHEMA`'s `users` gets
  `agent_access INTEGER NOT NULL DEFAULT 0`.
- `server/lib/migrations.ts`: new `migrateUserAgentAccess(db)`. If the
  column is missing, one transaction runs `ALTER TABLE users ADD COLUMN
  agent_access INTEGER NOT NULL DEFAULT 0` and `UPDATE users SET
  agent_access = 1 WHERE role = 'admin'`. It is called from `migrate()` after
  `migrateUserRole` (it reads `role`). On a fresh database `SCHEMA` already
  has the column, so it is a no-op.
- `server/models/user.ts`: `UserRow.agent_access: number`, and `toUser`
  maps `agentAccess: row.agent_access === 1`.
- `server/types.ts` and `src/types.ts`: `User.agentAccess: boolean`, kept in
  step by hand.
- `server/lib/users.ts`: `setUserAgentAccess(db, userId, agentAccess:
  boolean)`, the sibling of `setUserRole`.
- `server/lib/seed.ts`: `seedUser` also calls `setUserAgentAccess(db, id,
  true)`. Its doc comment says the seeded user gets admin and agent access.
- `server/lib/validation.ts`: `validateAgentAccess(body): boolean`, which
  uses `fieldsOf`. A non-boolean `agentAccess` is
  `HttpError(400, 'agentAccess must be a boolean')`.
- `server/routes/users.ts`: `agentAccessHandler(db)` on
  `PUT /users/:id/agent-access`. It validates, answers `404 'not found'` for
  an unknown user, sets the flag and answers `200` with `toUser(row)`. There
  is no self-guard: an admin who turns off their own flag can turn it back
  on. It sits under the existing `requireAdmin` mount at `/api/users`.
- `server/middleware/auth.ts`: new `requireAgentAccess(db)`, shaped like
  `requireAdmin`. It reads `agent_access` for `req.userId`, throws
  `401 'unauthorized'` for a missing user and `403 'forbidden'` when the flag
  is 0.
- `server/app.ts`: `mountAgentRuns` mounts `requireAgentAccess(db)` in place
  of `requireAdmin(db)`, and its comment is updated to say who may start
  runs. `requireAdmin` stays at `/api/users`.
- `src/lib/api.ts`: `setUserAgentAccess(id, agentAccess)`, which sends
  `PUT /api/users/:id/agent-access`, mirroring `setUserRole`.
- `src/components/UserRow.tsx`: an `AgentAccessToggle` beside
  `RoleSelect` in `.user-head`. It is a checkbox, visible label "Agent
  access", accessible name `Agent access for {username}`, which calls a new
  `onSetAgentAccess(agentAccess: boolean)` prop.
- `src/components/UserList.tsx` and `src/components/AdminView.tsx`: thread
  `onSetAgentAccess(id, agentAccess)` through. AdminView's handler uses the
  existing `change(...)` helper with toast `Agent access granted` or
  `Agent access removed`.
- `src/components/AdsView.tsx` and `src/App.tsx`: rename the prop
  `isAdmin` → `canRunAgent`. App passes `user.agentAccess`.
- `src/admin.css`: `.user-access`, a label laid out inline with the
  checkbox, using the existing tokens (`--s-2` gap, `--fs-sm`,
  `--ink-muted`), and `.user-head`'s controls wrapping together. No new
  values.
- `agent/test/fakeJobApp.ts`: add `agentAccess: false` to its fake user
  response so it matches the API shape. agent/ doesn't import the type, so
  this is for accuracy only.
- `docs/in-app-agent.md` §7: "The panel is admin-only" becomes "the panel
  and `/api/agent` need the user's agent-access flag". The endpoints are
  "mounted behind `requireAgentAccess`". `started_by` is "the starting
  user's id". A short paragraph covers the flag: admins set it per user, new
  users start without it, the migration grants it to existing admins and the
  seed grants it to the seeded user.
- `docs/architecture.md`: the admin-only lines for `AgentRunPanel`, the
  `/api/agent` mount, `agentRuns.ts` and `middleware/auth.ts` (now listing
  `requireAgentAccess`) describe the flag. The `seed.ts` and `users.ts` lines
  mention agent access and `setUserAgentAccess`.

## Work order

1. Schema, migration and mapper: `SCHEMA` column, `migrateUserAgentAccess`
   plus its tests, `UserRow`/`toUser`, `User.agentAccess` in both type
   files, `setUserAgentAccess`, and the `seedUser` grant plus its tests. Fix
   any fixtures that the new required field breaks at build time (`role:
   'admin'|'basic'` user objects in `src/**/*.test.tsx`).
2. Server gate: `requireAgentAccess` and the swap in `app.ts`. Update
   `server/routes/agentRuns.test.ts`.
3. Admin endpoint: `validateAgentAccess`, `agentAccessHandler` and its
   route, plus tests in `users.test.ts` and `validation.test.ts`.
4. Client: `api.ts`, `UserRow`/`UserList`/`AdminView`, `admin.css`, and the
   `AdsView`/`App` prop swap, plus component tests.
5. E2E: extend `e2e/admin.spec.ts` (see Tests). `agentRuns.spec.ts` keeps
   passing because the seeded user has the flag.
6. Docs: `docs/in-app-agent.md` §7 and `docs/architecture.md`.

## Tests

- New, `server/lib/migrations.test.ts`: on a legacy database, admins get
  `agent_access = 1` and basic users get 0. Running the migration twice is a
  no-op, so an admin whose flag was turned off stays off.
- New, `server/lib/seed.test.ts`: seeding a fresh user grants agent access,
  and re-seeding an existing user grants it again.
- Updated, `server/routes/agentRuns.test.ts`: the "basic user is 403" case
  becomes "a user without agent access is 403". New cases: an **admin
  without** the flag is 403, and a **basic user with** the flag can POST
  (201) and GET (200).
- New, `server/routes/users.test.ts`: an admin can set and clear the flag
  (200, and the body carries `agentAccess`). An unknown id is 404, a
  non-boolean or missing `agentAccess` is 400, and a basic caller is 403.
  `GET /users` rows carry `agentAccess`. A created user starts with
  `agentAccess: false`.
- New, `server/lib/validation.test.ts`: `validateAgentAccess` accepts
  `true`/`false` and rejects `"true"`, `1`, a missing field and a non-object
  body.
- Updated, `src/components/AdsView.test.tsx`: "a user without agent access
  sees no run panel" and "a user with agent access sees the run panel",
  using the `canRunAgent` prop.
- New, `src/components/UserRow.test.tsx`: the checkbox reflects
  `user.agentAccess`, and clicking it calls `onSetAgentAccess` with the
  toggled value. Query it with `getByRole('checkbox', { name: 'Agent access
  for <name>' })`.
- Updated, `src/components/AdminView.test.tsx`: toggling a row PUTs to
  `/api/users/:id/agent-access` and shows the toast.
- New, `e2e/admin.spec.ts`: the admin creates a basic user, who logs in and
  sees no Runs region in the ad inbox. The admin grants agent access from the
  row, and the basic user, on reload, sees the Runs region.
- Failure cases: `PUT /api/users/:id/agent-access` returns 400 (body not an
  object, or `agentAccess` not a boolean), 404 (unknown user) or 403 (caller
  not admin). `/api/agent/*` returns 401 (no session or user gone) or 403
  (flag off). The client gets all of these through `checkOk`, and AdminView
  shows the error toast as it does for role changes.
- Verification: `npm test -- --maxWorkers=2`, `npm run lint`,
  `npm run build`, then `npm run test:e2e` after checking ports
  (`ss -ltnp | grep -E '5173|3001|3002'`; if they're taken, use
  `test:e2e:prod`).

## Risks / rollback

The migration adds a column and backfills it from `role`. Rolling back the
code leaves an unused `agent_access` column, which the old code ignores
because it selects `*` and maps fields by name. Nothing needs undoing.

---

**Next stage:** run `/sdlc`.
