---
slug: 049-api-steps
date: 2026-11-25
---

# Run the model steps on the Claude API

## Problem

The pre-screen, evaluation and drafting steps run only as sandboxed
`claude -p` processes, so every CLI update stops them until the sandbox
check passes again. With an API key available, the steps can call the
Messages API directly. That removes the need for the sandbox, since the
call can use only the one tool the runner executes for it.

## What done looks like

1. A config key `engine: "cli" | "api"`, default `"cli"`, read by
   `agent:run`, `agent:evaluate` and `agent:draft`. An invalid value exits 2
   with one stderr line. Under `"cli"`, behaviour is unchanged and the
   existing tests pass untouched.
2. Under `"api"`, each step's `RunStep` is an API step built on
   `@anthropic-ai/sdk`, matching `docs/in-app-agent.md` §4: a cached system
   prompt, the ad as JSON in the user turn, output forced through
   `output_config.format` with the step's `stepSchema`, and one client tool,
   `search_profile`, run in-process with `searchIndexFile`.
3. API failures map onto `FailureCategory` as the §4 table says. An
   authentication or permission error stops the run's model steps, and the
   summary names it as a problem.
4. Per-step models and effort under `api.models` / `api.effort`, with the
   §5 defaults and adaptive thinking.
5. `ANTHROPIC_API_KEY` is read from `~/.config/job-agent/env` with
   `util.parseEnv`, never from `process.env`, and is required only under
   `"api"`.
6. The per-run cap `api.perRunUsd` (default 3) is enforced from each
   response's `usage` × `api.prices`, and a model named without a price
   exits 2. Once the cap is reached, no new model step starts and the rest
   stay queued.
7. Under `"api"`, `agent:run` skips the sandbox gate and `agent:evaluate`
   and `agent:draft` don't require a recorded check. The Ollama health check
   still runs.
8. Unit tests cover the API step against a fake SDK client (no network):
   tool rounds, the failure mapping, the cap and config validation.
9. CLAUDE.md's dependency list names `@anthropic-ai/sdk` at its exact
   version, for `agent/runner/` only. The README "Ad evaluation" section
   documents the engine switch, the key, models, prices and the cap.
   `docs/job-search-agent.md` §3's env row gains `ANTHROPIC_API_KEY`.
10. This stream's row in `docs/in-app-agent.md` "Streams" is updated.

## Approach

`docs/in-app-agent.md` §3–§6 is the contract. A new `agent/runner/lib/`
module returns a `RunStep` for a step's schema, system prompt, model and
effort. The commands pick it or the sandbox one from `engine`, so the step
code and `SandboxResult` don't change. A shared spend counter for the run
gates new steps, and 050 later backs it with the monthly ledger. The SDK
client is passed in, so tests use a fake.

## Out of scope

- The monthly cap, the ledger and the cost lines in the summary: 050.
- Starting runs from the UI: 051.
- Removing `claude -p`, the sandbox gate or the `engine` key, and renaming
  `cli_failed`: 052.
- Prompt contents.

## Related streams

Order in `docs/in-app-agent.md` §8: first, alongside 051. Needs: nothing.
050 needs this stream. 052 needs 049, 050 and 051.

## Open questions

- Whether the system prompt and the tool definitions share one cache
  breakpoint or take two. The plan decides against the SDK's caching rules.

---

**Next stage:** run `/sdlc`.
