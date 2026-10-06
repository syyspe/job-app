---
brief: brief/028-error-handling.md
branch: error-handling
date: 2026-10-02
---

# Client errors answered as 500, and no error logging — Plan

## Context

Six request shapes that are the caller's fault come back as `500 internal
server error`, and nothing is logged anywhere, so a real server fault and a
caller sending the wrong `Content-Type` are indistinguishable from outside
*and* from inside. Two independent causes (`brief/028-error-handling.md`):
`jsonErrorHandler` discards the status `express.json()` already put on its
error, and Express 5 leaves `req.body` as `undefined` when no parser matched,
which `loginHandler` dereferences. The MCP server is a second non-browser
caller against this API, and a silent 500 is the one failure neither side can
diagnose.

The statuses below were confirmed against Express 5.2.1 by probing a real
server during planning:

| Request | Now | After |
|---|---|---|
| `POST /api/login`, form-urlencoded | 500 | **415** |
| `POST /api/login`, malformed JSON | 500 | **400**, the parser's own message |
| `POST /api/login`, no body at all | 500 | **401** invalid credentials |
| `POST /api/login`, body `null` | 500 | **400** (`strict` rejects it as a parse failure) |
| `POST /api/login`, `text/plain` | 500 | **415** |
| `POST /api/applications`, JSON > 100kb | 500 | **413** |

The brief's three open questions are settled: the error log is **not**
silenced by production code — the tests that provoke a 5xx spy on
`console.error` and assert the line; the 415 check is **its own middleware**
mounted in `app.ts`, not a branch inside the error path; and a 4xx passes the
error's **own message** through verbatim, so the handler stays one rule.

## Affected files

- `server/lib/httpError.ts` — **new.** `class HttpError extends Error` with a
  `status`, for route and middleware code to `throw` instead of writing
  `res.status(...).json(...)` by hand.
- `server/lib/logging.ts` — **new.** `logError(request, status, err)`:
  `console.error` of one line — method, path, status, message — plus the stack
  on a 5xx only. It takes `{ method, path }` rather than a `Request`, so it is
  testable without an HTTP round trip. Nothing here writes to stdout.
- `server/middleware/errors.ts` — one rule replaces the two-branch special
  case: resolve a status from the error (`MulterError` → 400, anything
  carrying a numeric `status` → that status, else 500), log it, then answer a
  4xx with the error's own message and anything else with
  `500 {"error":"internal server error"}` as today. **As built there is no
  separate `HttpError` branch** — `HttpError` carries a numeric `status`, so
  the generic rule is what honours it, and a branch for it would be dead.
- `server/middleware/contentType.ts` — **new.** Throws
  `new HttpError(415, ...)` naming the rejected type when a request carries a
  `Content-Type` that is neither `application/json` nor `multipart/form-data`
  (`req.is([...])`). A request with **no** `Content-Type` passes through, which
  is what keeps a bodyless login a credentials check rather than a 415.
  `multipart/form-data` is admitted because `uploadAttachment`
  (`src/lib/api.ts:158`) posts `FormData` for multer and sets no
  `Content-Type` of its own.
- `server/app.ts` — mount the guard at `/api`, between `express.json()` and
  the auth router. Mount order stays the readable statement of the API's
  contract; nothing else moves.
- `server/routes/auth.ts` — `loginHandler` tolerates an absent body
  (`req.body ?? {}`), so its existing `typeof` checks yield `''` and the
  credentials check answers 401. `meHandler` answers 401 instead of crashing
  when the session's user row is gone — the same missing-row shape the brief
  names for `requireAdmin`, three lines away in the same file, so it is fixed
  here rather than left as the one remaining crash of its kind.
- `server/middleware/auth.ts` — `requireAdmin` answers 401 when the session's
  user row no longer exists, instead of reading `.role` off `undefined`.

## Work order

Red-Green-Refactor per step (`simple-code`); each step's tests fail before its
code exists.

1. `HttpError` in `server/lib/httpError.ts` — no test of its own; it is three
   lines, exercised through step 3.
2. `logError` in `server/lib/logging.ts` + `server/lib/logging.test.ts`:
   assert the single line's shape for a 4xx, and that a 5xx adds the stack
   while a 4xx does not. Spy with `vi.spyOn(console, 'error')`.
3. Rewrite `jsonErrorHandler` + new `server/middleware/errors.test.ts`: a tiny
   Express app whose route throws, one case each for `HttpError`, a
   `MulterError`, an `http-errors`-shaped 400, and a plain `Error` (500 with
   the generic body and a logged stack). The `console.error` spy both keeps
   the suite quiet and carries the assertion that the error was logged.
4. The content-type guard and its mount in `app.ts`. Cover it from
   `server/routes/auth.test.ts`: form-urlencoded → 415, `text/plain` → 415,
   and the existing JSON logins still pass.
5. `loginHandler`, `meHandler`, `requireAdmin`. **Found while building:**
   `sessions.user_id` is `ON DELETE CASCADE` and `openDatabase` sets
   `foreign_keys = ON`, so deleting a user takes their sessions with it and
   the brief's "session pointing at a deleted user" cannot be reached through
   the API — only by an out-of-band row delete. The 401s are kept (they also
   make the `as UserRow` / `as { role: string }` casts honest), and their two
   tests turn foreign keys off to create the orphan, since deleting the user
   with them on makes the test pass at `requireSession` and assert nothing.
6. A 413 case — `POST /api/applications` with a >100kb JSON body — in
   `server/routes/applications.test.ts`, where that route's other cases
   already live.
7. `npm run lint`, `npm test` and `npm run build`, then commit.

## Tests

- New: `server/lib/logging.test.ts` — the line's shape; stack on a 5xx, none
  on a 4xx.
- New: `server/middleware/errors.test.ts` — the four error shapes of step 3,
  each asserting both the response and the logged line.
- Updated: `server/routes/auth.test.ts` — form-urlencoded login → 415,
  `text/plain` → 415, no body → 401 `invalid credentials`, body `null` → 400,
  and `/api/me` with a session whose user row was deleted → 401 (the delete
  runs with `foreign_keys = OFF`; see the work order's step 5).
- Updated: `server/routes/applications.test.ts` — a >100kb JSON body → 413.
- Updated: `server/routes/users.test.ts` — an admin route reached with a
  session whose user row was deleted → 401, not a crash (same
  `foreign_keys = OFF` delete).
- Verification command: `npm test` — expect `Test Files N passed / Tests N
  passed` and no `failed` line. Then `npm run lint` and `npm run build`. E2E is
  unaffected and not part of this gate.

## Risks / rollback

The 415 guard is the only change that can refuse a request that works today.
It is scoped to `/api`, keys off `Content-Type` alone, and admits both types
the client actually sends (`src/lib/api.ts` sends JSON or `FormData` and
nothing else); the MCP server speaks JSON over the same routes. Reverting it is
deleting one `app.use` line.

---

**Next stage:** run `/sdlc`.
