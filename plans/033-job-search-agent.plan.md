---
brief: brief/033-job-search-agent.md
branch: 033-job-search-agent
date: 2026-11-18
---

# Daily job search agent: contracts and stream briefs — Plan

## Context

The feature is too large for one stream. This stream records the contracts the
pieces share and commits one brief per implementation stream. It changes no
application code. Stage 3 writes the documents below, using the decisions in
this plan as their content.

## Affected files

- `docs/job-search-agent.md` — new. The cross-stream contracts: everything
  under "Decisions to record".
- `brief/034-ad-inbox.md` — new.
- `brief/035-profile-corpus.md` — new.
- `brief/036-ad-evaluation.md` — new.
- `brief/037-application-drafts.md` — new.
- `brief/038-alert-sources.md` — new.
- `brief/039-daily-run.md` — new.

## Work order

1. Write `docs/job-search-agent.md` from "Decisions to record". Open it with
   the pipeline diagram and a note on the two places it refines brief 033:
   fan-out is parallel `claude -p` processes rather than subagents, and the
   timer is on the Windows side.
2. Write the six briefs from `brief/TEMPLATE.md` using "Stream briefs". Each
   links to the contract sections it depends on instead of copying them, and
   names the streams before and after it under Related streams.
3. Check that every "finished feature" item and every open question in brief
   033 is assigned to a stream.
4. Commit the documents together.

## Decisions to record

### 1. Pipeline and runtime

A plain Node runner in a new top-level `agent/` directory is what the timer
starts. It speaks HTTP to the job-app API as `mcp/` does and opens no database.

| Step | Done by | Model involved |
|---|---|---|
| Collect alerts, fetch public ad pages | runner + connectors | no |
| Screen titles by rules | runner | no |
| Evaluate an ad | `claude -p` | yes, read-only |
| Write a draft | `claude -p` | yes, read-only |
| Save the draft to job-app | runner | no |
| Send the summary email | runner | no |

Fan-out: the runner starts one `claude -p` per ad, with a configured
concurrency limit. Each ad gets a fresh process, so one hostile ad cannot
influence the judgement of another.

### 2. Agent permissions

| Capability | Runner | `claude -p` steps | Profile search tool |
|---|---|---|---|
| Mail read and send | yes | no | no |
| Job-app credentials and writes | yes | no | no |
| Network or web tools | public ad pages only | no | the configured Ollama endpoint only |
| Shell, file write | runner's own state only | no | no |
| Profile search | no | yes | its local index only |
| Untrusted ad text | passes it through | reads it as data | no |

Every `claude -p` step must:

- have no built-in tools and only the `search_profile` MCP tool, using
  `--strict-mcp-config` so the user's other connectors do not load;
- run in an empty working directory, loading no user or project settings;
- inherit an allowlisted environment that contains no job-app or mail secret;
- return one JSON object checked against `--json-schema`, which the runner
  validates again before acting on it;
- not use `--bare`, which does not read the subscription login.

`036-ad-evaluation` proves these properties with a test before any real ad is
processed, and settles the exact flags against the installed CLI.

The summary recipient is fixed in private config. No value from an ad or a
model response can select a recipient, URL to fetch, file path or status. The
runner only ever creates applications with status `draft` and has no code path
that submits an application.

### 3. Private configuration

The repository is public, so nothing personal enters it: no CV text, voice
rules, title rules, addresses or real alert emails. Test fixtures are
synthetic.

| Path | Holds |
|---|---|
| `~/.config/job-agent/env` (mode 600) | Mail and job-app secrets |
| `~/.config/job-agent/config.json` | Recipient, source switches, caps, title rules, corpus paths, file name prefix, Ollama URL and embedding model |
| `~/.config/job-agent/prompts/` | Headless evaluation and drafting rules adapted from the three job application skills |
| `~/.local/state/job-agent/` | Run lock, mail watermarks, daily counters, unreported source failures, logs |
| `~/.local/share/job-agent/` | Profile index |

### 4. Ad inbox data

New table `ads`, scoped by `user_id` like `applications`:

| Column | Notes |
|---|---|
| `id`, `user_id` | `user_id` cascades on user deletion |
| `source`, `external_id` | `UNIQUE (user_id, source, external_id)`; the id falls back to the canonical URL |
| `url`, `canonical_url` | |
| `title`, `company`, `location`, `deadline` | Text, empty when unknown |
| `state` | See below |
| `body` | Nullable ad text |
| `evaluation` | Nullable JSON: `verdict`, `fitSummary`, `reasons` |
| `application_id` | Nullable, `ON DELETE SET NULL`, so deleting a draft does not recreate it |
| `duplicate_of` | Nullable ad id |
| `attempts`, `last_error` | Retry bookkeeping; `last_error` is a fixed category, never ad text |
| `first_seen_at`, `updated_at`, `reported_at` | UTC; `reported_at` is null until a summary covers the latest outcome |

States, lowercase like every other value in the app:

| State | Meaning | `body` |
|---|---|---|
| `new` | Collected, title screening or fetch pending | empty |
| `awaiting_handover` | Title passed on a hand-over source; waits for the user | empty |
| `ready` | Full text present, awaiting evaluation | kept |
| `suitable` | Passed evaluation, awaiting a draft | kept |
| `drafted` | Application created (terminal) | cleared |
| `title_rejected` | Failed title rules | cleared |
| `unsuitable` | Failed evaluation (terminal) | cleared |
| `duplicate` | Same ad as an earlier ad or application (terminal) | cleared |
| `dismissed` | The user discarded it (terminal) | cleared |
| `failed` | Three attempts failed | cleared |

Allowed transitions; the server answers anything else with 409:

- `new` → `title_rejected`, `awaiting_handover`, `ready`, `duplicate`, `failed`, `dismissed`
- `awaiting_handover` → `ready`, `dismissed`
- `title_rejected` → `ready` (the user hands the ad over anyway)
- `ready` → `suitable`, `unsuitable`, `duplicate`, `failed`, `dismissed`
- `suitable` → `drafted`, `failed`, `dismissed`
- `failed` → `new` or `awaiting_handover`, by the connector's mode (user retry)

An unsure evaluation counts as `suitable`, and the doubt becomes a question in
the draft. A block or rate-limit response does not count as an attempt: the ad
stays `new` for the next run.

For a hand-over source, `title` and `company` are blanked once the ad is
terminal and reported, leaving only the keys needed for deduplication. This
keeps stored Duunitori content to what the review needs.

**Deduplication**, applied by the server, in order:

1. The unique key: ingesting a known ad returns the existing row.
2. Canonical URL matches another ad or any application's `link`, archived
   included. Canonical means lowercase host, no fragment, no tracking
   parameters, no trailing slash.
3. Normalised company and title match another ad from the last 90 days or any
   application's company and role. Rerun when `ready` if the company was
   unknown at ingest.

### 5. Inbox API

All routes sit behind `requireSession` and follow the existing error contract.

| Route | Purpose |
|---|---|
| `GET /api/ads?state=` | List, without `body` |
| `GET /api/ads/:id` | One ad with `body` |
| `POST /api/ads` | Idempotent ingest: 201 new, 200 existing |
| `POST /api/ads/:id/transition` | `{to, body?, evaluation?, error?}`; 409 if not allowed |
| `POST /api/ads/:id/handover` | `{text, url?, title?, company?}`; moves the ad to `ready` |
| `POST /api/ads/:id/draft` | Atomic draft creation, see below |
| `POST /api/ads/reported` | `{ids}`; sets `reported_at` after the email is accepted |

`POST /api/ads/:id/draft` is multipart: application fields plus the three
files. In one transaction it creates the application with server-fixed status
`draft`, stores the attachments, sets `application_id` and moves the ad to
`drafted`. A second call answers 409, so a retry cannot produce a second draft.
`034-ad-inbox` builds everything here except this route, which
`037-application-drafts` adds.

### 6. Source connector interface

```ts
type SourceMode = 'automatic' | 'handover'

interface AdCandidate {
  externalId: string
  url: string
  title: string
  company?: string
  location?: string
  deadline?: string
}

type FetchResult =
  | { kind: 'ok'; text: string; company?: string; deadline?: string }
  | { kind: 'gone' }
  | { kind: 'blocked' }
  | { kind: 'failed'; category: string }

interface SourceConnector {
  id: string
  mode: SourceMode
  matches(message: AlertMessage): boolean
  parseAlert(message: AlertMessage): AdCandidate[]
  fetchAd?(candidate: AdCandidate, http: PoliteHttp): Promise<FetchResult>
}
```

- Connectors do no I/O except through `PoliteHttp`, which the runner supplies.
  It enforces the daily cap and pauses, sends no credentials, and ends that
  source's day on the first `blocked`.
- A `handover` connector has no `fetchAd`. Duunitori is `handover`.
- Each source's config is `{enabled, termsCheckedOn, dailyOpenCap, minDelayMs}`.
  The runner refuses to enable an automatic source with no `termsCheckedOn`.

### 7. Draft format

Model output, validated by the runner:

```json
{
  "language": "fi | en",
  "applicationType": "portal | email",
  "fitSummary": "string",
  "coverLetter": "string",
  "cv": "string",
  "questions": [{ "id": "q1", "text": "string" }]
}
```

- **Questions.** Anything only the user can answer appears in the text as
  `[[ASK:q1]]` and in `questions`. The runner rejects output where the markers
  and the list differ.
- **Facts.** The CV starts from the master template for the language. Facts
  come from sources labelled `facts`. Sources labelled `style` never supply a
  fact. Motivation is always a question.
- **Application fields.** `status` `draft`, empty `dateApplied`, `link` the ad
  URL, `deadline` from the ad, and `notes` holding the fit summary, the open
  questions and the source.
- **Attachments.** All `.txt`, all stored in job-app only. The agent never
  writes to the applications folder.

| File | Name |
|---|---|
| Cover letter (FI) | `<prefix>_Hakemus_<Company>_FI.txt` |
| Cover letter (EN) | `<prefix>_CoverLetter_<Company>_EN.txt` |
| CV | `<prefix>_CV_<Company>_<FI\|EN>.txt` |
| Saved ad | `<Company>_<Role>_ilmoitus.txt` or `_ad.txt`, with a header of source URL, apply URL or email, and saved date |

An email application's cover letter file holds the recipient, subject,
attachment name and body. PDFs are never rendered by the agent.

### 8. Profile corpus and embeddings

- Embeddings come from the Ollama service on the user's other laptop, inside
  the home LAN. Corpus text and queries never leave the LAN. The address and
  model name live in private config, never in the repo.
- The vector store is embedded or local to this machine. ChromaDB is the
  user's example; `035-profile-corpus` chooses it or an equivalent, and the
  choice needs dependency approval.
- The index records the embedding model it was built with. A different
  configured model means a rebuild, and search refuses to mix the two.
- Every search needs the laptop, because the query must be embedded too. The
  runner checks the endpoint before the evaluation and draft steps. If it is
  unreachable, collection and title screening still run, evaluation and
  drafting are skipped, ads keep their state, no attempt is counted, and the
  summary reports it as a source failure. The next run catches up.

### 9. Daily run

- This WSL install has no systemd, so Windows Task Scheduler starts the runner
  through `wsl.exe`, with "run as soon as possible after a missed start".
- A lock file prevents overlapping runs.
- Catch-up comes from state: the mail watermark advances only after ingest
  succeeds, and unfinished ads stay in their state for the next run.
- Per-run caps on evaluations and drafts leave the remainder queued.
- One summary is sent when there are unreported drafts, title rejections,
  failures or source failures. Nothing is marked reported until the mail server
  accepts the message.

## Stream briefs

Build order. `035-profile-corpus` is the one candidate to run in parallel with
`034-ad-inbox`.

| Brief | Delivers | Open questions it carries |
|---|---|---|
| `034-ad-inbox` | `ads` table, API except the draft route, MCP tools (`list_ads`, `get_ad`, `handover_ad`, `dismiss_ad`), review view, hand-over action | Visual direction for the view; whether this third feature area triggers the deferred `src/components/` split |
| `035-profile-corpus` | Index built with the LAN Ollama embeddings, `facts`/`style` labels, read-only `search_profile` MCP tool, endpoint health check | Whether the Ollama model handles Finnish and English well enough; ChromaDB or an equivalent store; dependency approval; reaching the laptop from WSL |
| `036-ad-evaluation` | `agent/` skeleton, sandboxed `claude -p` wrapper and its isolation test, title rules, evaluation with fan-out | Title rules; what counts as suitable; per-run evaluation cap |
| `037-application-drafts` | Draft route, headless prompts, draft generation and validation, end-to-end run on a hand-supplied ad | Whether the skills' rules survive headless adaptation; work history they read from a separate memory store; per-run draft cap |
| `038-alert-sources` | Mailbox reader, `PoliteHttp`, connectors for the four sources | Kuntarekry and Valtiolle.fi terms and feeds; real alert samples; mail client dependency approval; mailbox provider |
| `039-daily-run` | Scheduled entry point, lock, catch-up, caps, summary email | Task Scheduler reliability at Windows start; how the job-app API is running at that moment; whether the Ollama laptop is on at the chosen run time; fit within Claude usage limits |

## Tests

- New: none. This stream adds documents only.
- Verification command: `npm test`, plus
  `git diff --name-only origin/master...HEAD`, which must list only `brief/`,
  `plans/` and `docs/job-search-agent.md`.

---

**Next stage:** run `/sdlc`.
