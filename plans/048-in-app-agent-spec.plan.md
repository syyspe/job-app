---
brief: brief/048-in-app-agent-spec.md
branch: 048-in-app-agent-spec
date: 2026-11-25
---

# Spec the in-app agent and brief its implementation streams — Plan

Docs only: one spec and four briefs. No code, and the current agent is left
unchanged.

## Context

The model steps (pre-screen, evaluate, draft) run as sandboxed `claude -p`
processes. A run happens only when the scheduled task fires or the user
starts one by hand, and every CLI update means re-running the sandbox check.
With an API key in hand, the steps can call the Claude API and a run can be
started from the app, from a phone on the LAN. This stream settles the design
in `docs/in-app-agent.md` and cuts the build into briefs 049–052, the same
way `docs/job-search-agent.md` did for 033.

## Decisions the spec records (settled with the user 2026-11-25)

1. **Where it runs: the API spawns the existing runner.** A UI start makes
   the API spawn `node agent/runner/commands/run.ts` (or `collect.ts`) as a
   child process with its own environment. `agent/` still never imports
   `server/`, keeps its secrets in `~/.config/job-agent/env`, and talks to
   job-app over HTTP. The §2 permissions table in `docs/job-search-agent.md`
   is unchanged: the server gains no mail, job-app-agent or Anthropic secret.
   The new coupling is one-way and by path only: `server/` spawns a file in
   `agent/` and imports nothing from it. `run.lock` already stops a UI run
   from overlapping a scheduled one. A child refused by the lock exits 1 with
   its message, and the UI shows that message.
2. **Scheduling: Task Scheduler stays.** The server isn't always running
   (`daily-run.sh` starts it when needed, and WSL may stop the distro), so an
   in-app timer would miss runs. The scheduled run and UI runs are the same
   command. A UI start needs the PC on and job-app up, which is the existing
   LAN-reach assumption.
3. **The engine is a config switch.** A new key, `engine: "cli" | "api"`,
   defaults to `"cli"`. Under `"api"`, the steps use a new `RunStep`
   (`agent/runner/lib/evaluate.ts:27`) built on the Messages API. The step
   code and the `SandboxResult` shape stay the same, and `claude -p` keeps
   working until 052.
4. **The API step.** It uses the official `@anthropic-ai/sdk`, approved by
   the user 2026-11-25 for `agent/runner/` only. 049 adds it to CLAUDE.md's
   dependency list. Each step is one Messages conversation:
   - the system prompt is today's framing plus the private rules, with
     prompt caching on it;
   - the ad goes in as JSON in the user turn, still as untrusted data;
   - the output is forced through `output_config.format` with the step's
     existing zod schema (`stepSchema`) and validated again as today;
   - the only tool is a client tool, `search_profile`, executed in-process
     with `searchIndexFile` from `agent/profile/lib/`. No MCP server is
     involved, and no other tools are offered.

   Under `"api"`, the sandbox check and its version gate don't apply,
   because the API call has only the tools we define. They still apply under
   `"cli"`. API failures map onto the existing categories:
   - timeout → `timeout`;
   - a refusal or invalid structured output → `bad_output` /
     `invalid_result`;
   - auth errors, 4xx and 5xx after the SDK's retries → `cli_failed`, renamed
     `step_failed` only in 052.

   An authentication error stops the model steps for the run and becomes a
   summary problem, like today's failed sandbox gate.
5. **Models: one per step, set in config.** The defaults are pre-screen
   `claude-haiku-5-5`, evaluation `claude-sonnet-5-5` and drafting
   `claude-opus-5-5`. Adaptive thinking is on, with effort `low` for the
   pre-screen, `medium` for evaluation and `high` for drafting.
6. **Key and spend.** `ANTHROPIC_API_KEY` goes in `~/.config/job-agent/env`.
   The runner reads it with `util.parseEnv`, like the other keys, never from
   `process.env`, so `sandboxEnv`'s exclusion still holds. Spend is
   controlled in three layers:
   - **Per run** (049): `api.perRunUsd` (default 3). The runner adds up each
     response's `usage` × the per-model prices in config. Once a run reaches
     the cap, it starts no new model step, and the remaining ads stay queued.
   - **Per month** (050): `api.monthlyUsd` (default 30). The ledger is a
     state file, `api-spend.json`, keyed by local month. Once a month reaches
     the cap, the model steps are skipped like a failed gate. The summary
     email and the run panel show the run's cost and the month to date.
   - **Backstop:** a spend limit set in the Anthropic Console. It's
     documented only.
7. **What the UI can start.** "Run now" starts the full `agent:run`,
   including the summary email. "Check mail" starts `agent:collect`, which
   has no model cost. Both are admin-only (`requireAdmin`). Each start is a
   row in a new `agent_runs` table (kind, startedAt, finishedAt, exitCode,
   output lines). The UI polls `GET` for the current run and the last few
   runs, so reloading on a phone still shows progress. Mail collection is
   otherwise unchanged.
8. **Out, as in the brief:** off-LAN access, prompt contents, the Batch API
   (a UI run wants results now), Managed Agents (these are code-driven
   single steps, not open-ended agents).

## Affected files

- `docs/in-app-agent.md`: new. The spec, with this shape:
  - an overview diagram: UI or Task Scheduler → runner → engine (cli | api);
  - one section per decision above, each with its contract: the config keys
    and their defaults, the env key, the failure mapping, the spend ledger
    format, the `agent_runs` columns and endpoints
    (`POST /api/agent/runs {kind}`, `GET /api/agent/runs`), the
    process-spawn rules (argv fixed by `kind`, no client value reaches argv
    or env, cwd = repo root);
  - a Streams table in the `docs/job-search-agent.md` format, with the
    "Picking the next stream" rules referenced, not copied;
  - the cut-over order.
- `brief/049-api-steps.md`: new. The `"api"` engine, the SDK dependency, the
  per-run cap, the README "Ad evaluation" setup lines. Needs: nothing.
- `brief/050-spend-caps.md`: new. The monthly ledger and cap, and the cost
  lines in the summary. Needs: 049.
- `brief/051-run-from-ui.md`: new. The spawn, the `agent_runs` migration and
  router, and a run panel at the top of the ad inbox (`ads.css`). The panel
  has Run now, Check mail, live status and the last runs, and it must work at
  phone width. 051 also checks the inbox and the draft flow (047's questions
  and editing) at phone width and fixes layout gaps in scope. Needs:
  nothing; it works with either engine. The cost display waits for 050.
- `brief/052-retire-claude-p.md`: new. Removes the `"cli"` engine, the
  sandbox gate, probes and canary, the `search_profile` MCP wiring for steps
  and `fakeClaude.ts`, then the README and spec sections. Starts only after
  049–051 are done and the API engine has run daily for two weeks. Needs:
  049, 050, 051.

All four briefs follow `brief/TEMPLATE.md`, each with a Related streams line
naming its order and Needs. No change to `docs/job-search-agent.md` beyond
one line in §1 pointing to `docs/in-app-agent.md`.

## Work order

1. Write `docs/in-app-agent.md` from the decisions above. Re-read
   `docs/job-search-agent.md` §1, §2, §3 and §9 so the new contracts
   reference the existing ones rather than restating them.
2. Write briefs 049–052. Each one's "What done looks like" is checkable, and
   its Out of scope names the sibling stream that owns the excluded part.
3. Add the pointer line to `docs/job-search-agent.md` §1.
4. Check consistency: the config keys, endpoint paths and stream numbers
   match across the spec and the briefs. `grep -n 'claude -p'` in the new
   files shows the fallback is kept until 052.
5. Commit on `048-in-app-agent-spec` with the noreply author and committer.

## Parallel streams

None in flight: the overlap check found no unmerged branch with a plan. 049
and 051 have no dependency on each other and can run as parallel worktrees.

## Tests

- No code, so no new tests.
- Verification command: none is needed for a docs-only change. Run
  `npm run lint` only if a file outside `docs/` and `brief/` gets touched,
  which shouldn't happen.

---

**Next stage:** run `/sdlc`.
