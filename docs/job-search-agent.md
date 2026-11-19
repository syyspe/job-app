# Daily job search agent: cross-stream contracts

What the streams listed under [Streams](#streams) agree on. A stream that needs
to change anything here changes this file in the same PR. The feature's goals are in
[brief 033](../brief/033-job-search-agent.md).

```text
 Windows Task Scheduler
        │ wsl.exe
        ▼
 agent/ runner ───────────────────────────────── holds the secrets, does all writes
        │
        ├─ 1. Collect      alert mailbox → connectors → POST /api/ads
        ├─ 2. Screen       title rules → title_rejected | awaiting_handover | new
        ├─ 3. Fetch        public ad page via PoliteHttp → ready
        │                  (hand-over sources: the user supplies the text)
        ├─ 4. Evaluate     one sandboxed `claude -p` per ad → suitable | unsuitable
        ├─ 5. Draft        one sandboxed `claude -p` per ad → validated JSON
        ├─ 6. Save         POST /api/ads/:id/draft → application with status `draft`
        └─ 7. Report       one summary email → POST /api/ads/reported

 `claude -p` steps reach only `search_profile` → local index + LAN Ollama
```

This design refines brief 033 in two places:

- **Fan-out** uses parallel `claude -p` processes rather than subagents, so one
  hostile ad cannot influence the judgement of another.
- **The timer** is on the Windows side, because this WSL install has no systemd.

## Streams

| Stream | Brief | State | Needs |
|---|---|---|---|
| `033-job-search-agent` | committed | done | — |
| `034-ad-inbox` | committed | done | — |
| `035-profile-corpus` | committed | done | — |
| `035a-corpus-sync` | committed | in progress | 035 |
| `036-ad-evaluation` | committed | open | 034, 035 |
| `037-application-drafts` | committed | open | 036 |
| `038-alert-sources` | committed | open | 034 |
| `039-daily-run` | committed | open | 035a, 037, 038 |
| `040-markdown-attachments` | not written | open | 035a, 037 |

`035a-corpus-sync` adds an "Add to profile" action in the UI, where the user
picks which of an application's attachments to mark; job-app stores a flag on
each. A runner-side `profile:sync` command then copies the marked attachments
into a `style` corpus folder, replacing an earlier copy of the same
attachment, runs the incremental index build and clears the flags. Marking is
by the UI action only, and a mark can be removed before the sync. `039-daily-run`
runs the sync each day. The letter suffix keeps it in build order next to 035
without taking a new number.

`040-markdown-attachments` switches the agent's text attachments from `.txt` to
`.md` (section 7), after which the corpus walk (section 3) reads `.md` files
only.

### Picking the next stream

For `/sdlc` Stage 1 when pointed at this file:

- The next stream is the first `open` row, top to bottom, whose **Needs** are
  all `done`. Use its slug as written; don't take a new number from the sdlc
  numbering command.
- Before starting it, check `git branch -a --list '*<slug>*'`. A branch means
  the stream is already in progress elsewhere, because this table on the
  default branch only changes on merge. Take the next eligible row instead.
- Brief **committed**: Stage 1 is already done. Create the branch and go to
  Stage 2. Brief **not written**: Stage 1 writes `brief/<slug>.md` from
  `brief/TEMPLATE.md`, using this file's sections as its contract.
- Each stream updates its own row: `in progress` in its plan commit, `done` in
  its PR. A stream that adds a follow-up stream adds its row in the same commit.

## 1. Pipeline and runtime

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
concurrency limit. Each ad gets a fresh process.

## 2. Agent permissions

| Capability | Runner | `claude -p` steps | Profile search tool |
|---|---|---|---|
| Mail read and send | yes | no | no |
| Job-app credentials and writes | yes | no | no |
| Network or web tools | job-app API, mail server, Ollama health check, public ad pages on each connector's `fetchHosts` | no | the configured Ollama endpoint only |
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
model response can select a recipient, file path or status, and a URL is
fetched only if it passes the host check in section 6. The runner only ever
creates applications with status `draft` and has no code path that submits an
application.

## 3. Private configuration

The repository is public, so nothing personal enters it: no CV text, voice
rules, title rules, addresses or real alert emails. Test fixtures are
synthetic.

| Path | Holds |
|---|---|
| `~/.config/job-agent/env` (mode 600) | Mail and job-app secrets |
| `~/.config/job-agent/config.json` | Recipient, source switches, caps, `handoverWaitDays`, title rules, corpus paths, file name prefix, Ollama URL and embedding model |
| `~/.config/job-agent/prompts/` | Headless evaluation and drafting rules adapted from the three job application skills |
| `~/.local/state/job-agent/` | Run lock, mail watermarks, daily counters, unreported source failures, logs |
| `~/.local/share/job-agent/` | Profile index |

Each path follows `$XDG_CONFIG_HOME`, `$XDG_STATE_HOME` or `$XDG_DATA_HOME`
when set. The profile index is `~/.local/share/job-agent/profile.db`.

The config keys `035-profile-corpus` owns, ignoring every other key:

```json
{
  "ollamaUrl": "http://<laptop>:11434",
  "embeddingModel": "<model>",
  "corpus": [
    { "path": "/abs/path/cv-templates", "label": "facts" },
    { "path": "/abs/path/letters", "label": "style" }
  ]
}
```

`path` is absolute, a file or a folder. A folder is walked recursively for
`.txt` and `.md` files, which inherit its label. Other file types are skipped
and listed in the build summary. A file reachable from two entries is a
config error.

## 4. Ad inbox data

New table `ads`, scoped by `user_id` like `applications`:

| Column | Notes |
|---|---|
| `id`, `user_id` | `user_id` cascades on user deletion |
| `source`, `external_id` | `UNIQUE (user_id, source, external_id)`; the id falls back to the canonical URL |
| `source_mode` | `automatic` or `handover`, required at ingest; an existing row keeps its stored mode |
| `url`, `canonical_url` | Only `http` and `https` URLs are accepted |
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
- `title_rejected` → `ready` (the user hands the ad over anyway), `dismissed`
- `ready` → `suitable`, `unsuitable`, `duplicate`, `failed`, `dismissed`
- `suitable` → `drafted`, `failed`, `dismissed`
- `failed` → `new` or `awaiting_handover`, by the connector's mode (user retry,
  which resets `attempts`), `dismissed`

`drafted` is reached only through `POST /api/ads/:id/draft`. The transition
route answers 409 for it, so no ad is marked drafted without an application.

What a transition must carry:

- **`failed`** requires `error`, so `gone` and other direct failures always
  carry a category. `error` must match `^[a-z0-9_]{1,40}$`, which keeps ad text
  out of `last_error`.
- **`suitable` and `unsuitable`** require `evaluation`: `{verdict, fitSummary,
  reasons}`, where `verdict` equals `to`, `fitSummary` is a string and `reasons`
  a string array.
- **`ready`** requires a non-empty `body`.

**Recording a failed attempt.** A transition with `to` equal to the current
state and an `error` adds one to `attempts` and stores `last_error`. It works
from `new`, `ready` and `suitable`. The third attempt moves the ad to `failed`
on the server. Any other same-state request is 409.

Retrying from `failed` must target the ad's mode, otherwise 409, and resets
`attempts`, `last_error` and `evaluation`.

An unsure evaluation counts as `suitable`, and the doubt becomes a question in
the draft. A block or rate-limit response does not count as an attempt: the ad
stays `new` for the next run. A `gone` fetch result moves the ad straight to
`failed` with the category `gone`.

An ad waits in `awaiting_handover` for `handoverWaitDays` days after
`first_seen_at`, 7 by default. If the ad has a deadline that falls sooner, it
waits only until the end of that day. The runner then moves it to `dismissed`.

For a hand-over source, `title` and `company` are blanked as soon as the ad
enters `unsuitable`, `duplicate` or `dismissed`, which no summary covers, and
once reported for `drafted`, `title_rejected` and `failed`. Only the keys needed
for deduplication remain, and handing such an ad over again supplies the title
and company anew. This keeps stored Duunitori content to what the review needs.

**Deduplication**, applied by the server, in order:

1. The unique key: ingesting a known ad returns the existing row.
2. Canonical URL matches another ad or any application's `link`, archived
   included. Canonical means lowercase host, no fragment, no tracking
   parameters, no trailing slash.
3. Normalised company and title match another ad from the last 90 days or any
   application's company and role. This rule is skipped while the company or
   title is unknown.

Rules 2 and 3 both run when an ad reaches `ready`. A match moves it on to
`duplicate` in the same transaction, and the response is 200 with the final
row. Ads in state `duplicate` are never match targets, so `duplicate_of` points
at an original, and a match against an application leaves it null. Rule 3 also
skips a later ad still in `new` or `awaiting_handover`, so the earlier ad
survives whichever of the two reaches `ready` first. An earlier ad waiting in
`awaiting_handover` does stay a target: a repeat from an automatic source is a
`duplicate`, even if the earlier ad later expires, so one job never reaches the
user twice.

## 5. Inbox API

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

## 6. Source connector interface

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
  fetchHosts?: string[]
  fetchAd?(candidate: AdCandidate, http: PoliteHttp): Promise<FetchResult>
}
```

- Connectors do no I/O except through `PoliteHttp`, which the runner supplies.
  It enforces the daily cap and pauses, sends no credentials, and ends that
  source's day on the first `blocked`.
- `PoliteHttp` fetches only `https` URLs whose host is in the connector's
  `fetchHosts`, and applies the same check to every redirect. Alert emails are
  untrusted, so a candidate with any other host is dropped without a request.
- A `handover` connector has no `fetchAd` or `fetchHosts`. Duunitori is
  `handover`.
- Each source's config is `{enabled, termsCheckedOn, dailyOpenCap, minDelayMs}`.
  The runner refuses to enable an automatic source with no `termsCheckedOn`.

## 7. Draft format

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

## 8. Profile corpus and embeddings

- Embeddings come from the Ollama service on the user's other laptop, inside
  the home LAN. Corpus text and queries never leave the LAN. The address and
  model name live in private config, never in the repo.
- The vector store is plain SQLite through `better-sqlite3`, already a
  dependency: chunks and their vectors as Float32 blobs, ranked by cosine
  similarity in JS. That is comfortable to about 10k chunks (about 40 MB at
  1024 dimensions, 10–20 ms a search). Storage sits behind
  `agent/profile/lib/store.ts` alone, so moving to `sqlite-vec` later is one
  file plus a rebuild. The index is derived data, never a source of truth.
- `npm run profile:index` is run by the user. It stores a SHA-256 per file and
  its label; a rerun embeds only new or changed files, drops deleted ones and
  skips the rest. Each file is replaced in its own transaction, so an
  interrupted build leaves every file either old and consistent or new.
- The index records the embedding model it was built with, written only when
  a build completes. A different configured model wipes the index and
  re-embeds everything, so an interrupted model change leaves an index with
  no completed model rather than a mixed one.
- Search refuses when the index is missing, has no completed model, or was
  built with a model or vector dimension other than the configured one. The
  error says to run `npm run profile:index`.
- `checkOllama(config)` in `agent/profile/lib/ollama.ts` is the health check
  the runner calls. It reads `GET /api/tags` with a 3 s timeout, and `model`
  or `model:latest` counts as present. It returns `{ ok: true }` or
  `{ ok: false, reason }` with `reason` one of `unreachable`, `bad_response`
  or `model_missing`, fixed categories fit for the summary's source failures.
  It returns rather than throws, because the runner recovers by skipping
  evaluation and drafting.
- `search_profile` runs from `agent/profile/`, the start of the `agent/` tree
  the runner joins in `036-ad-evaluation`. It is its own process with no
  job-app credentials and no import from `mcp/` or `server/`.
  `@modelcontextprotocol/sdk` and `zod` are approved for `agent/` as well as
  `mcp/`.
- Every search needs the laptop, because the query must be embedded too. The
  runner checks the endpoint before the evaluation and draft steps. If it is
  unreachable, collection and title screening still run, evaluation and
  drafting are skipped, ads keep their state, no attempt is counted, and the
  summary reports it as a source failure. The next run catches up.

## 9. Daily run

- This WSL install has no systemd, so Windows Task Scheduler starts the runner
  through `wsl.exe`, with "run as soon as possible after a missed start".
- A lock file prevents overlapping runs.
- Catch-up comes from state: the mail watermark advances only after ingest
  succeeds, and unfinished ads stay in their state for the next run.
- Per-run caps on evaluations and drafts leave the remainder queued.
- Each run dismisses the `awaiting_handover` ads whose wait has ended (section
  4), so a day missed because the PC was off is caught up on the next run.
- One summary is sent when there are unreported drafts, title rejections,
  failures or source failures. Nothing is marked reported until the mail server
  accepts the message.
