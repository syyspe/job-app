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

Two more are optional:

- `PORT` — the port the API listens on (default 3001)
- `PAGE_SIZE` — how many applications one page of the list shows (default 7).
  The client asks the API for it, so changing it needs a server restart only —
  no rebuild. Anything that isn't a whole number of at least 1 fails at
  startup.

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

### Development

Two processes: Vite serves the React app on `:5173` with HMR and proxies
`/api` to Express on `:3001`.

```
npm run dev         # frontend, :5173
npm run dev:server  # API, :3001
```

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

`mcp/` is a stdio MCP server that gives Claude Desktop seven tools over this
app: `list_applications`, `get_application`, `create_application`,
`attach_file`, `update_application`, `archive_application` and
`read_attachment`. It speaks to the API over HTTP exactly as the browser
does, so **the API has to be running already** (`npm run dev:server`, or
`npm start`) and the seed user has to exist — if it isn't up, the first tool
call says so.

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

Claude Desktop spawns the server with a minimal `PATH`, so a bare `node` may
not resolve; if the server shows as failed, put the absolute path from
`which node` in `command`.

`npm run mcp` runs the same server against your own shell's env vars, which
is the quickest way to check it by hand before wiring Claude Desktop up.

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
