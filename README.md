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
