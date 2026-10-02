---
slug: error-handling
date: 2026-10-02
---

# Client errors answered as 500, and no error logging

## Problem

Requests that are the caller's fault come back as `500 internal server
error`. Measured against a real server on `master` (03bb86d):

| Request | Now | Cause |
|---|---|---|
| `POST /api/login`, form-urlencoded body | 500 | `req.body` undefined |
| `POST /api/login`, malformed JSON | 500 | status on the error discarded |
| `POST /api/login`, no body at all | 500 | `req.body` undefined |
| `POST /api/login`, body `null` | 500 | `req.body` null |
| `POST /api/login`, `text/plain` body | 500 | `req.body` undefined |
| `POST /api/applications`, JSON over 100kb | 500 | status on the error discarded |

Two causes, independent of each other:

1. **`jsonErrorHandler` throws away the status the error already carries.**
   `express.json()` throws `http-errors` objects — `status: 400` for
   `entity.parse.failed`, `413` for `entity.too.large`.
   `server/middleware/errors.ts:14` special-cases `MulterError` and answers
   500 for everything else, including those.
2. **Express 5 leaves `req.body` as `undefined`** when no body parser matched
   the content type (Express 4 left `{}`). `loginHandler` casts it and reads
   `.username` off it (`server/routes/auth.ts:13`), so a form-encoded login
   is a `TypeError`, not a credentials check. The applications routes escape
   this only because `validateInput` happens to null-check first.
   `requireAdmin` has the same shape at `server/middleware/auth.ts:38` —
   `user.role` on a session whose user row was deleted.

And **nothing is logged**. The only `console.*` in `server/` is the listening
banner in `index.ts`, so every one of those 500s is silent: no status, no
message, no stack, nowhere. A real server fault and a caller sending the
wrong `Content-Type` are indistinguishable from the outside *and* from the
inside.

Worth fixing now because the MCP server is a second non-browser caller
against the same API, and a 500 with no log is the one failure neither of us
can diagnose.

## What done looks like

1. `jsonErrorHandler` answers the status the thrown error carries: a 4xx gets
   that status and the error's own message, anything else gets `500
   {"error":"internal server error"}` as today. `MulterError` keeps its 400.
2. An `HttpError` (status + message) in `server/lib/`, which route handlers
   and middleware may `throw` instead of writing `res.status(...).json(...)`
   by hand.
3. A request with a body the API cannot parse gets **415**, naming the
   problem — not a 500 and not a misleading 401. The guard admits
   `multipart/form-data`, because `uploadAttachment`
   (`src/lib/api.ts:158`) posts `FormData` for multer to parse and sets no
   `Content-Type` of its own.
4. Every error reaching the handler is logged to **stderr**, one line:
   method, path, status, message. A 5xx also logs the stack; a 4xx does not.
5. `loginHandler` and `requireAdmin` no longer throw on an absent body or a
   missing user row — login with no body is a failed credentials check, and a
   session pointing at a deleted user is a 401, not a crash.
6. Every row of the table above returns a 4xx, asserted by tests beside the
   code: `server/middleware/errors.test.ts` for the handler, and cases in
   `server/routes/auth.test.ts` for the login requests.

## Approach

The handler stops being a two-branch special case and becomes one rule:
*does this error carry a client-error status?* `express.json()` and multer
both already tag their errors, so honouring the tag fixes those for free, and
`HttpError` lets our own code opt into the same path. 5xx messages stay
generic in the response and go to the log instead — the log is the place for
detail, not the body.

Logging is `console.error` through a small helper in `server/lib/`, no new
dependency. The helper takes the request and the error, so it is testable
without an HTTP round trip.

Rejected: **pino or morgan** — a structured logger and an access log are more
than this problem needs, and both are new dependencies under CLAUDE.md's
policy. Reconsider if the log ever has to be machine-read.

Rejected: **normalising `req.body` to `{}`** so unparseable bodies fall
through to each route's existing validation. Smaller, but it tells a caller
who sent the wrong `Content-Type` that their password is wrong.

Rejected: **adding `express.urlencoded()`** so form posts work. That widens
the API's contract instead of fixing the reporting; `src/lib/api.ts` only
ever sends JSON or `FormData`.

Rejected: **a validation layer across every router** (zod is approved, but
only for `mcp/` so far). The existing `validateInput`/`validateUserInput`
already answer 400 correctly; this stream fixes the errors that escape them.

## Out of scope

- Rewriting routes that already answer 4xx correctly. They keep
  `res.status(...).json(...)`; `HttpError` is for new and changed code.
- Access logging — only errors are logged. A route that answers 401 or 400
  directly, like `requireSession`, never reaches the handler and so logs
  nothing.
- `Number(req.params.id)` on a non-numeric id, which answers 404 today.
  Defensible, and not a 500.
- The client: `checkOk` in `src/lib/api.ts` already reads `{error}` out of
  any non-ok response and surfaces the message, so better statuses improve
  the UI with no change here.
- Rate limiting, and anything else about *what* gets answered rather than
  with which status.

## Open questions

- Whether the error log should be silenced in Vitest. Tests that assert a 500
  will print a stack, which makes a passing run look like a failing one.
- Where the 415 guard belongs: its own middleware in `server/middleware/`
  mounted ahead of the routers in `app.ts`, or a check inside the error path
  of `express.json()`. The first is more explicit about the mount order the
  architecture notes call the security model; the plan picks one.
- Whether a 4xx should pass the error's own message through verbatim.
  `entity.parse.failed` messages come from the JSON parser and read like
  internals ("Unexpected token u in JSON at position 0"), even though they
  describe the caller's own payload.

---

**Next stage:** run `/sdlc`.
