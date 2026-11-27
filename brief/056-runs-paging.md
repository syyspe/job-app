---
slug: 056-runs-paging
date: 2026-11-27
---

# Ad inbox: page the runs list, one run at a time

## Problem

In the ad inbox, the runs panel (`AgentRunPanel`) sits above the state filter
buttons and lists up to 10 recent runs (`RECENT_LIMIT`), with the newest
run's output expanded. As runs pile up, the filter buttons and the ad cards
below them are pushed out of view.

## What done looks like

1. The runs panel shows one recent run at a time, starting with the newest.
2. Previous/Next controls step back and forth through the older runs, as the
   applications list does.
3. The paging control is the existing `Pagination` component, reused with an
   accessible label that names runs, not applications.
4. The filter buttons and the ad list stay in place however many runs exist.

## Approach

Reuse `Pagination` and `paginate` (`src/lib/paging.ts`) with a page size
of 1. `Pagination` currently hard-codes `aria-label="Application pages"`, so
the label becomes a prop.

## Out of scope

- Paging the ad cards. They stay as they are.
- What a run's output says. That is #3/#4's subject, in their own streams.
- Changing `RECENT_LIMIT` or the server's runs endpoint.

## Related streams

- The agent-process and ad-vocabulary streams planned in the same session
  (#3/#4) will likely change what a run's output contains, but not this
  panel's layout.

## Open questions

- While a run is in progress: does the current run take the single slot, or
  show above the paged recent run?
- Is the shown run's output still expanded by default?

---

**Next stage:** run `/sdlc`.
