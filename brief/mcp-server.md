---
slug: mcp-server
date: 2026-09-21
---

# MCP server for Claude Desktop

## Problem

Adding an application means opening the browser, filling the form, and
dragging the CV and cover letter in by hand. But the CV and the cover letter
are written in Claude Desktop in the first place — the whole application
exists there minutes before it exists here, and then gets retyped.

There is no way to reach this app from outside the browser: `/api` is the
only surface, it's cookie-authenticated, and nothing speaks MCP. So Claude
Desktop can write the letter but can't file it, can't move the application
to `interview` when the reply comes in, and can't read back what was sent
when it's time to prepare.

## What done looks like

1. A stdio MCP server at `mcp/`, launchable by Claude Desktop with a single
   `command`/`args`/`env` entry in `claude_desktop_config.json`.
2. It exposes seven tools, each a thin call against the existing `/api`:
   - `list_applications` — all of them, archived ones only when asked.
   - `get_application` — one, by id, with its attachment list.
   - `create_application` — company, role, dateApplied, deadline, status,
     link, notes; returns the new application including its id.
   - `attach_file` — an application id and a local path; uploads the file.
   - `set_application_status` — an id and one of the six statuses.
   - `archive_application` — an id and an archived boolean.
   - `read_attachment` — an attachment id; text MIME types come back as text
     content, everything else as a base64 blob with its MIME type.
3. It authenticates itself: logs in against `/api/login` with credentials
   from its env, holds the session cookie, and re-logs-in once on a 401
   rather than failing the tool call.
4. Failures reach the user as readable tool errors, not stack traces — a
   refused connection says the API server isn't running, a 404 says which id
   wasn't found, a 400 repeats the server's own `error` string.
5. Tests beside the code (`mcp/**/*.test.ts`), driving the tool handlers
   against a real `createApp()` on an ephemeral port with a seeded user.
   `npm test` picks them up and passes.
6. `npm run lint` and `npm run build` both clean — the new directory is
   covered by a tsconfig project, not left off the build.
7. `.env.example`, `README.md` and `CLAUDE.md` describe the new piece: the
   env vars it needs, the Claude Desktop config snippet, and where its code
   lives.

## Approach

**An HTTP client, not a second backend.** The MCP server is a separate
process that talks to the running Express API over HTTP, exactly as the
browser does. It opens no database and imports nothing from `server/` except
types. Validation, ownership checks and `updated_at` bookkeeping stay in the
routers, in one place.

Rejected: opening `DB_PATH` directly. It removes the need for a running
server and for credentials, but the insert/update/archive/attachment logic
currently lives inside the route handlers, so sharing it means first
extracting a repository layer out of `server/routes/*.ts` and rewiring the
routers through it — a large diff across tested code, in service of a
convenience. Also, with no session there is no honest answer to *which
user*; over HTTP the login decides that.

**Shape.** `mcp/index.ts` is the entry point: reads env, builds the client,
registers the tools, connects the stdio transport. `mcp/lib/client.ts` is
the fetch layer — base URL, the `Cookie` header, login-and-retry, and
turning a non-2xx into an `Error` carrying the server's `error` string.
`mcp/tools/` holds the tool definitions, one file per group
(applications, attachments), each converting arguments to a client call and
the result to MCP content. This mirrors `server/`'s split: an entry point,
a `lib/` with no protocol dependency, and the protocol-facing files apart
from it.

**Dependency.** `@modelcontextprotocol/sdk`, approved for this work. It
supplies the stdio transport, tool registration and JSON-RPC framing; the
alternative was owning ~150 lines of protocol plumbing.

**Config.** Three env vars, read at startup and all required:
`JOBAPP_API_URL` (e.g. `http://localhost:3001`), `JOBAPP_USERNAME`,
`JOBAPP_PASSWORD`. Claude Desktop supplies them in its `env` block, so they
don't go in `.env` and never in git; `.env.example` documents them as
comments and the README carries the config snippet.

**Two wrinkles the plan has to absorb, neither worth a server change:**

- There is no `GET /api/applications/:id`. `get_application` fetches the
  list and picks the id out of it. At personal scale that's a handful of
  rows.
- `PUT /api/applications/:id` replaces the whole record — there is no
  partial update. `set_application_status` therefore reads the application,
  merges the new status into the existing fields, and PUTs the result. The
  one trap: `validateInput` rejects a non-`draft` status with an empty
  `dateApplied`, so moving a draft to `applied` with no date set has to
  fail with a message saying so, not a bare 400.

## Out of scope

- Deleting applications or attachments. Creation, status, archive and read
  are the four asks; destructive operations stay in the browser where a
  misfired tool call can't reach them.
- Editing company, role, dates, link or notes after creation. Only status
  and archived change through MCP.
- Any transport other than stdio — no HTTP/SSE server, no remote access.
- Multi-user anything. One set of credentials, one user, as today.
- Publishing the package, or starting the API server on the MCP server's
  behalf. If the API isn't up, the tool call says so.
- Changes to `src/` or `server/`. If the build turns up something that
  genuinely needs a route change, that's its own brief.

## Open questions

- Whether `mcp/` gets its own `tsconfig.mcp.json` or joins
  `tsconfig.server.json`'s `include`. The name says server; the settings are
  identical. The plan picks one.
- Whether a `npm run mcp` script is worth having when Claude Desktop invokes
  `node mcp/index.ts` by absolute path anyway. Probably yes, for testing the
  thing by hand.
- How `read_attachment` decides "text": a prefix match on `text/` plus a
  short allowlist (`application/json`, `application/xml`) is the obvious
  cheap rule, but PDFs — the common case here — will go down the base64
  path and land on Claude Desktop's own PDF handling. Untested until it runs.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/mcp-server.plan.md` before writing any code.
