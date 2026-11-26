---
brief: brief/051-run-from-ui.md
branch: 051-run-from-ui
date: 2026-11-26
---

# Start and follow agent runs from the ad inbox — Plan

Context: today a run starts only from Task Scheduler or a WSL terminal. This
stream lets an admin start `agent:run` ("Run now") or `agent:collect` ("Check
mail") from the ad inbox on a phone, and watch the output. The contract is
`docs/in-app-agent.md` §1 (spawn rules) and §7 (table, endpoints, panel).

## Decisions this plan settles

- **Stub runner for e2e (the brief's open question).** `server/index.ts`
  reads an optional `AGENT_RUNNER_ROOT` at startup. It replaces the repo root
  as the spawn's cwd, so the fixed relative argv
  (`agent/runner/commands/<kind>.ts`) resolves inside it. The default is the
  repo root, resolved from `server/lib/agentRunner.ts`'s own location. The
  argv table and the env allowlist don't change, and no request value is
  involved. Both Playwright configs set it to `e2e/fixtures/runner`, which
  holds stub `agent/runner/commands/{run,collect}.ts`. `docs/in-app-agent.md`
  §1 gains one line for it ("test-only override, server env, read once").
- **The lock recognises collect.** `agent/runner/lib/lock.ts`'s `isRun`
  checks only `run.ts` today. With `collect.ts` holding the lock, a run would
  treat the lock as stale and take it. `RUN_SCRIPT` becomes `RUN_SCRIPTS =
  [run.ts, collect.ts]`. The message stays `another run is in progress (pid
  N)`.
- **Router mounted only when a runner is given.** `createApp` gains an
  optional `runner: RunnerSpawner`. When it's set, `app.ts` mounts
  `requireAdmin(db)` at `/api/agent`, then `createAgentRunsRouter(db,
  runner)`. `server/index.ts` always passes one. Other router tests don't
  change, and an app with no runner has no run routes. No default spawner
  reads `process.env` from `app.ts`.
- **Interrupted rows close in `server/index.ts`**, right after
  `openDatabase`. They don't close in `openDatabase` itself, because
  `npm run seed` opens the database too and would close a live row.
- **Output cap is done in SQL.** `UPDATE agent_runs SET output =
  substr(output || ?, -65536)`, counted in characters. The tail is kept.
- **Timestamps** are `new Date().toISOString()` (UTC ISO with `Z`), as §7
  says. The client shows them with the existing `formatTimestamp`.

## Affected files

- `server/db/index.ts`: add `agent_runs` to `SCHEMA` (`CREATE TABLE IF NOT
  EXISTS`), with §7's columns and `CHECK (kind IN ('run','collect'))`.
  `started_by` references `users(id)`. This is how `ads` arrived, so an old
  database gets the table on the next start.
- `server/lib/agentRunner.ts` (new):
  - `RUNNER_ARGS: Record<AgentRunKind, readonly string[]>`, the §1 table.
  - `REPO_ROOT` is `join(import.meta.dirname, '../..')`.
  - `runnerEnv(env)` returns the allowlist: `PATH`, `HOME`, `LANG`,
    `LC_ALL`, `TZ`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME`,
    `XDG_CACHE_HOME`, `NODE_EXTRA_CA_CERTS`, each only when set.
  - `type SpawnFn = (command, args, options) => ChildProcess` (the shape of
    `node:child_process.spawn`).
  - `type RunnerSpawner = (kind) => ChildProcess`.
  - `createRunnerSpawner(spawn, root, env)` calls `spawn(process.execPath,
    [...RUNNER_ARGS[kind]], {cwd: root, env: runnerEnv(env), shell: false,
    stdio: ['ignore','pipe','pipe']})`.
- `server/lib/agentRuns.ts` (new). Express-free; `db` and the logger are
  passed in.
  - `currentRun(db)` and `recentRuns(db)` (the last 10 finished rows, by
    `id DESC`).
  - `startRun(db, {kind, userId, runner, log})` inserts the row, spawns the
    child and logs `agent run started` (`runId`, `kind`, `startedBy`).
  - Each stream goes through `readline.createInterface`. Every line is
    appended through the capped UPDATE. On `error`, it appends
    `(could not start: <message>)`.
  - On `close(code)`, it sets `finished_at` and `exit_code` (`null` when
    killed by a signal), then logs `agent run finished` (`runId`, `kind`,
    `exitCode`, `durationMs`). It returns the inserted row.
  - `closeInterruptedRuns(db)` returns the count closed. It appends
    `(server restarted)` on its own line.
- `server/models/agentRun.ts` (new): `AgentRunRow` and `toAgentRun` →
  `{id, kind, startedAt, finishedAt, exitCode, output}`.
- `server/types.ts` and `src/types.ts`: `AgentRunKind`, `AgentRun`,
  `AgentRuns {current: AgentRun | null; recent: AgentRun[]}`, plus
  `AGENT_RUN_KINDS` wherever `ROLES` lives today.
- `server/lib/validation.ts`: `validateRunKind(body)` uses `fieldsOf`. A
  bad value throws `HttpError(400, 'kind must be one of: run, collect')`.
- `server/routes/agentRuns.ts` (new): `createAgentRunsRouter(db, runner)`.
  - `GET /agent/runs` returns `{current, recent}`.
  - `POST /agent/runs`: validate the kind first, then `409 'a run is already
    in progress'` if `currentRun`, then `startRun` with `res.locals.log`.
    Returns `201` and the row.
  - The check and the insert are synchronous, so two concurrent POSTs can't
    both pass.
- `server/app.ts`: the optional `runner` and the conditional mount, placed
  before `/api/users`.
- `server/index.ts`:
  - Calls `closeInterruptedRuns(db)`. When it closes any, it logs `interrupted
    agent runs closed` (`count`).
  - Builds `createRunnerSpawner(spawn, process.env.AGENT_RUNNER_ROOT ||
    REPO_ROOT, process.env)` and passes it to `createApp`.
- `agent/runner/lib/lock.ts`: `RUN_SCRIPTS`, as above.
- `agent/runner/commands/collect.ts`: takes `acquireRunLock(stateDir(...))`
  after config and env load and before `openMailbox`. Releases it in an
  outer `finally`.
- `agent/test/fakeRunHolder.ts`: `startFakeRunHolder(script = 'agent/runner/commands/run.ts')`.
- `src/lib/api.ts`: `listAgentRuns()` and `startAgentRun(kind)`.
- `src/lib/agentRuns.ts` (new):
  - `RUN_KIND_LABELS` is `{run: 'Daily run', collect: 'Mail check'}`.
  - `runOutcome(run)` returns `'succeeded' | 'failed' | 'interrupted'`
    (`exitCode` 0, non-zero, or null).
  - `RUN_OUTCOME_LABELS`.
- `src/components/AgentRunPanel.tsx` (new), with its test. Props:
  `onUnauthorized` and `onRunFinished`.
  - A `<section aria-labelledby>` with an `<h3>Runs</h3>`, and the buttons
    **Run now** and **Check mail**, which are disabled while a run is
    current.
  - The current run shows "Running: Daily run, started <time>" and a
    `<pre role="log" aria-label="Current run output">`.
  - The `<ul aria-label="Recent runs">` has one `<li data-outcome>` per
    run, with its kind label, time and outcome label. A
    `<details><summary>Output</summary><pre>` holds the output. The newest
    is open.
  - Reads once on mount. While `current` is set, a `setTimeout` loop polls
    `listAgentRuns` every 3 s. A poll that sees `current` go from set to
    `null` calls `onRunFinished`.
  - Starting a run goes through `useApiAction`, so a 409 or 400 becomes the
    error toast.
- `src/components/AdsView.tsx`: gains an `isAdmin` prop and renders
  `<AgentRunPanel>` above the filter when it's set. `useAds` returns
  `reload` for `onRunFinished`.
- `src/App.tsx`: passes `isAdmin={user.role === 'admin'}`.
- `src/ads.css`: the panel's rules (`.run-panel`, `.run-item`), using index
  tokens only.
  - A failed run gets a 4px `--danger` spine.
  - Succeeded and interrupted runs recede: a 2px neutral spine and muted
    text.
  - The running run gets an accent spine.
  - `pre` uses `white-space: pre-wrap; overflow-wrap: anywhere` and a capped
    `max-height` with `overflow: auto`.
  - Plus the 360 px fixes found in step 9 (also `applications.css` if the
    draft flow needs them).
- `e2e/fixtures/runner/agent/runner/commands/collect.ts` and `run.ts`
  (new): each prints two fixed lines and exits 0, with no imports.
- `e2e/agentRuns.spec.ts` (new):
  - Log in, open the inbox, click Check mail.
  - The panel shows the run, then the finished row with the stub's line
    and "Succeeded".
  - At 360 × 800, `scrollWidth <= clientWidth` holds for the inbox. The
    same check runs for an application's detail with open questions and the
    Markdown editor open (steps reused from the existing ads and
    applications specs).
- `playwright.config.ts` and `playwright.prod.config.ts`: the server env
  gains `AGENT_RUNNER_ROOT: join(import.meta.dirname, 'e2e/fixtures/runner')`.
- `README.md`: a new "Runs from the UI" section covering the admin-only
  panel, what each button runs, the lock and the 409, output capped at
  64 KiB, `(server restarted)`, and the env allowlist. It also says the
  runner still reads `~/.config/job-agent/`, and that `AGENT_RUNNER_ROOT` is
  for tests.
- `docs/architecture.md`: lists the router, `agent_runs`,
  `agentRunner.ts`/`agentRuns.ts`, the model and `AgentRunPanel`.
- `docs/in-app-agent.md`: the 051 Streams row → `done`, and §1 gains the
  override line. `docs/job-search-agent.md` §3's `run.lock` line: held by
  `agent:run` or `agent:collect`.

## Work order

1. Lock: add `RUN_SCRIPTS` and the `fakeRunHolder` script param, then
   `collect.ts` takes the lock. Write the tests first.
2. Schema, then `models/agentRun.ts`, then the types in both copies, then
   `validateRunKind`.
3. Write `server/lib/agentRunner.ts` with its unit tests (argv, env
   allowlist, options).
4. Write `server/lib/agentRuns.ts` with its unit tests (append and cap,
   close, interrupted).
5. Write the router, the `app.ts` mount and `index.ts` wiring, then the
   router tests.
6. Add the client API functions, `src/lib/agentRuns.ts`, and
   `AgentRunPanel` with its test.
7. Wire `AdsView` and `App`, and add the panel CSS.
8. Add the e2e stub, the config env and `agentRuns.spec.ts`'s run test.
9. Check `ss -ltnp | grep -E '5173|3001|3002'` first. At 360 px, screenshot
   the inbox (with the panel), an ad row's hand-over form, an application
   detail with open questions, and the Markdown editor. Fix each overflow
   or cramped control in that surface's CSS file. Then add the 360 px
   assertions to the spec.
10. Update the docs: README, architecture, `in-app-agent.md` and
    `job-search-agent.md`.
11. Run `npm test -- --maxWorkers=2`, `npm run lint`, `npm run build`, then
    `npm run test:e2e` (or `:prod` if a port is taken).

## Build notes

Where the build departed from the work order above:

- `startRun` spawns the child **before** inserting the row, not after.
  `spawn` throws synchronously for some errnos, and a throw after the
  insert would leave a row open until the next restart. The child's events
  fire on a later tick, so the listeners attached afterwards miss nothing.
- A child that never started still emits `close`, with a negative errno as
  its code. `startRun` records exit `null` for it, as the failure case
  below expects.
- `app.ts` mounts the run router through a small `mountAgentRuns(app, db,
  runner)`, which keeps `createApp` within the 40-line limit.
- `useAds` returns `refresh`, a stable callback that wraps its `reload` in
  the action runner, instead of `reload` itself. A fresh function on every
  render would restart the panel's poll timer.
- Step 9 found nothing to fix. At 360 px the inbox (with the panel and an
  open hand-over form) and a draft's open questions and Markdown editor
  neither overflow nor cramp a control, so no `applications.css` change.
- Also added: `server/test/fakeChild.ts`, shared by the lib and router
  tests; `validateRunKind` cases in `validation.test.ts`; and a
  `collect.ts` line in the README's "Alert sources" command list saying it
  takes `run.lock`.

## Parallel streams

- `049-api-steps` (planned, building now). It shares no code file: 049
  edits `run.ts`, not `collect.ts`, `lock.ts` or `server/`.
  - Shared docs: `README.md` (049 edits "Ad evaluation" and "Daily run",
    and this stream adds a new section), `docs/in-app-agent.md` (a
    different Streams row, §4 against §1), and `docs/job-search-agent.md`
    §3 (049 the env row, this stream the lock line).
  - No contract contradicts. The panel only spawns commands and shows
    their output, so it works with either engine.
  - **Independent**: whichever merges second rebases and resolves the
    doc hunks.
- 050's `api:` line needs no panel code. It's an output line and shows up
  as one.

## Tests

- New:
  - `lock.test.ts`: a lock held by a live `collect.ts` is refused.
  - `collect.test.ts`:
    - A lock held by a live run exits 1 with `another run is in progress
      (pid N)` and reads no mail, with the watermark unmoved.
    - The unreachable-mailbox case still leaves no `run.lock`.
  - `server/lib/agentRunner.test.ts`:
    - Argv per kind is exactly `[execPath, 'agent/runner/commands/<kind>.ts']`.
    - `cwd` is the root given, and `shell: false`.
    - The env is only the allowlist: `DB_PATH`, `SESSION_SECRET`,
      `ANTHROPIC_API_KEY` and `UPLOADS_DIR` are dropped, and
      `NODE_EXTRA_CA_CERTS` passes when set.
  - `server/lib/agentRuns.test.ts` uses a fake child (an EventEmitter with
    PassThrough stdout and stderr):
    - Lines from both streams append.
    - Output past 65 536 chars keeps the tail.
    - `close(0)`, `close(1)` and `close(null, 'SIGKILL')` set `exit_code`
      to 0, 1 and null.
    - A real `spawn` with a nonexistent cwd ends finished with `(could not
      start: …)`, which proves Node emits `close` after `error`.
    - `closeInterruptedRuns` closes only open rows and appends `(server
      restarted)`.
    - The logs carry IDs and the exit code, never an output line (the
      `logger.test.ts` capture style).
  - `server/routes/agentRuns.test.ts` uses `createApp` with a fake runner
    that records each kind and returns a controllable fake child:
    - 401 without a session, and 403 for a basic user, on both routes.
    - 400 for a missing, unknown or non-string kind, and for a non-object
      body.
    - 201 with the row; then `GET` shows it as `current`.
    - A second POST gives 409 `a run is already in progress`, and the
      runner was called once.
    - After the child closes, it's in `recent` and `current` is null.
    - `recent` caps at 10, newest first.
    - **A POST with extra fields (`argv`, `env`, `cwd`, `kind: 'collect'`)
      reaches the real `createRunnerSpawner` (with a recording `SpawnFn`)
      with exactly the constant argv and the allowlisted env**. This test
      pins that no request value reaches argv or env.
  - `AgentRunPanel.test.tsx` (by role and name; fake timers for polling):
    - The buttons are disabled while a run is current.
    - A click on Check mail posts `collect`.
    - The panel polls while running, then calls `onRunFinished` and shows
      the run under "Recent runs" with its outcome.
    - A 409 shows the error toast.
    - The current run's output appears in the log.
  - `AdsView.test.tsx`: no panel for a non-admin. An admin sees the "Runs"
    region.
  - `e2e/agentRuns.spec.ts`, as above.
- Updated: `lock.test.ts` and `run.test.ts` use the default script (no
  change in behaviour). `App.test.tsx`, only if it renders `AdsView`.
- Failure cases:
  - The body isn't an object, or the kind is unknown → 400 `{error}`.
  - A run is in progress → 409.
  - Not logged in → 401. Not an admin → 403.
  - The child is refused by `run.lock` → the row finishes with exit 1 and
    the lock's message as output. The panel shows it as Failed.
  - The spawn fails → the row finishes with exit null and `(could not
    start: …)`.
  - The server restarts mid-run → the row closes at start with `(server
    restarted)`, exit null, and shows as Interrupted.
  - An unexpected DB error in the handler → 500 through
    `jsonErrorHandler`.
- Verification command: `npm test -- --maxWorkers=2` (plus `npm run lint`,
  `npm run build`, `npm run test:e2e`).

## Risks / rollback

- `agent_runs` is a new table. Rolling back leaves it unused and harmless.
- The panel spawns a real `agent:run`, which costs model spend and sends
  the summary email. It's admin-only, and the lock plus the 409 prevent
  overlap. Start the first real run by hand from the phone, once merged.

---

**Next stage:** run `/sdlc`.
