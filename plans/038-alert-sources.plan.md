---
brief: brief/038-alert-sources.md
branch: 038-alert-sources
date: 2026-11-20
---

# Alert sources — Plan

Ads reach the pipeline only by hand today. This stream adds `npm run agent:collect`:
read job alert emails from a dedicated mailbox, parse them with one connector per
source, ingest the candidates, screen their titles, and fetch the public ad pages of
automatic sources through `PoliteHttp`. Contracts: `docs/job-search-agent.md`
sections 2, 3, 4 and 6.

Decided with the user (2026-11-20):

- **Mailbox:** a new Gmail account used only for job alerts. Each site's alert
  subscription moves to that address, with no forwarding. The runner reads it over
  IMAP (`imap.gmail.com:993`, TLS) with an app password. An iCloud alias was
  rejected because it delivers into the personal mailbox, and its app password
  opens all of it.
- **New dependencies (approved):** `imapflow` 2.12.1 (it ships its own types) and
  `mailparser` 3.14.5, plus `@types/mailparser` 3.9.0 as a dev dependency.
- **Default caps:** `dailyOpenCap` 20 and `minDelayMs` 15000, overridable per
  source.
- **Sources:** Academic Work, Valtiolle.fi and Nordea careers are automatic, and
  Duunitori is handover. **Kuntarekry is dropped**: it has no job-watch (alert)
  function and no sample emails. It moves to Out of scope, and the brief is amended
  in the plan commit: done-item 2, the open questions, and Out of scope gaining
  Kuntarekry. **Nordea careers is added** as an automatic source, under the same
  `termsCheckedOn` gate. If its terms rule out fetching, switching it to `handover`
  is a one-line change to its connector.
- **Samples:** the user puts real samples in `~/.config/job-agent/samples/<source>/`,
  outside the repo. For every source that means a few alert emails (`.eml`). For the
  three automatic sources it also means a few ad pages saved from the browser
  (`.html`). Parsers are written from these. Only synthetic fixtures that mimic their
  structure get committed.
- **Terms and feeds** (brief open questions 1–2) are the user's to check. They don't
  block the build: every source ships disabled, and an automatic source can't be
  enabled until `termsCheckedOn` is set. The alert email is assumed to be the only
  route. A feed found later becomes its own stream.

## Affected files

- `package.json`, `package-lock.json`: the three dependencies, and the
  `agent:collect` script (`node agent/runner/commands/collect.ts`).
- `agent/runner/lib/env.ts`: `loadMailEnv(path)` reads `MAIL_IMAP_HOST`,
  `MAIL_USERNAME` and `MAIL_PASSWORD` from the same env file, parsed but never
  loaded into `process.env`. A missing key is `CliError(2)`.
- `agent/runner/lib/runnerConfig.ts`: `loadSourcesConfig(path, connectors)`
  reads the `sources` key (see Contracts).
- `agent/runner/lib/mailbox.ts` (new): `openMailbox(env)` returns
  `{ uidValidity, messagesAfter(uid): AsyncIterable<AlertMessage>, close() }`.
  It opens INBOX read-only with `logger: false`, because runner commands print
  only results. It maps `simpleParser` output with `toAlertMessage(parsed, uid)`.
  Nothing is flagged, moved or deleted on the server.
- `agent/runner/lib/state.ts` (new): JSON files in `stateDir`, written atomically
  (temp file + rename). They are `mail-watermark.json`, `source-counters.json` and
  `source-failures.json` (shapes under Contracts).
- `agent/runner/lib/politeHttp.ts` (new): `createPoliteHttp({ sourceId, hosts,
  dailyOpenCap, minDelayMs, counters, fetch, now, sleep })`, with `fetch`, `now` and `sleep`
  injected for tests.
- `agent/runner/lib/sources/types.ts` (new): section 6's types, plus
  `AlertMessage` and the `PoliteHttp` interface.
- `agent/runner/lib/sources/html.ts` (new): `htmlToText(html)`, `linksOf(html)`
  and `jobPostingOf(html)` (see Work order 4). No dependency.
- `agent/runner/lib/sources/academicWork.ts`, `valtiolle.ts`, `nordea.ts`
  (automatic), `duunitori.ts` (handover), each with a test. `index.ts` holds
  `CONNECTORS`, the registry.
- `agent/runner/lib/sources/fixtures/*.html` (new): synthetic alert bodies and
  ad pages, with made-up employers and titles and no real ids.
- `agent/runner/lib/screen.ts` (new): `screenNewAds` and `ScreenCounts`, moved
  unchanged out of `evaluationRun.ts`, which now imports them. Collect and
  evaluate both screen.
- `agent/runner/lib/collectRun.ts` (new): `runCollect({ mailbox, jobApp,
  connectors, sources, titleRules, state, today, httpFor })` covers collect, then
  screen, then fetch, and returns a `CollectReport`.
- `agent/runner/commands/collect.ts` (new): wiring only, under `runCommand`. It
  needs no sandbox gate, because no `claude -p` runs.
- `agent/runner/lib/jobApp.ts`: adds `ingestAd(input)` (`POST /api/ads`, 201 or
  200). It adds `source` and `externalId` to the summary schema, and `body`,
  `company` and `deadline` to `AdTransition`.
- `agent/test/fakeJobAppAds.ts`: ingest support (an idempotent unique key) and
  the new transition fields.
- `agent/test/fakeMailbox.ts` (new): an in-memory `Mailbox`.
- `server/lib/adValidation.ts`, `server/lib/ads.ts`: a transition to `ready`
  accepts optional `company` and `deadline`. Each fills its column only while the
  stored value is empty, and `saveMove` writes `deadline`. This runs before the
  dedup rules, so a company that only the page names still feeds rule 3.
- `server/routes/ads.test.ts` (or the matching `server/lib` tests): cases for that.
- `brief/038-alert-sources.md`: amended in the plan commit (Kuntarekry out,
  Nordea careers in, and the open questions this plan settles marked as settled).
- `docs/job-search-agent.md`: Streams row 038 becomes `in progress` in the plan
  commit and `done` in the PR. The PR also adds the `MAIL_*` env keys and the
  `sources` key to §3, the `ready` transition's company/deadline to §4, and
  `AlertMessage` plus PoliteHttp's response classification to §6.
- `docs/architecture.md`, `README.md` (a new "Alert sources" section covering
  Gmail setup, the env keys, the `sources` config, samples and the terms check),
  and `CLAUDE.md` (the `agent:collect` command; the approved-dependency list
  gains `imapflow` and `mailparser`).

## Work order

0. **Precondition:** samples exist in `~/.config/job-agent/samples/<source>/` for
   all four sources: emails for each, and ad pages for the three automatic ones.
   The user has emails for all four; ad pages are saved by hand from the browser.
   If a source has none, stop and ask the user. Don't write that
   parser from guesses.
1. Dependencies and env: install the three packages at the exact versions above,
   then `loadMailEnv` + test.
2. Sources config: `loadSourcesConfig` + tests (shape and refusals under
   Contracts).
3. Types and `PoliteHttp` + tests. Behaviour:
   - `get(url)` refuses any non-`https` URL or a host not in `hosts` with
     `{ kind: 'failed', category: 'bad_host' }`, before any request.
   - Redirects use `redirect: 'manual'`. Each `Location` gets the same check
     (`bad_redirect`), with at most 3 hops.
   - Request headers are exactly `User-Agent: job-agent/1.0 (personal job alert
     reader)` and `Accept: text/html`. No cookies, auth or contact address.
     Timeout is `AbortSignal.timeout(30000)`.
   - Every HTTP request, redirect hops included, waits until `minDelayMs` has
     passed since this source's previous one.
   - An opened ad counts once against `dailyOpenCap`. The counter is incremented
     and persisted *before* the request, so a crash never undercounts.
   - Responses: 2xx → `{ kind: 'page', html }`. 401, 403, 429 and 503 →
     `blocked`, which marks the source blocked for today in the counters, and every
     later `get` returns `blocked` without a request. 404/410 → `gone`. Other
     statuses → `failed: http_error`. Network error or timeout → `failed: network`.
   - `dayEnded` is true once the cap is reached or the source is blocked.
4. `html.ts` + tests: `htmlToText` drops `script`, `style` and `head`, turns block
   elements and `br` into line breaks, strips tags, and decodes named and numeric
   entities. It collapses runs of blank lines and trims. `linksOf` returns
   `{ href, text }` per `<a>`, entity-decoded. `jobPostingOf` returns the first
   JSON-LD `JobPosting` (`description` as text, `hiringOrganization.name`,
   `validThrough` as `YYYY-MM-DD`), or null.
5. Connectors: read the samples first. For each source, record in a comment at
   the top of its file what identifies its alerts (sender domain, subject) and
   where the ad id and title sit. Then write `matches`/`parseAlert` (and for
   automatic sources `fetchAd`) with a synthetic fixture test each. Rules:
   - Never follow a click-tracking link. If an alert links only through a tracker,
     derive the ad URL from the id or a target parameter in the email, as the
     samples show. If that isn't possible, the connector can't be automatic: stop
     and ask.
   - `parseAlert` drops any candidate whose URL is not `https` on the source's own
     hosts. Duunitori keeps only `duunitori.fi` links.
   - A matched email with an unrecognised structure returns `[]`; it doesn't throw.
   - `deadline` is `YYYY-MM-DD` or omitted. `externalId` is the site's ad id.
   - `fetchAd` returns `ok` with `htmlToText` output, plus company and deadline
     when the page names them, preferring `jobPostingOf` when the page has one. A
     page with no ad text is `failed: no_ad_text`. A "this ad has closed" page,
     where the samples show one, is `gone`.
   - `fetchHosts` are the exact public hosts the samples show.
6. Server: the `ready` transition's `company`/`deadline` fill + tests.
7. Client: `jobApp.ts` additions + fake updates.
8. `screen.ts` move (`evaluationRun` tests stay green, unchanged), then
   `runCollect` + tests. Flow:
   - Collect: read messages after the watermark in UID order. If `uidValidity`
     changed, restart from UID 0; ingest is idempotent. Each message goes to the
     first *enabled* connector whose `matches` is true. Each candidate is ingested
     with `source = connector.id` and `sourceMode = connector.mode`. Only after
     all of a message's candidates are ingested does the watermark advance to its
     UID, persisted per message. A message matching no enabled connector advances
     the watermark too: a disabled source doesn't backfill when switched on. A
     matched message yielding zero candidates is counted and recorded as an
     `empty_alert` source failure.
   - Screen: `screenNewAds`.
   - Fetch: each enabled automatic source in parallel, each one's ads
     sequentially, oldest first, from `listAds('new')` filtered by `source`.
     Stop when `http.dayEnded`.
     - `ok` → transition to `ready` with `body`, `company` and `deadline`.
     - `gone` → `failed` with error `gone`.
     - `failed` → same-state `{ to: 'new', error: category }`.
     - `blocked` → no transition, and a `blocked` source failure is recorded once
       per source per day.
9. `commands/collect.ts`: load config, sources, env, mailbox and job-app client.
   It always closes the mailbox, and prints the report: per source, messages,
   candidates (new/existing), empty alerts and fetch outcomes, plus a screened
   line and ads left `new`.
10. Docs: `docs/job-search-agent.md`, `docs/architecture.md`, `README.md` and
    `CLAUDE.md` as listed above.

## Contracts

Fixed by this plan (written into `docs/job-search-agent.md` §3/§6 in step 10):

- **Connector ids:** `academicwork`, `valtiolle`, `nordea`, `duunitori`.
- **`sources` config:**
  `{ "<id>": { "enabled": bool, "termsCheckedOn"?: "YYYY-MM-DD", "dailyOpenCap"?: int ≥ 1 (20), "minDelayMs"?: int ≥ 1000 (15000) } }`.
  A source missing from config is disabled.
- **Config refusals (exit 2, one stderr line):**
  - an unknown id;
  - an enabled automatic source with no `termsCheckedOn`
    (`sources.<id>: termsCheckedOn is required to enable an automatic source`);
  - no source enabled. The command then reads no mail, so no watermark moves
    past emails nobody parsed.
- **State files** in `~/.local/state/job-agent/`:
  - `mail-watermark.json`: `{ uidValidity, lastUid }`.
  - `source-counters.json`: `{ date: "YYYY-MM-DD" (local), opened: { <id>: n }, blocked: [<id>] }`,
    reset when the date changes.
  - `source-failures.json`: `[{ source, date, kind: 'blocked' | 'empty_alert' }]`.
    038 appends; `039-daily-run` reports and clears.
- **`AlertMessage`:**
  `{ uid: number, from: string (lowercased address), subject: string, date: string (ISO), html: string, text: string }`.
- **Errors:** an unreachable mailbox or a failed IMAP login is `CliError(1, "cannot
  reach mailbox at <host>")` or `"mailbox login failed: check MAIL_USERNAME and
  MAIL_PASSWORD in <envPath>"`. A job-app failure during ingest propagates as it
  does today (exit 1), and the watermark stays before that message. A per-ad fetch
  failure is never a command failure. It becomes an ad transition or a source
  failure record.

## Tests

- New:
  - `env.test.ts` (mail keys).
  - `runnerConfig.test.ts` (`sources`: defaults, unknown id, terms refusal,
    handover without terms allowed, none enabled).
  - `politeHttp.test.ts`, using a fake fetch and a recorded sleep:
    - host and scheme refusal with no request made;
    - redirect onto a foreign host refused, and the 3-hop limit;
    - exact headers, with no `Cookie` or `Authorization`;
    - the delay applied between requests and redirect hops;
    - cap reached → `dayEnded` and no request;
    - the first `blocked` ends the day, even across a new `createPoliteHttp`
      the same day;
    - counters reset on a new date;
    - the status classification table.
  - `html.test.ts`.
  - One test per connector, using synthetic fixtures only:
    - `matches` true and false;
    - candidates parsed;
    - foreign-host and tracker links dropped;
    - unknown structure → `[]`;
    - `fetchAd` ok, gone, and `no_ad_text`.
  - `mailbox.test.ts`: `toAlertMessage` over `simpleParser` of a synthetic
    multipart `.eml` string with a quoted-printable, non-ASCII body. Offline.
  - `collectRun.test.ts`, against `fakeMailbox` and `fakeJobAppAds`:
    - the watermark advances per message;
    - an ingest failure stops the run with the watermark unmoved;
    - a disabled source is not ingested but its message is passed;
    - a `uidValidity` change rescans;
    - a blocked source leaves its ads `new` with `attempts` 0 and the other
      source keeps fetching;
    - `gone` → `failed` with `gone`;
    - `failed` → attempt recorded;
    - an empty alert is recorded;
    - Duunitori ads → `awaiting_handover` with no request made.
- Updated:
  - `jobApp.test.ts` (ingest 201/200, new fields).
  - Server ads tests: `ready` with company/deadline fills empty fields only,
    leaves set fields alone, and dedup rule 3 sees the filled company.
  - `evaluationRun.test.ts` unchanged and green after the move.
- Failure cases:
  - mailbox unreachable or login rejected → exit 1, one line, watermark unmoved;
  - env key missing or a config refusal → exit 2;
  - job-app down mid-ingest → exit 1, watermark at the last fully ingested
    message;
  - per-ad `blocked`/`gone`/`network`/`http_error`/`bad_host`/`bad_redirect`/
    `no_ad_text` → the ad transitions above, and the command exits 0.
- Verification command: `npm test -- --maxWorkers=2`, `npm run lint`,
  `npm run build`.
- Manual, in Stage 4 and only with the user's go-ahead, since it writes to the
  real job-app and contacts real sites: `npm run agent:collect` with only
  `duunitori` enabled (no page fetch) shows ingested ads reaching
  `awaiting_handover`. An automatic source is tried only once the user has
  recorded its `termsCheckedOn`.

## Departures during the build

- `loadSourcesConfig` takes the connectors' `{ id, mode }`, not just their ids:
  the terms refusal needs each source's mode.
- `createPoliteHttp` also takes `now`, so the delay tests are exact.
  `runCollect` takes `today`, the date that failure records carry.
- When the cap is reached, `get` answers `failed: daily_cap` without a request.
  `runCollect` checks `dayEnded` before each ad, so it never sees that answer.
- A state file that doesn't parse or has the wrong shape is exit 2
  (`<path>: not a valid state file; fix or delete it`).
- **Valtiolle.fi's ad text comes from the page's `<article>`, not from the
  JSON-LD description.** The description leaves out the requirements, the
  offer, the contacts and the locations. Company and deadline still come
  from the `JobPosting`. Academic Work and Nordea careers pages carry no
  JSON-LD, so each connector cuts its ad from the page markup. Valtiolle's
  alert links go only through Mailjet's tracker. The target URL sits
  base64url-encoded in the tracker path, so the connector decodes it from
  the email and never requests the tracker.
- Duunitori's alert dates have no year. The connector takes the next such
  date on or after the alert's own date. It also ignores the "Näitkö jo
  nämä?" recommendations that follow the matched ads.
- A rejected login is tested at the unit level (`connectError`), since no fake
  IMAP server exists. Unreachable is also tested end to end, against a closed
  local port.
- No sample shows a closed-ad page for any automatic source, so a closed ad
  is `gone` only through a 404 or 410.

## Risks / rollback

- Alert and page templates change without notice. Parsers return `[]` rather than
  throw, and `empty_alert` records make a change visible once `039` reports them.
- Gmail app passwords need 2FA on the dedicated account, and Google may revoke
  them. Login failure is one actionable line.
- Rollback: disable the sources in config. The code change is additive apart
  from the server's optional `ready` fields, which are backward compatible.

---

**Next stage:** run `/sdlc`.
