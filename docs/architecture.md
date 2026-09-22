# Architecture reference

The file-by-file detail, kept out of `CLAUDE.md` so it isn't re-read into
every session. `CLAUDE.md` holds what's needed to work here — the top-level
directory map, the invariants that aren't visible from the tree, and where
new code goes. This file is the long version: what each module is for, for
when you're new to a corner of the tree or deciding whether something already
exists.

**`CLAUDE.md` is authoritative for rules; this file is descriptive.** It
lists what's there today and will drift as code lands. If the two disagree
about a rule, `CLAUDE.md` wins. If this file describes something that no
longer exists, fix it or delete the line — don't preserve it.

## `src/` — the React app

`main.tsx` mounts. `App.tsx` is the auth shell: login state, login/logout,
and the `<main>`/`<h1>` frame. `types.ts` and the four CSS files sit beside
them.

The CSS splits by scope, and a value belongs to exactly one file:

| File | Owns |
|---|---|
| `index.css` | Design tokens (type, space, radii, the light and dark palettes, the status colours), element resets, `.button` |
| `App.css` | The app frame — nav, `main`, the layout grid, panels, forms, the sort bar, toasts |
| `applications.css` | The list surface — rows, the status spine, the chip, detail, attachments, empty state, the pager |
| `admin.css` | The admin surface — user rows, the role spine and control, the confirm clusters |

New rules read tokens from `index.css` rather than inventing values.

### `src/components/`

Presentational components, each with a test beside it. By surface:

- **Login** — `LoginForm`.
- **Applications** — `ApplicationsView` (with its local `useApplications`
  hook) over `ApplicationList`, `ApplicationDetail`, `ApplicationForm` and
  `ApplicationSort`, with `AttachmentList` in the detail and
  `ArchivedToggle`/`Pagination` at the foot of the list.
- **Admin** — `AdminView` (with its local `useUsers` hook) plus `UserForm`,
  `UserList` and `UserRow`.
- **Frame** — `NavBar`, which switches between the two views and shows the
  Admin control to admins only; `ToastProvider` and `ToastHost`.

### `src/lib/`

- `api.ts` — every `fetch` against `/api`. Components don't call `fetch`
  themselves. Sends `credentials: 'same-origin'` on every call and throws
  `UnauthorizedError` on a 401.
- `paging.ts` — `paginate`, the pure one-page-at-a-time slice. The page size
  comes from `GET /api/config`; a null size means one page holding
  everything, which is what the list shows until that call answers.
- `sorting.ts` — `SORT_FIELDS`, the `Sort` shape, `sortApplications`, and the
  field/order labels the sort bar renders.
- `toast.ts` — the toast contract behind `ToastProvider`: `ToastContext`,
  `useToast`, `TOAST_DURATIONS_MS` and `MAX_TOASTS`.
- `dates.ts`, `status.ts`, `roles.ts` — display formatting: the two date
  formatters (locale pinned to `en-GB` so tests are deterministic),
  `STATUS_LABELS` and `ROLE_LABELS`, the capitalised label per `Status` and
  per `Role`. Status and role *values* stay lowercase everywhere; only the
  label is capitalised.

### `src/test/`

- `setupTests.ts` — Vitest setup, named by `vite.config.ts`.

## `server/` — the Express API

`index.ts` reads the env and listens. `app.ts` is wiring only — routers,
static files, error handler — including the mount order `auth router →
requireSession → the rest`, which is what protects everything, and
`requireAdmin` mounted at `/api/users` alone, which is what keeps the user
routes to admins.

`types.ts` is the server's copy of the domain types (`src/types.ts` is the
client's — the two are kept in step by hand). `ApplicationInput` is the
exception: the server's copy lives in `lib/validation.ts`, beside the check
that enforces it.

### `server/routes/`

One router factory per resource, plus its tests: `applications.ts`,
`attachments.ts`, `auth.ts` (`/login`, `/logout`, `/me`), `config.ts`
(`/config`, the page size the client pages the list by) and `users.ts`
(admin-only account management).

### `server/models/`

Sqlite row shapes and the row→domain mappers, including `user.ts`.

### `server/lib/`

Helpers with no Express dependency:

- `validation.ts` — input checks, and the server's `ApplicationInput`.
- `applications.ts` — `touchApplication`, which bumps `updated_at`.
- `files.ts` — attachment storage.
- `passwords.ts` — hashing and session tokens.
- `cookies.ts` — reads the session cookie. Express 5 doesn't parse cookies,
  which is the only reason this file exists.
- `migrations.ts` — the startup column migrations (`migrateApplicationDates`,
  `migrateApplicationArchived`, `migrateUserRole`) behind one `migrate`.
- `seed.ts` — `createUser`; `seedUser`, which every run grants admin, so the
  seeded user is how an admin comes into being; and
  `migrateApplicationsToUser`, the table rebuild that gives a pre-auth
  database a `user_id`.
- `users.ts` — `setUserRole` and `adminCount`, needed by both the seed and
  the users router.
- `config.ts` — `parsePageSize`, which reads `PAGE_SIZE` at startup and
  throws on anything that isn't a whole number of at least 1.

### `server/middleware/`

- `errors.ts` — the error handler.
- `auth.ts` — `requireSession`, `requireAdmin`.

### Everything else under `server/`

- `db/index.ts` — `openDatabase`: connection plus schema.
- `seed.ts` — the `npm run seed` CLI entry point.
- `test/auth.ts` — `loginAs`, a test helper that logs in and returns a cookie
  header string for route tests to pass by hand.

## `mcp/` — the stdio MCP server

Claude Desktop talks to it over stdio. It speaks HTTP to a running API
exactly as the browser does, opens no database, and imports nothing from
`server/` except `types.ts`.

`index.ts` reads the three `JOBAPP_*` env vars and connects the stdio
transport. `server.ts` is `createMcpServer(client)`, wiring only.

**Nothing in `mcp/` may write to stdout** — that is the JSON-RPC channel;
diagnostics go to `console.error`.

### `mcp/lib/`

No MCP dependency:

- `client.ts` — the fetch layer: cookie, lazy login, one re-login on a 401,
  `ApiError`.
- `applications.ts` — `fetchApplication`, `checkDateApplied`.
- `files.ts`, `results.ts`.

### `mcp/tools/`

One file per tool group (`applications.ts`, `attachments.ts`), each exporting
a `register*Tools(server, client)`. Tool schemas are zod. A handler signals
failure by **throwing**; the SDK turns that into the tool error the user
reads.

### `mcp/test/`

- `harness.ts` — `startHarness`, which runs a real `createApp()` on an
  ephemeral port and links a real MCP client to the server in memory, so
  tools are exercised over the protocol.

## The rest of the tree

- `public/` — served verbatim at the site root, not processed by Vite.
- `e2e/` — Playwright specs, configured by `playwright.config.ts`.
- `dist/`, `node_modules/`, `test-results/`, `playwright-report/` are
  generated — never edit by hand, never commit.
