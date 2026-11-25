# In-app agent: Claude API steps and runs started from the UI

What streams 049–052 agree on. A stream that needs to change anything here
changes this file in the same PR. The goals are in
[brief 048](../brief/048-in-app-agent-spec.md). This file extends
[`job-search-agent.md`](job-search-agent.md) and doesn't restate it: the
pipeline (§1), permissions (§2), private configuration (§3) and daily run
(§9) there still hold unless a section below says otherwise.

```text
 Windows Task Scheduler            job-app UI (admin, LAN, phone)
        │ wsl.exe                         │ POST /api/agent/runs {kind}
        ▼                                 ▼
 daily-run.sh                       server/ spawns the runner by path
        │                                 │ (argv fixed by kind, own env)
        └───────────────┬─────────────────┘
                        ▼
        agent/runner  run.ts | collect.ts  ── run.lock: one at a time
                        │
                        ├─ collect, screen, fetch   (unchanged, no model)
                        └─ pre-screen, evaluate, draft
                                   │ RunStep, chosen by config `engine`
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
            "cli": sandboxed `claude -p`   "api": Messages API call
            (§2 of job-search-agent.md,    one tool: search_profile,
             until 052)                    run in-process
```

## Streams

| Stream | Brief | State | Needs |
|---|---|---|---|
| `048-in-app-agent-spec` | committed | in progress | — |
| `049-api-steps` | committed | open | — |
| `050-spend-caps` | committed | open | 049 |
| `051-run-from-ui` | committed | open | — |
| `052-retire-claude-p` | committed | open | 049, 050, 051 |

The rules for picking the next stream are the ones in
[`job-search-agent.md` "Picking the next stream"](job-search-agent.md#picking-the-next-stream),
applied to this table. 049 and 051 don't depend on each other and can run
as parallel worktrees. 052 also waits for the condition in
[Cut-over order](#8-cut-over-order), which the table can't express.

## 1. Where a run executes

The API doesn't run the agent itself; it **spawns the existing runner** as a
child process.

- `agent/` still never imports `server/`, keeps its secrets in
  `~/.config/job-agent/env`, and talks to job-app over HTTP.
- The new coupling is one-way and by path only: `server/` spawns a file in
  `agent/` and imports nothing from it.
- The permissions table in `job-search-agent.md` §2 is unchanged. The server
  gains no mail, job-app-agent or Anthropic secret. The runner reads those
  secrets from its own env file, as it does today.

**Spawn rules** (owned by 051):

| `kind` | argv |
|---|---|
| `run` | `node agent/runner/commands/run.ts` |
| `collect` | `node agent/runner/commands/collect.ts` |

- `process.execPath` is the `node`, and the argv for each kind is a constant
  in `server/`. No client value reaches argv or env; the body's `kind` only
  picks a row.
- cwd is the repository root, resolved from the server's own file location
  rather than `process.cwd()`.
- env is an allowlist: `PATH`, `HOME`, `LANG`, `LC_ALL`, `TZ` and the three
  `XDG_*_HOME` variables when set. Nothing from the server's `.env` is
  passed (`DB_PATH`, `UPLOADS_DIR`, `SESSION_SECRET` and the rest), and
  neither is `ANTHROPIC_API_KEY`.
- `NODE_EXTRA_CA_CERTS` passes through when the server has it set, because
  the runner reaches job-app over the same TLS.
- No shell is involved: `spawn` with an argv array, `shell: false`.

**Overlap.** `run.lock` (`job-search-agent.md` §3) allows one runner at a
time. 051 makes `collect.ts` take the same lock that `run.ts` takes, so a UI
"Check mail" can't overlap a scheduled run either. A child the lock refuses
exits 1 with its one-line message, and the UI shows that message as the
run's output. The server also refuses a second start while its own
`agent_runs` row is still running (`409`), which saves a spawn but isn't
what guarantees no overlap. The lock guarantees it, because the scheduled
run never touches `agent_runs`.

## 2. Scheduling

Task Scheduler and `daily-run.sh` stay as they are (`job-search-agent.md`
§9). An in-app timer was rejected because the server isn't always running:
`daily-run.sh` starts it when needed, and WSL may stop the distro once the
task's `wsl.exe` exits, so an in-app timer would miss days.

A UI start and the scheduled run run the same command. A UI start needs the
PC on and job-app up, which is the existing LAN-reach assumption. Off-LAN
access is out of scope.

## 3. The engine switch

A new top-level config key, owned by 049, read by `agent:run`,
`agent:evaluate` and `agent:draft`:

```json
{ "engine": "cli" }
```

`"cli"` (the default) or `"api"`. Any other value exits 2 with one stderr
line.

- Under `"cli"`, nothing changes: the steps run through
  `agent/runner/lib/sandbox.ts`, and the sandbox gate and its version check
  apply as in `job-search-agent.md` §2.
- Under `"api"`, each step's `RunStep` (`agent/runner/lib/evaluate.ts`,
  `(input: string) => Promise<SandboxResult>`) is the API step in §4. The
  step code (`evaluateAd`, `prescreenAd`, `writeDraft`) and the `SandboxResult`
  shape don't change, so the runs, caps and summary see no difference.
- Under `"api"`, `agent:evaluate` and `agent:draft` don't require a recorded
  sandbox check, and `agent:run` neither runs nor re-runs the probes. The
  Ollama health check still runs, because the `search_profile` tool needs
  it.

`claude -p` keeps working, and stays the default, until 052 removes it.

## 4. The API step

049 adds `@anthropic-ai/sdk`, approved by the user 2026-11-25 for
`agent/runner/` only, to CLAUDE.md's dependency list at an exact version.

Each step call is one Messages conversation:

- **System prompt:** today's framing file plus the private rules
  (`prompts/<step>.md`), the same text `--system-prompt` gets today. It
  carries `cache_control: {type: "ephemeral"}`, so a run's later ads read it
  from the cache.
- **User turn:** the ad as JSON (`adInput`, `draftInput`,
  `prescreenInput`), under the same framing that tells the model it's untrusted
  data.
- **Output:** forced through `output_config.format` (JSON schema) using the
  step's existing `stepSchema`, without the `$schema` key. The runner checks
  it against the zod schema again before acting on it, as today.
- **Tools:** exactly one client tool, `search_profile`, with the same input
  schema the MCP tool has. The runner runs it in-process with
  `searchIndexFile` from `agent/profile/lib/` against the local index and
  the configured Ollama. It doesn't start an MCP server and offers no other
  tools: no server tools, no web, no code execution.
- **Loop:** the runner answers `tool_use` turns until the model stops, with
  a cap of 8 tool rounds (a run past the cap is `bad_output`). The whole
  call is bounded by the step's existing `timeoutMs`.
- **Model and thinking:** per §5.

No sandbox is needed, because the call can do only what the runner
executes for it, and the runner executes only `searchIndexFile`.
`job-search-agent.md` §2's "every `claude -p` step must" list applies to the
`"cli"` engine only.

**Failure mapping** onto the existing `FailureCategory`
(`agent/runner/lib/sandbox.ts`):

| API outcome | Category |
|---|---|
| `timeoutMs` reached, or the SDK's timeout error | `timeout` |
| `stop_reason: "refusal"`, no JSON text, the tool-round cap reached | `bad_output` |
| JSON that fails the zod check | `invalid_result` (unchanged, from the step code) |
| Authentication error (401), permission error (403) | `cli_failed`, and the run stops its model steps |
| Any other 4xx, or a 5xx/overloaded after the SDK's retries | `cli_failed` |

`cli_failed` keeps its name until 052, which renames it `step_failed` with
the `"cli"` engine gone. When an authentication or permission error stops
the run, it's handled like today's failed sandbox gate: the remaining ads
stay queued and the summary names the problem (`Claude API: authentication
failed`).

## 5. Models

One model per step, set in config (owned by 049), with these defaults:

```json
{
  "api": {
    "models": {
      "prescreen": "claude-haiku-5-5",
      "evaluation": "claude-sonnet-5-5",
      "drafting": "claude-opus-5-5"
    },
    "effort": { "prescreen": "low", "evaluation": "medium", "drafting": "high" }
  }
}
```

Thinking is adaptive, with the step's effort. `effort` is `low`, `medium`
or `high`. A model id isn't checked against a list: an unknown one fails at
the API as a 4xx and counts as `cli_failed`.

## 6. Key and spend

**The key.** `ANTHROPIC_API_KEY` goes in `~/.config/job-agent/env`, beside
the existing keys (`job-search-agent.md` §3's table gains this row in 049).
The runner reads it with `util.parseEnv`, as it reads the others, never
from `process.env`, so `sandboxEnv`'s exclusion of it under `"cli"` still
holds. It's required only under `engine: "api"`. Missing then, it exits 2
with one stderr line.

**Spend** is controlled in three layers.

1. **Per run (049).** `api.perRunUsd`, default `3`. The runner adds up each
   response's `usage` (input, output, cache-write and cache-read tokens)
   times the per-model prices in config. Once the total reaches the cap, it
   starts no new model step. Steps already in flight finish, and the rest
   of the ads stay queued for the next run. The summary names the cap as a
   problem (`API run cap reached at $3.00`).

   ```json
   {
     "api": {
       "perRunUsd": 3,
       "prices": {
         "<model id>": { "inputPerMTok": 0, "outputPerMTok": 0, "cacheWritePerMTok": 0, "cacheReadPerMTok": 0 }
       }
     }
   }
   ```

   `prices` needs an entry for every model `api.models` names. A missing
   one exits 2, so the cap can never run blind. The user copies the numbers
   from Anthropic's pricing page. The repo carries no prices.

2. **Per month (050).** `api.monthlyUsd`, default `30`. The ledger is a new
   state file, `~/.local/state/job-agent/api-spend.json`, written through a
   temp file and a rename like the others:

   ```json
   { "months": { "2026-12": 4.12 } }
   ```

   The key is the local month (`YYYY-MM`). The runner adds each response's
   cost as it arrives, so a crash loses at most one response. Months before
   the previous one are dropped on write. A run checks the month before its
   first model step and before each new one. At or over the cap, the
   remaining model steps are skipped like a failed gate, and the summary
   names it (`API monthly cap reached: $30.00 of $30.00`).

   The summary email gains one line, `Claude API: $<run> this run, $<month>
   this month of $<cap>`. The run panel (§7) shows the same figures, read
   from a new last line the runner prints (`api: $<run> run, $<month>
   month`).

3. **Backstop.** A spend limit set in the Anthropic Console, above
   `monthlyUsd`. This is documented in the README only, with no code.

## 7. Runs from the UI

Owned by 051. The panel is admin-only, because a run uses the runner's
credentials and its spend.

**"Run now"** starts `kind: "run"`, the full `agent:run`, including the
summary email. **"Check mail"** starts `kind: "collect"`, `agent:collect`,
which has no model cost. Mail collection is otherwise unchanged.

**Table `agent_runs`** (a migration in `server/db/`, not scoped by
`user_id`, since runs belong to the install):

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | |
| `kind` | TEXT NOT NULL | `run` or `collect` (CHECK) |
| `started_by` | INTEGER NOT NULL | the admin's user id |
| `started_at` | TEXT NOT NULL | UTC ISO timestamp |
| `finished_at` | TEXT | NULL while running |
| `exit_code` | INTEGER | NULL while running; the child's code, or NULL with `finished_at` set if it was killed |
| `output` | TEXT NOT NULL DEFAULT '' | stdout and stderr lines, appended as they arrive, capped at 64 KiB (the tail kept) |

At server start, any row with `finished_at` NULL is closed with
`finished_at` = now and `output` ending in `(server restarted)`, because
its child died with the old process.

**Endpoints**, mounted behind `requireAdmin` at `/api/agent`:

- `POST /api/agent/runs` with `{"kind": "run" | "collect"}` returns `201`
  and the new run. An unknown kind is `400`. A run already in progress is
  `409` (`a run is already in progress`).
- `GET /api/agent/runs` returns `{current, recent}`. `current` is the
  running row or `null`. `recent` is the last 10 finished rows, newest
  first. Each row is `{id, kind, startedAt, finishedAt, exitCode, output}`.

Errors follow CLAUDE.md's contract (`HttpError`, `jsonErrorHandler`). The
server logs `agent run started` and `agent run finished` (`runId`, `kind`,
`exitCode`, `durationMs`) through its logger, never the output lines.

**The run panel** sits at the top of the ad inbox, styled in `ads.css`,
with Run now, Check mail, the current run's status and output, and the last
runs. While a run is current, the buttons are disabled and the panel polls
`GET /api/agent/runs` every 3 s. Otherwise it reads once on load. Because
the state lives in the table, reloading on a phone still shows progress. A
finished run refreshes the inbox list. The panel must work at phone width
(360 px), and 051 checks the inbox and the draft flow (047's questions and
Markdown editing) at that width too, fixing the layout gaps it finds in
scope.

## 8. Cut-over order

1. **049** and **051**, in either order or in parallel. After 049, the user
   sets `engine: "api"` and the key, and runs the daily run on the API.
   `"cli"` remains one config edit away.
2. **050**, after 049. Its cost line joins the run panel if 051 has
   landed, or in 051's own PR if 050 lands first.
3. **052**, only after 049–051 are done **and** the API engine has carried
   the daily run for two weeks without falling back to `"cli"`. 052 removes
   the `"cli"` engine and the `engine` key, the sandbox gate, the probes and
   canary, the `search_profile` MCP wiring for steps, `fakeClaude.ts`, and
   the README and spec sections that describe them. It renames
   `cli_failed` to `step_failed`. The `search_profile` stdio server
   (`npm run profile:mcp`) stays, because Claude Desktop uses it.

Until 052, `claude -p` is a working fallback at every step of this order.

## 9. Out of scope

- Off-LAN access: the app's LAN reach is enough.
- Prompt contents and evaluation criteria.
- The Batch API: a UI run wants results now, and the volumes are tiny.
- Managed Agents: these are code-driven single steps with a fixed schema,
  not open-ended agents.
