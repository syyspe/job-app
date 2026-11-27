---
brief: brief/057-plain-daily-run.md
branch: 057-plain-daily-run
date: 2026-11-27
---

# Daily run: screen, fetch, evaluate, and tell me in plain words — Plan

## Context

The daily run does too much and reports in pipeline terms. After this plan it
reads mail, applies the title rules, pre-screens **every** source's new ads,
fetches the promising ones, evaluates them and stops. It never drafts. The
run panel and the email say what happened in a few plain sentences. The email
lists the kept ads (the decision that's left to the user) and the ads the
pre-screen set aside, each with a link to the job site, so a wrong call can
still be checked by hand.

Open questions from the brief, answered:

- **Link to one ad:** none exists (the client has no routing). This plan adds
  `<appUrl>#ad-<id>`. It's a hash, so the server is unchanged and a prefetched
  GET does nothing.
- **Hand-over expiry:** stays as it is. It still dismisses hand-over ads that
  waited too long for a fetch (day cap hit, blocked, or past their deadline),
  and clears text past the deadline.
- **Pre-screen cap/budget:** no change. `prescreen.perRunCap` (40) queues the
  rest for the next run, and `api.perRunUsd` already stops model steps.
- **`alwaysSend` with nothing kept:** still sent. It holds the opening
  sentences only (e.g. "Read 0 new emails. No new job titles to pre-screen.")
  and the Open job-app link.

Decided with the user:

- **Engines:** `agent:run` keeps following config's `engine`, sandbox gate
  included. 052 removes the CLI engine later.
- **Not-promising ads:** the pre-screen dismisses them at once (verdict kept).
  The email lists them with the ad's job-site URL.
- **Blanking is narrowed to the ad text.** Duunitori's terms forbid storing
  the service's *content*, which means the ad text (`body`). The title and
  company come from the alert email, which the user's mailbox keeps
  indefinitely anyway. So the server stops blanking `title`, `company` and
  `prescreen.reason` for hand-over ads, both on entering
  `dismissed`/`unsuitable`/`duplicate` and once reported for
  `drafted`/`title_rejected`/`failed`. The rules that clear `body` stay as
  they are: `clearsBody` on entry, and the deadline dismissal of hand-over ads
  in `ready`/`suitable`. Rows that were already blanked stay blank, since
  there's nothing to restore them from. `AdRow`'s fallback title for a blank
  row stays for them.

## Affected files

Runner:

- `agent/runner/lib/collectRun.ts` — drop the automatic-source fetch
  (`fetchSource`, `fetches`, `SourceReport.fetched`). Collect now reads mail
  and applies title rules only. `formatCollectReport` becomes plain:
  "Read 2 new emails with 7 new job titles." Problems are covered by the
  story's source-failure sentences.
- `agent/runner/lib/handoverFetchRun.ts` → rename to `fetchRun.ts`
  (`runFetch`, `FetchReport`). It covers every enabled connector with a
  `fetchAd`. The candidates are `awaiting_handover` ads for a hand-over source
  and `new` ads for an automatic one. An ad is wanted if `fetchRequestedAt` is
  set, or if the source's `fetch` is `"automatic"` and the verdict is
  `promising` (today's `wanted`, unchanged). Drop `formatHandoverFetchReport`.
- `agent/runner/lib/runnerConfig.ts` — the source `fetch` switch stays. It is
  the rollback that `docs/job-search-agent.md` §9 records for Duunitori's
  terms. Its comment changes from "hand-over connector" to any connector with
  a `fetchAd`. Its default becomes `"automatic"`, so automatic sources keep
  fetching without a config change. The user's
  `~/.config/job-agent/config.json` sets `sources.duunitori.fetch:
  "automatic"` (brief item 2). That's a step for the user, named in the
  README, not code.
- `agent/runner/lib/prescreenRun.ts` — the candidates are unscreened ads in
  `awaiting_handover` (hand-over sources) plus `new` (automatic sources),
  oldest first, under `perRunCap`. After `setPrescreen`, a `not_promising` ad is
  moved to `dismissed`. The report keeps `promising: AdSummary[]` and
  `setAside: AdSummary[]` (the ads `setPrescreen` returned), plus `failed`,
  `queued` and `failedAttempts`.
  `formatPrescreenReport` is no longer used by the daily run. Delete it if
  nothing else uses it.
- `agent/runner/lib/evaluationRun.ts` — the report gains `kept: AdSummary[]`
  (moved ads now `suitable`). `formatEvaluationReport` stays for
  `agent:evaluate`.
- `agent/runner/lib/dailyRun.ts` — order: collect → expire hand-overs →
  health/gate → sync → pre-screen → fetch → evaluate → spend → gather news →
  summary. Remove `drafting` from `DailyRunOptions`/`DailyReport` and the
  `runDrafting` import. A new `gatherNews` step lists the unreported `failed`
  ads and reads the source failures into `report.news`, so the email and stdout
  tell the same story. `sendSummary` still sends only when the story has news
  or `alwaysSend` is set. After the server accepts the mail it marks the
  failed ads it listed as reported, so the next email doesn't list them again,
  and clears the source failures. `REPORTED_STATES` shrinks to `failed`: the
  other two states were marked only so they would be blanked. Drop
  `prescreenTally`.
- `agent/runner/lib/story.ts` (new) — `storyOf(report): Story`, the plain
  facts, and `storyLines(story): string[]`, the sentences that both outputs
  use:
  - "Read N new email(s)." (sum of collect's messages; left out if collect
    failed).
  - "Pre-screening found N interesting job title(s) and set aside M." /
    "No new job titles to pre-screen." Add "K more wait for the next run." when
    some were queued.
  - "Evaluation kept N of M." when M > 0. Add "K more wait for the next run."
    when some were queued.
  - Problems, one sentence each, only when they happen:
    - a step failure: "<Step label> failed: <message>". Labels: Reading the
      alert emails, Expiring old hand-overs, Profile sync, Pre-screening,
      Fetching ads, Evaluation, Spend check, Sending the summary.
    - a skip: "Pre-screening and evaluation were skipped: <reason>".
    - a budget stop: "Stopped before the remaining model steps: <reason>".
    - retries: "Pre-screening/Evaluation could not finish N ad(s); they will
      be tried again next run."
    - a failed ad: "<title>, <company> failed three times (<lastError>[ —
      detail]). Retry or dismiss it in job-app: <ad link>".
    - an empty alert: "<Source>'s alert of <date> had no ads in it — check
      whether its format changed."
    - a block: "<Source> blocked fetching on <date>; fetching resumes the
      next day."
  - No sync, sandbox, per-state, empty-alert or existing-ad counts. The one
    exception: "Sandbox re-verified for claude X." is kept, because it explains
    a slow run.
  - `adLink(appUrl, id)` = `new URL('#ad-' + id, appUrl).href`.
- `agent/runner/lib/summary.ts` — rewritten on the story:
  - Subject: `job agent: N kept, M set aside` plus `, K problem(s)` when there
    are any, or `job agent: nothing new`.
  - Body: the story's opening sentences, then the kept ads (`Title, Company`,
    `Ad: <url>`, the evaluation's `fitSummary`, `In job-app: <adLink>`), then
    "Set aside by the pre-screen:" (`Title, Company — reason`, `Ad: <url>`),
    then problems, the spend sentence ("Claude API: $0.12 this run, $4.10 of
    $30.00 this month."), and the existing Open job-app lines.
  - Remove `prescreenTally`, `PrescreenTally`, the tally lines and the
    title-rejected and drafts sections.
- `agent/runner/commands/run.ts` — stop loading `drafting` config, the
  `prompts/draft.md` prompt and the CV templates. `printReport` prints
  `storyLines`, then the kept titles, then `summary: sent | not sent |
  nothing to report`, then the `api:` line *last*, unchanged
  (`src/lib/agentRuns.ts` `runSpend` parses it). Step failures still go to
  stderr. The header comment is updated.
- `agent/runner/commands/collect.ts` — matches collect no longer fetching.

Server and client:

- `server/lib/ads.ts` — `setPrescreen` accepts `new` as well as
  `awaiting_handover`, and still answers 409 for any other state.
  `requestFetch` is unchanged. Remove `blanked`/`blankedPrescreen`.
  `movedRow` no longer blanks, and `markOneReported` sets only `reported_at`.
- `server/lib/adStates.ts` — remove `BLANK_ON_ENTRY`, `BLANK_ONCE_REPORTED`,
  `blanksOnEntry` and `blanksOnceReported`.
- `src/lib/adLink.ts` (new) — `adIdFromHash(hash): number | null` for `#ad-<n>`.
- `src/App.tsx` — the initial view is `'ads'` when the hash names an ad. The
  hash outlives login, which happens in-page. The id is passed to `AdsView`.
- `src/components/AdsView.tsx` — a new `focusAdId?: number` prop. Once the ads
  load, the filter is set to that ad's state, once. `AdList`/`AdRow` mark that
  row `aria-current="true"` and scroll it into view.
- `src/components/AdList.tsx`, `src/components/AdRow.tsx` — pass the current
  id through and mark the row.
- `src/ads.css` — the current row's highlight, built from the tokens in
  `index.css` (a focus-ring outline on the row; the spine is untouched).

Docs:

- `README.md`: the "Daily run" section (steps, no drafting, no `drafting` key
  or `draft.md` needed, the email's shape) and "Alert sources" (`fetch` defaults to
  `"automatic"`, set Duunitori's to `"automatic"`, collect doesn't fetch). `CLAUDE.md`: the agent:collect and agent:run
  command lines. `docs/job-search-agent.md`: the pre-screen scope, the
  `POST /api/ads/:id/prescreen` 409 rule, the summary, the §4 blanking
  paragraph (now only `body` is cleared, with the reasoning above), and §9's
  "hand-over sources only" and "Retention". `docs/architecture.md`: renamed
  and new files, and the blanking helpers removed. `docs/ad-inbox-review.md`
  is a dated review and stays as written.

## Work order

1. Server: `setPrescreen` accepts `new`, and title/company blanking is
   removed. Tests: the prescreen route accepts `new`; a hand-over ad dismissed,
   or reported while failed, keeps its title, company and reason while its
   `body` is cleared. Update `adStates.test.ts`, `ads.dedup.test.ts` and any
   route test that asserted blanking.
2. Config: the `fetch` default becomes `"automatic"`, and its comment and
   `runnerConfig.test.ts` are updated.
3. Fetch: rename `handoverFetchRun` → `fetchRun`, widen it to automatic
   sources, and move its tests. Remove fetching from `collectRun` and update
   `collectRun.test.ts` and `collect.ts`.
4. Pre-screen: widen the candidates, dismiss not-promising ads, and update the
   report shape and `prescreenRun.test.ts`.
5. Evaluation: add `kept` to the report and its test.
6. `story.ts` and its test: each sentence, including singular and plural, and
   that absent problems print nothing.
7. `summary.ts` on the story and its test: subject variants, kept and set-aside
   blocks with both links, the `alwaysSend` empty body.
8. `dailyRun.ts`: new order, drafting removed, `gatherNews`. Update
   `dailyRun.test.ts` and `dailyRun.budget.test.ts`.
9. `run.ts`: setup trim, `printReport`, `api:` line last. Update
   `run.test.ts`.
10. Client: `adLink.ts` and its test, then `App`, `AdsView`, `AdList`, `AdRow`
    and `ads.css`, with tests.
11. Docs, as listed above.

## Parallel streams

None of these has a plan yet, so overlap is judged from their briefs.

- `058-draft-on-demand` — its email link and the place to click Draft are this
  stream's `#ad-<id>` and the `AdsView` focus. **Sequence:** 058 plans after
  057 merges and builds on the link as specified here.
- `059-ad-states-plain` — rewords the states. The story and email avoid state
  names ("kept", "set aside", "interesting"), so the wording survives.
  **Sequence:** 059's own brief says to plan it after 057 merges.
- `056-runs-paging` — the same panel, layout only. No shared file. The output
  text changes, but the `api:` line contract stays. No action needed.
- `052-retire-claude-p` — this plan keeps both engines in `agent:run` (the
  user's decision), so 052's scope is unchanged by 057.

## Tests

- New: `story.test.ts`, `fetchRun.test.ts` (moved and widened: an automatic
  promising `new` ad is fetched, a clicked hand-over ad is fetched, an
  unscreened `new` ad is not), and `src/lib/adLink.test.ts`. AdsView: opening
  with `focusAdId` selects that ad's state and marks the row
  (`getByRole('listitem', { current: true })` or equivalent).
- Updated: `collectRun.test.ts` (no fetching), `prescreenRun.test.ts` (both
  sources, not-promising dismissed and listed in `setAside`),
  `evaluationRun.test.ts` (`kept`), `summary.test.ts`, `dailyRun.test.ts`
  (order, no drafting, news gathered once, email and stdout share sentences),
  `dailyRun.budget.test.ts`, `run.test.ts` (the `api:` line still last),
  `runnerConfig.test.ts`, and the server prescreen route tests.
- Failure cases: the step that dismisses a not-promising ad can fail at the
  transition. That is an HTTP error from job-app and bubbles out like a
  `setPrescreen` failure. The existing `guarded('pre-screen')` turns it into
  "Pre-screening failed: …", and the other steps still run (test it). The ad
  keeps its verdict and stays where it was. The next run doesn't pick it up
  again (it has a verdict) and doesn't fetch it (not promising), so expiry
  dismisses it later. That's acceptable and stated in a comment. A
  `setPrescreen` on a `new` ad from a hand-over source isn't reachable (title
  rules move hand-over ads out of `new` in collect).
- Verification command: `npm test -- --maxWorkers=2`, `npm run lint` and
  `npm run build`. Then `npm run test:e2e:prod` after checking the ports
  (`ss -ltnp | grep -E '5173|3001|3002'`).

## Risks / rollback

- The pre-screen now dismisses ads, and a dismissed ad can't be brought back
  (`dismissed` has no transitions). A set-aside ad stays readable in the
  inbox's Dismissed filter, and the email carries its job-site link.
  Rollback is reverting the branch; ads already dismissed stay dismissed.
- Ending title blanking can't be undone for rows stored in the meantime. That
  is the point of the change, and it rests on the user's reading of
  Duunitori's terms (content means the ad text). If that reading changes,
  restore the blanking from this branch's history.
- Duunitori fetching rolls back as §9 says: set
  `sources.duunitori.fetch: "requested"`. Its pre-screen and set-aside
  listing still run, and only clicked ads get fetched. §9's "the pre-screen runs
  for hand-over sources only" and the "Retention" paragraph are updated to
  match.

---

**Next stage:** run `/sdlc`.
