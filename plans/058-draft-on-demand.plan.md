---
brief: brief/058-draft-on-demand.md
branch: 058-draft-on-demand
date: 2026-11-27
---

# Draft on demand, through `claude -p` — Plan

Context: 057 took drafting out of the daily run. Drafting now happens only
when the user clicks **Draft** on a kept (`suitable`) ad, as a third run
kind the server spawns, and always on the sandboxed `claude -p` engine (the
subscription, not API credits). The brief's open questions, decided with
the user:

- **Lock:** a draft takes `run.lock` like run/collect. If the scheduled
  daily run holds the lock, the draft run fails with `another run is in
  progress (pid N)`. A UI-started run already blocks it with 409.
- **Progress:** the run records its ad. While it runs, that ad's row shows
  `Drafting…` in place of its buttons, and the run panel shows the output.
- **Sandbox:** if the check hasn't passed for the installed `claude`, the
  draft re-runs the probes first, as `agent:run` does, and exits 1
  without touching the ad if they fail.

Brief item 2 (the email link lands one click from Draft) needs no code:
057's `#ad-<id>` already selects the ad's state and marks the row, and the
row will carry the Draft button.

## Affected files

Runner (`agent/`):
- `agent/runner/commands/draft.ts` — takes one ad id
  (`npm run agent:draft -- <id>`). The id must be a positive integer, or it
  exits 2 with `usage: npm run agent:draft -- <ad id>`. It always builds a
  CLI step via `cliStep` and ignores `engine`, with no budget or `canStart`.
  It takes `acquireRunLock` after loading config and before any network
  call, then the sandbox gate (`ensureSandboxVerified`, probes as in
  `run.ts`, printing `sandbox re-verified for claude X` when it ran), then
  `draftAd`. It releases the lock in `finally`.
- `agent/runner/lib/draftRun.ts` — `runDrafting` (the batch of oldest
  suitable ads) is replaced by `draftNamedAd(options, adId)`:
  1. Ollama health check. Down → `CliError(1, 'drafting skipped: <reason>')`.
  2. `getAd`. If its state isn't `suitable` → `CliError(1, 'ad <id> is
     <state>, not suitable')`.
  3. `draftOne`, unchanged: a failure is a same-state transition carrying
     the category, and the third attempt fails the ad.

  It returns `{ result, failure, applicationId }`. `formatDraftReport`
  prints `drafted: ad <id> as application <applicationId>`, or the
  `formatFailedAttempt` line plus `(retrying)`/`(failed)`. `mapLimit`,
  `perRunCap`, `queued` and `canStart` are removed from this file.
- `agent/runner/lib/engine.ts` — export `cliStep(env, spec): RunStep`
  (today's body of `cliEngine.stepFor`), which `cliEngine` then uses. Remove
  `'drafting'` from `ModelStep`.
- `agent/runner/lib/runnerConfig.ts` — `drafting` loses `concurrency` and
  `perRunCap`. `drafting` is also removed from the API `STEPS`,
  `DEFAULT_MODELS` and `DEFAULT_EFFORT`. The schemas aren't strict, so an
  old config with those keys still loads.
- `agent/runner/lib/lock.ts` — add `agent/runner/commands/draft.ts` to
  `RUN_SCRIPTS`, and update the comments.

Server:
- `server/types.ts`, `src/types.ts` — add `'draft'` to `AGENT_RUN_KINDS`.
  `AgentRun` gains `adId: number | null`. New
  `RunRequest = { kind: 'run' | 'collect' } | { kind: 'draft'; adId: number }`.
- `server/db/index.ts` — `agent_runs` in SCHEMA:
  `CHECK (kind IN ('run','collect','draft'))` and
  `ad_id INTEGER REFERENCES ads(id) ON DELETE SET NULL`.
- `server/lib/migrations.ts` — new `migrateAgentRunsDraft`: if `agent_runs`
  exists without `ad_id`, rebuild it in one transaction. The rebuild
  creates `agent_runs_new` with the new shape, copies the rows, drops the
  old table and renames the new one. SQLite can't alter a CHECK in place.
  It's called last in `migrate`.
- `server/models/agentRun.ts` — `ad_id` in the row and `adId` in the
  mapper.
- `server/lib/validation.ts` — `validateRunKind` becomes
  `validateRunRequest(body): RunRequest`. An unknown kind is 400 as today.
  For `draft`, `adId` must be a positive integer, or 400 `adId must be a
  positive integer`.
- `server/routes/agentRuns.ts` — `startHandler` validates, then checks
  `currentRun`: an open run is 409. For `draft`, it then calls
  `requireAd(db, adId, req.userId)` (404) from `server/lib/ads.ts`, and
  answers 409 `ad is not suitable` if the ad's state isn't `suitable`. The
  checks and the insert stay synchronous.
- `server/lib/agentRuns.ts` — `StartRun` takes `request: RunRequest`;
  `insertRun` stores `ad_id`, and the start/finish log lines add `adId`.
- `server/lib/agentRunner.ts` — `RunnerSpawner = (request: RunRequest) =>
  ChildProcess`. Add `draft: ['agent/runner/commands/draft.ts']` to
  `RUNNER_ARGS`, and append `String(request.adId)` to the args for `draft`.
  The comment becomes: no request value reaches argv except the validated
  integer ad id. `shell: false` stays.

Client:
- `src/lib/useAgentRuns.ts` (new) — the `useAgentRuns` hook, moved out of
  `AgentRunPanel.tsx`. It gains an `enabled` flag (no fetching or polling
  without agent access) and `start(request: RunRequest)`.
- `src/components/AgentRunPanel.tsx` — becomes presentational: props
  `runs` and `onStart(kind)`. Its rendering is otherwise unchanged.
- `src/components/AdsView.tsx` — calls `useAgentRuns({ enabled:
  canRunAgent, onUnauthorized, onRunFinished: refresh })`. It passes `runs`
  and `start` to the panel, and gives `AdList` a
  `draftStatus(ad): 'none' | 'ready' | 'busy' | 'running'`:
  - `none`: no agent access, or the ad isn't `suitable`.
  - `running`: the current run is a draft for this ad.
  - `busy`: any other run is current.
  - `ready`: otherwise.

  `actions.onDraft(id)` = `start({ kind: 'draft', adId: id })`.
- `src/components/AdList.tsx` — passes `draftStatus(ad)` to each `AdRow`.
- `src/components/AdRow.tsx` — `AdActions.onDraft`. The `draft` prop
  decides the Draft button: shown as `button-primary` before Dismiss when
  it isn't `none`, and disabled when `busy`. When `running`, the row shows
  `<p className="ad-drafting">Drafting…</p>` instead of `AdButtons`.
- `src/lib/adStates.ts` — `canDraft(state)` (`suitable` only), so 059 has
  one place to rename.
- `src/lib/agentRuns.ts` — `RUN_KIND_LABELS.draft = 'Draft'`.
- `src/lib/api.ts` — `startAgentRun(request: RunRequest)`.
- `src/ads.css` — `.ad-drafting`:
  muted text, using `index.css` tokens only.

Docs:
- `README.md` — "Ad drafting":
  - the command takes an ad id and always runs on `claude -p`, whatever
    `engine` is;
  - it takes `run.lock` and re-runs the sandbox check itself;
  - the Draft button;
  - the removed `perRunCap`/`concurrency`;
  - API spend no longer includes drafting.

  Also the "Engine" section's note that `agent:draft` shares the engine.
- `CLAUDE.md` — the `agent:draft` command line in Commands.
- `docs/architecture.md` — the `commands/draft.ts`, `agentRunner.ts` and
  `agent_runs` lines.
- `brief/052-retire-claude-p.md` — amend per the 058 brief's item 6.
  `claude -p`, the sandbox check, probes, canary, version record and
  `fakeClaude.ts` stay for drafting. Only the pre-screen and evaluation
  lose their `claude -p` path, and the `engine` key keeps choosing only
  those two. Items 1, 2, 5 and 6 are reworded to match.

## Work order

1. Server types and storage: types (both copies), SCHEMA, the migration,
   the model and `validateRunRequest`, with their tests.
2. Server start path: `agentRunner.ts`, `agentRuns.ts` and the
   `agentRuns.ts` route, with their tests.
3. Runner: `engine.ts` `cliStep`, `runnerConfig.ts`, `lock.ts`,
   `draftRun.ts` `draftNamedAd` and the `draft.ts` command, with their
   tests.
4. Client: `useAgentRuns`, `AgentRunPanel`, `AdsView`/`AdList`/`AdRow`,
   `adStates`, labels, `api.ts` and CSS, with their tests.
5. Docs: README, CLAUDE.md, `docs/architecture.md` and the 052 brief
   amendment.

## Parallel streams

- `056-runs-paging` (brief only) reshapes `AgentRunPanel`'s recent list.
  This plan moves the panel's state into `src/lib/useAgentRuns.ts` and
  makes the panel presentational. **Sequence:** 058 merges first, then 056
  plans against the new panel.
- `059-ad-states-plain` (brief only) may rename `suitable`. This plan
  gates Draft through `canDraft` in `src/lib/adStates.ts` and the server's
  `suitable` check. **Sequence:** 059 plans after 058 and owns any rename
  of both.

## Tests

- New:
  - `server/lib/migrations.test.ts`:
    `migrateAgentRunsDraft` keeps the old rows (kind, output, exit code,
    `adId` null), accepts `draft` afterwards, and is a no-op on a second
    open.
  - `server/routes/agentRuns.test.ts`:
    - a draft POST for a suitable ad is 201 with `adId`, and the recording
      runner receives `{ kind: 'draft', adId }`;
    - the GET shows `adId`.
  - `server/lib/agentRunner.test.ts`: the draft args are `[draft.ts, '<id>']`
    with `shell: false`.
  - `agent/runner/lib/draftRun.test.ts`: `draftNamedAd` drafts, or records
    the attempt (retrying, then failed on the third). It throws on a
    non-suitable ad and when Ollama is down, touching no ad in either case.
  - `agent/runner/commands/draft.test.ts` (fakeClaude, fakeJobApp):
    - the id is drafted, exit 0;
    - with `engine: "api"` in config it still uses fakeClaude and needs no
      API key;
    - with no check record the probes run and `sandbox re-verified` is
      printed;
    - with a held live lock it exits 1 `another run is in progress`.
  - `src/components/AdRow.test.tsx`:
    - Draft is shown for `ready`, disabled for `busy`, absent for `none`;
    - `running` shows `Drafting…` and no buttons;
    - a click calls `onDraft(id)`.
  - `src/components/AdsView.test.tsx`:
    - clicking Draft POSTs `{kind:'draft', adId}`;
    - while that run is current the row shows `Drafting…`, and other
      suitable rows' Draft buttons are disabled;
    - without agent access there's no Draft button and no runs request.
- Updated:
  - `AgentRunPanel.test.tsx`: renders from props, and `onStart` is called
    with `'run'`/`'collect'`.
  - `agentRuns.test.ts`: the existing kind cases.
  - `engine.test.ts` and `runnerConfig.test.ts`: `drafting` gone from the
    API steps.
  - `lock.test.ts`: a draft holder counts as live.
- Failure cases:
  - POST `{kind:'draft'}` with a missing, non-integer or `0` adId → 400
    `adId must be a positive integer`.
  - Another user's ad, or an unknown ad → 404 `not found`.
  - An ad not `suitable` → 409 `ad is not suitable`.
  - A run already open → 409 `a run is already in progress`.
  - `agent:draft` with no or a bad id → exit 2, one stderr line.
  - Ollama down → exit 1 `drafting skipped: …`, no attempt counted.
  - The ad not suitable by the time the runner reads it → exit 1.
  - Lock held by a live run → exit 1.
  - Probes fail → exit 1 `sandbox check failed for claude X: …`, ad
    untouched.
  - A failed step → exit 1 with the attempt line, and the ad records the
    attempt.
  - The draft upload refused (e.g. 409 if drafted meanwhile) → exit 1, as
    today.
  - In every exit-1 case the run panel shows **Failed** with the output.
- Verification: `npm run build`, `npm run lint` and
  `npm test -- --maxWorkers=2` (all passed, no `failed` line).

## Risks / rollback

- The `agent_runs` rebuild doesn't undo itself, but rolling back needs no
  database change. An older build's `run`/`collect` inserts still pass the
  new CHECK, and `ad_id` is nullable. Old `draft` rows would only show with
  an unknown label.
- The runner logs in as the seed user. A Draft clicked by a different
  agent-access user on their own ad passes the server's check, but the
  runner's `getAd` gets a 404 and the run fails visibly. This is
  acceptable at personal scale, and noted in the README.

---

**Next stage:** run `/sdlc`.
