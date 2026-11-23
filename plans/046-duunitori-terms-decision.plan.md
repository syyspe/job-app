---
brief: brief/046-duunitori-terms-decision.md
branch: 046-duunitori-terms-decision
date: 2026-11-23
---

# Duunitori: user-triggered fetch, a pre-screen, and a switch to automatic — Plan

## Context

Duunitori ads wait in `awaiting_handover` until the user pastes the ad text,
because of 033's "never fetched" ruling. The user chose option (a), a Fetch
click per ad, with a config switch to (b), automatic fetching, to flip once a
model pre-screen proves good enough. Planning settled the brief's gate and
open questions:

- **Terms gate, read 2026-11-23.** The terms at
  https://duunitori.fi/compliance/kayttoehdot are still "Päivitetty 13.
  marraskuuta 2026". They forbid "tallentaa, arkistoida, skrapata tai muutoin
  järjestelmällisesti kopioida Palvelun sisältöä tai olennaista osaa siitä,
  paitsi siltä osin kuin se on teknisesti välttämätöntä Palvelun valtuutettua
  käyttöä varten". They also forbid systematic linking or embedding in another
  service, and making the content available to the public. They expressly
  allow "tavallisia linkkejä Palvelun julkisesti saatavilla oleville sivuille",
  with individual ads as the example. Bots, AI and agents are not mentioned.
  There is no ban on a user-triggered fetch.
- **robots.txt, read 2026-11-23.** `User-agent: *` → `Disallow: /`. Named
  groups (search bots, plus the user-triggered fetchers Claude-User,
  ChatGPT-User, Perplexity-User and MistralAI-User) may read
  `/tyopaikat/tyo/<ad>`, except the `lisaa_suosikkeihin`,
  `poista_suosikeista`, `samanlaiset` and `somegroups*` paths. The runner's
  honest `job-agent/1.0 (personal job alert reader)` falls under `*`. **The
  user decided to build (a) and (b) as briefed.** Their reading is that `*` is
  a crawler rule and that the allowed `*-User` agents show Duunitori tolerates
  user-triggered fetches. The User-Agent stays honest: the runner never claims
  to be one of the named agents.
- **The alerts carry no description.** None of the three saved real alerts
  (`~/.config/job-agent/samples/duunitori/`) has a description. Each card
  gives only the title and "Company, City - Hakuaika D.M - D.M.". The
  pre-screen therefore judges **title, company, location and deadline**. It is
  a sandboxed, gated `claude -p` step with the private prompt
  `prompts/prescreen.md`.
- **The ad page** carries a single top-level JSON-LD `JobPosting` with
  `description`, `validThrough` (ISO with offset) and
  `hiringOrganization.name` (a lowercase slug, e.g. "nordea"). So
  `jobPostingOf` (`agent/runner/lib/sources/html.ts`) is the extractor as it
  stands. The slug company never overwrites the email's, because page fields
  fill only empty columns.

Decisions on the brief's other open questions:

- **Fetch request.** A nullable `fetch_requested_at` column, not a new state.
  The ad stays `awaiting_handover`. The column is never cleared, so "did I
  click Fetch" survives as the record the verdict is compared against.
- **Pre-screen verdicts.** `promising` or `not_promising`, plus a reason of at
  most 300 characters. An `unsure` model answer is stored as `promising`, as
  in evaluation. The pre-screen runs for **hand-over sources only**, because
  automatic ads are fetched during collect, before any model step.
- **Switch.** `sources.<id>.fetch: "requested" | "automatic"`, default
  `"requested"`. It is read only for hand-over connectors that have a
  `fetchAd`, which today means Duunitori.

## Affected files

Server
- `server/db/index.ts`, `server/lib/migrations.ts` — `migrateAdFetch`: adds
  `prescreen TEXT` and `fetch_requested_at TEXT` to `ads`, idempotent like the
  others; the `CREATE TABLE` gets both columns.
- `server/types.ts` — `AdPrescreen {verdict, reason}`;
  `AdSummary` gains `prescreen: AdPrescreen | null`, `fetchRequestedAt: string | null`.
  `src/types.ts` gets the same in the client step (6): the new required
  fields break the client test fixtures that 045 also edits.
- `server/models/ad.ts` — row fields and mapping.
- `server/lib/adStates.ts` — `awaiting_handover` → `failed` allowed;
  `awaiting_handover` joins `ATTEMPT_STATES`. Retry is unchanged
  (handover → `awaiting_handover`).
- `server/lib/ads.ts` — `requestFetch(db, ad)`: 409 unless the ad is
  `awaiting_handover` with `source_mode = 'handover'`. Idempotent: a repeat
  keeps the first timestamp. `setPrescreen(db, ad, prescreen)`: 409 unless the
  ad is `awaiting_handover`. The blanking in `movedRow`/`markOneReported` also
  empties `prescreen.reason` but keeps `verdict`, because the reason talks
  about the ad and the verdict is what the comparison needs.
- `server/lib/adValidation.ts` — `parseAdPrescreen`: verdict enum, and a
  string reason of 1–300 characters, otherwise 400.
- `server/routes/ads.ts` — `POST /api/ads/:id/fetch-request` (no body → the
  ad) and `POST /api/ads/:id/prescreen` (`{verdict, reason}` → the ad).

Runner
- `agent/runner/lib/sources/duunitori.ts` — `fetchHosts: ['duunitori.fi']`,
  `fetchAd: (c, http) => fetchAdPage(c.url, http, jobPostingOf)`. The mode
  stays `handover`. The header comment is rewritten to match.
- `agent/runner/lib/sources/fixtures/duunitori-page.html` — a synthetic ad
  page with a JSON-LD JobPosting and related-job noise.
- `agent/runner/lib/fetchOutcome.ts` (new) — `applyFetch` and `recordBlocked`,
  moved out of `collectRun.ts`. A failure records a same-state attempt with
  `to: ad.state`, so it serves `new` and `awaiting_handover` alike.
- `agent/runner/lib/collectRun.ts` — imports them; no behaviour change.
- `agent/runner/lib/runnerConfig.ts` — `sourceSchema.fetch` enum with default
  `requested`; `termsCheckedOn` is required for every enabled connector **with
  a `fetchAd`**, not only automatic ones, with the message `termsCheckedOn is
  required to enable a source that fetches`. New `prescreen` key in
  `runnerConfigSchema`: `{concurrency 1–8 (4), perRunCap ≥1 (40), timeoutMs ≥1 (120000)}`.
- `agent/runner/lib/prescreen.ts` (new) — output schema, `PRESCREEN_PROMPT`,
  `PRESCREEN_FRAMING`, `prescreenInput(ad)` (title, company, location,
  deadline as JSON), and `prescreenAd(ad, runStep)` → `{kind:'screened', prescreen}`
  or `{kind:'failed', category}`, modelled on `evaluate.ts`.
- `agent/runner/prompts/prescreen.framing.md`, `prescreen.example.md` (new) —
  the framing marks the input as untrusted, says it holds only title, company,
  location and deadline, and says to answer `unsure` when in doubt. The
  example file holds synthetic criteria.
- `agent/runner/lib/prescreenRun.ts` (new) — the `awaiting_handover` ads of
  hand-over sources with `prescreen === null`, oldest first, up to
  `perRunCap`, through `mapLimit`. Success posts `/prescreen`. A failure moves
  and counts nothing, and the ad is retried next run, until expiry. Returns
  `{screened: {promising, notPromising}, failed, queued, ads}`, the ads as
  `/prescreen` answered, so the summary shows them even if a later step in the
  run blanks them.
- `agent/runner/lib/handoverFetchRun.ts` (new) — for each enabled hand-over
  connector with a `fetchAd`, the `awaiting_handover` ads of that source,
  oldest first. With `fetch: requested` it takes the ads with
  `fetchRequestedAt`. With `automatic` it takes those plus the ones whose
  verdict is `promising`. Each is fetched through `httpFor(connector)` and
  `applyFetch`, stopping on `dayEnded`. Returns per-source `FetchOutcome`
  counts.
- `agent/runner/lib/jobApp.ts` — schema gains `prescreen` and
  `fetchRequestedAt`; new `setPrescreen(id, prescreen)` and `listAllAds()`
  (`GET /api/ads`).
- `agent/runner/lib/handoverExpiry.ts` — `handoverExpired`: an ad with
  `fetchRequestedAt` ignores `waitDays` and waits until its deadline, so a
  click on day 7 isn't dismissed before the run that fetches it. New
  `dismissExpiredText`: hand-over ads in `ready` or `suitable` whose deadline
  has passed move to `dismissed`, which clears the body and blanks. The
  existing step calls both and reports one count.
- `agent/runner/lib/dailyRun.ts` — model steps become sync → **pre-screen →
  hand-over fetch** → evaluate → draft. Each is `guarded`, and the report
  gains `prescreen` and `handoverFetch`. The fetch sits inside the model
  steps on purpose: text is fetched only in a run that can evaluate it the
  same day. `sendSummary` passes the run's newly pre-screened ads and the
  14-day tally to `composeSummary`. Newly pre-screened ads make the summary
  non-empty.
- `agent/runner/lib/summary.ts` — a section "Pre-screened (n)" with one line
  per newly pre-screened ad: `title, company: promising|not promising — reason`.
  Then one line `Pre-screen vs. Fetch, last 14 days: promising N (fetched X),
  not promising M (fetched Y)`, counted over hand-over ads with a prescreen
  first seen in the last 14 days, where "fetched" means `fetchRequestedAt` is set.
- `agent/runner/commands/run.ts` — loads `prompts/prescreen.md`, wires
  `prescreen` and `handoverFetch` options, prints their report lines.
- `agent/test/` fakes (`fakeSources.ts`, any fake job-app client) — the new
  client methods and fields.

Client
- `src/lib/api.ts` — `requestFetch(id)`.
- `src/components/AdRow.tsx` — on an `awaiting_handover` hand-over row
  without `fetchRequestedAt`: a primary **Fetch** button, with Hand over kept
  beside it. With `fetchRequestedAt` the button is replaced by
  "Fetch requested — the next run fetches it". Any row with a prescreen shows
  `Pre-screen: Promising|Not promising — <reason>` in an `ad-prescreen`
  paragraph, plus "Fetch requested" when it was clicked, so the pairing stays
  visible after the ad moves on.
- `src/components/AdsView.tsx` — an `onFetch` action ("Fetch requested" toast).
- `src/components/ads.css` — `.ad-prescreen`, muted text from the
  `index.css` tokens, like `.ad-fit`. No new colours.
- `mcp/tools/ads.ts` — check that the new fields pass through; change it only
  if it maps fields explicitly.

Docs
- `docs/job-search-agent.md` — a new "Duunitori decision (046)" section that
  replaces the 033 ruling. It records the terms date and quotes, the
  robots.txt finding and the user's reading of it, the brief's reasoning,
  where fetching would start to look like scraping, and the retention rules.
  §3 config (`fetch`, `prescreen`, the `termsCheckedOn` rule), §4 (columns,
  transitions, attempts from `awaiting_handover`, both expiry rules), §5 (two
  routes) and §6 ("a hand-over connector may have `fetchAd`; it is fetched
  only on request or by the switch") are updated, and the diagram's step 3
  line too.
- `docs/architecture.md`, `README.md` ("Alert sources", "Ad evaluation", "Daily
  run": `prescreen.md`, the switch, the `termsCheckedOn` requirement),
  `CLAUDE.md` (the `agent:run` line names `prompts/prescreen.md`).

## Work order

1. Docs: the Duunitori decision section and the §3–§6 contract changes in
   `docs/job-search-agent.md`. Commit.
2. Server: migration, types, model, states, `requestFetch`/`setPrescreen`,
   validation, routes, with tests. Commit.
3. Runner, sources: the Duunitori `fetchAd` with its page fixture, the
   `fetchOutcome.ts` extraction, and the config changes, with tests.
4. Runner, model steps: `prescreen.ts`, its prompts, `prescreenRun.ts`,
   `handoverFetchRun.ts`, the expiry changes, `dailyRun.ts`, `summary.ts`,
   `run.ts` and the `jobApp.ts` client, with tests. Commit.
5. **Wait for `045-inbox-hide-closed` to merge, then `git rebase master`.**
6. Client: `api.ts`, `AdRow`, `AdsView`, `ads.css`, with tests; MCP check.
   Commit.
7. README, architecture, CLAUDE.md. Commit.
8. Tell the user to set `sources.duunitori.termsCheckedOn: "2026-11-23"` (the
   date of this plan's reading) and to copy `prescreen.example.md` to
   `~/.config/job-agent/prompts/prescreen.md` with their own criteria. Until
   then `agent:run` exits 2 with an enabled Duunitori. Don't edit
   `~/.config/job-agent/` without asking.

## Parallel streams

- `045-inbox-hide-closed`: both change `AdRow.tsx`, `AdsView.tsx`, and
  possibly `src/lib/adStates.ts`. **Sequence:** steps 1–4 go ahead now. The
  client step (6) waits until 045 has merged and this branch is rebased onto
  master (step 5), so it builds on 045's filter and title label rather than
  conflicting with them.
- `inbox-redesign` (not started) depends on this stream: the page now also
  shows the Fetch-requested marker and pre-screen verdicts.

## Tests

- New, server: `ads.fetch.test.ts`, which covers fetch-request from
  `awaiting_handover` (200, timestamp set, repeat keeps it), from another
  state (409), on an automatic ad (409) and on another user's ad (404).
  Prescreen: valid (200), from another state (409), bad verdict or empty or
  over-long reason (400). Transitions: `awaiting_handover` → `failed` with an
  error, a same-state attempt and the third attempt → `failed`. Blanking
  empties the reason and keeps the verdict. `migrations.test.ts`: the new
  migration is idempotent on an old table.
- New, runner: `prescreen.test.ts` (input fields, unsure → promising, invalid
  output → `invalid_result`), `prescreenRun.test.ts` (only hand-over
  `awaiting_handover` with no prescreen, oldest first, the cap, a failure
  posting nothing), `handoverFetchRun.test.ts` (requested mode fetches only
  clicked ads; automatic mode adds promising ones; it stops on `dayEnded`; a
  connector without `fetchAd` is skipped), `fetchOutcome.test.ts` (the
  same-state attempt from `awaiting_handover`).
- Updated: `duunitori.test.ts` (no longer "never fetches"; `fetchAd` on the
  fixture gives body and deadline, keeps the email's company, page without
  JSON-LD → `no_ad_text`), `runnerConfig.test.ts` (`fetch` default and enum;
  an enabled Duunitori without `termsCheckedOn` → exit 2), `handoverExpiry.test.ts`
  (requested ad survives `waitDays` until its deadline; ready/suitable
  hand-over ads past the deadline are dismissed; automatic ones untouched),
  `dailyRun.test.ts` (step order; gate failure → no pre-screen, no fetch),
  `summary.test.ts` (section, tally, control characters cleaned),
  `collectRun.test.ts` (unchanged behaviour after the extraction),
  `AdRow.test.tsx`/`AdsView.test.tsx` (Fetch button by role, requested text,
  verdict line, toast), `mcp/tools/ads.test.ts` if it changes.
- Failure cases:
  - `POST /fetch-request`: 404 for an unknown or unowned ad; 409 `an ad cannot
    be fetched from <state>`; 409 for an automatic ad.
  - `POST /prescreen`: 400 for a bad verdict or reason; 404; 409 from a state
    other than `awaiting_handover`.
  - Pre-screen step: `timeout`, `cli_failed`, `bad_output` and
    `invalid_result` leave the ad unscreened and are counted as failed in the
    report.
  - Fetch: `blocked` (no attempt; the day ends and a source failure is
    recorded), `gone` → `failed: gone`, any other failure → a same-state
    attempt, with the third → `failed`.
  - Config: `termsCheckedOn` missing for a fetching source, or a bad `fetch`
    value → one stderr line, exit 2.
  - Prompt file missing → the existing `readConfigFile` exit 2.
- Verification command: `npm test -- --maxWorkers=2`, `npm run lint`,
  `npm run build`, then `npm run test:e2e` after checking that ports
  5173/3001 are free (`ss -ltnp | grep -E '5173|3001|3002'`), or
  `test:e2e:prod`.

## Risks / rollback

- The migration only adds nullable columns. Rolling back the code leaves them
  unused and harmless.
- Fetching goes against robots.txt's `*` rule, as the user decided and the
  doc records. The exposure is bounded by `dailyOpenCap` and `minDelayMs`, by
  the stop on the first block, and by fetching only the alert's own ad URL.
  The `automatic` switch is off by default. Rollback: set `fetch: requested`
  (stops automatic fetching) or disable the source.

---

**Next stage:** run `/sdlc`.
