---
slug: admin-users
date: 2026-09-22
---

# An admin page for managing users

## Problem

Accounts exist only because `npm run seed` made one. Adding a second person
means shell access to the server, editing `.env`, and running the CLI again;
a forgotten password can't be changed from the app at all, because nothing
anywhere writes a password hash except the seed. Every user is also equal —
there is no notion of who is allowed to manage accounts, so there is nowhere
to put that ability even if the endpoints existed.

## What done looks like

1. `users` gains a `role` column, `'admin'` or `'basic'`, `NOT NULL DEFAULT
   'basic'`. Existing databases pick it up additively, like the other
   migrations.
2. The user named by `.env`'s `SEED_USERNAME` is an admin: `npm run seed`
   sets the role whether it creates that user or finds them already there.
3. `GET /api/me` returns the role alongside the username, so the front end
   can decide what to show.
4. An admin-only `/api/users` router: list, create, update, delete. A basic
   user's session gets 403 on every one of them; no session still gets 401.
5. Create takes a username, a password and a role.
6. Edit covers the role and a password reset — nothing else. Usernames are
   not editable.
7. Deleting a user cascades: their applications, their attachment rows and
   their uploaded files on disk all go with them.
8. The API refuses to delete the account you're logged in as, and refuses to
   demote the last remaining admin. Both checks live on the server.
9. Applications stay strictly per-user. An admin sees only their own — no
   route gains an admin bypass, and the existing `WHERE user_id = ?` scoping
   is untouched.
10. The nav shows an "Admin" control to admins only, which switches the app
    between the applications view and the admin view.
11. The admin page reads like the rest of the app — the same tokens, panels,
    forms and buttons, no new visual vocabulary.
12. `npm test` passes, with route tests for 403-as-a-basic-user, both lockout
    guards, and the delete cascade. `npm run test:e2e` passes, covering that
    a basic user never sees the Admin control.

## Approach

`role` is modelled the way `status` already is: a `ROLES` tuple and a `Role`
type in `server/types.ts` and its hand-kept twin `src/types.ts`, with the
check in `server/lib/validation.ts` beside the existing one.

A new `server/routes/users.ts` router factory, mounted in `app.ts` after
`requireSession`, behind a `requireAdmin` middleware added to
`server/middleware/auth.ts` — so `app.ts` keeps showing the whole protection
story in its mount order. Password hashing reuses `server/lib/passwords.ts`;
creating a user reuses `createUser` from `server/lib/seed.ts` rather than
growing a second `INSERT`.

The cascade is explicit, not a schema change: `applications.user_id` is a
plain reference, and the files on disk are nobody's foreign key. The handler
collects the user's attachments, deletes the rows in one transaction, then
unlinks the files through `server/lib/files.ts`. Sessions already cascade
from `users`, so a deleted user is logged out everywhere by the same
statement.

Front end: an `AdminView` component beside the others, its API calls added to
`src/lib/api.ts`, and a view switch held in `App.tsx`'s state that `NavBar`
toggles. No URL and no new dependency — react-router was the alternative and
buys deep links this app has never had. The `frontend-design` skill gets read
before the admin page's markup and CSS, and new rules read tokens from
`index.css` rather than inventing values.

Rejected: letting admins see everyone's applications. The admin role is about
managing accounts, not about reading other people's job hunts.

Rejected: editing usernames. It's a unique column with a clash to report and
no demand behind it.

## Out of scope

- Self-service signup, and users changing their own password — a reset is
  something an admin does to someone else.
- Admins reading, editing or transferring another user's applications.
- Any role beyond the two, and per-route permissions finer than admin/basic.
- An audit trail of who created or deleted whom.
- MCP tools for users. `mcp/` doesn't change.
- URL routing, deep links and the back button.

## Open questions

- A database that migrates but is never re-seeded has no admin at all until
  `npm run seed` runs again. Is "run the seed" the documented answer, or
  should the migration promote the lowest-id user?
- Password rules. There are none anywhere today; does the create form get a
  minimum length, or does it stay as permissive as the seed?
- Is one confirm dialog enough in front of an irreversible cascade, or should
  deleting a user require typing the username?

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/admin-users.plan.md` before writing any
code.
