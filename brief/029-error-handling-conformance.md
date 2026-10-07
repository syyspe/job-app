---
slug: 029-error-handling-conformance
date: 2026-10-07
---

# Bring existing code into line with the error-handling skill

## Problem

The `error-handling` skill and the `Errors:` contract line in `CLAUDE.md`
landed in 95ef630. Stream 028 deliberately left working routes alone
("`HttpError` is for new and changed code"), but the skill now says a
contract "applies everywhere, not just to new code", and the new definitions
take precedence over what is built. Audit of `master` at 8a84ab1:

**Caller-controlled input that still produces a bad answer** (probed against
a real app instance):

| Request | Now | Cause |
|---|---|---|
| `PUT /api/users/:id/role`, no body | 500 | `(req.body as {...}).role` on `undefined` |
| `PUT /api/users/:id/password`, no body | 500 | same, `server/routes/users.ts:79` |
| `GET /api/attachments/:id`, file gone from `uploads/` | 404 with `ENOENT … stat '/…/uploads/<uuid>.txt'` | `res.download`'s `send` error reaches the handler as a 4xx and its message — an absolute server path — is passed through verbatim |

**Routes format their own failures.** 28 hand-written
`res.status(4xx).json({ error })` calls in `server/routes/{applications,
attachments,users,auth}.ts` and `server/middleware/auth.ts`, against the
contract's "throws `HttpError` … and doesn't write `res.status(...).json(...)`
by hand". Side effect: none of those 4xx reach `logError`, so they are never
logged — the skill's table wants one line, no stack, for every caller fault.

**Validators return `null` to mean "failed"** (`validateInput`,
`validateUserInput` in `server/lib/validation.ts`), so every bad field
collapses to `invalid application` / `invalid user`. The skill wants the
language's idiom (throw) and a message saying what was wrong.

**Conflicts answered as 400.** `username taken` and `cannot demote the last
admin` are conflicts with current state, which the skill's table maps to 409.

**Catches that drop the cause or catch too broadly:**
- `mcp/lib/files.ts:21` — any `readFile` failure (EACCES, EISDIR) is
  reported as `no file at <path>`, cause discarded.
- `mcp/lib/client.ts:50` — `fetchOrExplain` catches everything from `fetch`
  and rethrows without `{ cause }`.
- `mcp/tools/attachments.ts:23` — wraps a 404 `ApiError` without `{ cause }`.

**CLI entry points crash with a stack for a caller's mistake.**
`server/index.ts`, `server/seed.ts` and `mcp/index.ts` `throw` at top level
on missing env vars, so Node prints a stack trace and source excerpt for what
is a usage error — the skill wants a message on stderr and a non-zero exit,
no stack.

Conforming already, recorded so the plan doesn't redo it: `jsonErrorHandler`
and `logError`; the 415 guard; `server/lib/files.ts` (catches `ENOENT`
specifically, a named recovery); `checkOk`/`useApiAction` on the client (the
UI's edge); `response.json().catch(() => null)` in both API clients (a
genuine fallback); Express 5 forwards rejected promises, so async handlers
reach the edge.

## What done looks like

1. No `res.status(4xx).json(...)` left in `server/` outside
   `jsonErrorHandler`; routes and middleware `throw new HttpError(...)`.
   Success responses (`201`, `204`) are unchanged.
2. Every caller's-fault 4xx is logged as one line via `logError`, no stack.
3. `PUT /api/users/:id/role` and `/password` with no body answer **400**, not
   500.
4. A download whose file is missing on disk answers without any server path
   in the body (status decided in the plan — see Open questions).
5. `validateInput` and `validateUserInput` throw `HttpError(400, …)` with a
   message naming the field and what to send (e.g. `company is required`,
   `status must be one of: draft, applied, …`), instead of returning `null`.
6. `username taken` and `cannot demote the last admin` answer **409**.
   `cannot demote yourself` and `cannot delete yourself` stay 400.
7. The three MCP catches keep their cause (`{ cause: err }`), and
   `readLocalFile` only says "no file" for `ENOENT`.
8. `server/index.ts`, `server/seed.ts` and `mcp/index.ts` report missing
   configuration as one line on stderr and exit non-zero, without a stack.
9. Tests for every changed failure path (status + message), and the existing
   tests that pinned old messages/statuses updated —
   `mcp/lib/client.test.ts` (`invalid application`),
   `src/components/AdminView.test.tsx` (last-admin), and the server route
   tests.

## Approach

Keep the `{"error": "<message>"}` contract as recorded in `CLAUDE.md`. The
skill prefers RFC 9457 `application/problem+json`, but a contract change
needs its own brief and would touch `checkOk`, the MCP client and every body
assertion — not this stream.

Mechanical conversion first (each `res.status(4xx).json({error})` + `return`
becomes a `throw new HttpError(status, message)`), which `jsonErrorHandler`
already answers identically, so most existing tests pass unchanged and act
as the regression net. Then the behaviour changes on top: validators that
throw, the 409s, the no-body 500s, the download leak.

Express 5 catches a synchronous `throw` in middleware and handlers, so
`requireSession`/`requireAdmin`/`checkApplicationExists` can throw too.

The client needs no code change: `checkOk` and the MCP `readError` already
surface whatever `error` says, so better messages show up in the toast and
in Claude Desktop for free.

Rejected: **`http-errors` instead of `HttpError`.** The skill prefers the
framework's type, but `HttpError` is the type the contract names, it's three
lines, and taking `http-errors` as a direct dependency needs approval for no
behavioural gain.

Rejected: **zod on the server for validation** — approved only for `mcp/`,
and hand-written checks that throw are enough for two validators.

## Out of scope

- Changing the response shape to RFC 9457.
- `Number(req.params.id)` on a non-numeric id answering 404 (028 judged it
  defensible).
- Access logging, log levels, a logging library.
- Client UI changes beyond updated test fixtures.

## Open questions

- The download with a missing file: is that **404 `not found`** (the caller
  asked for something that, from their side, isn't there) or **500** (DB and
  `uploads/` drifted — our fault, logged with a stack)? `unlinkIfExists`
  already treats that drift as expected, which argues 404; the skill's "our
  fault" column argues 500.
- Whether a validator reports only the first bad field or all of them in one
  message.
- `multer.diskStorage`'s `destination` calls `mkdirSync` inside the callback;
  if that throws (permissions), check whether multer forwards it to `next` or
  it escapes as an uncaught exception. Plan should probe.
- Should `meHandler`'s 401 on every logged-out page load (`GET /api/me`)
  be logged? Following the skill, yes — one line each — but it may be noise.
