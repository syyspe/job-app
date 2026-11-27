---
slug: 059-ad-states-plain
date: 2026-11-27
---

# Fewer ad states, in words I understand

## Problem

The ad inbox has ten states: `new`, `awaiting_handover`, `ready`,
`suitable`, `drafted`, `title_rejected`, `unsuitable`, `duplicate`,
`dismissed`, `failed`. It also has a filter button per state and a set of
actions that differ by state. The vocabulary is the pipeline's, not mine,
and with that many states and actions the inbox is hard to read.

## What done looks like

1. The inbox shows a small set of states, each named for what it means to
   me (e.g. waiting for my decision, drafted, not a match, failed) rather
   than for a pipeline step.
2. Only the states that need me, or that I'd look back at, have a filter
   button.
3. Each state offers only the actions that make sense in it, and the
   inbox has fewer actions overall.
4. Where an ad was dropped, the inbox says which step dropped it and why
   (title rules, pre-screen or evaluation), without that being its own
   state.
5. The run report (057) and the summary email use the same words.

## Approach

The plan proposes the state set. That set may be display-level (grouping
today's stored states under fewer labels) or a real change to the stored
states and their transitions. The plan picks one and says why.

## Out of scope

- The run's steps and the email: 057.
- The Draft action: 058.

## Related streams

- 057-plain-daily-run removes the Fetch click and the run's drafting, so
  several of today's states and actions stop occurring in daily use. Best
  planned after 057 is merged.
- 058-draft-on-demand adds the Draft action to the kept state.

## Open questions

- The state set itself (left to the plan).
- Whether `awaiting_handover`/`ready` survive at all once Duunitori is
  automatic (057).
- What happens to the MCP tools' state names (`dismiss_ad`, `handover_ad`)
  if the stored states change.

---

**Next stage:** run `/sdlc`.
