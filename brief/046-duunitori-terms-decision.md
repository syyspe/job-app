---
slug: 046-duunitori-terms-decision
date: 2026-11-23
---

# Duunitori: user-triggered fetch, a description pre-screen, and a switch to automatic

## Problem

Duunitori ads need me to paste the ad text before the agent can evaluate one
(observation 2 in [`docs/ad-inbox-review.md`](../docs/ad-inbox-review.md)).
The 033 ruling, "Duunitori is never fetched by the agent", is why. The review
left the choice among its options (a)–(d) to me. This stream records that
choice and builds it.

**My choice: (a), a user-triggered fetch of one ad at a time, plus a
configuration switch to (b), fully automatic fetching.** I'll flip the switch
once I've verified that the agent's pre-screen of the email description works
well enough. Then fetching is still not systematic, because two screening
steps come before any fetch: the job watcher I defined on Duunitori's site,
and the agent's pre-screen of each ad's email description.

Today there is no agent pre-screen of the description. The only pre-screen is
a reject-phrase match on the **title** (`agent/runner/lib/titleRules.ts`),
and the Duunitori parser doesn't read the description from the email. So this
stream builds that pre-screen too.

### Reasoning I'm relying on

What Duunitori's terms prohibit. They say users may not store, archive,
scrape or systematically copy Service content, except where that is
technically necessary for authorised use. They also restrict systematically
linking to or embedding the content in another service, and making the
Service content, or a substantial part of it, available to the public. Every
one of these is about systematic collection and redistribution, which is what
a commercial scraper does when it pulls 20,000 listings into its own
database. The terms don't mention bots, AI or agents at all.

My workflow, step by step:

- **Reading the alert emails.** This is my own mailbox and doesn't touch
  Duunitori's service. It's fine.
- **Opening a specific ad I chose.** This is the same request my browser
  sends when I click the link in the email. One ad at a time, prompted by an
  alert I set up myself, is ordinary use of the service. It doesn't become
  "systematic copying" because an agent does the clicking.
- **Writing an application draft.** This is my own work. The ad is only an
  input to it.

Where it would start to look like scraping:

- crawling search results or category pages, or following links beyond the
  ads my alerts sent me;
- fetching every ad from every email in bulk, rather than the ones I actually
  consider;
- building up a stored archive of ad texts. "Tallentaa" (store) is literally
  in the clause. Keeping the text of an ad I applied to in my own tracker is a
  long way from systematic archiving, but it mustn't grow into a database of
  every ad;
- republishing or sharing the content anywhere;
- high request rates, or getting around rate limits and bot protection.

Practical points:

- Keep a human in the loop. I pick which ads get opened, or the agent
  pre-filters from the email snippet and opens only the promising ones.
- Many Duunitori ads copy ads from the employer's own careers page or another
  job board. When the ad links to the original, reading it there avoids the
  question entirely.
- For real certainty, ask Duunitori. A short "is this OK?" to
  info@duunitori.fi would settle it.

To sum up: one ad at a time, for my own job search, with no bulk storage or
redistribution, fits the spirit of the terms. Mass fetching or archiving is
what they're written to stop.

## What done looks like

1. **Terms gate first.** Before any code, the stream re-reads Duunitori's
   current terms (and robots.txt), records the date and what they say, and
   sets `termsCheckedOn`. If the reading finds a clear ban on even a
   user-triggered fetch, the stream **stops** there and shows me the exact
   wording, and I decide again. I don't expect this; we have read both
   already.
2. The 033 ruling is updated in `docs/job-search-agent.md` to record the new
   decision and the reasoning above.
3. **Pre-screen.** The Duunitori parser reads each ad's description from the
   alert email. A `claude -p` pre-screen judges each ad from its title and
   description and records a verdict on the ad.
4. **Fetch (mode a).** An `awaiting_handover` Duunitori ad has a Fetch action
   in the inbox. Clicking it only marks the ad. The next daily run fetches
   the page through the existing polite HTTP (caps, delays, block handling)
   and evaluates the ad right away in the same run. The paste stays available.
5. **Switch (mode b).** A config option switches Duunitori to automatic: the
   runner fetches and evaluates every ad that passes the pre-screens, with no
   click. Mode (a) is the default.
6. **Verdict vs. my choice.** The inbox UI and the summary email show, per
   ad, the pre-screen verdict next to whether I clicked Fetch, so I can judge
   when to flip the switch.
7. **Retention.** A dismissed ad's text is removed from the database
   automatically. No Duunitori ad text survives past its deadline unless it
   became an application: unhandled ads whose deadline has passed lose their
   text automatically. Part of this exists already (entering `dismissed`
   clears `body`, title and company; expiry dismisses waiting hand-overs). The
   plan confirms what is covered and closes the gaps, including fetched ads.

## Approach

- The fetch happens in the runner during the daily run, never in the server.
  The server doesn't import `agent/`, and polite HTTP already lives in the
  runner. I rejected an immediate server-started fetch for that reason.
- Fetch only the ad page linked from my alert email. No search or category
  pages, and no following other links.
- The pre-screen and the evaluation run under the existing `claude -p`
  sandbox-check gate.

## Out of scope

- Contacting Duunitori (option (c)). I may do it myself; it isn't code.
- Making the paste cheaper (option (d)).
- Changing my Duunitori job watchers, including the broad "Python" one.
- Reading the employer's original posting in place of the Duunitori page.
  It's a good idea, but it belongs in a later stream.
- The inbox redesign (`inbox-redesign`).

## Related streams

- `045-inbox-hide-closed`: checked out in its own worktree, no commits yet.
  It changes how dismissed ads show in the inbox. This stream adds a Fetch
  action and a pre-screen verdict to the same rows, so the plan should check
  for overlap in `AdRow`/`AdsView`.
- `inbox-redesign` (not started) depends on this stream, because the
  Duunitori decision changes which states the page has to show.

## Open questions

- Where the description sits in Duunitori's alert email, and whether every
  alert carries one.
- The pre-screen's prompt (private, like `prompts/evaluate.md`), its verdict
  values, and whether it runs for automatic sources too or only Duunitori.
- Whether a "fetch requested" ad needs a new state or a flag on
  `awaiting_handover`.
- The config shape of the (a)/(b) switch under `sources.duunitori`.

---

**Next stage:** run `/sdlc`.
