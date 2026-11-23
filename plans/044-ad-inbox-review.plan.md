---
brief: brief/044-ad-inbox-review.md
branch: 044-ad-inbox-review
date: 2026-11-23
---

# Ad inbox review — Plan

## Context

The brief asks for one review document, no code: record three inbox
observations, explain each against the code, lay out the Duunitori fetching
options for the user to decide, and propose follow-up streams. Planning
research has already answered the brief's first open question (below), so the
build session writes from this file without re-deriving it.

### Findings the doc records (read-only, 2026-11-23)

- **Blank Academic Work title (open question 1).** Ad id 1 has
  `source_mode = 'handover'`. It was first seen 2026-11-19 15:02 UTC, before
  038 made Academic Work an automatic source (`academicWork.ts` added in
  `2361274`, merged as PR #63 at 2026-11-20 12:27 +0200). So it was ingested
  by hand with hand-over mode during 037. Reporting it (`reported_at`
  2026-11-20 14:16 UTC) then blanked it via `markOneReported` →
  `blanksOnceReported('drafted')` (`server/lib/ads.ts:229`,
  `server/lib/adStates.ts:29`). The rule did what it says. The row is a
  leftover from before 038, not a bug in the automatic path. Its application
  (id 30, "Ohjelmistokehittäjä (full-stack) energiasektorille, Espoo") keeps
  the title.
- **"Untitled ad"** is the fallback at `src/components/AdRow.tsx:95`. Rows get
  blanked by `movedRow` (`server/lib/ads.ts:66`, `BLANK_ON_ENTRY` =
  unsuitable/duplicate/dismissed) and `markOneReported` (`BLANK_ONCE_REPORTED`
  = drafted/title_rejected/failed), both only for `source_mode = 'handover'`.
- **Dismissed Duunitori ads.** All 26 were first seen 2026-11-21 and 22 (the
  18:00 UTC runs) and moved between 2026-11-22 19:52 and 2026-11-23 08:18 UTC,
  outside the run times. That fits manual dismissal rather than
  `handoverExpiry.ts` (7 days, or the deadline if sooner). The doc says so and
  leaves the user to confirm it. None has `reported_at` because dismissed is
  never reported. Blanking happens on entry.
- **Page shape (observation 3).** `AdsView.tsx` renders one filter button per
  state in `AD_STATE_ORDER` (`src/lib/adStates.ts`), all ten of them, empty
  ones included. The default is `awaiting_handover`. Nothing on the page says
  why an ad isn't evaluated yet, and nothing separates "Title rejected" (the
  title screen in `agent/runner/lib/titleRules.ts`) from "Unsuitable" (the
  `claude -p` evaluation).
- **The 033 ruling** sits at `brief/033-job-search-agent.md:64-70`. The terms
  gate is `termsCheckedOn` in `agent/runner/lib/runnerConfig.ts:58,78`
  (required to enable an automatic source), and the Duunitori connector is
  `agent/runner/lib/sources/duunitori.ts` (`mode: 'handover'`).

## Affected files

- `docs/ad-inbox-review.md` (new): the review document.

Nothing else changes. `docs/job-search-agent.md` and the earlier briefs get
linked, not edited.

## Work order

1. Write `docs/ad-inbox-review.md` with these sections:
   1. **Observations**: the three observations in the user's words, taken
      from the brief's Problem section, plus the brief's state/source table.
   2. **What produces each one**: the Findings above, one subsection per
      observation, each naming the rule or the `file:line`. Answer open
      question 1 here. Link `docs/job-search-agent.md` §4 for the blanking
      rule and the hand-over wait rather than restating them.
   3. **Duunitori fetching: open decision.** Quote the 033 ruling verbatim
      with its date and terms link. Then weigh options (b) fully automatic,
      (a) user-triggered fetch of one ad, (c) ask Duunitori for permission or
      an API/feed, and (d) a cheaper paste. For each give what it gives the
      user, how it reads against the terms as 033 recorded them, and what it
      would cost to build. State that this doc makes no decision.
   4. **Terms gate**: whichever stream changes the Duunitori connector starts
      by re-reading the current terms and recording the date and reading, the
      same way `termsCheckedOn` gates the automatic sources.
   5. **Volume lever**: the "Python"-only job watcher matters only if fetching
      is allowed. The user can remove it if it proves too broad.
   6. **Open decisions for the user**: Duunitori fetching (a–d); dismissed ads
      hidden entirely or only from the default view (the rows stay either way
      for deduplication), with a recommendation of "out of the default view";
      whether to clean up ad id 1 or leave it.
   7. **Proposed follow-up streams**, each with a name, the observations it
      covers, what it depends on, and an order:
      - `inbox-hide-closed`: obs. 1. Takes dismissed (and possibly duplicate)
        out of the default view and replaces "Untitled ad" with a neutral
        label. No dependencies. **First**, small, independent.
      - `duunitori-terms-decision`: obs. 2. Re-read the terms and record the
        user's choice among a–d. No code unless (d). Gates the next one.
      - `duunitori-fetch` or `cheaper-handover`: obs. 2. Implements whichever
        option was chosen. Depends on the decision stream.
      - `inbox-redesign`: obs. 3. Look and feel, using the `frontend-design`
        skill: explain the states, show why an ad waits, keep title-rejected
        apart from unsuitable, and drop or fold the empty filter buttons.
        Goes **last**, after the Duunitori decision, because that decision
        changes which states the page has to show.
2. Run `npm run lint` (docs-only, a sanity check) and commit as
   `Build: ad inbox review`.

## Tests

- No code, so no new tests. Verification: the document covers each "What done
  looks like" item 1–6 in the brief. The Stage 4 verifier checks it against
  this list. `npm test -- --maxWorkers=2` stays green trivially.

---

**Next stage:** run `/sdlc`.
