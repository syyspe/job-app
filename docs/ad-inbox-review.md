# Ad inbox review

Written 2026-11-23 for stream `044-ad-inbox-review`
([brief](../brief/044-ad-inbox-review.md)). This document records what the ad
inbox looks like in use, explains it against the current code, and proposes
how to split the follow-up work. It changes no code and decides nothing about
Duunitori. The contracts it refers to live in
[`job-search-agent.md`](job-search-agent.md) and the
[033](../brief/033-job-search-agent.md), [034](../brief/034-ad-inbox.md) and
[038](../brief/038-alert-sources.md) briefs.

## 1. Observations

In the user's words:

1. Dismissed ads stay visible, each titled "Untitled ad". I'd like them gone
   from the UI.
2. Duunitori ads need me to paste the ad text before I can hand one over. To me
   that is no different from pasting the ad URL into Claude Desktop and asking
   it to evaluate the job: I have already said what interests me in the
   Duunitori job watchers (which are also based on the CV I added there), and
   the email descriptions rarely tell me enough to decide. The agent screens the
   email titles the same way I would, and could fetch and evaluate the ads
   itself. I'd prefer Duunitori to work like the automatic sources, with no
   handover at all.
3. The page as a whole is clumsy: a row of state buttons whose meaning is
   unclear. After `agent:evaluate` found one suitable job, I expected many
   unsuitable ones, but Unsuitable still showed 0.

The database on 2026-11-23 (read-only):

| State | Source | Ads | Blank title |
|---|---|---|---|
| awaiting_handover | duunitori | 10 | 0 |
| dismissed | duunitori | 26 | 26 |
| suitable | duunitori | 1 | 0 |
| title_rejected | duunitori | 1 | 1 |
| drafted | academicwork | 1 | 1 |

## 2. What produces each one

### 2.1 Dismissed ads titled "Untitled ad"

"Untitled ad" is the fallback for an empty title at
`src/components/AdRow.tsx:95` (`ad.title || 'Untitled ad'`). Titles are emptied
by the blanking rule in [`job-search-agent.md` §4](job-search-agent.md#4-ad-inbox-data),
which keeps stored Duunitori content to what the review needs. The rule is
applied only to rows with `source_mode = 'handover'`, in two places:

- `movedRow` (`server/lib/ads.ts:65`) blanks on entry to `BLANK_ON_ENTRY`,
  which is `unsuitable`, `duplicate` and `dismissed`
  (`server/lib/adStates.ts:27`).
- `markOneReported` (`server/lib/ads.ts:228`) blanks once the ad has been
  reported, for `BLANK_ONCE_REPORTED`, which is `drafted`, `title_rejected` and
  `failed` (`server/lib/adStates.ts:29`).

So every dismissed Duunitori ad is blank by design, and the list still shows
it because the page has a Dismissed filter like every other state (see 2.3).

All 26 dismissed ads were first seen on 2026-11-21 and 22, in the 18:00 UTC
runs. They moved between 2026-11-22 19:52 and 2026-11-23 08:18 UTC, which is
outside the run times. The hand-over wait in
[§4](job-search-agent.md#4-ad-inbox-data) (`handoverWaitDays`, 7 by default, or
the deadline if sooner; `agent/runner/lib/handoverExpiry.ts`) would have
dismissed them during a run, and only after 7 days unless a deadline came
sooner. That fits dismissing them by
hand rather than by expiry. **The user should confirm this.** None of them
has `reported_at`, because dismissed ads are never reported; for them the
blanking happens on entry.

**The blank Academic Work title (the brief's open question 1).** Ad id 1 is
the drafted Academic Work ad. Its row has `source_mode = 'handover'`. It was
first seen 2026-11-19 15:02 UTC. Academic Work became an automatic source the
next day: `academicWork.ts` was added in `2361274` and merged as
PR #63 on 2026-11-20 12:27 +0200. So the ad was ingested by hand, with
hand-over mode, during 037. Reporting it (`reported_at` 2026-11-20 14:16 UTC)
then blanked it through `markOneReported` → `blanksOnceReported('drafted')`.
The rule did what it says. The row is a leftover from before 038, not a bug in
the automatic path. Its application (id 30, "Ohjelmistokehittäjä (full-stack)
energiasektorille, Espoo") keeps the title.

### 2.2 Duunitori needs a paste

The Duunitori connector (`agent/runner/lib/sources/duunitori.ts`) declares
`mode: 'handover'` and has no `fetchAd`. The runner only parses its alert
emails, so every Duunitori ad that passes the title screen waits in
`awaiting_handover` until the user pastes the ad text into the hand-over form
(`src/components/AdHandoverForm.tsx`). Automatic sources such as Academic
Work declare `mode: 'automatic'` and a `fetchAd` that opens the public ad page
(`agent/runner/lib/sources/academicWork.ts:53,57`). This difference is the 033
ruling in code. Section 3 covers whether to change it.

### 2.3 The page is clumsy, and Unsuitable shows 0

`src/components/AdsView.tsx:54` renders one filter button for each state in
`AD_STATE_ORDER` (`src/lib/adStates.ts:17`). That is all ten states, including
the empty ones. The default filter is `awaiting_handover`
(`src/components/AdsView.tsx:78`).

The count of 0 for Unsuitable was correct. Only the one handed-over ad was
ready for evaluation, and it was suitable. The other Duunitori ads were never
evaluated because they were waiting for a hand-over. So this observation is
mostly observation 2, plus a page that:

- doesn't say why an ad hasn't been evaluated yet;
- doesn't distinguish "Title rejected" (the title screen,
  `agent/runner/lib/titleRules.ts`, which runs before any page is read) from
  "Unsuitable" (the `claude -p` evaluation of the full ad);
- shows filter buttons for states that are empty.

## 3. Duunitori fetching: an open decision

The ruling in the [033 brief](../brief/033-job-search-agent.md) (2026-11-18):

> **Duunitori is never fetched by the agent.** Its
> [terms](https://duunitori.fi/compliance/kayttoehdot) (updated 2026-11-13)
> prohibit scraping, storing or otherwise systematically copying the service's
> content. Rejected alternatives: a logged-in fetch of the personal
> recommendations page, which also stores my credentials in an unattended job
> and puts the account at risk; and opening every emailed link automatically,
> which is still systematic copying.

**This document makes no decision.** The options, weighed against the terms as
033 recorded them:

| Option | What it gives the user | Against the terms as 033 read them | Cost to build |
|---|---|---|---|
| **(b) Fully automatic**: Duunitori becomes an automatic source like Academic Work. The user's preference. | No hand-over at all. Ads that pass the title screen get evaluated and drafted like any other. | Ruled out. This is the "opening every emailed link automatically" alternative that 033 rejected as systematic copying. | Small to moderate: switch the connector to `automatic`, add a page extractor and `fetchAd`, set `termsCheckedOn`. The daily cap, delays and block handling already exist in the runner. |
| **(a) User-triggered fetch of one ad**: a "Fetch" action on an `awaiting_handover` row replaces the paste. | The user only clicks on the ads they pick, with no copying. | A grey area. It is closer to the user opening the page, but it is still the agent fetching and storing content, one ad at a time and only when asked. | Moderate: a new server route or runner command that fetches one page, a button on the row, and error states for block and gone. It reuses the extractor that (b) would need. |
| **(c) Ask Duunitori** for written permission, or for an API or feed. | Possibly (b) with no terms risk, if they agree. | Clean whatever the answer: it settles the question instead of reading the terms. | No code until there is an answer. The cost then depends on what they offer. Waiting costs time, and they may never answer. |
| **(d) A cheaper paste**: keep the hand-over and make it faster, for example by accepting a whole-page paste and extracting title, company and text from it. | Less friction, same flow. | Unchanged from today: the user copies the page, and the agent never fetches it. | Small: changes to the hand-over form and its parsing, and no change to the runner. |

These options aren't exclusive. (c) can run alongside (d) while waiting for an
answer, and (a) or (b) could follow if Duunitori allows it.

## 4. Terms gate

Whichever stream changes the Duunitori connector starts by re-reading
Duunitori's current terms and recording the date and what they say, before any
code. The `termsCheckedOn` gate does the same for automatic sources:
`agent/runner/lib/runnerConfig.ts:58` declares it, and line 78 refuses to
enable an automatic source without it. 033's reading dates from the terms of
2026-11-13, and terms change.

## 5. Volume lever

One of the user's Duunitori job watchers matches on "Python" alone. As long as
Duunitori needs a hand-over, its volume only adds titles to screen and rows to
dismiss. It starts to matter if fetching is allowed: every ad it lets past the
title screen would then cost a fetch and an evaluation. The user can remove it
if it proves too broad. Changing the watchers is outside this stream.

## 6. Open decisions for the user

1. **Duunitori fetching**: which of (a)–(d) in section 3, or a combination.
2. **Dismissed ads**: hide them from the UI entirely, or only from the default
   view. Either way the rows stay, because deduplication needs them.
   Recommendation: **out of the default view**, still reachable through a filter,
   so a mistaken dismissal can be found.
3. **Ad id 1**: clean up the blank-titled Academic Work row, or leave it as a
   harmless pre-038 leftover.
4. Confirm that the 26 dismissed Duunitori ads were dismissed by hand
   (section 2.1).

## 7. Proposed follow-up streams

In the suggested order:

| # | Stream | Covers | Depends on | Scope |
|---|---|---|---|---|
| 1 | `inbox-hide-closed` | Obs. 1 | Nothing | Take dismissed, and possibly duplicate, out of the default view, and replace "Untitled ad" with a neutral label. Goes **first** because it is small and independent. |
| 2 | `duunitori-terms-decision` | Obs. 2 | Nothing | Re-read the terms (section 4) and record the user's choice among (a)–(d). No code unless the choice is (d). Gates stream 3. |
| 3 | `duunitori-fetch` or `cheaper-handover` | Obs. 2 | Stream 2 | Implements whichever option was chosen: `duunitori-fetch` for (a) or (b), `cheaper-handover` for (d). |
| 4 | `inbox-redesign` | Obs. 3 | Stream 2, ideally 3 | The page's look and feel, using the `frontend-design` skill. Explain the states, show why an ad is waiting, keep title-rejected apart from unsuitable, and drop or fold the empty filter buttons. Goes **last**, because the Duunitori decision changes which states the page has to show. |
