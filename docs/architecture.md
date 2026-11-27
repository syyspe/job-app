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
| `ads.css` | The ad inbox surface — the run panel and its run rows, the group filter, ad rows and their spine |

New rules read tokens from `index.css` rather than inventing values.

### `src/components/`

Presentational components, each with a test beside it. By surface:

- **Login** — `LoginForm`.
- **Applications** — `ApplicationsView` (with its local `useApplications`
  hook for the data and `useListView` for sort, archived filter and page)
  over `ApplicationList`, `ApplicationDetail`, `ApplicationForm` and
  `ApplicationSort`, with `OpenQuestions` (lists each open
  `[[ASK:qN]]` question, shown only while any is open) and `AttachmentList`
  in the detail, and `ArchivedToggle`/`Pagination` at the foot of the list.
  `AttachmentList` offers Edit on a current `.md` attachment and opens
  `AttachmentEditor` in place of the row's actions; an original with an
  edited copy says "Original, kept unchanged" instead.
- **Admin** — `AdminView` (with its local `useUsers` hook) plus `UserForm`,
  `UserList` and `UserRow`.
- **Ad inbox** — `AdsView` (with its local `useAds` hook and the group filter)
  over `AdList` and `AdRow`. The filter lists four groups of the stored
  states (Kept, Failed, Drafted, Set aside; see `adStates.ts`), and ads in
  progress or closed belong to none and aren't listed. A kept row offers
  Draft and Dismiss, a failed one Retry and Dismiss; a set-aside row says
  which step dropped it and why, and offers no buttons. For users with
  agent access, a suitable ad's row offers Draft; `AdsView` passes each row
  its `DraftStatus` (`none`, `ready`, `busy` while another run is current,
  `running` — `Drafting…` in place of the buttons — while its own is). A summary email's
  `#ad-<id>` link opens the inbox (`App` reads the hash once, so it outlives
  the in-page login); `AdsView`'s `focusAdId` selects that ad's group once
  the ads load (an ad in no group leaves Kept selected), and its row is `aria-current` and scrolled into view. Above the filter,
  for users with agent access only, `AgentRunPanel`, presentational over
  `AdsView`'s `useAgentRuns`: Run now and Check mail, the current run's
  output and the last ten runs one at a time through `Pagination`, the
  current run in their place while one is in progress, each with its Claude
  API spend when its output ends with the `api:` line.
- **Frame** — `NavBar`, which switches between the views and shows the Admin
  control to admins only; `ToastProvider` and `ToastHost`.

### `src/lib/`

- `api.ts` — every `fetch` against `/api`. Components don't call `fetch`
  themselves. Sends `credentials: 'same-origin'` on every call and throws
  `UnauthorizedError` on a 401.
- `apiAction.ts` — `useApiAction(onUnauthorized)`, the `run` wrapper both
  data hooks share: it shows the success toast, and on `UnauthorizedError`
  shows the session-expired toast and calls `onUnauthorized`.
- `useAgentRuns.ts` — `useAgentRuns({ enabled, onUnauthorized,
  onRunFinished })`: the runs listing, polled every 3 s while a run is
  current, and `start(request)`; a run finishing calls `onRunFinished`,
  which refreshes the inbox. Disabled, it fetches nothing.
- `agentRuns.ts` — `RUN_KIND_LABELS`, `runOutcome` (exit 0 succeeded,
  non-zero failed, none interrupted), `RUN_OUTCOME_LABELS`, and `runSpend`,
  which reads the last `api: $x run, $y month` line from a run's output.
- `adStates.ts` — the inbox's groups: `AD_GROUPS` (the filter's order),
  `AD_GROUP_LABELS` (the summary email's words), `adGroup` (stored state,
  plus the pre-screen verdict for a dismissed ad, → group or none),
  `setAsideBy` (which step dropped a set-aside ad, and why), which actions a
  group offers (`canDismiss`, `canDraft` for Draft), and `DraftStatus`.
- `adLink.ts` — `adIdFromHash(hash)`: the ad id of a `#ad-<id>` hash, or null.
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
routes to admins. `requireAgentAccess` is mounted at `/api/agent`, ahead of
the run router, so runs follow the user's agent-access flag rather than their
role. The run router exists only when `createApp` is given a `runner` (as
`index.ts` always does). `index.ts` also closes the runs a previous server
process left open before it listens.

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
`PUT /attachments/:id/profile-sync`, where a clear naming a `storedName` the
row no longer has is a 409 that keeps the mark; and
`PUT /attachments/:id/text`, the raw-text save of a `.md` attachment),
`questions.ts` (`GET /applications/:id/questions` and
`POST /applications/:id/answers`, the draft's open questions),
`agentRuns.ts` (`GET`/`POST /agent/runs`, agent access only: list the current and
last ten runs, or start one, 409 while one is running; a draft run names a
`suitable` ad of the caller's, or is 404/409), `auth.ts` (`/login`, `/logout`, `/me`), `config.ts`
(`/config`, the page size the client pages the list by) and `users.ts`
(admin-only account management, including `PUT /users/:id/agent-access`).

### `server/models/`

Sqlite row shapes and the row→domain mappers, including `user.ts` and
`agentRun.ts`.

### `server/lib/`

Helpers with no Express dependency:

- `validation.ts` — input checks, and the server's `ApplicationInput`.
- `applications.ts` — `touchApplication`, which bumps `updated_at`, and
  `insertApplication`/`insertAttachment`, the one copy of each INSERT, used by
  the applications, attachments and ad draft routes.
- `uploads.ts` — `createUpload(uploadsDir)`, the multer disk storage both
  upload routers use (UUID file names, 10 MB limit, UTF-8 file names).
- `adStates.ts` — the ad state tables: allowed transitions, and which states
  clear the text.
- `adDedup.ts` — `canonicalUrl`, `normaliseText` and the two duplicate lookups.
- `adValidation.ts` — request parsing for each ad route; `parseAdDraft`
  fixes status `draft` and an empty `dateApplied` itself.
- `ads.ts` — the ad database operations: ingest, transition, hand-over,
  `requestFetch` (on `awaiting_handover` only), `setPrescreen` (on `new` or
  `awaiting_handover`), `draftAd` (application, attachments and the move to
  `drafted`, run by the route in one transaction), and reporting, which sets
  `reported_at` only. A transition to `ready` fills an empty
  `company` or `deadline` from the request before the dedup rules run.
- `files.ts` — attachment storage.
- `askMarkers.ts` — pure text rules for `[[ASK:qN]]` markers: the open ids,
  filling answers into a document, the `qN:` question lines in the notes and
  the `→ <answer>` line written under them, and `.md`/"(edited)" naming.
- `markdownEdits.ts` — `currentDocuments` (the `.md` attachments no copy
  supersedes), `readTextIfExists` and `saveMarkdownText`. That last one never
  overwrites an original. The first save inserts an "(edited)" copy with
  `edited_from` set, and the profile mark moves to it. A later save
  overwrites the copy. It returns the replaced file for the caller to unlink
  after its transaction commits. Shared by the attachments and questions
  routers.
- `passwords.ts` — hashing and session tokens.
- `cookies.ts` — reads the session cookie. Express 5 doesn't parse cookies,
  which is the only reason this file exists.
- `migrations.ts` — the startup column migrations (`migrateApplicationDates`,
  `migrateApplicationArchived`, `migrateUserRole`, `migrateUserAgentAccess`,
  `migrateAttachmentUploadedAt`,
  `migrateAttachmentProfileSync`, `migrateAttachmentEditedFrom`,
  `migrateAdFetch`, and `migrateAgentRunsDraft`, which rebuilds
  `agent_runs` because SQLite can't alter its CHECK) behind one `migrate`.
- `seed.ts` — `createUser`; `seedUser`, which every run grants admin and
  agent access, so the seeded user is how an admin comes into being; and
  `migrateApplicationsToUser`, the table rebuild that gives a pre-auth
  database a `user_id`.
- `users.ts` — `setUserRole`, `setUserAgentAccess` and `adminCount`, needed
  by both the seed and the users router.
- `config.ts` — `parsePageSize`, which reads `PAGE_SIZE` at startup and
  throws on anything that isn't a whole number of at least 1; and
  `parseLogLevel`, which does the same for `LOG_LEVEL`.
- `logger.ts` — `createLogger`, the no-dependency JSON-lines logger.
- `agentRunner.ts` — `createRunnerSpawner(spawn, root, env)`: the only place
  the API spawns anything. `RUNNER_ARGS` is the constant argv per run kind
  (`run`, `collect`, `draft`); a draft appends its validated ad id, the one
  request value that reaches argv. `runnerEnv` is the env allowlist,
  `REPO_ROOT` the default cwd.
- `agentRuns.ts` — the `agent_runs` operations: `currentRun`, `recentRuns`,
  `startRun` (spawns, inserts the row, appends each stdout/stderr line
  capped to the last 64 KiB, and finishes it on `close`) and
  `closeInterruptedRuns`, which `index.ts` calls at startup.
  `server/index.ts` builds the one instance; `child` binds fields such as the
  request ID.

### `server/middleware/`

- `requestLogging.ts` — mounted first: gives each request a UUID
  (`X-Request-Id`, `res.locals.requestId`), a child logger on
  `res.locals.log`, and one `request finished` line.
- `errors.ts` — the error handler. It logs each failure once, through
  `res.locals.log`.
- `auth.ts` — `requireSession`, `requireAdmin`, `requireAgentAccess`.

### Everything else under `server/`

- `db/index.ts` — `openDatabase`: connection plus schema. `attachments.profile_sync`
  (0/1) is the "Add to profile" mark the runner clears. `agent_runs` holds the
  runs started from the UI, with `ad_id` set for a draft run; it isn't
  scoped by user.
- `seed.ts` — the `npm run seed` CLI entry point.
- `test/auth.ts` — `loginAs`, a test helper that logs in and returns a cookie
  header string for route tests to pass by hand.
- `test/adsApi.ts` — `withAdsApi` and the request helpers the `ads.*.test.ts`
  route tests share.
- `test/fakeChild.ts` — `fakeChild()`, a stand-in `ChildProcess` with
  writable stdout/stderr and a `close(code, signal)` that emits as Node does.

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

One file per tool group (`ads.ts`, `applications.ts`, `attachments.ts`,
`questions.ts`), each exporting
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
- `searchTool.ts` — `SEARCH_PROFILE_DESCRIPTION` and `searchRequestShape`,
  shared by the MCP tool and the runner's API step so the two can't drift.

### `agent/runner/` — the runner

The part of `agent/` that talks to job-app. It reads its credentials from
`~/.config/job-agent/env` and never from `process.env`.

`commands/sync.ts` is `npm run profile:sync`. It requires `syncFolder`, checks
Ollama, then runs `syncProfile` and prints what it copied and the build
summary. `commands/sandboxCheck.ts` is `npm run agent:sandbox-check`: it runs
the probes, prints pass or fail per property and records the CLI version only
when all pass. `commands/evaluate.ts` is `npm run agent:evaluate`: config,
runner config, private prompt and env, then the version gate, then
`runEvaluation`. `commands/draft.ts` is `npm run agent:draft -- <ad id>`:
the id, then config, the `drafting` key, the private prompt and both CV
templates and env, then `run.lock`, then `ensureSandboxVerified` (the
probes, if the installed `claude` hasn't passed), then `draftNamedAd`. Its
step is always `cliStep`, whatever `engine` says. `commands/collect.ts` is `npm run agent:collect`:
the `sources` key, runner config and the mail and job-app env, then
`openMailbox` and `runCollect`, closing the mailbox whatever happens. It runs
no `claude -p`, so it has no version gate. `commands/run.ts` is
`npm run agent:run`: every config key, prompt and env value it needs (no
`drafting` key, CV templates or `draft.md`; exit 2 before anything else),
then `acquireRunLock`, the profile index only when `syncFolder` is set, and
`runDaily` with the real dependencies; it prints `runOutputLines`, the
summary's own sentences.
`daily-run.sh` is what the scheduled task runs: it logs to
`~/.local/state/job-agent/logs/`, starts job-app if it isn't answering, and
runs `agent:run`. Each line formatter (`formatCollectReport`,
`formatEvaluationReport`, `formatDraftReport`, `formatSyncResult`,
`runOutputLines`) lives in `lib/`, since a command file runs on import.

`prompts/evaluate.framing.md` is the fixed head of the evaluation system
prompt; `prompts/evaluate.example.md` a synthetic example of the private
criteria that follow it. `prompts/draft.framing.md` and
`prompts/draft.example.md` are the same pair for drafting.

`lib/`:

- `env.ts` — `loadJobAppEnv(path)`, `loadMailEnv(path)` and
  `loadSmtpEnv(path)`: `util.parseEnv` of the env file, which gives
  `{ baseUrl, username, password }` and `{ host, username, password }` (the
  IMAP or the SMTP host, with the shared mail login), and `loadApiKey(path)`
  for `ANTHROPIC_API_KEY`. A missing file or variable is exit 2.
- `jobApp.ts` — `createJobAppClient(config)`: `listPendingSync`,
  `downloadAttachment`, `clearProfileSync(id, storedName)` (false on 409,
  through the request's `allow` list), `listAds(state)`, `getAd(id)`,
  `transitionAd(id, body)`, `ingestAd(input)` (201 new, 200 existing),
  `draftAd(id, upload)` (multipart: the five fields
  and three `text/plain` files) and `markReported(ids)`. There is no other way to create or change an
  application. It logs in lazily, re-logs in once on a 401, and
  turns every failure into a `CliError(1, …)`. Ad responses are checked
  against only the fields the runner reads.
- `runnerConfig.ts` — `loadRunnerConfig(path)`: `titleRules.reject` and
  `evaluation.{concurrency, perRunCap, timeoutMs}`, with defaults;
  `loadDraftConfig(path)`: the `drafting` key, read only by `agent:draft`;
  `loadSourcesConfig(path, connectors)`: the `sources` key, with every
  connector present (missing means disabled) and the exit-2 refusals;
  `loadDailyRunConfig(path)`: `handoverWaitDays` and `summary.recipient`,
  read only by `agent:run`; `loadEngineConfig(path)`: `engine` and `api`
  (models, effort, `perRunUsd`, `monthlyUsd`, prices), refusing an unpriced model under
  `"api"`.
- `mapLimit.ts` — `mapLimit(items, {limit, canStart}, fn)`, order-keeping
  bounded concurrency for the runs; once `canStart` is false no further item
  starts, and only the started items are returned.
- `engine.ts` — `cliStep(env, spec)`, a sandboxed `claude -p` step, which
  drafting uses directly; `createEngine(config, deps)` and
  `loadEngine(env, profile)` for the pre-screen and evaluation:
  `stepFor(spec)` gives a step's `RunStep`, a sandboxed `claude -p` under
  `"cli"` (with the `UNLIMITED` budget) or the API step under `"api"` (with a
  run budget charging `<stateDir>/api-spend.json`). It builds objects only,
  with no network or file I/O.
- `apiStep.ts` — `createApiStep(options)`: one Messages conversation per
  call, `search_profile` its only tool and answered in-process, at most 8
  tool rounds, the whole call under one `timeoutMs` signal, and the SDK's
  errors mapped onto the failure categories (a 401 or 403 also stops the
  budget). Every non-timeout API error is `model_failed` with a `detail`:
  status, the API's message and the request id. `MessagesApi` is the narrow
  client a fake satisfies.
- `apiBudget.ts` — `responseCost(price, usage)`, the `StepBudget` interface,
  `UNLIMITED`, and `createRunBudget`, which charges each response to the run
  and the month's ledger and stops new steps on `stop(reason)`, at
  `perRunUsd`, or once the month reaches `monthlyUsd`, in that order.
  `spend()` gives the run's and the month's figures once a call was made.
- `apiSpend.ts` — `createSpendLedger(path, now)`: `monthTotal()` and
  `add(usd)` over `api-spend.json` (`{ months: { "YYYY-MM": usd } }`, local
  months), re-read on every call and written through `state.ts`'s
  `writeState`, keeping only the current and previous month.
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
  source counters and the source failure list (`removeFailures` drops the
  ones a sent summary covered), each a JSON file written through a temp file
  and a rename; `localDate(now)`, and the `readState`/`writeState` helpers
  the spend ledger reuses.
- `lock.ts` — `acquireRunLock(stateDir)` → `release`: `run.lock` created
  exclusively with the pid; a holder whose `/proc/<pid>/cmdline` still names
  `agent/runner/commands/run.ts`, `collect.ts` or `draft.ts` is `CliError(1, …)`; any other holder (gone,
  reused by an unrelated process, or unreadable) is removed and the lock
  taken once more.
- `handoverExpiry.ts` — `handoverExpired(ad, { waitDays, now })` (UTC
  first-seen plus the wait, or past an ISO deadline's local day; an ad with a
  Fetch request and a deadline waits for the deadline) and
  `dismissExpiredHandovers(jobApp, options)`, which also dismisses hand-over
  ads in `ready` or `suitable` past their deadline.
- `smtp.ts` — `sendMail(message, config, transport)`: the hand-written SMTP
  exchange over implicit TLS on 465 (`EHLO`, `AUTH PLAIN`, `MAIL FROM`,
  `RCPT TO`, `DATA`, `QUIT`), every reply code checked, a base64 body, a 30 s
  timeout. Failures are `CliError(1, …)`: unreachable, login refused, or the
  command refused with its code.
- `story.ts` — `storyOf(report, appUrl)`: the run in plain sentences, the
  opening ones ("Read 2 new emails. …") and one per problem (a failed or
  skipped step, a budget stop, retries, a failed ad with this run's detail
  and its job-app link, an empty alert, a block), plus the promising,
  set-aside and kept ads. `storyLines` is what both outputs print,
  `hasNews` whether there is anything to send, `adLink(appUrl, id)` the
  `#ad-<id>` link and `adName` "title, company".
- `summary.ts` — `composeSummary({ story, apiSpend, appUrl, lanUrl })`:
  subject and plain-text body from the story: the opening, each kept ad with
  both links and its fit summary, the set-aside ads with reason and job-site
  link, the problems and a `Claude API:` spend line. Ad text goes through
  `oneLine`.
- `runOutput.ts` — `runOutputLines(report, appUrl)`: `agent:run`'s stdout,
  the story's sentences, `Kept:` lines, the `summary:` line and the `api:`
  line last.
- `counted.ts` — `counted(n, noun)`: "1 email", "2 emails".
- `oneLine.ts` — `oneLine(value)`: control characters and line breaks become
  spaces, so untrusted text can't start a line of its own.
- `stepFailure.ts` — `FailedAttempt` (ad id, title, source, category,
  optional detail), `failedAttempt(ad, failure)` and
  `formatFailedAttempt(step, attempt)`, the `<step> failed: …` line the
  evaluation and drafting reports print per failed attempt.
- `dailyRun.ts` — `runDaily(options)`, every dependency injected: collect,
  expire, one health check and the gate (`ensureSandboxVerified`, or `null`
  under `"api"`), then sync, pre-screen, fetch and evaluation under the
  budget's `canStart`, the spend check (the budget's stop reason and its
  `spend()`, on `report.apiSpend`), `gatherNews` (unreported `failed` ads and
  source failures, on `report.news`), then the summary. It never drafts. A
  `CliError` in a step is recorded as a failure and the run goes on;
  anything else propagates.
- `politeHttp.ts` — `createPoliteHttp(options)`: the only network path a
  connector has. It checks scheme and host on the URL and every redirect,
  sends fixed headers, spaces requests by `minDelayMs`, counts each open
  before the request and ends the source's day at its cap or first block.
- `sources/` — the connectors. `types.ts` holds the section 6 interface,
  `html.ts` the dependency-free `htmlToText`, `linksOf` and `jobPostingOf`,
  `common.ts` the host check and the fetch-then-extract step, and
  `index.ts` the `CONNECTORS` registry. `academicWork.ts`, `valtiolle.ts` and
  `nordea.ts` are automatic, `duunitori.ts` is hand-over with a `fetchAd`
  over the page's JSON-LD. Every `fetchAd` is called only by `fetchRun.ts`. Each file opens with
  what identifies its alerts and where the ad id, title and text sit.
  `fixtures/` holds synthetic alert bodies and ad pages only.
- `collectRun.ts` — `runCollect`: alerts after the watermark into ingests,
  then `screenNewAds`; it fetches no page. It returns per-source counts, and
  `formatCollectReport` prints them as one sentence.
- `fetchOutcome.ts` — `applyFetch` (a fetch result into a transition: a
  failure is a same-state attempt from `new` or `awaiting_handover`) and
  `recordBlocked`, used by the fetch.
- `fetchRun.ts` — `runFetch`: each enabled source with a `fetchAd`, its
  waiting ads (`awaiting_handover` for a hand-over source, `new` for an
  automatic one) with a Fetch request or, under `fetch: "automatic"`, a
  promising verdict, oldest first, until the day ends.
- `prescreen.ts` / `prescreenRun.ts` — `prescreenAd(ad, runStep)`: title,
  company, location and deadline as JSON on stdin, `unsure` mapped to
  `promising`; `runPrescreen`: the unscreened hand-over ads in
  `awaiting_handover` and automatic ads in `new`, oldest first, up to
  `perRunCap` through `mapLimit`. A not-promising ad is dismissed at once and
  reported under `setAside`. A failure stores nothing.
- `sandbox.ts` — the one way the runner starts `claude -p`: `sandboxArgs`
  (the fixed flag list), `sandboxEnv` (the allowlist), `profileMcpConfig`,
  `stepSchema` (zod → JSON Schema without `$schema` or `maxItems`), `spawnSandboxed` (fresh
  empty cwd, stdin, timeout) and `runSandboxed`, which parses the JSON
  envelope into `ok` or a failure category.
- `sandboxProbes.ts` / `sandboxCanary.ts` — the gate's two real runs (benign
  with canary project files in the parent directory, hostile) and the judging
  of their `stream-json` events.
- `sandboxCheck.ts` — the `sandbox-check.json` record,
  `requirePassedCheck(claudeBin, stateDir)` for `agent:evaluate` and
  `agent:draft`, `verifySandbox` (probes, then the record only if all pass)
  and `ensureSandboxVerified`, `agent:run`'s gate, which probes only when the
  record doesn't match the installed version.
- `evaluate.ts` — `evaluateAd(ad, runStep)`: the ad as JSON on stdin, the
  output checked again with zod, `unsure` mapped to `suitable` with the fixed
  first reason.
- `evaluationRun.ts` — `runEvaluation`: screen `new` ads, check Ollama, then
  evaluate the oldest `perRunCap` ready ads through `mapLimit` at
  `concurrency`; a failure is a same-state transition with its category.
  `kept` lists the ads moved to `suitable` with their fit summary.
- `draftOutput.ts` — the drafting step's zod schema and `checkDraft`, which
  answers `ask_mismatch` unless the `[[ASK:id]]` markers in the cover letter
  and CV are exactly the question ids.
- `draft.ts` — `writeDraft(ad, templates, runStep)`: the ad, its evaluation
  and both CV templates as JSON on stdin, the output checked again.
- `draftApplication.ts` — `buildDraft(ad, output, naming)`: company and role
  fallbacks, `notes`, the file names (`fileComponent`) and the saved ad.
- `draftRun.ts` — `draftNamedAd(options, adId)`: check Ollama, read the ad
  and require `suitable` (either refusal is `CliError(1, …)`, touching no
  ad), then draft it; a failure is a same-state transition with its
  category. `formatDraftReport` is the one result line.
- `sync.ts` — `syncProfile({ jobApp, config, store, ollama })`: copies the
  marked attachments into `syncFolder` as `<id>-<safe name>`, rebuilds the
  index, then clears each mark with the `storedName` it listed, so a file
  replaced mid-run keeps its mark and is returned under `changed`. It does
  no health check.

### `agent/test/`

- `fakeJobApp.ts` — an HTTP stand-in for the job-app endpoints the runner
  uses (login, pending list, download, flag with the conditional 409, and the ad routes from
  `fakeJobAppAds.ts`), with recorded flag calls, transitions, drafts and
  every request line, a login
  counter, session expiry, a switchable failure and a transition that fails
  for one ad (`transitionFailsFor`). `fakeHttp.ts` holds its
  JSON helpers.
- `fakeJobAppAds.ts` — `fakeAd(fields)` and the ad ingest, list, get,
  transition, multipart draft and `reported` handlers. They are idempotent on
  `(source, externalId)`, record attempts, fail an ad on the third and draft
  only a suitable ad, as the server does.
- `fakeMailbox.ts` — an in-memory `Mailbox` that records the UIDs read after.
- `memoryLedger.ts` — `memoryLedger(monthUsd)`, an in-memory `SpendLedger`.
- `dailyRunFixture.ts` — `startDailyRun()`: a fake job-app, runner state, a
  mailbox, and `options(overrides)` for `runDaily` recording each step and
  sent summary; shared by `dailyRun.test.ts` and `dailyRun.budget.test.ts`.
- `fakeSmtp.ts` — a plain-TCP SMTP stand-in: records every command and the
  decoded message, and can refuse a chosen verb with a code, drop the
  connection or never greet.
- `fakeSources.ts` — `fixture(name)`, `alert(fields)` and `fakePoliteHttp`,
  which answers every get with one result.
- `fakeAnthropic.ts` — a scripted `MessagesApi`: each call takes the next
  reply (a message, a real SDK error, or `hang` until the signal aborts) and
  records the request body; builders for messages, blocks and API errors.
- `fakeClaude.ts` — an executable stand-in for the `claude` CLI: records
  argv, env, cwd and stdin to `FAKE_CLAUDE_LOG` and acts as
  `FAKE_CLAUDE_MODE` says; `--version` prints `9.9.9`.
- `fakeOllama.ts` — an HTTP stand-in on port 0 with deterministic trigram
  vectors, a request counter and switchable failures.
- `profileFixture.ts` — a temp `HOME` with a synthetic corpus and config, and
  `runNode`, an async spawn so the fake can answer the child process.
- `fakeRunHolder.ts` — `startFakeRunHolder(script)`, a live process whose
  command line names a run script, for the lock tests.
- `tempDir.ts`, `runCommandFixture.ts`.

## The rest of the tree

- `public/` — served verbatim at the site root, not processed by Vite.
- `e2e/` — Playwright specs, configured by `playwright.config.ts`.
  `e2e/fixtures/runner/` holds stub `agent/runner/commands/{run,collect}.ts`
  that print two lines; both configs point `AGENT_RUNNER_ROOT` at it.
- `dist/`, `node_modules/`, `test-results/`, `playwright-report/` are
  generated — never edit by hand, never commit.
