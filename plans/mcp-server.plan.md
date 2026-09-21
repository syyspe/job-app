---
brief: brief/mcp-server.md
branch: mcp-server
date: 2026-09-21
---

# MCP server for Claude Desktop — Plan

## Context

The CV and the cover letter are written in Claude Desktop, then retyped into
this app by hand. `/api` is the only way in, it's cookie-authenticated, and
nothing speaks MCP — so Claude Desktop can write the letter but can't file
it, can't move an application to `interview`, and can't read back what was
sent.

This adds `mcp/`: a stdio MCP server that talks to the running Express API
over HTTP exactly as the browser does. It opens no database and imports
nothing from `server/` except `types.ts`. Validation, ownership checks and
`updated_at` bookkeeping stay in the routers.

Two questions settled during planning:

- **Tool schemas use zod.** `McpServer.registerTool`'s `inputSchema` only
  accepts zod schemas (checked against the 1.30.0 type definitions —
  `ZodRawShapeCompat | AnySchema`, both zod). So `zod` joins
  `@modelcontextprotocol/sdk` in `dependencies`. It adds nothing to
  `node_modules` — the SDK already depends on it — and buys typed,
  pre-validated handler arguments instead of ~60 lines of hand-written JSON
  Schema and argument coercion.
- **`attach_file` sends a guessed MIME type** from a six-entry extension map,
  defaulting to `application/octet-stream`. `mime_type` is the only record of
  what an attachment is, and the browser path fills it honestly; the MCP path
  shouldn't poison it.

## Affected files

**New — `mcp/`**

- `mcp/index.ts` — entry point: reads the three env vars, builds the client
  and the server, connects `StdioServerTransport`. ~15 lines, mirrors
  `server/index.ts`. **Writes nothing to stdout** — stdout is the JSON-RPC
  channel, so any diagnostic goes to `console.error`.
- `mcp/server.ts` — `createMcpServer(client): McpServer`; constructs the
  server and calls the two `register*Tools` functions. Split from `index.ts`
  so tests can build a server without a stdio transport.
- `mcp/lib/client.ts` — the fetch layer: base URL, `Cookie` header,
  lazy login, one re-login on a 401, error mapping. Exports `ApiError`,
  `createApiClient`.
- `mcp/lib/applications.ts` — the two helpers both tool files need:
  `fetchApplication(client, id)` (list-and-find, throws `no application with
  id N`) and `checkDateApplied(input)`.
- `mcp/lib/files.ts` — `readLocalFile(path)` (bytes + guessed MIME) and
  `isTextMime(mimeType)`.
- `mcp/lib/results.ts` — `jsonResult(value)` and `fileResult(uri, file)`,
  the two `CallToolResult` shapes the tools return.
- `mcp/tools/applications.ts` — `registerApplicationTools(server, client)`:
  `list_applications`, `get_application`, `create_application`,
  `set_application_status`, `archive_application`.
- `mcp/tools/attachments.ts` — `registerAttachmentTools(server, client)`:
  `attach_file`, `read_attachment`.
- `mcp/test/harness.ts` — test helper, not a spec (same role as
  `server/test/auth.ts`).
- Tests: `mcp/lib/client.test.ts`, `mcp/server.test.ts`,
  `mcp/tools/applications.test.ts`, `mcp/tools/attachments.test.ts`.

**Changed**

- `package.json` — `dependencies`: `@modelcontextprotocol/sdk` `^1.30.0`,
  `zod` `^4.6.5`. `scripts`: `"mcp": "node mcp/index.ts"`.
- `tsconfig.server.json` — `"include": ["server", "mcp"]`. Settled open
  question: no `tsconfig.mcp.json`. The settings would be identical, and
  `mcp/` imports `server/types.ts`, so one project keeps that import plain.
- `vite.config.ts` — `test.include` gains `'mcp/**/*.test.ts'`.
- `.env.example`, `README.md`, `CLAUDE.md` — see **Docs** below.

Nothing under `src/` or `server/` changes.

## Design notes the build needs

### `mcp/lib/client.ts`

```ts
export interface ApiConfig { baseUrl: string; username: string; password: string }

export interface ApiClient {
  getJson<T>(path: string): Promise<T>
  sendJson<T>(method: 'POST' | 'PUT', path: string, body: unknown): Promise<T>
  sendForm<T>(path: string, form: FormData): Promise<T>
  getFile(path: string): Promise<{ bytes: Uint8Array; mimeType: string }>
}

export function createApiClient(config: ApiConfig): ApiClient
```

Internals, in one closure over `let cookie: string | null = null`:

- `fetchOrExplain(url, init)` — wraps `fetch` in try/catch; a thrown network
  error becomes `Error(\`cannot reach the job-applications API at ${baseUrl} —
  is it running? (npm run dev:server)\`)`. Requirement 4's refused connection.
- `login()` — `POST /api/login`; on 401 throws `Error('login failed for user
  X — check JOBAPP_USERNAME/JOBAPP_PASSWORD')`; otherwise stores
  `res.headers.get('set-cookie').split(';')[0]`, the same trick
  `server/test/auth.ts` uses.
- `send(path, init)` — logs in if there's no cookie, sends with the `Cookie`
  header, and on a 401 logs in once and retries exactly once. Then non-2xx →
  `throw new ApiError(status, body.error ?? res.statusText)`, reading the
  server's own `{ error }` string the way `src/lib/api.ts`'s `checkOk` does.

`ApiError` must not use a parameter property — `erasableSyntaxOnly` is on, so
write the field and assign it in the constructor:

```ts
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
```

`getFile` returns the raw bytes plus the response's `content-type` (minus any
`; charset=…`), falling back to `application/octet-stream`. That's one request
instead of a list scan, and Express derives the type from the stored
filename's extension, which is the original file's extension.

### The seven tools

Every handler returns `jsonResult(...)` and signals failure by **throwing** —
`McpServer` catches a thrown `Error` and returns `{ isError: true, content:
[{ type: 'text', text: error.message }] }`, which is requirement 4's readable
tool error. No handler builds an error result by hand.

| Tool | Input (zod) | Does |
|---|---|---|
| `list_applications` | `includeArchived: z.boolean().optional()` | `GET /api/applications`, filters out `archived` unless asked |
| `get_application` | `id: z.number().int()` | `fetchApplication`, returns it with its attachments |
| `create_application` | `company`, `role` required strings; `dateApplied`, `deadline`, `link`, `notes` optional strings (default `''`); `status: z.enum(STATUSES).optional()` (default `'applied'`) | `checkDateApplied`, then `POST /api/applications` |
| `attach_file` | `applicationId: z.number().int()`, `path: z.string()` | `fetchApplication` (for the readable 404), `readLocalFile`, `POST /api/applications/:id/attachments` |
| `set_application_status` | `id`, `status: z.enum(STATUSES)` | `fetchApplication`, merge, `checkDateApplied`, `PUT /api/applications/:id` |
| `archive_application` | `id`, `archived: z.boolean()` | `fetchApplication`, `PUT /api/applications/:id/archived` |
| `read_attachment` | `id: z.number().int()` | `getFile`, then `fileResult` |

`STATUSES` is imported from `../../server/types.ts` — `z.enum(STATUSES)`
accepts the readonly tuple, so the six statuses are never written out twice.
Give every field a `.describe(...)`; that text is what Claude Desktop reads.

`registerApplicationTools` must not be one 150-line function (40-line limit):
one small `registerX(server, client)` per tool, and the exported function
calls the five. If `applications.ts` crowds 300 lines, split the two
mutating tools into `mcp/tools/status.ts`.

**The `dateApplied` trap** (brief, "two wrinkles"). `validateInput` rejects a
non-`draft` status with an empty `dateApplied`, and a bare
`ApiError(400, 'invalid application')` doesn't explain why. So both
`create_application` and `set_application_status` call, *before* the request:

```ts
export function checkDateApplied(input: { status: string; dateApplied: string }): void {
  if (input.status !== 'draft' && !input.dateApplied) {
    throw new Error(
      `status '${input.status}' needs dateApplied (YYYY-MM-DD) — only a draft can have none`,
    )
  }
}
```

Nothing invents a date.

**Why the extra GET.** `attach_file`, `set_application_status` and
`archive_application` all call `fetchApplication` first. `set_application_status`
has to (there's no partial update — it reads, merges the new status into the
existing fields, and PUTs the whole record). The other two do it so an unknown
id reads `no application with id 7` instead of `not found`, without a
catch-and-rethrow in each handler. One extra list GET at personal scale.

`read_attachment` is the one place that maps an error, because there's no
list to scan:

```ts
try {
  file = await client.getFile(`/api/attachments/${id}`)
} catch (error) {
  if (error instanceof ApiError && error.status === 404) {
    throw new Error(`no attachment with id ${id}`)
  }
  throw error
}
```

### `mcp/lib/files.ts` and `mcp/lib/results.ts`

```ts
const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
}
```

`readLocalFile(path)` reads the bytes and looks up `extname(path).toLowerCase()`,
defaulting to `application/octet-stream`; an `ENOENT` becomes
`Error(\`no file at ${path}\`)`. The upload is
`form.append('file', new File([bytes], basename(path), { type: mimeType }))` —
`File` is a Node global on 24.

`isTextMime(mimeType)` — strip anything after `;`, then `startsWith('text/')`
or one of `application/json`, `application/xml`. Settled open question: PDFs
take the blob path and land on Claude Desktop's own PDF handling.

`fileResult(uri, file)` returns `{ content: [{ type: 'text', text }] }` for a
text MIME type, else the embedded-resource shape with the base64 blob:

```ts
{ content: [{ type: 'resource', resource: { uri, mimeType, blob: Buffer.from(bytes).toString('base64') } }] }
```

`uri` is `jobapp://attachments/${id}`.

### `mcp/index.ts`

```ts
const baseUrl = process.env.JOBAPP_API_URL
const username = process.env.JOBAPP_USERNAME
const password = process.env.JOBAPP_PASSWORD
if (!baseUrl || !username || !password) {
  throw new Error('JOBAPP_API_URL, JOBAPP_USERNAME and JOBAPP_PASSWORD must all be set')
}
const server = createMcpServer(createApiClient({ baseUrl, username, password }))
await server.connect(new StdioServerTransport())
```

Imports: `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`,
`StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js`,
`CallToolResult` (type) from `@modelcontextprotocol/sdk/types.js`. The SDK's
export map is a `./*` wildcard onto `dist/esm/*`, so the `.js` suffixes are
required and resolve under `module: nodenext`.

## Work order

Red-green-refactor per slice.

1. **Wiring, no code.** `npm install @modelcontextprotocol/sdk zod`, the
   `mcp` script, `"mcp"` in `tsconfig.server.json`'s include,
   `'mcp/**/*.test.ts'` in `vite.config.ts`'s `test.include`.
2. **`mcp/lib/client.ts`** with `mcp/lib/client.test.ts` — the whole
   login/retry/error surface, driven against a real `createApp()` (see
   Tests).
3. **`mcp/lib/results.ts`, `mcp/lib/files.ts`, `mcp/lib/applications.ts`** —
   small and covered by the tool tests that follow.
4. **`mcp/test/harness.ts` and `mcp/server.ts`**, registering the application
   tools.
5. **The five application tools**, one at a time with its tests.
6. **The two attachment tools**, same.
7. **`mcp/server.test.ts`** — `listTools()` returns exactly the seven names.
   The completeness check, last.
8. **`mcp/index.ts`.** Untested, like `server/index.ts`.
9. **Docs** — `.env.example`, `README.md`, `CLAUDE.md`.

## Tests

The harness mirrors `server/routes/applications.archive.test.ts` exactly —
`mkdtempSync` root, `openDatabase`, `createUser(db, 'testuser',
'test-password')`, `createApp(db, uploadsDir)`, `server.listen(0)` — and then
links a real MCP client to the server in memory, so tools are exercised over
the protocol rather than by calling handlers, the same way the route tests go
over real HTTP rather than calling Express handlers.

`mcp/test/harness.ts` exports `startHarness()` returning `{ client, baseUrl,
root, uploadsDir, close }`, plus `callTool(client, name, args)`,
`textOf(result)` and `jsonOf<T>(result)`. It builds the pair with
`InMemoryTransport.createLinkedPair()` from
`@modelcontextprotocol/sdk/inMemory.js` and `Client` from
`@modelcontextprotocol/sdk/client/index.js`, connecting both ends before
returning. `close()` closes client, server, http server, then
`rmSync(root, { recursive: true, force: true })`. Every test file is
`// @vitest-environment node`.

**New**

- `mcp/lib/client.test.ts` — lazy login then cookie reuse across two calls;
  re-login after the session row is deleted from sqlite mid-test (the 401
  retry, requirement 3); bad credentials give an error naming the env vars;
  a base URL on a closed port gives the "is it running?" error; a 400 from
  the API surfaces the server's own `error` string.
- `mcp/server.test.ts` — `listTools()` returns exactly the seven names from
  requirement 2.
- `mcp/tools/applications.test.ts` — create returns the new application with
  an id and it shows up in `list_applications`; a non-draft create with no
  `dateApplied` is a tool error naming `dateApplied` and creates nothing;
  archived rows are hidden by default and appear with `includeArchived: true`;
  `get_application` returns the row with its attachments, and an unknown id
  errors with `no application with id 9999`; `set_application_status` changes
  the status and leaves company/role/deadline/link/notes untouched;
  draft→applied with no date errors instead of 400-ing; `archive_application`
  round-trips true then false.
- `mcp/tools/attachments.test.ts` — `attach_file` on a temp `.txt` lands in
  `get_application`'s attachments with its original name and `text/plain`; a
  `.pdf` records `application/pdf` (the mime map); a missing path errors
  naming the path; an unknown application id errors with `no application with
  id N`; `read_attachment` returns text content for the `.txt` and an
  embedded resource with a base64 `blob` and `mimeType: 'application/pdf'`
  for the `.pdf`; an unknown attachment id errors with `no attachment with
  id N`.

**Updated** — none. No existing test touches anything this changes.

**Verification command:** `npm test` (the gate — it now picks up
`mcp/**/*.test.ts`), then `npm run lint` and `npm run build`.
`npm run test:e2e` is unaffected but should still pass.

**Manual smoke**, once the suite is green — with `npm run dev:server` running
and a seeded user:

```
JOBAPP_API_URL=http://localhost:3001 JOBAPP_USERNAME=you JOBAPP_PASSWORD=… npm run mcp
```

then paste these three lines on stdin; the third must answer with the seven
tools:

```
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```

## Docs

- `.env.example` — a commented block for `JOBAPP_API_URL`,
  `JOBAPP_USERNAME`, `JOBAPP_PASSWORD`, saying plainly that Claude Desktop
  supplies them in its `env` block and they are **not** read from `.env`.
- `README.md` — a "Claude Desktop (MCP)" section after "Running the server":
  the API must already be running; the config snippet; and the note that
  Claude Desktop spawns with a minimal `PATH`, so `command` may need the
  absolute path to `node` (`which node`).

  ```json
  {
    "mcpServers": {
      "job-applications": {
        "command": "node",
        "args": ["/absolute/path/to/job-app/mcp/index.ts"],
        "env": {
          "JOBAPP_API_URL": "http://localhost:3001",
          "JOBAPP_USERNAME": "you",
          "JOBAPP_PASSWORD": "…"
        }
      }
    }
  }
  ```

- `CLAUDE.md` — `mcp/` in **Architecture** (entry point, `lib/`, `tools/`,
  `test/`, and that it speaks HTTP to the API and imports only
  `server/types.ts`); `npm run mcp` in **Commands**; the `mcp/**/*.test.ts`
  glob and the `tsconfig.server.json`-covers-both note in **Conventions**;
  and the new dependency pair recorded there, since the policy is
  approval-only.

## Risks / rollback

Two new dependencies and one new directory; nothing existing changes
behaviour. Rollback is deleting `mcp/` and reverting the four config files.

The one live risk is stdout: anything printed there by the MCP process
corrupts the JSON-RPC stream and Claude Desktop shows the server as failed
with no useful message. Keep `console.log` out of `mcp/`.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
