---
slug: 057-plain-daily-run
date: 2026-11-27
---

# Daily run: screen, fetch, evaluate, and tell me in plain words

## Problem

Using the agent is too complicated. The daily run (`agent/runner/lib/dailyRun.ts`)
collects mail, expires hand-overs, syncs the profile, pre-screens hand-over
ads, fetches the ones I clicked Fetch on, evaluates, **drafts**, and then
emails a summary. Its output, both the run panel's and the email's, is
written in internal terms: "0 messages", "0 new ads", "0 empty alerts" (an
empty alert is an alert email the parser found no ads in), plus a long list
of states and actions. I can't tell at a glance what happened or what's
waiting for me.

I want the run to do the routine work by itself and hand me only the
decision: which of the kept ads get a draft.

## What done looks like

1. The daily run does, in order: read the alert emails not read before →
   title rules → model pre-screen of **every** source's new ads (not only
   hand-over ones) → fetch the promising ones → evaluate. It no longer drafts.
2. Duunitori fetches promising ads automatically (`fetch: "automatic"`), so
   no ad waits for my Fetch click in daily use. This is the switch 046 left
   for once the pre-screen had proven itself.
3. An ad the evaluation keeps waits for my decision (today's `suitable`).
   Nothing drafts it until I ask (stream 058).
4. The summary email reads like:
   "Read 2 new emails. Pre-screening found 4 interesting job titles.
   Evaluation kept 1 of them:" followed by, for each kept ad, its title and
   company, a link to the ad on the job site, the evaluation summary, and a
   link to that ad in job-app where I can dismiss it (and draft it, once 058
   lands).
5. The run panel output uses the same plain wording and counts as the
   email. No "empty alerts", "existing ads" or per-state tallies unless
   something needs me.
6. Problems (a failed step, a source whose alerts parsed to nothing, the
   spend cap) still appear, each as one plain sentence saying what to do,
   and only when they happen.

## Approach

Most of the parts exist: the pre-screen (046), `fetch: "automatic"`, the
evaluation, and the SMTP summary (`agent/runner/lib/summary.ts`). This
stream reorders and trims them, widens the pre-screen to every source, and
rewrites the report text. Links in the email open job-app and do nothing on
their own. An email client or link scanner may prefetch a URL, so a GET must
never dismiss or draft.

## Out of scope

- The Draft action itself and drafting through `claude -p`: 058.
- Fewer ad states and plain labels in the inbox: 059.
- Paging the run panel: 056.

## Related streams

- 058-draft-on-demand builds the Draft button this email links to.
- 059-ad-states-plain reworks the states this stream's report counts. The
  report's wording should survive 059 unchanged.
- 052-retire-claude-p (briefed, not started): this stream takes `claude -p`
  out of the daily run entirely. Pre-screen and evaluation run on the API.
- 056-runs-paging: same panel, layout only.

## Open questions

- Does job-app have a URL that opens one ad in the inbox, or does this
  stream add one? The email's job-app link needs it.
- Does the hand-over expiry (`handoverWaitDays`) still have a job once
  Duunitori is automatic, or does it go?
- With the pre-screen on every source, does the per-run cap or budget need
  changing? It's a Haiku call per ad.
- Is the email still sent when nothing was kept (`alwaysSend`)? What does it
  say then?

---

**Next stage:** run `/sdlc`.
