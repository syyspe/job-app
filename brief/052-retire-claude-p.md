---
slug: 052-retire-claude-p
date: 2026-11-25
---

# Retire the `claude -p` engine

> Amended by 058 (draft on demand): drafting always runs on `claude -p`, so
> `claude -p` and its sandbox gate stay for drafting. Only the pre-screen and
> evaluation lose their `claude -p` path.

## Problem

Once the API engine has proven itself, the `"cli"` engine is dead weight:
the sandbox gate, its probes and canary, the per-step MCP wiring and the
CLI-version dance exist only to make `claude -p` safe. Keeping both engines
doubles every step change.

## What done looks like

1. The pre-screen and evaluation lose their `claude -p` path: the `"cli"`
   choice of the `engine` key is removed, and the key keeps choosing only
   those two steps' engine. `claude -p`, `agent:sandbox-check` and its npm
   script, the sandbox probes and canary, the version record, the
   `search_profile` MCP wiring for steps and `fakeClaude.ts` stay, because
   `agent:draft` runs on them.
2. `agent:run` no longer re-runs probes after a CLI update, and
   `agent:evaluate` no longer checks a recorded version. `agent:draft` keeps
   re-running the probes itself after a `claude` update.
3. (Done by 054: `cli_failed` was renamed `model_failed`. Stored
   `cli_failed` values display as they are, with no migration.)
4. The `search_profile` stdio server (`npm run profile:mcp`) stays, because
   Claude Desktop uses it.
5. The README, CLAUDE.md's command list, `docs/job-search-agent.md` §1, §2
   and §9, and `docs/in-app-agent.md` §3 and §8 describe the API engine for
   the pre-screen and evaluation, and `claude -p` for drafting only. This
   stream's row in `docs/in-app-agent.md` "Streams" is marked
   done.
6. `npm test` and `npm run test:e2e` pass. A `grep -rn 'claude -p'` outside
   `brief/`, `plans/` and history sections finds only drafting and the
   sandbox check it depends on.

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
