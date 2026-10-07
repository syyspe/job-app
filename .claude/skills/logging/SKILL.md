---
name: logging
description: Use whenever writing code that logs, or that should — a new HTTP route or middleware, a CLI command, a background job or worker, startup and configuration, a call to an external service — and any time you are about to write a print/console.log or a logger call. Also at Stage 2, when a plan adds the project's first boundary: that plan decides the project's logging contract alongside its error contract.
---

# Logging

Logs are how we find out what happened after the fact, without a debugger
attached. The failure this skill exists to prevent: something goes wrong in
production, and the logs are either silent, a wall of debug noise, or
`console.log` lines with no time, no level and nothing that ties a caller's
report to the line that explains it.

`error-handling` decides *when* an error is logged — once, at the edge. This
skill decides how every log line is written, errors included.

## One logger, configured once

- **Use a real logger, never `print`/`console.log`/`fmt.Println`.** Take the
  framework's own if it has one, otherwise the language's standard one
  (Python `logging`, Go `log/slog`) or the usual choice for the stack (pino in
  Node). Configure it in one place at startup; everything else just gets it.
- **The level comes from configuration** (an environment variable or the
  config file), defaulting to `info`. Never hard-code it per module.
- **A CLI keeps stdout for its output.** Logs and diagnostics go to stderr, so
  piping the output never picks up a log line.
- **No leftover debug output.** Temporary prints used while building are
  removed before the build commit; anything worth keeping becomes a `debug`
  call.

## Levels

| Level | For | Example |
|---|---|---|
| error | our fault, someone should look | unhandled exception at the edge, with stack |
| warn | unexpected but handled | retry succeeded on the 2nd attempt, fallback used |
| info | the normal story, one line per notable thing | startup, a request finished, a job ran |
| debug | detail for diagnosing one problem, off by default | the outbound request being sent |

A caller's-fault error is `info` or `warn`, not `error` — a malformed request
is the caller's problem, and paging on it trains everyone to ignore `error`.

## What gets logged

- **Startup:** one line with the version, environment and the non-secret
  config that matters (port, log level, which database host).
- **Every request or command:** one line when it finishes — method and route
  (or command), status or exit code, duration. Use the framework's access log
  if it has one rather than writing your own.
- **Errors:** as `error-handling` says — once, at the edge, with a stack only
  for our own faults.
- **Background jobs:** start and finish, with a count of what they did, and
  each failure.
- **Calls to external services:** at `debug`; a failure surfaces as an error
  through the normal path, not a separate log line.

Not every function call, loop iteration or successful database query. If a
line wouldn't help diagnose a real incident, don't add it.

## How a line is written

- **Fixed message, variable fields.** `log.info("order created", order_id=id)`,
  not `log.info(f"order {id} created")` — the message stays searchable and the
  fields stay filterable.
- **Every line in a request carries its request ID.** Take it from an incoming
  header if the contract names one, otherwise generate it at the edge, and
  attach it to the logger for that request (child logger, context var,
  `MDC`), not by passing it through every function. Return it to the caller —
  as a response header and in the error body — so a report can be matched to
  the line that explains it.
- **Log IDs, not objects.** A user ID, not the user; an order ID, not the
  order.

## Never log

- secrets, tokens, passwords, API keys, session cookies, `Authorization`
  headers
- whole request or response bodies
- personal data — emails, names, addresses, phone numbers — unless the
  project's contract explicitly allows a field and says why

If a library logs any of these by default, turn that off or redact it in the
logger configuration.

## The project's logging contract

Like errors, the general rules above become a contract on the `Logging:` line
in `CLAUDE.md`'s Conventions, so every module logs the same way. It states:

- the logger and where it's configured
- the format — JSON lines for anything that runs as a service, plain text for
  a CLI or local-only tool
- where logs go (stdout/stderr, a file) and the setting that controls the level
- the request ID header name, if the project has requests

**When it's decided:** in the same plan that decides the `Errors:` contract —
the project's first boundary. The request ID and the log line for a failure
belong to both, so they're decided together. The build commit records it on
the `Logging:` line and includes the logger setup. Changing it later needs its
own brief.

## Tests

Don't assert on log output in ordinary tests — it couples them to wording.
The one exception: the forced-internal-failure case `error-handling` already
requires should also check that exactly one `error` line was written, with a
stack and the request ID, and that the response carries the same request ID.

## Self-check before finishing

- Any `print`/`console.log` left in code this change touched?
- Does each new request, command or job produce its one finishing line?
- Is every new log line a fixed message with fields, at the right level?
- Could any new line contain a secret, a body or personal data?
