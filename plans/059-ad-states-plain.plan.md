---
brief: brief/059-ad-states-plain.md
branch: 059-ad-states-plain
date: 2026-11-27
---

# Fewer ad states, in words I understand — Plan

## Context

The inbox shows one filter button per stored state (eight of the ten) and a
different set of buttons in each, using the pipeline's vocabulary. Since 057
the run fetches every promising ad by itself and the pre-screen dismisses the
rest, so most of those states and buttons no longer need the user. After this
plan the inbox shows **four groups named with the email's words**, each with
only the actions that make sense in it.

**Display-level, not a stored-state change.** The stored states stay exactly as
they are; the client maps them onto groups. Why:

- The stored states drive the runner, the server's transition table and the
  MCP tools (~30 files). The brief's problem is what the *inbox* shows, and a
  mapping solves it without a migration or a second pipeline change right
  after 057.
- Every distinction a group needs can already be read off a row: the stored
  state plus `prescreen.verdict` tells which step dropped an ad.
- Brief open questions: `awaiting_handover`/`ready` stay stored states, they
  just aren't listed. The MCP tools (`list_ads`, `handover_ad`,
  `dismiss_ad`) and their state names are unchanged.

The groups (decided with the user):

| Group | Stored states | Filter | Row actions |
|---|---|---|---|
| **Kept** | `suitable` | yes, default | Draft (058), Dismiss |
| **Failed** | `failed` | yes | Retry, Dismiss |
| **Drafted** | `drafted` | yes | — |
| **Set aside** | `title_rejected`, `unsuitable`, `dismissed` with `prescreen.verdict === 'not_promising'` | yes | — (Open ad only) |
| *(not listed)* in progress | `new`, `awaiting_handover`, `ready` | no | — |
| *(not listed)* closed | `duplicate`, other `dismissed` (by the user or by hand-over expiry) | no | — |

- **Set aside** rows say which step dropped the ad and why, replacing today's
  "Pre-screen: …" line for those rows:
  - `title_rejected` → "Set aside by the title rules."
  - pre-screen → "Set aside by the pre-screen — <prescreen.reason>"
  - `unsuitable` → "Set aside by the evaluation — <evaluation.fitSummary>"
- **Kept** rows keep the fit summary line. Failed rows keep "Failed with …".
- **Removed from the UI:** the Fetch button, the Hand over button and the
  hand-over form. With fetching automatic, in-progress ads need nothing from
  the user. If a site blocks fetching, `handover_ad` in MCP is the fallback.
- **Brief item 5 (same words):** the inbox takes its words from the 057 email
  and run report ("N kept, M set aside", "failed … Retry or dismiss it"), so
  `story.ts`/`summary.ts` don't change. A test pins the shared words (below).

## Affected files

- `src/lib/adStates.ts` — replace `AD_STATE_LABELS`, `AD_STATE_ORDER`,
  `canHandOver`, `canDismiss` and `retryTarget`'s neighbours with:
  - `type AdGroup = 'kept' | 'failed' | 'drafted' | 'set_aside'`
  - `AD_GROUPS: readonly AdGroup[]` (that order) and `AD_GROUP_LABELS`
  - `adGroup(ad: AdSummary): AdGroup | null` — the table above; null = not
    listed
  - `setAsideBy(ad): string | null` — the "Set aside by …" sentence, or null
    if the ad isn't set aside
  - `canDismiss(group)` → `kept` or `failed`. Keep `canDraft`, `DraftStatus`,
    `retryTarget`.
- `src/lib/adStates.test.ts` (new, beside it) — the mapping and the sentences.
- `src/components/AdsView.tsx` — the filter iterates `AD_GROUPS`, counts and
  lists by `adGroup(ad)`; default selection `kept`. `useSelectedState`: a
  focused ad selects `adGroup(focusAd)` when it is non-null, otherwise the
  default stays. Drop `onHandOver`/`onFetch` and the `handoverAd`/
  `requestFetch` imports.
- `src/components/AdRow.tsx` — drop `FetchButton`, `canFetch`, the hand-over
  mode, `AdHandoverForm` import and `onHandOver`/`onFetch` from `AdActions`.
  `Mode` becomes `'idle' | 'dismiss'`. `AdDetails` shows `setAsideBy(ad)` for a
  set-aside row instead of `AdPrescreenLine`; other rows keep the pre-screen
  line without the "· Fetch requested" suffix. `data-state` becomes
  `data-group={adGroup(ad)}` (the spine reads the group). `AdButtons` takes the
  group for Dismiss.
- `src/components/AdList.tsx` — `stateLabel` → `groupLabel` (empty state:
  "No ads in Kept").
- `src/components/AdHandoverForm.tsx`, `AdHandoverForm.test.tsx` — deleted
  (no caller left).
- `src/lib/api.ts` — delete `handoverAd` and `requestFetch`.
- `src/types.ts` — delete the client's `AdHandoverInput` (no caller left; the
  server's copy stays).
- `src/ads.css` — spine selectors move to `data-group`: `failed` danger,
  `drafted` screening, `kept` the accent `awaiting_handover` used
  (`--st-interview`), `set_aside` the 2px neutral spine with muted title.
  Delete `.ad-handover`.
- Tests: `src/components/AdsView.test.tsx`, `AdRow.test.tsx`,
  `AdList.test.tsx`, `e2e/ads.spec.ts`, `e2e/agentRuns.spec.ts` (see Tests).
- Docs: `docs/architecture.md` (the Ad inbox paragraph, `adStates.ts` line,
  `ads.css` line, AdHandoverForm removed), `docs/job-search-agent.md` (the
  "inbox shows each verdict next to whether the user clicked Fetch" bullet,
  and a note under §4 that the inbox groups the stored states as above),
  `README.md` wherever it names inbox buttons or states.

Unchanged on purpose: `server/` (states, transitions, the handover and
`fetch-request` routes), `mcp/`, `agent/`. `fetch-request` stays as the API
of the `fetch: "handover"` rollback recorded in `docs/job-search-agent.md`;
the docs note that under that rollback the user hands ads over through MCP.

## Work order

1. `src/lib/adStates.ts` + its new test: groups, labels, `adGroup`,
   `setAsideBy`, `canDismiss(group)`.
2. `AdRow.tsx`, `AdList.tsx`, `AdsView.tsx` onto groups; remove Fetch/Hand
   over; delete `AdHandoverForm*`, `handoverAd`, `requestFetch`, client
   `AdHandoverInput`. Update the three component tests.
3. `src/ads.css` spine on `data-group`, `.ad-handover` removed.
4. `e2e/ads.spec.ts` and `e2e/agentRuns.spec.ts`.
5. Docs.
6. `npm run lint`, `npm run build`, `npm test -- --maxWorkers=2`, e2e (ports
   checked first).

## Parallel streams

- `056-runs-paging` — brief only, no plan yet, so its files can't be checked.
  It pages the run panel's runs list: likely `AgentRunPanel` and the
  run-panel rules in `src/ads.css`, while this plan touches the ad rows and
  filter. No shared contract; neither waits for the other. If it ends up
  editing `AdsView.tsx`, git flags the shared file at merge.

## Tests

- New `src/lib/adStates.test.ts`:
  - each stored state → its group; `dismissed` + `not_promising` →
    `set_aside`; `dismissed` + `promising` or no verdict → null; `new`,
    `awaiting_handover`, `ready`, `duplicate` → null.
  - `setAsideBy` for each of the three steps, including the reason/fit
    summary; null for a kept ad.
  - `AD_GROUP_LABELS` contains "Kept" and "Set aside", the words the 057
    email's subject uses (`summary.ts`'s `"N kept, M set aside"`) — the
    item-5 pin.
- `AdsView.test.tsx`: four filter buttons in order Kept, Failed, Drafted, Set
  aside with counts; Kept selected by default; a pre-screen-dismissed ad
  counts under Set aside; in-progress ads appear under no filter;
  `focusAdId` of a failed ad selects Failed; `focusAdId` of an in-progress ad
  leaves Kept selected. Remove the Fetch/hand-over cases.
- `AdRow.test.tsx`: Kept row offers Draft and Dismiss; Failed row Retry and
  Dismiss; Drafted and Set aside rows have no buttons; each set-aside row's
  sentence; no Fetch/Hand over anywhere. Remove the hand-over form cases.
- `AdList.test.tsx`: empty-state wording with a group label.
- `e2e/ads.spec.ts`: hand-over test removed; dismiss test uses a `suitable`
  ad (ingest → `ready` → `suitable` via transitions) under Kept; retry test
  checks the row leaves Failed (no "New" filter to show it under); new test:
  a `title_rejected` ad shows under Set aside with "Set aside by the title
  rules." and no buttons.
- `e2e/agentRuns.spec.ts`: the phone-width ad is moved to `failed` (listed,
  with buttons) instead of `awaiting_handover`.
- Failure cases: nothing new can fail; no new boundary.
- Verification command: `npm run lint && npm run build && npm test --
  --maxWorkers=2`, then `npm run test:e2e` after
  `ss -ltnp | grep -E '5173|3001|3002'` (or `test:e2e:prod` if a port is
  taken).

## Risks / rollback

Nothing stored changes, so a revert of the branch restores the old inbox. The
one capability that leaves the UI is pasting an ad by hand; it remains in MCP
(`handover_ad`) and the server.

---

**Next stage:** run `/sdlc`.
