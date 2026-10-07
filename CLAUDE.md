# Project Instructions for Claude

> Read by Claude at the start of every session in this repo — the highest
> leverage file here. Keep it accurate; stale instructions are worse than
> none.

## Commands

- Build: `npm run build` (runs `tsc -b` then `vite build`)
- Test: `npm test` — this is the gate that must pass before a PR. End-to-end
  tests are separate: `npm run test:e2e` (Playwright, boots the dev server
  itself). `npm run test:e2e:prod` runs the same specs against `npm start`
  (the production build) instead.
- Lint: `npm run lint` (oxlint)
- Format: none configured — oxlint covers lint only. Match surrounding style.
- Dev server: `npm run dev` (http://localhost:5173). This only starts the
  frontend — the API proxies `/api` to `http://localhost:3001`, so also run
  `npm run dev:server` in a second terminal or requests fail with
  `ECONNREFUSED 127.0.0.1:3001`. `dev:server` requires `.env` (copy from
  `.env.example` and set `DB_PATH`/`UPLOADS_DIR`) — see README's "Running
  the server" section.
- Seed: `npm run seed` — creates the user named by `.env`'s
  `SEED_USERNAME`/`SEED_PASSWORD` (if it doesn't already exist) and assigns
  any pre-auth applications to it. Run once against a fresh or pre-auth
  database before the server will answer any `/api` route other than
  `/api/login`.
- MCP server: `npm run mcp` — the stdio server Claude Desktop spawns. Needs
  `JOBAPP_API_URL`, `JOBAPP_USERNAME` and `JOBAPP_PASSWORD` in the
  environment (it does not read `.env`) and an already-running API. See the
  README's "Claude Desktop (MCP)" section.

Expected healthy output for tests: `Test Files N passed / Tests N passed`,
with no `failed` line. Playwright: `N passed`.

## Conventions

- Language/runtime: TypeScript 6.0.3 on Node 24.20.0 LTS (pinned in `.nvmrc`
  and `package.json`'s `engines.node`). ESM only — `"type": "module"`.
- Framework: React 19.2.8 + React DOM 19.2.8, built by Vite 8.2.2.
- Testing: Vitest 4.1.11 with Testing Library (jsdom) for unit/component
  tests, Playwright 1.62.1 for end-to-end.
- Dependency policy: no new dependencies without approval. Approved so far
  beyond the framework set: `@modelcontextprotocol/sdk` 1.30.0 and `zod`
  4.6.5, both for `mcp/`.
- Unit tests live beside the code they test as `src/**/*.test.tsx?`,
  `server/**/*.test.ts` and `mcp/**/*.test.ts`; those globs are what Vitest
  picks up. E2E specs go in `e2e/*.spec.ts`.
- `tsconfig.server.json` covers both `server/` and `mcp/` — one project, one
  set of settings, and `mcp/`'s import of `server/types.ts` stays plain.
- Import `test`/`expect` from `vitest` explicitly — globals are off, so an
  undeclared `test` is a type error at build time, not a runtime surprise.
- Query by accessible role/name in tests (`getByRole`), not by CSS class or
  test id, unless there's no accessible handle.
- Errors: the API answers every failure as JSON `{"error": "<message>",
  "requestId": "<id>"}`, the `requestId` matching the `X-Request-Id` header.
  New and changed server code throws `HttpError(status, message)`
  (`server/lib/httpError.ts`) for a client error, and doesn't write
  `res.status(...).json(...)` by hand. `jsonErrorHandler`
  (`server/middleware/errors.ts`, mounted last in `app.ts`) is the single
  edge-out handler: an error's own 4xx `status` gets passed through with its
  message, and anything else becomes `500 {"error": "internal server
  error"}`. `jsonErrorHandler` logs it through the request's logger. On the
  client, `checkOk` in `src/lib/api.ts` turns `{error}` into a thrown `Error`
  and a 401 into `UnauthorizedError`. `mcp/` tools signal failure by
  throwing. CLI entry points (`server/index.ts`, `server/seed.ts`,
  `mcp/index.ts`) report missing or invalid configuration as one stderr line
  and exit 2, with no stack.
- Logging: `createLogger` (`server/lib/logger.ts`, no dependency) is built
  once in `server/index.ts` and passed to `createApp`; nothing else
  constructs one except tests. It writes JSON lines `{time, level, msg,
  ...fields}` to stdout, at the level `LOG_LEVEL` sets
  (`debug|info|warn|error|silent`, default `info`; invalid → exit 2).
  `requestLogging` (`server/middleware/requestLogging.ts`, mounted first)
  generates a UUID per request — incoming headers ignored — returns it as
  `X-Request-Id`, puts a child logger carrying it on `res.locals.log`, and
  writes one `request finished` info line (method, path without query,
  status, durationMs). Request-scoped code logs only through
  `res.locals.log`. Errors are logged once, by `jsonErrorHandler`: a 4xx at
  `info` without a stack, a 5xx at `error` with `err` (the inspected error,
  stack and cause chain). Messages are fixed strings, variable data goes in
  fields; log IDs, never bodies, headers, cookies, passwords or usernames.
  Outside the logger: CLI config errors (`server/seed.ts`, `server/index.ts`
  before the logger exists) stay one plain stderr line + exit 2, and `mcp/`
  is outside this contract — stdout is its JSON-RPC channel.

## Architecture

- `src/` — the React app. `main.tsx` mounts; `App.tsx` is the auth shell
  (login state, login/logout, the `<main>`/`<h1>` frame). Presentational
  components live in `src/components/` with a test beside each, non-visual
  helpers in `src/lib/`, and `src/test/setupTests.ts` is the Vitest setup
  named by `vite.config.ts`.
- `server/` — the Express API. `index.ts` reads the env and listens; `app.ts`
  is wiring only (routers, static files, error handler). One router factory
  per resource in `server/routes/`, row shapes and row→domain mappers in
  `server/models/`, Express-free helpers in `server/lib/`, middleware in
  `server/middleware/`, `openDatabase` in `server/db/index.ts`.
- `mcp/` — the stdio MCP server Claude Desktop talks to. It speaks HTTP to a
  running API exactly as the browser does and opens no database. `index.ts`
  reads the three `JOBAPP_*` env vars and connects the stdio transport;
  `server.ts` is `createMcpServer(client)`, wiring only; `lib/` carries no MCP
  dependency; `tools/` is one file per tool group, each exporting a
  `register*Tools(server, client)` with zod schemas.
- `public/` — served verbatim at the site root, not processed by Vite.
- `e2e/` — Playwright specs, configured by `playwright.config.ts`.
- `dist/`, `node_modules/`, `test-results/`, `playwright-report/` are
  generated — never edit by hand, never commit.

`docs/architecture.md` has the file-by-file detail — what each module is for
and what already exists — to read on demand rather than every session. These
are the invariants a directory listing won't tell you:

- **`app.ts`'s mount order is the security model.** `auth router →
  requireSession → the rest` is what protects everything, and `requireAdmin`
  mounted at `/api/users` alone is what keeps the user routes to admins.
- **Express 5 doesn't parse cookies.** `server/lib/cookies.ts` reads the
  session cookie by hand; that is the only reason the file exists.
- **The domain types are duplicated by hand.** `server/types.ts` is the
  server's copy and `src/types.ts` the client's; the two are kept in step
  manually. `ApplicationInput` is the exception — the server's copy lives in
  `server/lib/validation.ts`, beside the check that enforces it.
- **Components never call `fetch`.** Every call against `/api` goes through
  `src/lib/api.ts`, which sends `credentials: 'same-origin'` and throws
  `UnauthorizedError` on a 401.
- **Status and role *values* stay lowercase everywhere**; only the label is
  capitalised, via `STATUS_LABELS`/`ROLE_LABELS`. Dates format through
  `src/lib/dates.ts`, locale pinned to `en-GB` so tests are deterministic.
- **A CSS value belongs to exactly one file**: `index.css` the design tokens,
  resets and `.button`; `App.css` the app frame; `applications.css` the list
  surface; `admin.css` the admin surface. New rules read tokens from
  `index.css` rather than inventing values.
- **Nothing in `mcp/` may write to stdout** — that is the JSON-RPC channel;
  diagnostics go to `console.error`. A tool handler signals failure by
  **throwing**; the SDK turns that into the tool error the user reads.

Where new code goes: a component in `src/components/`; an endpoint in the
matching `server/routes/*.ts`, or a new router factory there mounted from
`app.ts`; a row shape or mapper in `server/models/`. A helper two routers both
need goes in `server/lib/` — never import one router from another.

## Things Claude gets wrong here

> Add to this list the second time Claude makes the same mistake — see
> `REVIEW.md` for the review-feedback loop that feeds this section.

- **Check the e2e ports before running Playwright; don't run into an
  occupied one.** `npm run test:e2e` needs 5173 and 3001,
  `npm run test:e2e:prod` needs 3002. Both configs set
  `reuseExistingServer: !process.env.CI`, so if something is already
  listening Playwright silently attaches to it instead of booting a seeded
  one — every spec then fails at login and it reads like a broken build, not
  a port collision. Check first (`ss -ltnp | grep -E '5173|3001|3002'`), and
  if a port is taken switch to a free one rather than killing the process or
  running anyway: `test:e2e:prod` is the easy move, since it serves the
  client from the API's own origin and its port is one `const port` in
  `playwright.prod.config.ts`. `test:e2e`'s ports are not movable per run —
  `vite.config.ts` hardwires the `/api` proxy to 3001.

## Working agreement

- Nothing gets implemented without a committed plan first — the `sdlc`
  skill's "Rules that don't bend".
- One stage per session: at a stage's commit, hand off and stop — the `sdlc`
  skill's "Handing off".
- Skills in `.claude/skills/` encode policy — check the relevant one
  before starting work that matches its trigger conditions; don't wait to
  be flagged. In particular: `simple-code` applies to every function and
  file you touch while writing or editing code, unconditionally — its
  limits and no-cleverness/no-defensive-code rules are active from the
  first line, not a checklist for after `verifier` or review catches
  something. `error-handling` applies the same way to any code that can
  fail, and the `Errors:` line above is the contract it keeps consistent;
  `logging` likewise for anything that logs, against the `Logging:` line.
- Hooks in `.claude/hooks/` are hard guardrails, not suggestions — if one
  blocks you, that's a signal to stop and check with me, not to work
  around it.
- The default branch is PR-only. Never push to it directly, however small
  the change or however clearly it was asked for — commit on a branch and
  open a PR. `default-branch-guard.sh` enforces this.

## The loop

Four stages, one slug per branch — run `/sdlc`;
`.claude/skills/sdlc/SKILL.md` has the table and the rules, including the
trivial-change exception.

## Session hygiene

- **Prefer reading to a subagent.** Don't use `Explore` for "where does X
  live"; let `verifier` read the diff in Stage 4 rather than re-reading it
  here.
- **Don't resume a cold session.** Stepping away mid-stage: commit what
  exists and start fresh later.

Why: `.claude/skills/sdlc/session-economy.md`.
