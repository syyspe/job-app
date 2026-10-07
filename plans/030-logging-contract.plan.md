---
brief: brief/030-logging-contract.md
branch: 030-logging-contract
date: 2026-10-07
---

# Decide job-app's logging contract — Plan

Decisions taken with the user: a thin no-dependency logger (no pino), a request
ID that is always generated (incoming headers ignored), and `mcp/` outside the
contract.

## Affected files

- `server/lib/logger.ts` (new) — `createLogger(level, write?)` returning
  `{ debug, info, warn, error, child }`. Each call writes one JSON line
  `{"time":<ISO>,"level":…,"msg":…,...fields}`. `write` defaults to
  `process.stdout.write`. Tests inject their own. `child(fields)` merges fields
  into every line. Levels are `debug < info < warn < error`, plus `silent`,
  which writes nothing. Exports the `Logger` and `LogLevel` types.
- `server/lib/logger.test.ts` (new).
- `server/lib/config.ts` (+ test) — `parseLogLevel(value)` beside
  `parsePageSize`. `undefined` → `'info'`. A valid level name passes through.
  Anything else throws `Error('LOG_LEVEL must be one of debug, info, warn,
  error, silent')`.
- `server/middleware/requestLogging.ts` (new, + test) —
  `requestLogging(logger)`:
  - generates `crypto.randomUUID()` and sets the `X-Request-Id` response header
  - sets `res.locals.requestId` and `res.locals.log = logger.child({ requestId })`
  - captures `req.method`, `req.path` (no query string) and a start time
  - on `res`'s `close` event, writes `log.info('request finished', { method,
    path, status, durationMs })`

  It also augments Express's `Locals` interface with `log: Logger` and
  `requestId: string`, so neither needs a cast.
- `server/app.ts` — `CreateAppOptions` gains `logger?: Logger`. When it's
  omitted, it defaults to `createLogger('silent')`, so the ~12 test call sites
  stay quiet and unchanged. `app.use(requestLogging(logger))` is mounted
  first, before `express.json()`, so every request gets an ID, including one
  whose body fails to parse.
- `server/middleware/errors.ts` — drops `logError`. It logs through
  `res.locals.log`:
  - 4xx: `info('request failed', { status, error: message })`
  - 5xx: `error('request failed', { status, error: message, err:
    inspect(error) })`. `util.inspect` keeps the stack and the cause chain that
    `console.error(error)` gives today.

  Both bodies gain `requestId: res.locals.requestId`. The handler still logs
  exactly once.
- `server/lib/logging.ts`, `server/lib/logging.test.ts` — deleted. The
  cause-chain test case moves into `errors.test.ts`.
- `server/index.ts` — reads `LOG_LEVEL` through `parseLogLevel`, with the same
  exit-2 pattern as `readPageSize`. It builds the one logger, passes it to
  `createApp`, and replaces the `console.log` startup line with
  `logger.info('api listening', { port, logLevel, db: dbPath, uploads:
  uploadsDir, pageSize })`. There's no version field: `package.json` stays at
  `0.0.0`.
- Tests that assert exact error bodies (15 assertions in
  `server/routes/{applications,users,attachments,auth}.test.ts` and
  `errors.test.ts`) switch from `toEqual({ error })` to `toMatchObject({ error
  })`. The `vi.spyOn(console, 'error')` checks in `users.test.ts:140` and
  `attachments.test.ts:324,357` pass a capturing logger via `createApp`'s
  `logger` option instead.
- `CLAUDE.md` — replaces the `Logging:` line with the contract below. In the
  `Errors:` line, the body becomes `{"error", "requestId"}` and the `logError`
  sentence becomes "jsonErrorHandler logs it through the request's logger".
- `docs/architecture.md` — adds `lib/logger.ts` and
  `middleware/requestLogging.ts`, and removes `logging.ts`.
- `README.md` env-var list and `.env.example` — `LOG_LEVEL` (commented, default
  `info`).

## Work order

1. `logger.ts` + tests.
2. `parseLogLevel` + tests.
3. `requestLogging` middleware + tests. Mount it in `app.ts` with the `logger`
   option.
4. `jsonErrorHandler` logs via `res.locals.log` and adds `requestId` to the
   body. Delete `logging.ts`/its test. Update `errors.test.ts` (it mounts
   `requestLogging` with a capturing logger) and the route tests listed above.
5. `index.ts`: `LOG_LEVEL`, one logger, the startup line through it.
6. Docs: `CLAUDE.md` `Logging:`/`Errors:` lines, `docs/architecture.md`,
   README, `.env.example`.
7. `npm test`, `npm run lint`, `npm run build`. Check the e2e ports, then run
   `npm run test:e2e`.

## Contracts

- Errors (amended, as the brief allows): every failure body is `{"error":
  "<message>", "requestId": "<id>"}`. The `requestId` matches the
  `X-Request-Id` header and the log lines for that request. Everything else is
  unchanged.
- Logging: `createLogger` (`server/lib/logger.ts`) is a no-dependency wrapper,
  built once in `server/index.ts` and passed to `createApp`. Nothing else
  constructs one except tests.
  - Format and level: JSON lines `{time, level, msg, ...fields}` to stdout. The
    level comes from `LOG_LEVEL` (`debug|info|warn|error|silent`, default
    `info`). An invalid value means exit 2.
  - Request ID: `requestLogging`, mounted first in `app.ts`, generates a UUID
    per request. Incoming headers are ignored. It returns the ID as
    `X-Request-Id`, puts a child logger carrying it on `res.locals.log`, and
    writes one `request finished` info line (method, path without query,
    status, durationMs). Request-scoped code logs only through
    `res.locals.log`.
  - Errors: logged once, by `jsonErrorHandler`. A 4xx logs at `info` without a
    stack. A 5xx logs at `error` with `err` (the inspected error: its stack
    and cause chain).
  - Messages and fields: messages are fixed strings and variable data goes in
    fields. Log IDs, never request or response bodies, headers, cookies,
    passwords or usernames.
  - Outside the logger: CLI entry points (`server/seed.ts`, the config checks in
    `server/index.ts` before the logger exists) keep their one plain stderr
    line + exit 2. `mcp/` is outside this contract. It keeps stdout for
    JSON-RPC and its exit-2 config line on stderr.

## Tests

- New, `logger.test.ts`:
  - a call writes exactly one parseable JSON line with `time`, `level`, `msg`
    and the fields
  - lines below the level aren't written
  - `silent` writes nothing
  - `child` fields appear on every line, and call fields win on a clash
- New, `config.test.ts`: `parseLogLevel` returns `'info'` for `undefined`, passes
  `'debug'` through, and throws the message above for `'loud'`.
- New, `requestLogging.test.ts`:
  - the response carries a UUID `X-Request-Id` that is different for each
    request
  - exactly one `request finished` line carries `method`, `path` (with no
    query string), `status`, `durationMs` and the same `requestId`
- Updated, `errors.test.ts`:
  - a 4xx writes one `info` line carrying the status and message, and its body
    `requestId` equals the header
  - a forced 5xx writes **exactly one `error` line**, whose `err` contains the
    stack and the `[cause]` chain and whose `requestId` equals the response
    header and the body's `requestId`. This is the one log assertion the
    `logging` skill allows.
  - the mid-stream failure still writes one `error` line
- Updated: the route tests named above. Error bodies are checked with
  `toMatchObject`, and the 500 cases use a capturing logger instead of
  `console.error` spies.
- Failure cases:
  - `LOG_LEVEL` invalid → one stderr line, exit 2, no stack. Same as
    `PAGE_SIZE`.
  - A body that fails to parse still gets an `X-Request-Id` and a `requestId`
    in its 400 body, because `requestLogging` runs before `express.json()`.
  - No other new failure path.
- Verification command: `npm test` (the gate). Then `npm run lint`, `npm run
  build`, and `npm run test:e2e` after the port check from CLAUDE.md.

## Risks / rollback

Nothing hard to reverse. `requestId` is an extra body field and an extra
header: `checkOk` and `mcp/lib/client.ts` read only `error`, so clients are
unaffected. Revert the build commit to roll back.

## Build notes

Where the build departed from the plan:

- `server/index.ts`: `readPageSize` became `readOrExit(read)`, shared by
  `PAGE_SIZE` and `LOG_LEVEL`, so the exit-2 pattern isn't written twice.
  `index.test.ts` gained the invalid-`LOG_LEVEL` case.
- `auth.test.ts` had two more exact-body comparisons than the plan counted
  (wrong password vs unknown user, form-urlencoded login). They now compare
  the `error` field only.
- The malformed-body failure case is asserted in `auth.test.ts`'s existing
  malformed-JSON login test, which also checks the body's `requestId` against
  the header.
- `docs/architecture.md` never listed `logging.ts`, so there was nothing to
  remove there.

---

**Next stage:** run `/sdlc`.
