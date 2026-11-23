---
slug: 044-ad-inbox-review
date: 2026-11-23
---

# Ad inbox review

## Problem

The ad inbox is hard to interpret. Three observations from using it:

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

There are too many separate items here for one stream. This stream documents
them and plans how to split the work.

Findings from the database on 2026-11-23 (read-only), which the doc builds on:

| State | Source | Ads | Blank title |
|---|---|---|---|
| awaiting_handover | duunitori | 10 | 0 |
| dismissed | duunitori | 26 | 26 |
| suitable | duunitori | 1 | 0 |
| title_rejected | duunitori | 1 | 1 |
| drafted | academicwork | 1 | 1 |

- The Unsuitable count of 0 was correct. The only ad ready for evaluation was
  the one I had handed over, and it was suitable. The other Duunitori ads were
  waiting for a handover and were never evaluated. So observation 3 is mostly
  observation 2 plus a page that doesn't show why an ad hasn't been evaluated,
  or that "title rejected" and "unsuitable" are different buckets.
- "Untitled ad" comes from the blanking rule
  (`docs/job-search-agent.md`, "For a hand-over source, `title` and `company`
  are blanked…"), which exists to keep stored Duunitori content to a minimum.
  The drafted Academic Work ad is blank too, and that source isn't hand-over.

## What done looks like

1. `docs/ad-inbox-review.md` exists and records the three observations above in
   my words, together with the database findings.
2. It explains each observation against the current design: which rule or code
   produces the behaviour, and the blank-titled Academic Work ad found.
3. It treats Duunitori fetching as an open decision for me, not as settled. It
   quotes the 033 ruling ("Duunitori is never fetched by the agent", from its
   terms of 2026-11-13 prohibiting scraping, storing or systematic copying) and
   weighs:
   - (b) fetching fully automatically, my preference, which the 033 reading
     rules out;
   - (a) a user-triggered fetch of one ad at a time — closer to me opening the
     page, still the agent fetching, a grey area under the same terms;
   - (c) asking Duunitori for permission, or for an API or feed;
   - (d) keeping the paste but making it cheaper.
4. It states that whichever stream changes the Duunitori connector starts by
   re-reading the current terms and recording that reading, as the
   `termsCheckedOn` gate does for the automatic sources.
5. It notes the "Python"-only job watcher as a volume lever that matters only if
   fetching is allowed. I can remove it if we decide it is too broad.
6. It proposes the follow-up streams: for each, a name, the observations it
   covers, what it depends on, and a suggested order. The look-and-feel redesign
   is one of them and uses the `frontend-design` skill.

## Approach

A single document in `docs/`, written from the code, the existing docs and the
database. No code changes. The doc links to the 033, 034 and 038 briefs and
`docs/job-search-agent.md` rather than repeating them.

## Out of scope

- Any code, UI or config change, including to the Duunitori connector.
- Deciding whether fetching Duunitori is allowed. The doc lays out the options;
  I decide.
- Writing the follow-up streams' briefs. They get their own streams.
- Changing my Duunitori job watchers.

## Related streams

None in flight (only `master` is checked out).

## Open questions

- Why is the drafted Academic Work ad's title blank, when the blanking rule
  covers hand-over sources only?
- Should dismissed ads disappear from the UI entirely, or just from the default
  view? Either way the rows stay for deduplication.

---

**Next stage:** run `/sdlc`.
