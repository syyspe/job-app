---
name: error-handling
description: Use whenever writing or reviewing code that can fail — an HTTP route or middleware, a CLI entry point, parsing input, file/network/database I/O, calling an external API — and any time you write a throw/raise, a catch/except, or a new error type. Also at Stage 2, when a plan adds the project's first such boundary: that plan decides the project's error contract.
---

# Error handling

Errors are part of the interface, not an afterthought to the happy path. The
failure this skill exists to prevent: a project grows for weeks with one
special-cased error handler, and every mistake a caller makes — a malformed
body, a wrong content type, a missing field — comes back as a 500 with nothing
logged. A caller can't tell their mistake from our fault, and neither can we.

## Every error is the caller's fault or ours

Decide which, every time. It sets everything the caller sees.

| | Caller's fault | Our fault |
|---|---|---|
| HTTP | the specific 4xx (400, 401, 403, 404, 409, 413, 415, 422) | 500 (or 502/503 for an upstream) |
| CLI | exit 2 (usage) or 1, with a message on stderr | exit 1, short message on stderr |
| Message | specific — what was wrong and what to send instead | generic — detail goes to the log only |
| Log | one line, no stack | one line plus the stack |

**Anything a caller controls has an expected rejection.** A 5xx caused by
input the caller chose — a body, a header, a path, a query parameter, a file —
is a bug, not an edge case. Unknown errors still default to "ours", but
nothing predictable from input should ever fall through to that default.

## Where errors are handled

Three places, and nowhere else:

1. **At the boundary in.** Validate input where it enters — parsed body,
   arguments, file contents, an external API's response — and reject it there
   with a caller's-fault error. Past that point the code trusts its data;
   `simple-code`'s "No defensive code" applies.
2. **At the edge out, in one place.** One central handler turns errors into
   what the caller sees: an HTTP error middleware, the CLI's `main`, the UI's
   API client. Routes and commands throw; they don't each format their own
   failure responses.
3. **Where you can actually recover** — a retry, a fallback, a default that is
   genuinely correct. If you can't name the recovery, don't catch.

Everywhere else, let errors propagate.

## Idioms

- **Use the language's failure idiom.** Throw/raise in JS/TS, Python, Java,
  C#; return `error`/`Result` in Go and Rust. Don't return `null`, `-1` or
  `false` to mean "failed" where the idiom is to throw.
- **Use the framework's error type before inventing one.** Django's
  `Http404`/`ValidationError`, FastAPI's `HTTPException`, `http-errors` in
  Express. If the framework has none, define exactly one project error type
  carrying the caller-facing classification (e.g. `HttpError(status,
  message)`), not a hierarchy.
- **Honour classifications errors already carry.** Body parsers, upload
  libraries and HTTP clients tag their errors with a status or code. The
  central handler reads that tag rather than special-casing libraries one by
  one.
- **Catch the specific type, never the base class** — except at the edge-out
  handler, which is the one place that catches everything.
- **No empty catch, no catch-log-rethrow.** Swallowing hides the bug; logging
  and rethrowing logs it twice. Log once, at the edge.
- **Keep the cause when wrapping.** `new Error(msg, { cause: err })`,
  `raise X(...) from err`, `fmt.Errorf("...: %w", err)`.
- **Make sure async failures reach the edge handler.** Check how this
  framework version treats a rejected promise or an exception in a callback,
  and don't assume — Express 4 and 5 differ here, for example.
- **Clean up in `finally`/`with`/`using`/`defer`**, not in each catch branch.
- **Never leak internals to the caller**: no stack traces, SQL, file paths or
  library error text in a response for a server fault. Never log secrets, tokens,
  passwords or whole request bodies.

## The project's error contract

The rules above are general. The contract says how *this* project applies
them, so the 30th endpoint fails the same way as the first. It lives on the
`Errors:` line in `CLAUDE.md`'s Conventions and states:

- the shape the caller gets (response body, exit codes, UI message)
- the error type code throws to choose a caller's-fault status
- where the single edge-out handler lives
- what is logged, where, and at what level

**Pick a standard over a home-made shape.** For an HTTP JSON API that's RFC
9457 `application/problem+json`, or the framework's built-in error response
if it has one. For a CLI it's exit codes 0/1/2 with messages on stderr.

**When it's decided:** in the plan that adds the project's first boundary, if
`CLAUDE.md` still says the contract isn't decided. That plan writes the
contract into its Approach, and the build commit records it on the `Errors:`
line. If the build creates the edge-out handler, the same commit includes it.
After that, every change follows the contract. Changing the contract needs its
own brief, and the change applies everywhere, not just to new code.

## Tests

Every boundary a change adds gets tests for how it fails, not only for how it
succeeds. At minimum, each case below that applies:

- malformed or missing input → the specific caller's-fault status and message
- wrong content type or an oversized payload
- a resource that doesn't exist, or a request the caller isn't allowed to make
- a forced internal failure → generic message, no internals in the response

The plan's Tests section lists these by name.

## Self-check before finishing

- Can any input a caller controls produce a 5xx or a crash?
- Does every catch either recover or sit at the edge?
- Does new failing code throw the contract's error type, rather than
  formatting its own response?
- Is every error logged exactly once, with a stack only for our own faults?
