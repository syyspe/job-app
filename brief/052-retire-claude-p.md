---
slug: 052-retire-claude-p
date: 2026-11-25
---

# Retire the `claude -p` engine

## Problem

Once the API engine has proven itself, the `"cli"` engine is dead weight:
the sandbox gate, its probes and canary, the per-step MCP wiring and the
CLI-version dance exist only to make `claude -p` safe. Keeping both engines
doubles every step change.

## What done looks like

1. The `"cli"` engine, the `engine` config key, `agent:sandbox-check` and
   its npm script, the sandbox probes and canary, the version record and
   gate, the `search_profile` MCP wiring for steps, and `fakeClaude.ts` are
   removed, with their tests.
2. `agent:run` no longer re-runs probes after a CLI update.
   `agent:evaluate` and `agent:draft` no longer check a recorded version.
3. (Done by 054: `cli_failed` was renamed `model_failed`. Stored
   `cli_failed` values display as they are, with no migration.)
4. The `search_profile` stdio server (`npm run profile:mcp`) stays, because
   Claude Desktop uses it.
5. The README, CLAUDE.md's command list, `docs/job-search-agent.md` §1, §2
   and §9, and `docs/in-app-agent.md` §3 and §8 describe only the API
   engine. This stream's row in `docs/in-app-agent.md` "Streams" is marked
   done.
6. `npm test` and `npm run test:e2e` pass. A `grep -rn 'claude -p'` outside
   `brief/`, `plans/` and history sections finds nothing.

## Approach

Delete, then follow the type errors. The step code already runs through
`RunStep`, so removing the sandbox implementation leaves the steps
untouched.

## Out of scope

- Any change to the API step's behaviour, caps or models: 049 and 050.
- The run panel: 051.

## Related streams

Order in `docs/in-app-agent.md` §8: last. Needs: 049, 050, 051, **and** two
weeks of daily runs on `engine: "api"` without falling back to `"cli"`.
Don't start it before both hold.

## Open questions

None.

---

**Next stage:** run `/sdlc`.
