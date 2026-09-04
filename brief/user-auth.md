---
slug: user-auth
date: 2026-09-04
---

# User authentication and per-user applications

## Problem

The API is completely open. Any caller that can reach `/api` can read, edit,
and delete every application and every attachment, and the schema has no idea
who added what — `applications` has no owner column. That's tolerable while
this is one person on localhost and untenable the moment it isn't.

## What done looks like

1. A `users` table: `id`, `username` (`UNIQUE NOT NULL`), password hash,
   created-at. Usernames are unique at the database level, not just in
   application code.
2. Passwords are stored as a scrypt hash with a per-user random salt
   (`node:crypto`). Plaintext is never written to the database or a log.
3. A `sessions` table holding an opaque random token against a `user_id`.
4. `POST /api/login` takes username and password, creates a session, and sets
   it as an httpOnly cookie. Wrong username or wrong password both give the
   same 401.
5. `POST /api/logout` deletes the session row and clears the cookie.
6. `GET /api/me` returns the logged-in user, or 401 — the front end needs it
   to decide whether to show the login form.
7. Every other `/api` route requires a valid session and returns 401 without
   one.
8. `applications.user_id` is `NOT NULL` and references `users(id)`. Every
   read, update, and delete is scoped to the session's user in SQL.
9. Attachments are scoped through their parent application: one user cannot
   list, download, or delete another user's attachment.
10. A seed script creates the initial user (username and password supplied
    by whoever runs it — not hardcoded) and assigns every existing
    application to that user, so the current contents of the database
    survive the migration intact.
11. Front end: a login form, a logout control, `src/lib/api.ts` sending
    credentials and handling 401 by returning to the login form. The app
    still works end to end when this lands.
12. `npm test` passes, with route tests covering 401-without-session and
    one-user-cannot-see-another's-rows. The Playwright specs log in first and
    `npm run test:e2e` passes.

## Approach

Sessions live in the database. The token is 32 random bytes, stored in
`sessions` and sent as an httpOnly, `sameSite=lax` cookie; logout is a
`DELETE` on that row. A JWT was the alternative and was rejected because
logout can't actually revoke one — an endpoint that pretends to log you out
isn't worth having.

No new dependencies. `node:crypto` covers scrypt hashing and token
generation, and comparison is `timingSafeEqual`. Express 5 has no cookie
parsing built in, so the auth middleware reads the single cookie it cares
about out of the `Cookie` header itself rather than pulling in
`cookie-parser`.

Placement follows the existing layout: hashing and token helpers in
`server/lib/passwords.ts` (no Express dependency), the session-checking
middleware in `server/middleware/auth.ts`, login/logout/me in a
`server/routes/auth.ts` router factory. `app.ts` mounts the auth router, then
the middleware, then the existing routers — so the ordering that protects
everything is visible in one file.

Ownership is enforced in the `WHERE` clause, never by fetching a row and
comparing afterwards. Asking for someone else's application returns 404, not
403, so the API doesn't confirm that the id exists.

The schema change is additive in `openDatabase`: create the new tables, and
add `user_id` to `applications` if it isn't there yet.

## Out of scope

- Open registration. Accounts come from the seed script only; there is no
  public signup endpoint.
- Password change and password reset.
- Roles, permissions, or sharing an application between users.
- Login rate limiting and lockout.
- The `secure` cookie flag and anything else HTTPS-specific — this runs on
  localhost.

## Open questions

- Do sessions expire, and after how long? Nothing here sweeps old rows yet.
- The seeded password is a bootstrap credential for a localhost database,
  and with no change-password endpoint in scope there is no way to replace
  it from the app. That's fine for now and is a blocker for hosting this
  anywhere.
- Do the seeded user's credentials belong in the seed script or in `.env`?

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/user-auth.plan.md` before writing any
code.
