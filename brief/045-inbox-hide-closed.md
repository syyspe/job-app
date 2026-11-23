---
slug: 045-inbox-hide-closed
date: 2026-11-23
---

# Inbox: hide closed ads

## Problem

Observation 1 from [`docs/ad-inbox-review.md`](../docs/ad-inbox-review.md):
dismissed ads stay visible in the ad inbox, each titled "Untitled ad", and I'd
like them gone from the UI. On 2026-11-23 that was 26 blank-titled Duunitori
rows. The blank titles come from the blanking rule, which is intended
(review doc §2.1). The problem is that the page still lists those rows, and
that "Untitled ad" is the only label a blank row gets.

It is stream 1 in the review doc's §7 order, because it is small and depends
on nothing.

## What done looks like

1. The ad inbox has no Dismissed and no Duplicate filter button, and never
   lists an ad in either state.
2. Ads in those states stay in the database and in `GET /api/ads`, so the MCP
   tools and the agent's de-duplication are unchanged.
3. A visible ad with a blank title shows its source and the date it was first
   seen, e.g. "Duunitori ad · 21 Nov 2026", instead of "Untitled ad". The date
   goes through `src/lib/dates.ts`.
4. Component tests cover both: the two states are absent from the filter and
   the list, and a blank-titled row gets the source + date label.

## Approach

Client only. The inbox page (`AdsView`, `src/lib/adStates.ts`) leaves the two
closed states out of the filter row and the list it renders. `AdRow` builds
the fallback label from `ad.source` and `ad.firstSeenAt`. No server, API or
MCP change.

Rejected: making `GET /api/ads` leave them out by default, because it also
serves the MCP list and the agent, which rely on those rows.

## Out of scope

- The filter row's redesign and its empty buttons. That is `inbox-redesign`.
- The Duunitori decision, which is `046-duunitori-terms-decision`.
- The blanking rule itself.
- The leftover blank-titled Academic Work row (id 1, review doc §2.1).

## Related streams

- `046-duunitori-terms-decision` is checked out in another worktree. It
  touches no inbox code unless its choice is (d).
- `inbox-redesign` (review doc §7, stream 4) comes later and will rework the
  same filter row. This stream should stay small so the redesign has little
  to undo.

## Open questions

1. The source is stored as a slug (`duunitori`, `academicwork`), and the row
   already prints it raw. Where does the display name in "Duunitori ad" come
   from? A small label map on the client, or the slug as it is?

---

**Next stage:** run `/sdlc`.
