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
and the `<main>`/`<h1>` frame. `types.ts` and the five CSS files sit beside
them.

The CSS splits by scope, and a value belongs to exactly one file:

| File | Owns |
|---|---|
| `index.css` | Design tokens (type, space, radii, the light and dark palettes, the status colours), element resets, `.button` |
| `App.css` | The app frame — nav, `main`, the layout grid, panels, forms, the sort bar, toasts |
| `applications.css` | The list surface — rows, the status spine, the chip, detail, attachments, empty state, the pager |
| `admin.css` | The admin surface — user rows, the role spine and control, the confirm clusters |
| `ads.css` | The ad inbox surface — the state filter, ad rows and their spine, the hand-over form |

New rules read tokens from `index.css` rather than inventing values.

### `src/components/`

Presentational components, each with a test beside it. By surface:

- **Login** — `LoginForm`.
- **Applications** — `ApplicationsView` (with its local `useApplications`
  hook for the data and `useListView` for sort, archived filter and page)
  over `ApplicationList`, `ApplicationDetail`, `ApplicationForm` and
  `ApplicationSort`, with `AttachmentList` in the detail and
  `ArchivedToggle`/`Pagination` at the foot of the list.
- **Admin** — `AdminView` (with its local `useUsers` hook) plus `UserForm`,
  `UserList` and `UserRow`.
- **Ad inbox** — `AdsView` (with its local `useAds` hook and the state filter)
  over `AdList`, `AdRow` and `AdHandoverForm`.
- **Frame** — `NavBar`, which switches between the views and shows the Admin
  control to admins only; `ToastProvider` and `ToastHost`.

### `src/lib/`

- `api.ts` — every `fetch` against `/api`. Components don't call `fetch`
  themselves. Sends `credentials: 'same-origin'` on every call and throws
  `UnauthorizedError` on a 401.
- `apiAction.ts` — `useApiAction(onUnauthorized)`, the `run` wrapper both
  data hooks share: it shows the success toast, and on `UnauthorizedError`
  shows the session-expired toast and calls `onUnauthorized`.
- `adStates.ts` — `AD_STATE_LABELS`, the filter's display order, and which
  actions each ad state offers.
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

One router factory per resource, plus its tests: `ads.ts` (the ad inbox,
including the multipart `POST /ads/:id/draft`, which removes every uploaded
file again when the draft is refused),
`applications.ts`, `attachments.ts` (upload, download, replace, delete, and
the profile-sync mark: `GET /attachments/pending-sync`,
`PUT /attachments/:id/profile-sync`), `auth.ts` (`/login`, `/logout`, `/me`), `config.ts`
(`/config`, the page size the client pages the list by) and `users.ts`
(admin-only account management).

### `server/models/`

Sqlite row shapes and the row→domain mappers, including `user.ts`.

### `server/lib/`

Helpers with no Express dependency:

- `validation.ts` — input checks, and the server's `ApplicationInput`.
- `applications.ts` — `touchApplication`, which bumps `updated_at`, and
  `insertApplication`/`insertAttachment`, the one copy of each INSERT, used by
  the applications, attachments and ad draft routes.
- `uploads.ts` — `createUpload(uploadsDir)`, the multer disk storage both
  upload routers use (UUID file names, 10 MB limit, UTF-8 file names).
- `adStates.ts` — the ad state tables: allowed transitions, and which states
  clear the text or blank a hand-over ad's title and company.
- `adDedup.ts` — `canonicalUrl`, `normaliseText` and the two duplicate lookups.
- `adValidation.ts` — request parsing for each ad route; `parseAdDraft`
  fixes status `draft` and an empty `dateApplied` itself.
- `ads.ts` — the ad database operations: ingest, transition, hand-over,
  `draftAd` (application, attachments and the move to `drafted`, run by the
  route in one transaction), reporting. A transition to `ready` fills an empty
  `company` or `deadline` from the request before the dedup rules run.
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
  throws on anything that isn't a whole number of at least 1; and
  `parseLogLevel`, which does the same for `LOG_LEVEL`.
- `logger.ts` — `createLogger`, the no-dependency JSON-lines logger.
  `server/index.ts` builds the one instance; `child` binds fields such as the
  request ID.

### `server/middleware/`

- `requestLogging.ts` — mounted first: gives each request a UUID
  (`X-Request-Id`, `res.locals.requestId`), a child logger on
  `res.locals.log`, and one `request finished` line.
- `errors.ts` — the error handler. It logs each failure once, through
  `res.locals.log`.
- `auth.ts` — `requireSession`, `requireAdmin`.

### Everything else under `server/`

- `db/index.ts` — `openDatabase`: connection plus schema. `attachments.profile_sync`
  (0/1) is the "Add to profile" mark the runner clears.
- `seed.ts` — the `npm run seed` CLI entry point.
- `test/auth.ts` — `loginAs`, a test helper that logs in and returns a cookie
  header string for route tests to pass by hand.
- `test/adsApi.ts` — `withAdsApi` and the request helpers the `ads.*.test.ts`
  route tests share.

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

One file per tool group (`ads.ts`, `applications.ts`, `attachments.ts`), each exporting
a `register*Tools(server, client)`. Tool schemas are zod. A handler signals
failure by **throwing**; the SDK turns that into the tool error the user
reads.

### `mcp/test/`

- `harness.ts` — `startHarness`, which runs a real `createApp()` on an
  ephemeral port and links a real MCP client to the server in memory, so
  tools are exercised over the protocol.

## `agent/` — the job search agent

The job search agent's own processes. Nothing in it imports from `server/` or
`mcp/`. Job-app credentials live only in `agent/runner/`, which may import
`agent/profile/lib/` and `agent/lib/`. `agent/profile/` never imports
`agent/runner/`. Its contracts are in `docs/job-search-agent.md`.

### `agent/lib/`

- `paths.ts` — `configPath(env)`, `envPath(env)`, `promptsDir(env)`,
  `indexPath(env)` and `stateDir(env)`, from `XDG_CONFIG_HOME` /
  `XDG_DATA_HOME` / `XDG_STATE_HOME` or the `HOME` defaults.
- `cliError.ts` — `CliError(exitCode, message)`, the one agent error type, and
  `runCommand(main)`, the edge-out handler every entry point runs under: a
  `CliError` becomes one stderr line and its exit code; anything else
  propagates with its stack.

### `agent/profile/` — the profile corpus

`index.ts` is the stdio MCP server the `claude -p` steps get as their only
tool (`npm run profile:mcp`): it loads the config and registers
`search_profile` through `server.ts`'s `createProfileServer(search)`, which
offers that one tool and nothing else. **Nothing in its entry writes to
stdout.** Each call opens the index read-only for that search alone, so a
missing or rebuilt index shows up per call, as a tool error.

`commands/` holds the three user commands: `build.ts` (`profile:index`,
health check first), `health.ts` (`profile:health`) and `search.ts`
(`profile:search`).

`lib/`:

- `config.ts` — `loadProfileConfig(path)`, the zod check of the keys this
  stream owns in `~/.config/job-agent/config.json`; other keys are ignored.
  An optional `syncFolder` is appended to `corpus` as a `style` entry.
  `parseConfigFile(path, schema)` is the shared read-parse-check with the
  `<path>: <field>: <message>` exit-2 error, which the runner's config reuses.
- `corpus.ts` — `listCorpusFiles(entries)`: walks folders for `.txt`/`.md`,
  lists the rest as skipped, rejects a file reached from two entries.
- `chunk.ts` — `chunkText(text)`: paragraphs packed up to 1500 characters.
- `ollama.ts` — `createOllama({url, model}).embed(texts)` and
  `checkOllama(config)`, which returns a fixed reason rather than throwing.
- `store.ts` — the only file that knows the index is plain SQLite with
  Float32 vector blobs: `openIndex`, `openReadonlyIndex`.
- `build.ts` — `buildIndex`: incremental by SHA-256 and label, wipes on a
  model change, records the model only once the build completes.
  `formatBuildSummary` gives the summary lines `profile:index` and
  `profile:sync` print.
- `search.ts` — `searchIndex` / `searchIndexFile`: brute-force cosine, and
  the refusals (no index, no completed build, other model, other dimension).

### `agent/runner/` — the runner

The part of `agent/` that talks to job-app. It reads its credentials from
`~/.config/job-agent/env` and never from `process.env`.

`commands/sync.ts` is `npm run profile:sync`. It requires `syncFolder`, checks
Ollama, then runs `syncProfile` and prints what it copied and the build
summary. `commands/sandboxCheck.ts` is `npm run agent:sandbox-check`: it runs
the probes, prints pass or fail per property and records the CLI version only
when all pass. `commands/evaluate.ts` is `npm run agent:evaluate`: config,
runner config, private prompt and env, then the version gate, then
`runEvaluation`. `commands/draft.ts` is `npm run agent:draft`: config, the
`drafting` key, the private prompt and both CV templates, env, the version
gate, then `runDrafting`. `commands/collect.ts` is `npm run agent:collect`:
the `sources` key, runner config and the mail and job-app env, then
`openMailbox` and `runCollect`, closing the mailbox whatever happens. It runs
no `claude -p`, so it has no version gate.

`prompts/evaluate.framing.md` is the fixed head of the evaluation system
prompt; `prompts/evaluate.example.md` a synthetic example of the private
criteria that follow it. `prompts/draft.framing.md` and
`prompts/draft.example.md` are the same pair for drafting.

`lib/`:

- `env.ts` — `loadJobAppEnv(path)` and `loadMailEnv(path)`: `util.parseEnv`
  of the env file, which gives `{ baseUrl, username, password }` and
  `{ host, username, password }`. A missing file or variable is exit 2.
- `jobApp.ts` — `createJobAppClient(config)`: `listPendingSync`,
  `downloadAttachment`, `setProfileSync`, `listAds(state)`, `getAd(id)`,
  `transitionAd(id, body)`, `ingestAd(input)` (201 new, 200 existing),
  `draftAd(id, upload)` (multipart: the five fields
  and three `text/plain` files). There is no other way to create or change an
  application. It logs in lazily, re-logs in once on a 401, and
  turns every failure into a `CliError(1, …)`. Ad responses are checked
  against only the fields the runner reads.
- `runnerConfig.ts` — `loadRunnerConfig(path)`: `titleRules.reject` and
  `evaluation.{concurrency, perRunCap, timeoutMs}`, with defaults;
  `loadDraftConfig(path)`: the `drafting` key, read only by `agent:draft`;
  `loadSourcesConfig(path, connectors)`: the `sources` key, with every
  connector present (missing means disabled) and the exit-2 refusals.
- `mapLimit.ts` — `mapLimit(items, limit, fn)`, order-keeping bounded
  concurrency for both runs.
- `prompts.ts` — `buildSystemPrompt(framing, rules)`: the fixed framing
  first, then the private rules.
- `titleRules.ts` — `matchesReject(title, phrases)` (whole-word,
  case-insensitive, Unicode letters as word characters) and
  `screenTarget(ad, phrases)`.
- `screen.ts` — `screenNewAds(jobApp, phrases)`, which both runs call.
- `mailbox.ts` — `openMailbox(config)`: INBOX over IMAP (TLS, port 993),
  read-only, with ImapFlow's logger off. `messagesAfter(uid)` yields
  `AlertMessage`s in UID order through `toAlertMessage`, and `connectError`
  maps a rejected login and an unreachable host to `CliError(1, …)`.
- `state.ts` — `createRunnerState(stateDir)`: the mail watermark, the daily
  source counters and the source failure list, each a JSON file written
  through a temp file and a rename; `localDate(now)`.
- `politeHttp.ts` — `createPoliteHttp(options)`: the only network path a
  connector has. It checks scheme and host on the URL and every redirect,
  sends fixed headers, spaces requests by `minDelayMs`, counts each open
  before the request and ends the source's day at its cap or first block.
- `sources/` — the connectors. `types.ts` holds the section 6 interface,
  `html.ts` the dependency-free `htmlToText`, `linksOf` and `jobPostingOf`,
  `common.ts` the host check and the fetch-then-extract step, and
  `index.ts` the `CONNECTORS` registry. `academicWork.ts`, `valtiolle.ts` and
  `nordea.ts` are automatic, `duunitori.ts` is hand-over. Each file opens with
  what identifies its alerts and where the ad id, title and text sit.
  `fixtures/` holds synthetic alert bodies and ad pages only.
- `collectRun.ts` — `runCollect`: alerts after the watermark into ingests,
  then `screenNewAds`, then each enabled automatic source's oldest `new` ads
  through its connector, the sources in parallel. It returns per-source
  counts.
- `sandbox.ts` — the one way the runner starts `claude -p`: `sandboxArgs`
  (the fixed flag list), `sandboxEnv` (the allowlist), `profileMcpConfig`,
  `stepSchema` (zod → JSON Schema without `$schema`), `spawnSandboxed` (fresh
  empty cwd, stdin, timeout) and `runSandboxed`, which parses the JSON
  envelope into `ok` or a failure category.
- `sandboxProbes.ts` / `sandboxCanary.ts` — the gate's two real runs (benign
  with canary project files in the parent directory, hostile) and the judging
  of their `stream-json` events.
- `sandboxCheck.ts` — the `sandbox-check.json` record and
  `requirePassedCheck(claudeBin, stateDir)`.
- `evaluate.ts` — `evaluateAd(ad, runStep)`: the ad as JSON on stdin, the
  output checked again with zod, `unsure` mapped to `suitable` with the fixed
  first reason.
- `evaluationRun.ts` — `runEvaluation`: screen `new` ads, check Ollama, then
  evaluate the oldest `perRunCap` ready ads through `mapLimit` at
  `concurrency`; a failure is a same-state transition with its category.
- `draftOutput.ts` — the drafting step's zod schema and `checkDraft`, which
  answers `ask_mismatch` unless the `[[ASK:id]]` markers in the cover letter
  and CV are exactly the question ids.
- `draft.ts` — `writeDraft(ad, templates, runStep)`: the ad, its evaluation
  and both CV templates as JSON on stdin, the output checked again.
- `draftApplication.ts` — `buildDraft(ad, output, naming)`: company and role
  fallbacks, `notes`, the file names (`fileComponent`) and the saved ad.
- `draftRun.ts` — `runDrafting`: check Ollama, then draft the oldest
  `perRunCap` suitable ads through `mapLimit`; a failure is a same-state
  transition with its category.
- `sync.ts` — `syncProfile({ jobApp, config, store, ollama })`: copies the
  marked attachments into `syncFolder` as `<id>-<safe name>`, rebuilds the
  index, then clears the marks. It does no health check.

### `agent/test/`

- `fakeJobApp.ts` — an HTTP stand-in for the job-app endpoints the runner
  uses (login, pending list, download, flag, and the ad routes from
  `fakeJobAppAds.ts`), with recorded flag calls, transitions, drafts and
  every request line, a login
  counter, session expiry and a switchable failure. `fakeHttp.ts` holds its
  JSON helpers.
- `fakeJobAppAds.ts` — `fakeAd(fields)` and the ad ingest, list, get,
  transition and multipart draft handlers. They are idempotent on
  `(source, externalId)`, record attempts, fail an ad on the third and draft
  only a suitable ad, as the server does.
- `fakeMailbox.ts` — an in-memory `Mailbox` that records the UIDs read after.
- `fakeSources.ts` — `fixture(name)`, `alert(fields)` and `fakePoliteHttp`,
  which answers every get with one result.
- `fakeClaude.ts` — an executable stand-in for the `claude` CLI: records
  argv, env, cwd and stdin to `FAKE_CLAUDE_LOG` and acts as
  `FAKE_CLAUDE_MODE` says; `--version` prints `9.9.9`.
- `fakeOllama.ts` — an HTTP stand-in on port 0 with deterministic trigram
  vectors, a request counter and switchable failures.
- `profileFixture.ts` — a temp `HOME` with a synthetic corpus and config, and
  `runNode`, an async spawn so the fake can answer the child process.
- `tempDir.ts`, `runCommandFixture.ts`.

## The rest of the tree

- `public/` — served verbatim at the site root, not processed by Vite.
- `e2e/` — Playwright specs, configured by `playwright.config.ts`.
- `dist/`, `node_modules/`, `test-results/`, `playwright-report/` are
  generated — never edit by hand, never commit.
