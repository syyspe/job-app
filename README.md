# job-applications

Manages job applications.

Built on a personal-scale AI-native SDLC: four stages (brief, plan, build,
ship), each ending by committing an artifact the next stage reads. Run
**`/sdlc`** for where the current branch stands; the stage table and rules are
in `.claude/skills/sdlc/SKILL.md`.

## Prerequisites

- **git**
- **[Claude Code](https://claude.com/claude-code)** (the `claude` CLI)
- **Node 24.20.0 LTS** (see `.nvmrc`), then `npm install`
- **python3** — the hooks in `.claude/hooks/` parse tool-call data with it,
  unconditionally, regardless of your project's stack. Without it, every
  Edit/Write/Bash call gets blocked by a raw shell error instead of the
  hook's actual guardrail message.
- **[`gh`](https://cli.github.com)**, authenticated — the default branch is
  PR-only, so opening PRs is part of the normal flow, starting with
  bootstrap's own setup PR. Without it nothing breaks; you just open each PR
  in a browser from a compare URL instead.

*(Optional)* set the `ANTHROPIC_API_KEY` secret on the GitHub repo (Settings
→ Secrets → Actions) so `.github/workflows/claude-review.yml` reviews PRs
automatically. Without it the workflow skips cleanly and PRs stay green;
`/review` in a local session covers the same `REVIEW.md` passes with no
key — see that file. Note that the key is billed to whoever owns it: turning
this on means you pay for a review of every PR here.

## Running the server

The API reads its storage locations from two required env vars — there is no
default, so it fails fast at startup if either is missing:

- `DB_PATH` — full path to the sqlite database file
- `UPLOADS_DIR` — full path to the uploads directory
- `SEED_USERNAME` / `SEED_PASSWORD` — the login `npm run seed` creates

Five more are optional:

- `PORT` — the port the API listens on (default 3001)
- `PAGE_SIZE` — how many applications one page of the list shows (default 7).
  The client asks the API for it, so changing it needs a server restart only —
  no rebuild. Anything that isn't a whole number of at least 1 fails at
  startup.
- `LOG_LEVEL` — `debug`, `info`, `warn`, `error` or `silent` (default `info`).
  The API logs JSON lines to stdout; any other value fails at startup.
- `TLS_CERT` / `TLS_KEY` — PEM files for the certificate and its key. Set
  both and `npm start` serves HTTPS instead of HTTP; see "HTTPS" below.

Copy `.env.example` to `.env`, fill in real paths, and pick your own
`SEED_USERNAME`/`SEED_PASSWORD` — do this before either mode below.

The API requires a logged-in session for every route except `/api/login`.
Run the seed script once against a fresh (or pre-auth) database to create
that user and, if the database already has applications from before auth
existed, assign them to it:

```
npm run seed
```

There is no signup endpoint — the first account comes from the seed script
only, and it only ever creates the user once: if `SEED_USERNAME` already
exists, re-running `npm run seed` after editing `.env` does not change its
password. Get `SEED_USERNAME`/`SEED_PASSWORD` right in `.env` before the
first run against a given database.

What every run does change is the role: `npm run seed` makes that user an
admin, whether it just created it or found it already there. That is the only
way an admin comes into being — the migration that adds the `role` column
gives every existing user `basic` and promotes nobody. After pulling a build
with roles in it, run `npm run seed` once or the database has no admin.

Schema migrations are not the seed script's job — `openDatabase` runs them
every time the database is opened, so any entry point (the server, the seed
CLI, tests) gets a current schema. `npm run seed` is only about the seed user
and pre-auth applications.

### The Admin page

An admin sees an **Admin** control in the nav bar; a basic user does not, and
`/api/users` answers them `403` whatever they do. On that page an admin can
add a user, switch anyone between admin and basic, reset a password, and
delete an account. Three things the server refuses: deleting yourself,
demoting yourself, and demoting the last admin — so there is always an admin,
and always someone holding the session that could promote another. Changing
your own role is the one way you could have locked yourself out of this page,
which is why the server stops it rather than the form.

Deleting a user is permanent and takes their applications and uploaded files
with it. Applications stay strictly per-user regardless: no admin sees
another person's applications anywhere in the app.

There is no self-service password reset. Resetting a password also ends that
user's existing sessions, so the old password's cookies stop working. A
forgotten password is an admin's job on this page; if the forgotten password *is* the last admin's, re-run
`npm run seed` with that user's `SEED_USERNAME` and a new `SEED_PASSWORD`.

### HTTPS

Unset, the server speaks plain HTTP, so the password and session cookie cross
the network unencrypted. To serve HTTPS, make a certificate with
[mkcert](https://github.com/FiloSottile/mkcert), signed by the local CA at
`mkcert -CAROOT`. Keep it outside the repo, next to the database:

```
mkdir -p /projects/tests/job-app-certs && cd /projects/tests/job-app-certs
mkcert -cert-file job-app.pem -key-file job-app-key.pem localhost 127.0.0.1 192.168.100.9
```

Then point `.env` at both files:

```
TLS_CERT=/projects/tests/job-app-certs/job-app.pem
TLS_KEY=/projects/tests/job-app-certs/job-app-key.pem
```

The key is a secret, which is why it lives outside the repo rather than
gitignored inside it. After that, `npm start` serves
`https://192.168.100.9:3001` (and `https://localhost:3001`), and the session
cookie is `Secure`. A device only trusts the certificate once it trusts the
mkcert root CA. Setting only one of the two vars, or naming a file that can't
be read or isn't a valid PEM, stops startup with one line on stderr.

### Development

Two processes: Vite serves the React app on `:5173` with HMR and proxies
`/api` to Express on `:3001`.

```
npm run dev         # frontend, :5173
npm run dev:server  # API, :3001
```

`npm run dev:server` always serves plain HTTP, whatever `.env` says about
`TLS_CERT`/`TLS_KEY` — HTTPS is for `npm start` only.

### Production

One process: `npm start` builds the app and runs a single Express server that
serves the built frontend and the API together.

```
npm start
```

Listens on `PORT` (default `3001`). `npm run test:e2e:prod` runs the same e2e
specs as `npm run test:e2e`, but against `npm start` instead of the two dev
servers — useful for confirming the built app actually works end to end.

## Claude Desktop (MCP)

`mcp/` is a stdio MCP server that gives Claude Desktop thirteen tools over this
app: `list_applications`, `get_application`, `create_application`,
`attach_file`, `update_application`, `archive_application`,
`read_attachment`, `delete_attachment`, `replace_attachment`, `list_ads`,
`get_ad`, `handover_ad` and `dismiss_ad`. It speaks
to the API over HTTP exactly as the browser does, so **the API has to be
running already** (`npm run dev:server`, or `npm start`) and the seed user
has to exist — if it isn't up, the first tool call says so.

Add it to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "job-applications": {
      "command": "node",
      "args": ["/absolute/path/to/job-app/mcp/index.ts"],
      "env": {
        "JOBAPP_API_URL": "http://localhost:3001",
        "JOBAPP_USERNAME": "you",
        "JOBAPP_PASSWORD": "your-password"
      }
    }
  }
}
```

The three env vars are all required, and Claude Desktop is the only thing
that supplies them — the MCP server does not read `.env`. Use the same
credentials `npm run seed` created.

When `npm start` serves HTTPS (see "HTTPS"), set
`JOBAPP_API_URL` to `https://localhost:3001` and add
`"NODE_EXTRA_CA_CERTS": "<the output of mkcert -CAROOT>/rootCA.pem"` to the
same `env` block, so Node trusts the mkcert certificate. `npm run dev:server`
stays on HTTP, so the URL follows whichever of the two is running.

Claude Desktop spawns the server with a minimal `PATH`, so a bare `node` may
not resolve; if the server shows as failed, put the absolute path from
`which node` in `command`.

`npm run mcp` runs the same server against your own shell's env vars, which
is the quickest way to check it by hand before wiring Claude Desktop up.

## Profile corpus

`agent/profile/` keeps a local, searchable index of your own application
material (CVs, cover letters, notes) for the job search agent. Embeddings come
from an [Ollama](https://ollama.com) service on another machine in the home
LAN, so no corpus text or query leaves the LAN. `search_profile` is the only
tool the agent's `claude -p` steps get.

### Config

Settings live outside the repo, in `~/.config/job-agent/config.json`
(`$XDG_CONFIG_HOME/job-agent/config.json` when that is set). The profile
commands read these keys and ignore the rest:

```json
{
  "ollamaUrl": "http://192.168.1.50:11434",
  "embeddingModel": "bge-m3",
  "corpus": [
    { "path": "/home/you/applications/cv-templates", "label": "facts" },
    { "path": "/home/you/applications/sent-letters", "label": "style" }
  ],
  "syncFolder": "/home/you/applications/synced"
}
```

- `path` is absolute, a file or a folder. Folders are walked recursively for
  `.txt` and `.md` files, which inherit the folder's label; anything else is
  skipped and listed when you build. A file reachable from two entries is an
  error.
- `facts` is the source of truth about you. `style` is material kept only as
  examples of tone: earlier letters may contain errors, so search results
  carry the label and a `style` result never supplies a fact.
- `syncFolder` (optional, absolute) is where `profile:sync` puts the
  attachments you mark in the UI. It is indexed as one more `style` entry, so
  it must not sit inside another corpus folder. `profile:sync` creates it.
  Create it by hand if you run `profile:index` before the first sync.

`profile:sync` also needs job-app credentials, in `~/.config/job-agent/env`
(mode 600; `$XDG_CONFIG_HOME/job-agent/env`). The file is parsed, not sourced:

```bash
JOBAPP_API_URL=http://localhost:3001
JOBAPP_USERNAME=you
JOBAPP_PASSWORD=...
```

The index is written to `~/.local/share/job-agent/profile.db`
(`$XDG_DATA_HOME/job-agent/profile.db`). It is derived data: delete it and
rebuild any time.

### Ollama on the laptop

On the machine that runs Ollama, make it listen on the LAN and pull the model:

```bash
OLLAMA_HOST=0.0.0.0:11434 ollama serve
ollama pull bge-m3
```

and allow inbound TCP 11434 in that machine's firewall. With WSL in
`networkingMode=mirrored`, outbound connections from WSL to the LAN work as
from Windows, so no extra WSL rule is needed (the Hyper-V firewall rule only
matters for traffic *into* WSL). Check from WSL:

```bash
curl http://192.168.1.50:11434/api/tags
```

`bge-m3` is the recommended model: multilingual (Finnish included), 1024
dimensions, long context. Use `profile:search` with a few Finnish and English
queries to judge it on your own corpus.

### Commands

- `npm run profile:health` — prints `ok`, or `unreachable`, `bad_response`
  or `model_missing`, and exits 1.
- `npm run profile:index` — checks Ollama, then builds the index. Reruns embed
  only new or changed files and drop deleted ones. A different
  `embeddingModel` re-embeds everything.
- `npm run profile:search -- "<query>" [facts|style]` — prints the top five
  results with score, label and source.
- `npm run profile:sync` — copies every attachment marked "Add to profile" in
  the UI into `syncFolder` as `<id>-<name>`, rebuilds the index, then clears
  the marks. It checks Ollama first and changes nothing if the check fails. A
  failed build keeps the marks for the next run.
- `npm run profile:mcp` — the stdio MCP server with the single
  `search_profile` tool. It needs no job-app credentials.

Rebuild after adding, changing or removing corpus files, or after changing
`embeddingModel`. Search refuses until you do, and says so.

## Ad evaluation

`agent:evaluate` screens new ads in the inbox by title and evaluates the
ready ones against your criteria, each ad in its own sandboxed `claude -p`
process whose only tool is `search_profile`. It needs the profile corpus set
up as above, the job-app env file, and a logged-in `claude` CLI on `PATH`.

### Setup

1. Write your criteria to `~/.config/job-agent/prompts/evaluate.md`
   (`$XDG_CONFIG_HOME/job-agent/prompts/evaluate.md`). Start from
   `agent/runner/prompts/evaluate.example.md`. The runner puts its own fixed
   framing first (`agent/runner/prompts/evaluate.framing.md`): the ad is
   untrusted data, facts come only from `facts` results, and doubt means
   `unsure`.
2. Optionally add the runner's keys to `config.json`; these are the defaults:

   ```json
   {
     "titleRules": { "reject": [] },
     "evaluation": { "concurrency": 2, "perRunCap": 10, "timeoutMs": 300000 }
   }
   ```

   `titleRules.reject` holds phrases matched as whole words, ignoring case
   (`intern` does not match `international`). A title that matches goes to
   `title_rejected`; leave unclear words off the list so those ads get a full
   evaluation. `concurrency` is 1–8.
3. Run `npm run agent:sandbox-check` once, and again **after every `claude`
   CLI update**. It runs two real `claude -p` probes and the CLI version that passed in
   `~/.local/state/job-agent/sandbox-check.json`. `agent:evaluate` refuses to
   run on any other version.

### Commands

- `npm run agent:sandbox-check` — prints `pass` or `FAIL` for each sandbox
  property and exits 1 on any failure, recording nothing.
- `npm run agent:evaluate` — moves `new` ads to `title_rejected`, or to
  `awaiting_handover` for a hand-over source, and leaves automatic ones
  `new`. It then checks Ollama: if Ollama is down, it prints
  `evaluation skipped: <reason>`, exits 0 and touches no ready ad. Otherwise
  it evaluates the oldest `perRunCap` ready ads into `suitable` or
  `unsuitable`, and leaves the rest queued. An unsure result counts as
  `suitable`. A failed step records an attempt with a fixed category
  (`timeout`, `cli_failed`, `bad_output`, `invalid_result`), and the third
  failed attempt moves the ad to `failed`.

## Ad drafting

`agent:draft` turns each `suitable` ad into a job-app application with status
`draft`. A sandboxed `claude -p` step writes a cover letter, a tailored CV, a
fit summary and the open questions as JSON. The runner checks them, builds
three `.txt` attachments (the saved ad, the cover letter and the CV) and
creates the application in one call to `POST /api/ads/:id/draft`. Nothing in
the agent can submit an application. The setup from "Ad evaluation" applies,
including the sandbox check.

### Setup

1. Write your drafting rules (voice, structure, naming) to
   `~/.config/job-agent/prompts/draft.md`. Start from
   `agent/runner/prompts/draft.example.md`. The runner puts its fixed framing
   first (`agent/runner/prompts/draft.framing.md`): the ad is untrusted data,
   facts come only from the CV templates and `facts` results, `style` results
   set tone only, and motivation or any unconfirmed fact becomes a
   `[[ASK:qN]]` question rather than being invented.
2. Add the `drafting` key to `config.json`. `filePrefix` and both
   `cvTemplates` paths are required; the rest shows the defaults:

   ```json
   {
     "drafting": {
       "filePrefix": "Firstname_Lastname",
       "cvTemplates": { "fi": "/abs/path/cv-fi.md", "en": "/abs/path/cv-en.md" },
       "concurrency": 1,
       "perRunCap": 3,
       "timeoutMs": 600000
     }
   }
   ```

   Each step gets both templates whole and starts the CV from the one in the
   draft's language. `concurrency` is 1–4.
3. Export your work history, meaning the notes on your work experience and
   projects that you would otherwise give an assistant by hand, as `.md`
   files into a folder listed in `corpus` with the label `facts`, then run
   `npm run profile:index`. The step finds them through `search_profile`.
   Nothing it writes about you comes from anywhere else.

### Command

- `npm run agent:draft` checks Ollama first. If Ollama is down, it prints
  `drafting skipped: <reason>`, exits 0 and touches no ad. Otherwise it
  drafts the oldest `perRunCap` suitable ads and leaves the rest queued. Each
  draft's `notes` hold the fit summary, the open questions (`q1: …`) and the
  ad's source and URL. An ad that gives no company or title gets
  `Unknown company` / `Unknown role` and a fixed question asking for it. A
  failed step records an attempt with a fixed category (`timeout`,
  `cli_failed`, `bad_output`, `invalid_result`, `ask_mismatch`), and the
  third failed attempt moves the ad to `failed`. A draft the API refuses
  (for example a 409 because the ad was drafted in the meantime) stops the
  run with exit 1.

## Alert sources

`agent:collect` reads new job alert emails from a mailbox used for nothing
else, turns them into ads in the inbox, screens their titles, then fetches
the full ad pages of the automatic sources. It runs no `claude -p` step, so
it needs no sandbox check. The sources are:

| Id | Site | Mode |
|---|---|---|
| `academicwork` | Academic Work | automatic: the ad page is fetched |
| `valtiolle` | Valtiolle.fi | automatic |
| `nordea` | Nordea careers | automatic |
| `duunitori` | Duunitori | hand-over: never fetched; the ad waits in `awaiting_handover` |

### Setup

1. Create a Gmail account used only for job alerts, turn on 2-step
   verification and make an app password for it. Move each site's alert
   subscription to that address, with no forwarding from your own mailbox.
2. Add the mail keys to `~/.config/job-agent/env`, next to the job-app ones:

   ```sh
   MAIL_IMAP_HOST=imap.gmail.com
   MAIL_USERNAME=<the alert address>
   MAIL_PASSWORD=<the app password>
   ```

   The mailbox is opened read-only: nothing is marked read, moved or deleted.
3. Check each automatic site's terms of use. Once a site's terms allow
   fetching its public ad pages, record the date you checked them. A source
   left out of `sources` is disabled, and an automatic source can't be
   enabled without `termsCheckedOn`:

   ```json
   {
     "sources": {
       "duunitori": { "enabled": true },
       "valtiolle": { "enabled": true, "termsCheckedOn": "2026-11-20" },
       "nordea": { "enabled": false },
       "academicwork": { "enabled": false }
     }
   }
   ```

   Each source also takes `dailyOpenCap` (pages opened per day, default 20)
   and `minDelayMs` (the pause between its requests, default 15000, at least
   1000). If a site's terms rule fetching out, switching its connector's
   `mode` to `handover` is a one-line change.

The parsers were written from real alerts and pages kept in
`~/.config/job-agent/samples/<source>/`, outside the repository. When a
site changes its alert layout, its connector finds nothing and the run
records an `empty_alert` failure for that source. Save a fresh sample there
before you fix the connector. The tests use synthetic fixtures only.

### Command

- `npm run agent:collect` reads the messages that arrived since its last run
  and ingests each candidate with its source and the site's ad id. A repeat
  of a known ad isn't added again. Then it screens `new` ads as
  `agent:evaluate` does, and fetches each enabled automatic source's oldest
  `new` ads, up to that source's daily cap. A fetched ad goes to `ready`, or
  to `duplicate` when it matches an earlier ad or application. A page that
  is gone moves the ad to `failed`. Any other fetch failure records an
  attempt, and the third moves the ad to `failed`. A 401, 403, 429 or 503
  answer stops that source for the day without counting an attempt, and is
  recorded as a `blocked` source failure. The command prints one line per
  enabled source, a `screened:` line and the number of ads left `new`.
  Configuration errors exit 2. An unreachable mailbox, a rejected mail login
  or a job-app failure exits 1. Its position in the mailbox is kept in
  `~/.local/state/job-agent/mail-watermark.json` and advances one message at
  a time, so a failed run reads the unfinished message again next time.

## Daily run

`agent:run` does the whole pipeline once: collect, dismiss expired
hand-overs, sync the profile, evaluate, draft, and email you one summary
when there is something new. Windows Task Scheduler starts it every evening.
Everything above it must already be set up: the profile corpus, ad
evaluation, ad drafting and alert sources.

### Setup

1. Add the SMTP host to `~/.config/job-agent/env`. The summary is sent from
   the alert mailbox, so it reuses its login:

   ```sh
   MAIL_SMTP_HOST=smtp.gmail.com
   ```

2. Add the recipient, and optionally the hand-over wait, to
   `~/.config/job-agent/config.json`:

   ```json
   {
     "summary": { "recipient": "<your own address>" },
     "handoverWaitDays": 7
   }
   ```

   An ad waiting for hand-over is dismissed `handoverWaitDays` days after it
   was first seen, or after its deadline day if that comes sooner.
3. In Windows, open Task Scheduler and create a task:
   - Trigger: daily at 20:00.
   - Settings: tick "Run task as soon as possible after a scheduled start is
     missed", and set "If the task is already running" to "Do not start a
     new instance".
   - Action: start `wsl.exe` with the arguments
     `-d <distro> --exec bash -lic <repo>/agent/runner/daily-run.sh`, where
     `<distro>` is your distribution's name in `wsl -l` and `<repo>` this
     repository's absolute path. `-i` makes bash read `~/.bashrc`, which is
     where node and `NODE_EXTRA_CA_CERTS` come from.

The first run after a `claude` update re-runs the sandbox check by itself.
If the check fails, evaluation and drafting are skipped until it passes, and
the summary says why.

### Command

- `npm run agent:run` takes `~/.local/state/job-agent/run.lock` and refuses
  with exit 1 while another run holds it. A lock left by a run that no
  longer exists is taken over. It prints one line per step and a `summary:`
  line. A step that fails (the mailbox or job-app unreachable, say) is
  printed to stderr and listed in the summary, and the later steps still
  run. If Ollama is unreachable or the sandbox check fails, evaluation and
  drafting are skipped and no ad is touched. Configuration errors exit 2
  before the lock is taken. A failed step or send exits 1; a skip alone
  exits 0. Nothing is marked reported until the mail server has accepted
  the summary, so a failed send is retried next run.
- `agent/runner/daily-run.sh` is what the task runs. It starts job-app with
  `npm start` if nothing answers at `JOBAPP_API_URL`, then runs `agent:run`.
  Its output is appended to
  `~/.local/state/job-agent/logs/run-YYYY-MM-DD.log`, and the output of a
  job-app it started to `logs/server.log` in the same folder.

## The default branch is PR-only

Nothing lands on the default branch except by merged pull request. On a solo
project that isn't about permission — you're the reviewer — it's about
forcing the diff to be *looked at*, once, in one place, instead of
accumulating as a string of direct commits nobody ever reads back.
`.claude/hooks/default-branch-guard.sh` blocks a direct push from any Claude
session here (escape hatch: `ALLOW_DEFAULT_PUSH=1`, for when you've decided
to take that on).

If this rule stops paying for itself on some project, delete the hook from
`.claude/settings.json`. It's a default, not a law.

## Working on something

Run `/sdlc` and Claude tells you where the current branch stands and what to
do next. The instructions for each stage are in `.claude/skills/sdlc/stages/`,
and the reasoning behind the process is in
`.claude/skills/sdlc/session-economy.md`. Working on more than one thing at a
time? Use the `worktree` skill (`.claude/skills/worktree/SKILL.md`) instead of
switching branches in place.

## Repository layout

| Path | Stage | Purpose |
|---|---|---|
| `brief/` | 1. Brief | Problem framing + requirements, one file per piece of work |
| `plans/` | 2. Plan | Implementation plans, one per branch/PR, committed as the audit trail |
| `CLAUDE.md` | all | Project knowledge Claude reads every session |
| `.claude/skills/` | 2–3 | Triggered policy skills |
| `.claude/skills/sdlc/` | all | `/sdlc` — which stage the branch is in, and what's next |
| `.claude/hooks/` | 3, 4 | Deterministic guardrails and approval gates |
| `.claude/agents/` | 4 | Subagents for repeated tasks (verification) |
| `.claude/settings.json` | all | Wires hooks into tool events |
| `REVIEW.md` | 4. Ship | PR review policy — read by the CI workflow and by local `/review`, not by the built-in `/code-review` |
| `.github/workflows/claude-review.yml` | 4. Ship | Optional CI that runs `REVIEW.md`'s passes on every PR |

## What this process deliberately leaves out

- **No approval workflow.** No `status: draft|approved`, no sign-off lines,
  no roles. You approve things by committing them.
- **No monitoring loop.** The upstream playbook closes Stage 6 back to Stage
  1 via SLO control bands and on-call routing. That needs a metrics stack and
  a rotation; a personal project has neither. When something breaks, you
  notice, and you write a brief.
- **No agent-config eval suite.** The playbook regression-tests `CLAUDE.md`
  and `.claude/**` with a 20–50 task eval suite in CI. That's a real
  practice, and it's real work to maintain — out of proportion here. The
  substitute is the "Things Claude gets wrong here" section of `CLAUDE.md`:
  when a mistake recurs, write it down there.

## License

[MIT](LICENSE). Copy it, fork it, sell whatever you build with it.

Worth saying plainly: this is a **single-user tool that runs on your own
machine**, and it's the test bed for the
[ai-sdlc-skeleton](https://github.com/syyspe/ai-sdlc-skeleton) workflow — the
process is the point, the app is what the process was pointed at. There's no
signup and no rate limiting, and CSRF rests on the session cookie being
`httpOnly` + `sameSite: lax` rather than on tokens — enough for one person
and a local SQLite file, not enough for the open internet. Add those before
putting it anywhere public. `SECURITY.md` says the same in more detail.
