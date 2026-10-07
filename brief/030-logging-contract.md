---
slug: 030-logging-contract
date: 2026-10-07
---

# Decide job-app's logging contract

## Problem

The `logging` skill (synced from the skeleton) asks every project for a
`Logging:` contract, and job-app's is "not decided yet". Today the server
logs with bare `console` calls: `logError` (`server/lib/logging.ts`) writes
one stderr line per error plus the stack for a 5xx, and `server/index.ts`
prints one startup line. There's no per-request log line, no request ID tying
an error response to its log line, and no configurable level. Until the
contract is decided, the verifier fails any build that adds a boundary.

## What done looks like

1. `CLAUDE.md`'s `Logging:` line states job-app's contract: the logger and
   where it's configured, the format, where logs go and the setting for the
   level, and the request ID header.
2. The server's existing logging meets that contract.

## Out of scope

- Metrics and tracing.
- Changing the error contract, beyond adding the request ID to it if the
  plan decides to.

## Open questions

- Logger: a new dependency (e.g. pino) or a thin wrapper over `console`?
- Does the MCP server (`mcp/`) log, and if so under the same contract?
- Request ID: accept one from an incoming header, or always generate?

---

**Next stage:** run `/sdlc`.
