---
slug: 034-ad-inbox
date: 2026-11-18
---

# Ad inbox

## Problem

The job search agent needs one place to record every ad it has seen, what
happened to it and what still waits for me. Job-app has only applications
today, so nothing can remember a rejected ad or stop the same ad being
processed twice. Every later stream writes to this inbox, so it comes first.

## What done looks like

1. Job-app stores ads in the `ads` table, scoped to the user, with the states
   and transitions in the contract.
2. The server answers a transition the contract does not allow with 409.
3. Ingesting a known ad returns the existing row, and the three deduplication
   rules mark a repeat as `duplicate`, including a match against an archived
   application.
4. Every inbox API route except `POST /api/ads/:id/draft` works behind
   `requireSession`.
5. Ad text is cleared on the states the contract lists, and a hand-over
   source's `title` and `company` are blanked when the contract says so.
6. The MCP tools `list_ads`, `get_ad`, `handover_ad` and `dismiss_ad` work from
   Claude Desktop.
7. A review view lists ads by state, and lets me dismiss an ad, hand over its
   text and retry a failed one.

## Approach

The contracts are fixed in `docs/job-search-agent.md`:

- [Ad inbox data](../docs/job-search-agent.md#4-ad-inbox-data): table, states,
  transitions and deduplication.
- [Inbox API](../docs/job-search-agent.md#5-inbox-api): routes and their
  behaviour.

The work follows the existing shape: a router factory in `server/routes/`
mounted after `requireSession`, row shapes in `server/models/`, a tool group in
`mcp/tools/`, and components that call the API only through `src/lib/api.ts`.

The inbox can be tried by hand through the API and MCP tools, before any agent
code exists.

## Out of scope

- `POST /api/ads/:id/draft`, which `037-application-drafts` adds.
- Collecting, screening or evaluating ads.
- Any code in `agent/`.

## Related streams

- Before: `033-job-search-agent` records the contracts.
- After: `036-ad-evaluation`, `037-application-drafts`, `038-alert-sources` and
  `039-daily-run` all use this API.
- In parallel: `035-profile-corpus` touches little else and may run alongside
  this stream in its own worktree.

## Open questions

- What visual direction should the review view take? `CLAUDE.md` leaves the UI
  undecided until the first plan that reshapes it.
- Does this third feature area trigger the deferred split of `src/components/`
  into feature folders?
- How long may an ad wait in `awaiting_handover`? Until I act, its Duunitori
  title and company stay stored, and the contract sets no time limit.
- How does the server know an ad's source is a hand-over source? The `failed`
  retry target and the blanking of `title` and `company` both depend on the
  connector's mode, but the `ads` table has no column for it.

---

**Next stage:** run `/sdlc`.
