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

## Architecture

- `src/` — the React app. `main.tsx` mounts, `App.tsx` is the auth shell (login
  state, login/logout, the `<main>`/`<h1>` frame); `types.ts` and the four CSS
  files sit beside them. The CSS splits by scope, and a value belongs to
  exactly one of them: `index.css` owns the design tokens (type, space, radii,
  the light and dark palettes, the status colours) plus element resets and
  `.button`; `App.css` owns the app frame — nav, `main`, the layout grid,
  panels, forms, the sort bar, toasts; `applications.css` owns the list
  surface — rows, the status spine, the chip, detail, attachments, empty
  state and the pager; `admin.css` owns the admin surface — user rows, the
  role spine and control, the confirm clusters. New rules read tokens from
  `index.css` rather than inventing values.
  - `src/components/` — twelve presentational components, each with a test
    beside it: `LoginForm` for the login screen, `ApplicationsView` (with its
    local `useApplications` hook) for the applications UI and
    `ArchivedToggle`/`Pagination` at the foot of its list, `AdminView` (with
    its local `useUsers` hook) plus `UserForm`/`UserList`/`UserRow` for the
    admin page, and the original four. `NavBar` switches between the two
    views and shows the Admin control to admins only.
  - `src/lib/api.ts` — every `fetch` against `/api`. Components don't call
    `fetch` themselves. Sends `credentials: 'same-origin'` on every call and
    throws `UnauthorizedError` on a 401.
  - `src/lib/paging.ts` — `paginate`, the pure one-page-at-a-time slice. The
    page size comes from `GET /api/config`; a null size means one page holding
    everything, which is what the list shows until that call answers.
  - `src/lib/dates.ts`, `src/lib/status.ts` and `src/lib/roles.ts` — display
    formatting: the two date formatters (locale pinned to `en-GB` so tests are
    deterministic), `STATUS_LABELS` and `ROLE_LABELS`, the capitalised label
    per `Status` and per `Role`. Status and role *values* stay lowercase
    everywhere; only the label is capitalised.
  - `src/test/setupTests.ts` — Vitest setup, named by `vite.config.ts`.
- `server/` — the Express API. `index.ts` reads the env and listens, `app.ts`
  is wiring only (routers, static files, error handler) — including the
  mount order `auth router → requireSession → the rest`, which is what
  protects everything, and `requireAdmin` mounted at `/api/users` alone, which
  is what keeps the user routes to admins. `types.ts` is the server's copy of the domain types
  (`src/types.ts` is the client's — the two are kept in step by hand).
  `ApplicationInput` is the exception: the server's copy lives in
  `lib/validation.ts`, beside the check that enforces it.
  - `server/routes/` — one router factory per resource, plus its tests,
    including `auth.ts` (`/login`, `/logout`, `/me`), `config.ts` (`/config`,
    the page size the client pages the list by) and `users.ts` (admin-only
    account management).
  - `server/models/` — sqlite row shapes and the row→domain mappers,
    including `user.ts`.
  - `server/lib/` — helpers with no Express dependency: `validation.ts`,
    `files.ts`, `passwords.ts` (hashing and session tokens), `cookies.ts`
    (reads the session cookie — Express 5 doesn't parse cookies), `seed.ts`
    (the seed user, which every run makes an admin, and the legacy-database
    migration), `users.ts` (`setUserRole`, `adminCount` — needed by both the
    seed and the users router), `config.ts` (`parsePageSize`, which reads
    `PAGE_SIZE` at startup and throws on anything that isn't a whole number of
    at least 1).
  - `server/middleware/` — Express middleware: `errors.ts`, `auth.ts`
    (`requireSession`, `requireAdmin`).
  - `server/db/index.ts` — `openDatabase`: connection plus schema.
  - `server/seed.ts` — the `npm run seed` CLI entry point.
  - `server/test/auth.ts` — `loginAs`, a test helper that logs in and returns
    a cookie header string for route tests to pass by hand.
- `mcp/` — the stdio MCP server Claude Desktop talks to. It speaks HTTP to a
  running API exactly as the browser does, opens no database, and imports
  nothing from `server/` except `types.ts`. `index.ts` reads the three
  `JOBAPP_*` env vars and connects the stdio transport; `server.ts` is
  `createMcpServer(client)`, wiring only. **Nothing in `mcp/` may write to
  stdout** — that is the JSON-RPC channel; diagnostics go to `console.error`.
  - `mcp/lib/` — no MCP dependency: `client.ts` (the fetch layer — cookie,
    lazy login, one re-login on a 401, `ApiError`), `applications.ts`
    (`fetchApplication`, `checkDateApplied`), `files.ts`, `results.ts`.
  - `mcp/tools/` — one file per tool group (`applications.ts`,
    `attachments.ts`), each exporting a `register*Tools(server, client)`.
    Tool schemas are zod. A handler signals failure by **throwing**; the SDK
    turns that into the tool error the user reads.
  - `mcp/test/harness.ts` — `startHarness`, which runs a real `createApp()`
    on an ephemeral port and links a real MCP client to the server in
    memory, so tools are exercised over the protocol.
- `public/` — served verbatim at the site root, not processed by Vite.
- `e2e/` — Playwright specs, configured by `playwright.config.ts`.
- `dist/`, `node_modules/`, `test-results/`, `playwright-report/` are
  generated — never edit by hand, never commit.

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

- Nothing gets implemented without a committed plan first — see
  `plans/README.md`.
- A stage ends at its commit, and the next stage's first action belongs to a
  fresh session. Say the stage is done, name the next action, suggest the new
  session, stop there — don't start the next stage in the same one, and don't
  offer to. The `sdlc` skill has the boundaries and which model each stage is
  worth.
- Skills in `.claude/skills/` encode policy — check the relevant one
  before starting work that matches its trigger conditions; don't wait to
  be flagged. In particular: `simple-code` applies to every function and
  file you touch while writing or editing code, unconditionally — its
  limits and no-cleverness/no-defensive-code rules are active from the
  first line, not a checklist for after `verifier` or review catches
  something.
- Hooks in `.claude/hooks/` are hard guardrails, not suggestions — if one
  blocks you, that's a signal to stop and check with me, not to work
  around it.
- The default branch is PR-only. Never push to it directly, however small
  the change or however clearly it was asked for — commit on a branch and
  open a PR. `default-branch-guard.sh` enforces this. It's a solo repo, so
  I'm the reviewer; the point is that the diff gets looked at once, in one
  place, before it lands.

## The loop

Work moves through four stages. Each ends by committing an artifact, and that
commit is what starts the next stage — one kebab-case slug names the branch
and every artifact on it.

| Stage | Artifact | Unlocked by |
|---|---|---|
| 1. Brief | `brief/<slug>.md` | — |
| 2. Plan | `plans/<slug>.plan.md` | brief committed |
| 3. Build | code + tests | plan committed **before** code |
| 4. Ship | verification, review, PR merged | code committed |

There are no approval flags to flip — an artifact exists or it doesn't, and
that's the whole state. Run the `sdlc` skill (`/sdlc`) for where the current
branch stands, what each stage involves, and why the boundaries fall where
they do.

Stages are the default path, not a cage. For a genuinely trivial change — a
typo, a version bump, a one-line fix with an obvious test — say so and go
straight to a branch and a PR. Skipping the brief is a judgment call you can
make out loud; skipping the plan on anything that isn't trivial is not.

## Session hygiene

Two rules apply at every moment of every stage:

- **Prefer reading to a subagent.** The sessions are short, with only a few turns.
  Do not use `Explore` for "where does X live". Let `verifier` read the diff in
  Stage 4 rather than re-reading it here.
- **Don't resume a cold session.** The prompt cache goes stale after roughly
  an hour, so picking a long session back up after a break re-reads its whole
  context at full price. Stepping away mid-stage: commit what exists and start
  fresh later.

The rest is about the seams — one session per stage, and which model each
stage is worth. Those rules live with the boundaries that trigger them, in
`.claude/skills/sdlc/` (`SKILL.md` for the mechanics, `session-economy.md` for
why).
