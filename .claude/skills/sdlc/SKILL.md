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

## The loop

One short kebab-case slug (e.g. `csv-export`) names the branch and every
artifact on it.

| Stage | Artifact | What unlocks the next stage |
|---|---|---|
| 1. Brief | `brief/<slug>.md` | Brief committed |
| 2. Plan | `plans/<slug>.plan.md` | Plan committed **before** any code |
| 3. Build | The code and its tests | Work order done, verification passes |
| 4. Ship | PR with `REVIEW.md`'s passes applied | The user reads it and merges |

## Work out where you are

Read it off the branch, in this order — first match wins:

1. `git rev-parse --abbrev-ref HEAD`. On `main`/`master`, no work stream is
   checked out: the next action is Stage 1 on a new branch.
2. Otherwise the branch name is the slug. Check for `brief/<slug>.md` and
   `plans/<slug>.plan.md`.
3. Missing artifact → you are in the stage that produces it.
4. Plan present: `git status --porcelain` dirty means Build is in progress;
   clean means either implement it, or it's implemented and Stage 4 is next
   — check `git log` against the plan's work order rather than guessing.

The SessionStart hook (`.claude/hooks/session-start-check.sh`) runs the same
rules once per session. Re-derive them here rather than trusting a stale
reading from the top of the conversation.

## What to do at each stage

**Stage 0 — nothing started.** Agree a slug with the user, then
`git checkout -b <slug>`. Running two streams at once? Use the `worktree`
skill instead of switching branches in place.

**Stage 1 — Brief.** Write `brief/<slug>.md` from `brief/TEMPLATE.md` by
interviewing the user — Problem, What done looks like, Approach, Out of
scope, Open questions — one question at a time. Write what they actually
said. Leave a section thin, or delete it, rather than inventing requirements
to fill it. Commit it. No approval step follows; the commit is the handoff.

**Stage 2 — Plan.** Call `EnterPlanMode` yourself, as the first action of the
stage. Don't wait to be asked and don't assume the user started the session in
plan mode — remembering to flip the mode is the most-forgotten step in the
loop, and it's yours to remember, not theirs. Then read the brief and iterate
until the plan could be implemented from the file alone, without the
conversation that produced it. Once `ExitPlanMode` is approved, write the plan
into `plans/<slug>.plan.md` in `plans/TEMPLATE.plan.md`'s shape and commit it
*before* writing code — that commit is what Stage 4 compares the diff
against.

**Stage 3 — Build.** Implement the work order. `simple-code` applies from the
first line, not as a cleanup pass afterwards. For a bug fix, commit the
failing test *before* the fix and don't edit it while fixing. If the
implementation departs from the plan, update `plans/<slug>.plan.md` in the
same commit rather than letting them drift.

**Stage 4 — Ship.** Run the verification command from `CLAUDE.md`'s Commands
section and report its real output, not a paraphrase. Hand the change to the
`verifier` subagent — fresh context, checks the diff against the plan — and
fix what it finds. Then `/code-review` (it applies `REVIEW.md`'s passes:
Bugs, Security, Scope, Simplicity), push the branch, and open a PR:
`git push -u origin <slug> && gh pr create`. The default branch is PR-only
and `default-branch-guard.sh` blocks a direct push to it, so there is no
shortcut here even for a one-line change. The user merges.

## Handing off between stages

Committing a stage's artifact is a clear point, not just a milestone. The
whole conversation is resent on every turn, so a finished stage's context
gets paid for again and again — and the stage rules above are re-derivable
from disk by one hook, so carrying it forward buys almost nothing. See
`CLAUDE.md`'s Session hygiene section.

So: right after committing `brief/<slug>.md` or `plans/<slug>.plan.md`, say
the stage is done, name the next action in one line, and suggest picking it
up in a fresh session. Say it once — if the user would rather keep going,
keep going.

Stage 3 is also where to suggest `/model sonnet`. The work order is already
written down by then, and Build is the most turn-dense stage.

## Rules that don't bend

- Nothing gets implemented without a committed plan. This is the one hard
  rule; the rest is a default path.
- Don't run several stages together unasked. Report where things stand
  compactly — a status line and the next action — then offer to do that next
  step, and do it once the user agrees.
- For a genuinely trivial change (typo, version bump, one-line fix with an
  obvious test), say so and go straight to a branch and a PR. Skipping the
  brief is a judgment call to make out loud. Skipping the plan on anything
  larger than that is not.
- If a hook blocks you, that's a signal to stop and ask the user, not to
  work around it.
