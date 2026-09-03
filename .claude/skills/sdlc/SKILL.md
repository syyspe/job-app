---
name: sdlc
description: Use when the user asks where they are in the process, what to do next, how this repo's workflow works, how to start a piece of work, or what unlocks the next stage — and any time work is about to move from one stage to the next. Also user-invocable as /sdlc. Reports which of the four stages the current branch is in, derived from the artifacts on disk, and drives the next handoff.
---

# Where we are in the loop, and what's next

This repo runs a personal-scale adaptation of the [AI-native
SDLC](https://claude.com/blog/the-ai-native-sdlc-playbook): four stages, each
ending by committing an artifact whose commit initiates the next stage. There
is no separate state to track and nothing to approve — **the artifacts on the
branch are the state.**

One short kebab-case slug (e.g. `csv-export`) names the branch and every
artifact on it.

| Stage | Artifact | Instructions | What unlocks the next stage |
|---|---|---|---|
| 1. Brief | `brief/<slug>.md` | `stages/1-brief.md` | Brief committed |
| 2. Plan | `plans/<slug>.plan.md` | `stages/2-plan.md` | Plan committed **before** any code |
| 3. Build | The code and its tests | `stages/3-build.md` | Code committed |
| 4. Ship | Verification, review, and a PR | `stages/4-ship.md` | The user reads it and merges |

Paths are relative to this skill's directory. **Read only the stage file you
land in** — a session works one stage, and the other three are dead weight for
the rest of it.

Every boundary is a commit, which is why verification and `verifier` open
Stage 4 instead of closing Stage 3: whether they've run is the one thing a
fresh session can't read off disk, so nothing gates on it. Anything that has
to be *remembered* to be true isn't state — only what's committed is.

## Work out where you are

Read it off the branch, in this order — first match wins:

1. `git rev-parse --abbrev-ref HEAD`. On `main`/`master`, no work stream is
   checked out: the next action is Stage 1 on a new branch.
2. Otherwise the branch name is the slug. Check for `brief/<slug>.md` and
   `plans/<slug>.plan.md`. Missing artifact → you are in the stage that
   produces it.
3. Both present, `git status --porcelain` dirty → Stage 3, in progress.
4. Both present, tree clean → has code landed since the plan?

   ```bash
   plan_commit=$(git log --diff-filter=A --format=%H -1 -- "plans/$slug.plan.md")
   git log "$plan_commit"..HEAD -- . ':(exclude)brief' ':(exclude)plans'
   ```

   Output → Stage 4. Empty → Stage 3, not started. Date it from the commit
   that *added* the plan, not the last to touch it: a build session amends the
   plan in the same commit as the code it drifted from, and dating from that
   would hide the very code it's meant to detect.

The SessionStart hook (`.claude/hooks/session-start-check.sh`) runs the same
rules once per session and names the stage file. Re-derive them here rather
than trusting a stale reading from the top of the conversation — a commit
landing mid-session moves the branch to the next stage.

**Stage 0 — nothing started.** Agree a slug with the user, then
`git checkout -b <slug>`. Running two streams at once? Use the `worktree`
skill instead of switching branches in place.

## Handing off between stages

Three boundaries, and the default at all three is **end the session.**

| Stage ends when | Next session |
|---|---|
| `brief/<slug>.md` committed | Stage 2 — Plan, in plan mode |
| `plans/<slug>.plan.md` committed | Stage 3 — Build, `/model sonnet` |
| Code committed | Stage 4 — Ship: verify, `verifier`, review, PR |

At each one: say the stage is done, name the next action in one line, suggest
a fresh session, and stop there. Don't take the next stage's first action in
the same message, and don't offer to. Say it once — if the user would rather
keep going, keep going.

A finished stage's context is spent, and every later turn pays to resend it;
`session-economy.md` in this directory has the full reasoning, including which
model each stage is worth. Read it if a boundary looks like ceremony.

## Rules that don't bend

- Nothing gets implemented without a committed plan. This is the one hard
  rule; the rest is a default path.
- One session, one stage. A stage ends where the table above says it ends,
  and the next stage's first action belongs to the next session. Suggest the
  handoff instead of starting the work and mentioning the handoff afterwards.
- Don't run several *stages* together unasked. Report where things stand
  compactly — a status line and the next action — then offer to move to the
  next stage, and do it once the user agrees. This governs stage transitions,
  not the steps inside a stage: Stage 4's steps run back to back without
  checking in between.
- For a genuinely trivial change (typo, version bump, one-line fix with an
  obvious test), say so and go straight to a branch and a PR. Skipping the
  brief is a judgment call to make out loud. Skipping the plan on anything
  larger than that is not.
