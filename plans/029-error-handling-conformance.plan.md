---
brief: brief/029-error-handling-conformance.md
branch: 029-error-handling-conformance
date: 2026-10-07
---

# Bring existing code into line with the error-handling skill — Plan

## Context

The `error-handling` skill and the `Errors:` contract say routes **throw**
`HttpError` and the single edge handler formats and logs. Code written before
the skill still breaks those rules. Routes write `res.status(4xx).json(...)` by
hand, so those failures are never logged. Two no-body PUTs answer 500. A
download whose file has gone leaks an absolute server path. Validators return
`null`, so every bad field comes back as the same vague message. Conflicts
answer 400. Three MCP catches drop the error's cause. The CLI entry points
print a stack trace for a missing env var. The contract stays
`{"error": "<message>"}`, so no client code changes.

The brief's open questions are settled:

- **A download whose file is missing on disk → 500.** The DB and `uploads/`
  have drifted, which is our fault. The caller gets `internal server error`,
  and the log line, with its stack, names the attachment and its stored file.
- **Validators report the first bad field only**: one check after another,
  each a `throw`.
- **`GET /api/me`'s 401 is logged** like every other caller fault: one line,
  no stack. No special case.
- **multer's `destination` callback:** multer 2.3.0 calls `_handleFile`
  synchronously inside busboy's `'file'` listener, so a `mkdirSync` throw
  there escapes multer's error path instead of reaching `next`. The fix
  removes the question rather than relying on a probe: `destination` uses
  callback-style `mkdir(uploadsDir, { recursive: true }, (error) =>
  callback(error, uploadsDir))`. multer's own `abortWithError` then forwards
  any failure to `next`, and the edge answers 500. A test forces the failure.

## Affected files

- `server/lib/validation.ts`: the validators throw instead of returning
  `null`.
  - A private `fieldsOf(body)` throws `HttpError(400, 'request body must be a
    JSON object')` for anything that isn't a non-null object. This covers the
    `undefined` that Express 5 leaves when no parser matched.
  - `validateInput(body): ApplicationInput` checks in this order, throwing
    `HttpError(400, …)` at the first failure:
    - `company is required`
    - `role is required`
    - `deadline must be a string`
    - `status must be one of: <STATUSES joined by ", ">`
    - `dateApplied is required unless status is draft`
  - `validateUserInput(body): UserInput` checks `username is required`, then
    `password is required`, then `role must be one of: <ROLES>`.
  - New `validateRole(body): Role` and `validatePassword(body): string` for
    the two single-field PUTs. They reuse `fieldsOf` and the same messages, so
    a missing body becomes a 400 instead of a 500.
  - `isRole` stops being exported because only this file uses it now.
- `server/routes/applications.ts`, `attachments.ts`, `users.ts`, `auth.ts`
  and `server/middleware/auth.ts`: every `res.status(4xx).json({ error });
  return` becomes `throw new HttpError(status, message)`, and handlers lose
  `res` where they no longer need it. Success responses (`201`, `204`, `200`)
  are unchanged. Messages are unchanged except:
  - `archiveHandler`: `invalid archived` becomes `archived must be true or
    false`.
  - `users.ts`: `username taken` and `cannot demote the last admin` become
    **409**. `cannot demote yourself` and `cannot delete yourself` stay 400.
  - `users.ts`: `roleHandler` and `passwordHandler` call
    `validateRole(req.body)` and `validatePassword(req.body)` in place of the
    `(req.body as …).x` casts.
- `server/routes/attachments.ts`, two more changes:
  - `downloadHandler` passes a callback: `res.download(path, name, (error) =>
    { if (error) next(new Error(\`cannot send attachment ${row.id}
    (${row.stored_name})\`, { cause: error })) })`. A plain `Error` has no
    `status`, so the edge answers a generic 500 and logs the stack. The send
    error's own 404 and path never reach the response.
  - `buildUpload`'s `destination` switches to callback `mkdir`, as described
    above.
- `server/index.ts`, `server/seed.ts`, `mcp/index.ts`: a missing env var
  prints one line on stderr and calls `process.exit(2)` instead of `throw`ing.
  In `server/index.ts`, `parsePageSize` keeps throwing. The entry point is the
  CLI's edge, so it wraps that one call, prints `error.message` and exits 2.
- `mcp/lib/files.ts`: `readLocalFile` says `no file at <path>` only when
  `code === 'ENOENT'`, with `{ cause: error }`. Any other failure, such as
  EISDIR or EACCES, rethrows unchanged.
- `mcp/lib/client.ts`: `fetchOrExplain` catches only `TypeError`, which is
  what `fetch` rejects with for a network failure, and rethrows anything else.
  It wraps with `{ cause: error }`.
- `mcp/tools/attachments.ts`: `namingMissingAttachment` adds
  `{ cause: error }`.
- `CLAUDE.md`, `Errors:` line: one added sentence. CLI entry points report
  missing or invalid configuration as one stderr line and exit 2, with no
  stack.

`jsonErrorHandler`, `logError`, `HttpError`, `checkOk` and the MCP
`readError` need no change. The edge already answers and logs whatever is
thrown.

## Work order

1. **Mechanical conversion.** Turn every hand-written 4xx in the four routers
   and `middleware/auth.ts` into a `throw new HttpError(...)`, with the same
   status and message. Run `npm test`: everything should still pass, because
   the edge answers identically. This is the regression net.
2. **Validators throw.** Rewrite `validation.ts` as above and switch the
   callers. Update `mcp/lib/client.test.ts`, which expected `invalid
   application`, to expect `company is required`. Add the validator tests.
3. **No-body PUTs.** Wire `validateRole` and `validatePassword` into
   `users.ts`, and add the no-body tests.
4. **409s.** Change both statuses. Update `users.test.ts`'s two assertions,
   and change the status in the `AdminView.test.tsx` fixture to 409.
5. **Download leak and multer `mkdir`.** Make both `attachments.ts` changes
   and add their tests.
6. **MCP causes.** Change `files.ts`, `client.ts` and `tools/attachments.ts`,
   with tests.
7. **CLI entry points.** Change all three files and add the spawn tests.
8. **Contract line.** Add the sentence to `CLAUDE.md`. Then run `npm test`,
   `npm run lint` and `npm run build`.

## Tests

- New, in `server/lib/validation.test.ts`, one assertion per message:
  - `validateInput`:
    - non-object body, `undefined` and an array → `request body must be a
      JSON object`
    - empty `company` → `company is required`
    - missing `role` → `role is required`
    - numeric `deadline` → `deadline must be a string`
    - unknown status → `status must be one of: …`
    - `applied` without `dateApplied` → `dateApplied is required unless
      status is draft`
    - in every case, the thrown error is an `HttpError` with status 400
  - `validateUserInput`: each of its three messages.
  - `validateRole` and `validatePassword`: `undefined` body, wrong value.
- New, in `server/routes/users.test.ts`:
  - `PUT /api/users/:id/role` and `/password` with **no body** → **400**,
    `request body must be a JSON object`. This was a 500 before.
  - A taken username → **409** `username taken`, and `console.error` is
    called exactly once with a line ending `409 username taken` and no stack.
    This proves item 2 of "done", since route 4xx now reach `logError`.
- New, in `server/routes/attachments.test.ts`:
  - **Download a file deleted from disk** → 500,
    `{"error":"internal server error"}`, and the body doesn't contain
    `uploadsDir`. A spy on `console.error` asserts the line names the
    attachment.
  - **Upload when the uploads directory can't be created**: point
    `uploadsDir` at a path under a regular file (ENOTDIR) → 500 `internal
    server error`, and the process survives, since a follow-up request still
    answers.
- New, in `server/routes/applications.test.ts`: a POST with an empty
  `company` answers `{"error":"company is required"}`, which pins that the
  message reaches the caller.
- New, in `mcp/lib/files.test.ts`:
  - a missing path → `no file at <path>`, with `cause.code === 'ENOENT'`
  - a directory path → rejects with EISDIR, **not** `no file at`
- Updated, in `mcp/lib/client.test.ts`:
  - The unreachable-API test also asserts that `cause` is a `TypeError`.
  - The rejected-request test expects `company is required`.
- New, in `server/index.test.ts`, `server/seed.test.ts` and
  `mcp/index.test.ts`, each using `spawnSync(process.execPath, [entry], { env:
  { PATH } })`:
  - exit status 2
  - stderr names the missing variables
  - stderr has no `    at ` stack line
  - `server/index.test.ts` also covers `PAGE_SIZE=0` with the other vars set:
    exit 2 with the `PAGE_SIZE must be …` message. Set `DB_PATH` to a temp
    path so nothing is opened before the check fails. The check runs before
    `openDatabase`.
- Updated:
  - `users.test.ts`: last-admin → 409.
  - `AdminView.test.tsx`: fixture status → 409. The message is unchanged.
- Not separately testable: `namingMissingAttachment`'s `{ cause }`. The MCP
  SDK flattens a thrown tool error to text, so the cause isn't observable
  through the tool result. The visible message is unchanged and already
  pinned by `mcp/tools/attachments.test.ts`.
- Failure cases covered:
  - malformed or missing body → 400 naming the field
  - conflicts with current state → 409
  - unknown resource → 404, unchanged
  - unauthenticated or forbidden → 401/403, unchanged, now logged
  - forced internal failures (missing file, uploads `mkdir` failure) → generic
    500, no path in the body
  - CLI usage errors → exit 2, one line, no stack
- Verification command: `npm test`, then `npm run lint` and `npm run build`.
  E2E isn't required by the gate, but `npm run test:e2e:prod` is a cheap
  extra check that the admin page's error toast still works. Check the ports
  first, per CLAUDE.md.

## Risks / rollback

Nothing is hard to reverse: no schema, no dependency, no response-shape
change. The visible changes are new messages and two 400s that become 409s.
Both clients surface `error` as-is, and no client code branches on 400 vs 409.
Route tests that provoke a 4xx will now print a log line to stderr. That's
expected output, not a failure. Rollback is reverting the build commit.

---

**Next stage:** run `/sdlc`.
