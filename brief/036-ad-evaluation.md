---
slug: 036-ad-evaluation
date: 2026-11-18
---

# Ad evaluation

## Problem

Most ads can be rejected from the title alone, and the rest need a real
comparison with my profile. That comparison means a model reads untrusted ad
text, which may contain instructions aimed at the agent. The sandbox that makes
this safe has to exist and be proven before any real ad is processed.

## What done looks like

1. A new `agent/` directory holds the runner skeleton, covered by the project's
   TypeScript and Vitest configuration.
2. A wrapper starts sandboxed `claude -p` steps with the restrictions in the
   contract.
3. A test proves those restrictions against the installed CLI before any real
   ad is processed.
4. Title rules from private config move an ad to `title_rejected`, or onward by
   its source's mode.
5. Each `ready` ad is evaluated in its own process, up to a configured
   concurrency limit and per-run cap, and ads over the cap stay queued.
6. The runner validates each result again and moves the ad to `suitable` or
   `unsuitable`. An unsure result counts as `suitable`.
7. An ad that fails three times moves to `failed`, with a fixed error category
   and no ad text in `last_error`.
8. If the Ollama endpoint is unreachable, evaluation is skipped, ads keep their
   state and no attempt is counted.

## Approach

The contracts are fixed in `docs/job-search-agent.md`:

- [Pipeline and runtime](../docs/job-search-agent.md#1-pipeline-and-runtime):
  what the runner does and how it fans out.
- [Agent permissions](../docs/job-search-agent.md#2-agent-permissions): the
  rules every `claude -p` step must meet.
- [Private configuration](../docs/job-search-agent.md#3-private-configuration):
  where title rules, caps and prompts live.
- [Ad inbox data](../docs/job-search-agent.md#4-ad-inbox-data): the states and
  transitions the runner drives.

The runner speaks HTTP to the job-app API as `mcp/` does and opens no database.
Ads are supplied by hand through the inbox until `038-alert-sources` exists.

## Out of scope

- Writing drafts.
- Reading mail or fetching ad pages.
- The timer and the summary email.

## Related streams

- Before: `034-ad-inbox` provides the API and `035-profile-corpus` the
  `search_profile` tool.
- After: `037-application-drafts` reuses the sandboxed wrapper and picks up
  `suitable` ads.

## Open questions

- What are the title rejection rules? Trainee, part-time and excluded
  technologies are clear, but a "junior" title is not always a mismatch.
- What counts as suitable after full evaluation?
- What should the per-run evaluation cap be?

---

**Next stage:** run `/sdlc`.
