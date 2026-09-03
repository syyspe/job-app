# job-applications

Manages job applications.

Built on a personal-scale AI-native SDLC: **every stage produces a
version-controlled artifact the next stage reads.** You stay accountable for
judgment calls (what to build, whether the plan is right, whether it merges);
Claude does the work in between.

```
brief.md  →  plan.md  →  code + tests  →  PR
 (Brief)     (Plan)      (Build)          (Ship)
```

| Stage | Artifact | Done when | Which unlocks |
|---|---|---|---|
| 1. Brief | `brief/<slug>.md` | problem, requirements, approach, out-of-scope are written down | Plan |
| 2. Plan | `plans/<slug>.plan.md` | plan committed **before** any code | Build |
| 3. Build | code + tests | the work order is committed | Ship |
| 4. Ship | verification, review, PR | verification passes, `verifier` says PASS, you merge | Brief, again |

There is no `status:` frontmatter and nothing to approve. **An artifact exists
or it doesn't** — that's the entire state machine, and it's readable with
`ls`. Every session opens by telling you which stage the current branch is in
and what's next; **`/sdlc`** re-answers that any time you ask.

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
`/code-review` in a local session does the same job with no key.

## Running the server

The API reads its storage locations from two required env vars — there is no
default, so it fails fast at startup if either is missing:

- `DB_PATH` — full path to the sqlite database file
- `UPLOADS_DIR` — full path to the uploads directory

Copy `.env.example` to `.env` and fill in real paths first, for either mode
below.

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

## Starting a piece of work

The short version: **run `/sdlc`** and Claude tells you where the current
branch stands and what to do next. The long version is below, once, so you
know what it's driving.

One slug threads through everything — pick a short kebab-case name (e.g.
`csv-export`) and reuse it as the branch name and every artifact's filename.

1. `git checkout -b <slug>` from the default branch.
2. **Stage 1.** Talk the idea through with Claude and land it in
   `brief/<slug>.md` (copy `brief/TEMPLATE.md`, or let Claude write it).
   Problem, what done looks like, approach, out of scope. Commit.
   *Keep it thin* — six honest lines beat two invented pages.
3. **Stage 2.** Start a Claude Code session in **plan mode** referencing the
   brief and iterate until the plan's right — see `plans/README.md` — then
   commit it as `plans/<slug>.plan.md`.
   *Unlock:* the plan is committed. Nothing gets implemented before that.
4. **Stage 3.** Fresh session, auto mode: implement the work order and commit
   it. `simple-code` applies from the first line. The commit ends the stage —
   nothing gets verified or reviewed here.
5. **Stage 4.** Fresh session again, in order: `CLAUDE.md`'s verification
   command, the `verifier` subagent (re-checks the diff against the plan with
   fresh context), `/code-review` for `REVIEW.md`'s passes, then push, open a
   PR, read it, merge it.

Each of those is a **separate session**. A stage ends at a commit, that commit
is the whole handoff, and the session-start hook re-derives where you are from
disk — so the next stage starts for almost nothing, while dragging a finished
stage's context along is paid for on every turn after it.

Working on more than one of these at a time? See the `worktree` skill
(`.claude/skills/worktree/SKILL.md`) instead of switching branches in place.

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
| `REVIEW.md` | 4. Ship | PR review policy Claude applies to every change |
| `.github/workflows/claude-review.yml` | 4. Ship | Optional CI that runs `REVIEW.md`'s passes on every PR |

## Stage-by-stage notes

**1. Brief.** The cheapest stage to be honest in. Write down what's actually
wrong, what "done" means concretely enough to check later, and — most
valuable of all — what's explicitly *out* of scope. Skip it only for changes
genuinely too small to have a scope.

**2. Plan.** Start every implementation in plan mode. Commit the plan before
writing code; that's the artifact Stage 4 compares the diff against. If the
implementation departs from the plan, update the plan in the same commit
rather than letting them drift.

**3. Build.** Run independent streams in separate git worktrees. For bug
fixes, write and commit the failing test *before* the fix, and don't let the
agent edit that test while fixing it. The stage ends at the commit; checking
the work is the next session's job, because the session that wrote the code
knows what it was *meant* to do — which is the assumption verification exists
to break.

**4. Ship.** Wrap verification in one command (`make test`, `npm test`, …)
documented in `CLAUDE.md` with its expected healthy output. That command, then
`verifier`, then `REVIEW.md`'s passes via `/code-review` or the CI workflow,
then a PR you actually read before merging. Hooks gate anything hard to
reverse — production deploys, protected-path edits.

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
- No license file — add one before making the repo public if you intend
  others to reuse it.
