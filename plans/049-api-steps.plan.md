---
brief: brief/049-api-steps.md
branch: 049-api-steps
date: 2026-11-26
---

# Run the model steps on the Claude API — Plan

Context: the pre-screen, evaluation and drafting steps run only as sandboxed
`claude -p`, so every CLI update stops them until the sandbox check passes
again. This stream adds a second engine. Under it each step is one Messages
API conversation whose only tool is `search_profile`, run in-process.
`docs/in-app-agent.md` §3–§6 is the contract. A config key `engine` picks
the engine, and the default `"cli"` leaves today's behaviour unchanged.

## Decisions on the brief's open questions

- **Caching: two breakpoints.** The render order is tools → system →
  messages, so `cache_control: {type: "ephemeral"}` on the system text block
  caches the tool definition and the system prompt together as one prefix,
  which every ad in the run shares. A top-level `cache_control:
  {type: "ephemeral"}` (automatic caching) also caches the growing
  conversation across one ad's tool rounds. That matters for drafting,
  whose user turn carries both CV templates and is re-sent every round. A
  prefix under the model's minimum just doesn't cache, with no error.
- **Refusals: no server-side fallback.** `stop_reason: "refusal"` is
  `bad_output`. A fallback would run the request on a model that
  `api.prices` doesn't price, so the per-run cap would run blind, which
  §6 forbids. It would also need the beta endpoint. A refusal on a job ad
  is rare, the ad is retried next run, and the third failed attempt moves
  it to `failed`, where the summary shows it. This is recorded in §4's
  failure table.

## Affected files

- `package.json`, `package-lock.json`: add `@anthropic-ai/sdk` (`npm install
  @anthropic-ai/sdk@1.14.0`, the latest on 2026-11-26; re-check with
  `npm view` at build time and use whatever is current).
- `agent/profile/lib/searchTool.ts` (new): `SEARCH_PROFILE_DESCRIPTION` and
  `searchRequestShape` (the zod raw shape: query, label, limit), moved out of
  `agent/profile/server.ts`. That way the MCP tool and the API tool can't
  drift apart, and `agent/runner` may import `agent/profile/lib/`.
- `agent/profile/server.ts`: imports both from `searchTool.ts`. No behaviour
  change.
- `agent/runner/lib/runnerConfig.ts`: `loadEngineConfig(path)` returns
  `{engine, api}`.
  - `engine` is `z.enum(['cli','api']).default('cli')`.
  - `api.models` and `api.effort` take §5's defaults. `effort` is
    `low|medium|high`.
  - `api.perRunUsd` is a positive number, default 3.
  - `api.prices` is a record of the model id to four non-negative numbers
    (`inputPerMTok`, `outputPerMTok`, `cacheWritePerMTok`,
    `cacheReadPerMTok`), default `{}`.
  - Under `"api"` only, a model named in `api.models` with no price throws
    `CliError(2, "<path>: api.prices.<model>: no price for a model api.models names")`.
  - An invalid value exits 2 through `parseConfigFile`, as every other key
    does.
- `agent/runner/lib/env.ts`: `loadApiKey(path)` reads the required
  `ANTHROPIC_API_KEY` through the existing `readEnvFile` (`util.parseEnv`,
  never `process.env`).
- `agent/runner/lib/apiBudget.ts` (new):
  - `responseCost(price, usage)`: `input_tokens`, `output_tokens`,
    `cache_creation_input_tokens` and `cache_read_input_tokens` (the last
    two count 0 when null), each times its price, divided by 1e6.
  - `interface StepBudget {canStart(): boolean; stopReason(): string | null}`.
  - `UNLIMITED: StepBudget`, which always starts and never stops.
  - `createRunBudget({perRunUsd, prices})` returns a `RunBudget extends
    StepBudget` with `charge(model, usage)` and `stop(reason)`.
    - `canStart()` is false once the budget is stopped or the spend has
      reached the cap.
    - `stopReason()` returns the stop reason, or `API run cap reached at
      $3.00` once the cap is reached.
  - 050 later adds the monthly ledger behind the same interface.
- `agent/runner/lib/apiStep.ts` (new): `createApiStep(options): RunStep`.
  - Options: `messages` (the narrow client below), `model`, `effort`,
    `prompt`, `systemPrompt`, `schema`, `timeoutMs`, `searchProfile:
    (request: SearchRequest) => Promise<SearchResult[]>` and `budget:
    RunBudget`.
  - Client type: `interface MessagesApi { create(body:
    Anthropic.MessageCreateParamsNonStreaming, options: {signal: AbortSignal}):
    Promise<Anthropic.Message> }`. It's narrow so the fake can satisfy it.
  - Request:
    - `max_tokens: 16000`, non-streaming.
    - `system: [{type: 'text', text, cache_control: {type: 'ephemeral'}}]`,
      plus top-level `cache_control`.
    - `thinking: {type: 'adaptive'}`.
    - `output_config: {effort, format: {type: 'json_schema', schema}}`.
    - `tools: [search_profile]`, whose `input_schema` comes from
      `z.toJSONSchema(z.object(searchRequestShape))` without `$schema`.
      `tool_choice` is left out, so it defaults to `auto`.
    - The user turn is `` `${prompt}\n\n${input}` ``.
  - Loop:
    - Each response is charged to the budget first.
    - On `stop_reason: 'tool_use'`, every `tool_use` block runs in
      parallel. Its input is parsed with zod. Invalid input, or a `CliError`
      from the search, becomes `{type: 'tool_result', is_error: true}`
      carrying the message. Any other error propagates. Success is
      `JSON.stringify(results, null, 2)`, the same text the MCP tool
      returns.
    - The assistant turn appends `response.content` unchanged, which
      preserves the thinking blocks. All the results go back in one user
      turn.
    - At most 8 tool rounds. A ninth `tool_use` response is `bad_output`.
    - Any other stop reason: `end_turn` with a text block that parses as
      JSON is `ok`. Everything else (`refusal`, `max_tokens`,
      `pause_turn`, no text, unparseable text) is `bad_output`.
  - Timeout: one `AbortSignal.timeout(timeoutMs)` spans the whole call and
    is passed to every `create`.
  - Error map:
    - `APIUserAbortError` / `APIConnectionTimeoutError` → `timeout`.
    - `AuthenticationError` → `budget.stop('Claude API: authentication
      failed')`, then `cli_failed`.
    - `PermissionDeniedError` → `budget.stop('Claude API: permission
      denied')`, then `cli_failed`.
    - Any other `APIError` (other 4xx, 5xx and connection errors, after the
      SDK's own 2 retries) → `cli_failed`.
    - Anything else is rethrown, because it's a bug.
- `agent/runner/lib/engine.ts` (new):
  - `type ModelStep = 'prescreen' | 'evaluation' | 'drafting'`.
  - `interface StepSpec {step, prompt, systemPrompt, schema, timeoutMs}`.
  - `interface Engine {kind: 'cli' | 'api'; budget: StepBudget; stepFor(spec): RunStep}`.
  - `createEngine(config, {env, envFile, searchProfile})`:
    - `"cli"`: `stepFor` wraps `runSandboxed` exactly as the commands do
      today (`claudeBin: 'claude'`, `env`), with `UNLIMITED` as the budget.
    - `"api"`: loads the key with `loadApiKey(envFile)`, builds `new
      Anthropic({apiKey})` and a `createRunBudget`. `stepFor` picks the
      step's model and effort from `config.api`.
  - It only constructs objects, with no network, so the commands can call
    it before taking the lock.
- `agent/runner/lib/mapLimit.ts`: an optional `canStart = () => true`. A
  worker stops taking items once it returns false. The result is only the
  items that started, in input order (`results.slice(0, next)`).
- `agent/runner/lib/prescreenRun.ts`, `evaluationRun.ts`, `draftRun.ts`:
  - Each options type gains an optional `canStart?: () => boolean`, passed
    to `mapLimit`.
  - `queued` becomes the total minus the ads that started. That equals
    today's number when every ad starts.
  - An ad that didn't start isn't touched, so it stays queued with no
    attempt counted.
- `agent/runner/lib/dailyRun.ts`:
  - `DailyRunOptions` gains `budget?: StepBudget` (default `UNLIMITED`).
    Its `canStart` is passed to the pre-screen, evaluation and drafting runs.
  - `gate` may resolve `null`, meaning no sandbox under `"api"`.
  - `DailyReport` gains `stopped: Problem | null`, set after the model
    steps from `budget.stopReason()` as `{step: 'model steps', message}`.
  - `sendSummary` adds it to `problems`, so the summary names it, and it
    doesn't fail the run. It's handled like a failed gate.
- `agent/runner/commands/run.ts`:
  - `loadSetup` adds `engine: createEngine(loadEngineConfig(path), …)`,
    with `searchProfile` built from `searchIndexFile(indexPath(env), {ollama,
    model})`.
  - `prescreenOptions` and `modelOptions` use `engine.stepFor(...)`.
  - `gate` is `async () => null` under `"api"`, and today's
    `ensureSandboxVerified` otherwise.
  - `budget: engine.budget` is passed to the daily run.
  - `printReport` prints `model steps stopped: <message>`.
- `agent/runner/commands/evaluate.ts`, `draft.ts`:
  - Each builds its engine the same way.
  - `requirePassedCheck` runs only when `engine.kind === 'cli'`.
  - Each passes `canStart: engine.budget.canStart`.
  - After the report, each prints `stopped: <reason>` when the budget has
    one.
- `agent/test/fakeAnthropic.ts` (new): a scripted `MessagesApi`. It holds a
  queue of responses or errors, records every request body, and has a hang
  mode that rejects with `APIUserAbortError` when its signal aborts. The
  errors are real SDK error instances. Check the constructors against the
  installed SDK.
- `agent/runner/prompts/evaluate.framing.md`, `prescreen.framing.md`, and the
  `*_PROMPT` constants in `evaluate.ts`, `prescreen.ts` and `draft.ts`:
  "on standard input" becomes engine-neutral wording ("The ad arrives as
  JSON…", "…the job ad given as JSON."). This is the repo's fixed framing,
  not the private rules. `sandboxProbes.ts` stays as it is.
- `CLAUDE.md`:
  - The dependency list adds `@anthropic-ai/sdk` <version>, for
    `agent/runner/` only.
  - The Ad evaluation commands line says the gate applies under `engine:
    "cli"`.
- `README.md`:
  - The "Ad evaluation" section gains an "Engine" subsection: the
    `engine` switch, `ANTHROPIC_API_KEY` in `~/.config/job-agent/env`,
    `api.models` / `api.effort` with their defaults, `api.prices` (copy the
    numbers from Anthropic's pricing page, since the repo carries none), and
    `api.perRunUsd`. It also says that under `"api"` the sandbox check
    isn't needed but Ollama still is.
  - "Daily run" names the stop lines.
- `docs/job-search-agent.md` §3: the env row gains `ANTHROPIC_API_KEY` (only
  under `engine: "api"`).
- `docs/in-app-agent.md`:
  - The 049 Streams row → `done`.
  - §4: the caching decision.
  - §4's failure table: a refusal without fallback (and why), `max_tokens`
    and `pause_turn` as `bad_output`, and 403's own stop message.

## Work order

1. Install the SDK. Update the CLAUDE.md dependency line.
2. Extract `searchTool.ts`. `server.ts` uses it, and the profile tests stay
   green.
3. Add `loadEngineConfig` and `loadApiKey`, with tests.
4. Add `apiBudget.ts`, with tests.
5. Add `canStart` to `mapLimit` and the three runs, with tests.
6. Add `fakeAnthropic.ts`, `apiStep.ts` and its tests.
7. Add `engine.ts`, with tests.
8. In `dailyRun.ts`, add `budget`, the nullable `gate` and `stopped`, with
   tests. Wire `run.ts`.
9. Wire `evaluate.ts` and `draft.ts`.
10. Reword the framing and the prompt constants.
11. Update the docs: README, `job-search-agent.md` §3, `in-app-agent.md` §4
    and the Streams row, and CLAUDE.md's Commands line.
12. Run `npm test -- --maxWorkers=2`, `npm run lint` and `npm run build`.

## Parallel streams

- `051-run-from-ui` has a brief but no branch or plan yet. It touches
  `server/`, `src/` and `agent/runner/commands/collect.ts` (the lock). This
  plan doesn't touch `collect.ts`, so no file or contract is shared, and the
  two streams run independently. 050 builds on `apiBudget.ts`'s
  `StepBudget` and `RunBudget`.

## Tests

- New `runnerConfig.test.ts` cases:
  - No `engine` → `cli`, with the §5 defaults.
  - `engine: "gpt"` → exit 2.
  - An `effort` outside `low|medium|high` → exit 2.
  - `"api"` with a model that has no price → exit 2, naming the model.
  - `"cli"` with no prices → ok.
- New `env.test.ts`: `loadApiKey` returns the key, and a missing key exits 2
  with `<path>: ANTHROPIC_API_KEY is not set`.
- New `apiBudget.test.ts`:
  - The cost of a usage with all four token kinds.
  - `canStart` turns false exactly at the cap, with the reason `API run cap
    reached at $3.00`.
  - `stop(reason)` wins.
  - `UNLIMITED` always starts.
- New `mapLimit.test.ts`: a `canStart` that turns false after two items
  returns two results and never calls fn for the rest.
- New run tests: with `canStart` false after the first ad, the evaluation,
  pre-screen and drafting runs move only the started ads, `queued` counts
  the rest, and no attempt is recorded for them.
- New `apiStep.test.ts` (fake client, no network):
  - Request shape: model, effort, adaptive thinking, the JSON schema
    without `$schema`, both cache breakpoints, exactly one tool, and no
    `tool_choice`.
  - A direct `end_turn` JSON → `ok`.
  - Two tool rounds, with the search called with parsed input. The result
    text matches the MCP tool's, and the assistant content, thinking
    included, is echoed unchanged.
  - An invalid tool input, and a `CliError` from the search, each →
    `is_error` result, and the loop continues.
  - A ninth tool round → `bad_output`.
  - `refusal`, `max_tokens`, no text block, and non-JSON text → `bad_output`.
  - A hang → `timeout`.
  - `APIConnectionTimeoutError` → `timeout`.
  - 401 → `cli_failed`, and the budget is stopped with `Claude API:
    authentication failed`.
  - 403 → the same, with `permission denied`.
  - 400, 500 and connection errors → `cli_failed`, and the budget isn't
    stopped.
  - A non-SDK error is rethrown.
  - Each response's usage is charged.
- New `engine.test.ts`:
  - `"api"` with no key → exit 2.
  - `"api"` `stepFor` uses the step's model and effort, checked through an
    injected fake.
  - `"cli"` has an `UNLIMITED` budget.
- New `dailyRun.test.ts` cases:
  - `gate` resolving `null` runs the model steps, with `sandbox: null`.
  - A budget that stops mid-evaluation: the rest of the evaluation and all
    of drafting start nothing, `report.stopped` is set, the summary is sent
    naming it, and `failures` stays empty.
- Updated: the three runs' and `mapLimit`'s existing tests stay untouched
  and must still pass, which proves the `"cli"` path is unchanged. This
  applies to the profile `server.test.ts` too.
- Failure cases (new boundaries):

  | Failure | Category or result | Effect |
  |---|---|---|
  | Bad `engine`, `effort`, `perRunUsd` or a price | exit 2, one stderr line | — |
  | Unpriced model under `"api"` | exit 2 | — |
  | Missing `ANTHROPIC_API_KEY` under `"api"` | exit 2 | — |
  | API 401 | `cli_failed` | stops the run's model steps |
  | API 403 | `cli_failed` | stops the run's model steps |
  | Other API error or connection error | `cli_failed` | an attempt is counted |
  | Timeout | `timeout` | an attempt is counted |
  | Refusal, truncation, no JSON, the 8-round cap | `bad_output` | an attempt is counted |
  | Schema mismatch | `invalid_result` (unchanged) | — |
  | Search failure inside a step | `is_error` tool result | the model sees it; the step goes on |
  | Cap reached | no new step starts | ads stay queued, and the summary names it |

- Verification command: `npm test -- --maxWorkers=2` (CLAUDE.md's gate),
  plus `npm run lint` and `npm run build`. Manual (optional, real spend,
  user's call): with `engine: "api"`, a key and prices set, `npm run
  agent:evaluate` against a small ready queue, then check
  `cache_read_input_tokens` on a second ad. The build session doesn't do
  this unasked.

## Risks / rollback

- Rollback is one config edit: `engine: "cli"`, or remove the key. Nothing
  is migrated and no state file is added.
- The cap can overshoot by up to the steps already in flight (concurrency
  is at most 8). That's accepted by §6.
- The SDK error constructors and the exact `output_config` / `cache_control`
  types are checked against the installed 1.x types at build time. If the
  top-level `cache_control` turns out not to combine with a block
  breakpoint, keep the system breakpoint alone and note it in §4.

---

**Next stage:** run `/sdlc`.
