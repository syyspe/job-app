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
| 3. Build | The code and its tests | Work order done, verification green, `verifier` PASS |
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
to fill it. Commit it. No approval step follows; the commit is the handoff —
and it ends the stage, so hand off to a fresh session rather than opening the
plan here.

**Stage 2 — Plan.** Call `EnterPlanMode` yourself, as the first action of the
stage. Don't wait to be asked and don't assume the user started the session in
plan mode — remembering to flip the mode is the most-forgotten step in the
loop, and it's yours to remember, not theirs. Then read the brief and iterate
until the plan could be implemented from the file alone, without the
conversation that produced it. Once `ExitPlanMode` is approved, write the plan
into `plans/<slug>.plan.md` in `plans/TEMPLATE.plan.md`'s shape and commit it —
that commit is what Stage 4 compares the diff against.

Approving `ExitPlanMode` approves the *plan*. It is not a go-ahead to build
now, and this is the boundary that gets crossed by accident most often: the
plan is fresh in context, step 1 looks small, and starting it costs nothing
visible. Committing the plan ends the stage. Don't open a file from the work
order, don't do step 1 "while we're here" — say the plan is committed, name
its first step in one line, and hand off to a fresh session (`/model
sonnet`).

**Stage 3 — Build.** Implement the work order. `simple-code` applies from the
first line, not as a cleanup pass afterwards. For a bug fix, commit the
failing test *before* the fix and don't edit it while fixing. If the
implementation departs from the plan, update `plans/<slug>.plan.md` in the
same commit rather than letting them drift.

The stage ends when the code is committed, the verification command from
`CLAUDE.md` runs green, and the `verifier` subagent — fresh context, checks the
diff against the plan — reports PASS. Fix what it finds, then stop. Review and
the PR are Stage 4. Don't run `/code-review` here: it reads the diff off disk,
so it gains nothing from this session's context and pays full price for it, and
a build session is the worst-placed reviewer of its own build.

**Stage 4 — Ship.** A fresh session, opening on a clean tree with the build
committed. Run `/code-review` (it applies `REVIEW.md`'s passes: Bugs,
Security, Scope, Simplicity), fix what it raises, then push and open a PR:
`git push -u origin <slug> && gh pr create`. The default branch is PR-only and
`default-branch-guard.sh` blocks a direct push to it, so there is no shortcut
here even for a one-line change. The user merges.

If the build wasn't verified — no verification command run, no `verifier` PASS
— do that first and report its real output, not a paraphrase. That's Stage 3's
tail arriving late, not something to skip.

## Handing off between stages

Every stage ends at a commit, and every one of those commits is a clear point,
not just a milestone. The whole conversation is resent on every turn, so a
finished stage's context gets paid for again and again — and the stage rules
above are re-derivable from disk by one hook, so carrying it forward buys
almost nothing. See `CLAUDE.md`'s Session hygiene section.

There are three boundaries, and the default at all three is **end the
session**:

| Stage ends when | Next session |
|---|---|
| `brief/<slug>.md` committed | Stage 2 — Plan, in plan mode |
| `plans/<slug>.plan.md` committed | Stage 3 — Build, `/model sonnet` |
| Code committed, verification green, `verifier` PASS | Stage 4 — Ship: `/code-review`, push, PR |

At each one: say the stage is done, name the next action in one line, suggest
picking it up fresh — and stop there. Don't take the next stage's first action
in the same message, and don't offer to take it in this session. Say it once;
if the user would rather keep going, keep going.

`/model sonnet` belongs with the Build handoff. The work order is written down
by then, and Build is the most turn-dense stage.

## Rules that don't bend

- Nothing gets implemented without a committed plan. This is the one hard
  rule; the rest is a default path.
- One session, one stage. A stage ends where the table above says it ends,
  and the next stage's first action belongs to the next session. Suggest the
  handoff instead of starting the work and mentioning the handoff afterwards.
- Don't run several stages together unasked. Report where things stand
  compactly — a status line and the next action — then offer to do that next
  step, and do it once the user agrees.
- For a genuinely trivial change (typo, version bump, one-line fix with an
  obvious test), say so and go straight to a branch and a PR. Skipping the
  brief is a judgment call to make out loud. Skipping the plan on anything
  larger than that is not.
- If a hook blocks you, that's a signal to stop and ask the user, not to
  work around it.
