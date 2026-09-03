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
| 3. Build | The code and its tests | Code committed |
| 4. Ship | Verification, review, and a PR | The user reads it and merges |

Every boundary is a commit, so every one is computable — which is what the
next section does. (`CLAUDE.md` has why verification sits at the head of Stage
4 rather than the tail of Stage 3.)

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

The stage ends at that commit. Nothing else belongs here — not the
verification command, not `verifier`, not `/code-review`. A build session is
the worst-placed judge of its own build: it knows what the code was *meant* to
do, which is exactly the assumption verification exists to break. Hand it to a
session that has to read the diff cold.

**Stage 4 — Ship.** A fresh session, opening on a clean tree with the build
committed. Four steps, in order, as one continuous sequence — don't stop
between them to ask how to proceed:

1. **Verify.** Run the verification command from `CLAUDE.md` and report its
   real output, not a paraphrase. If it says "3 failed," say that.
2. **`verifier`.** The subagent re-checks the diff against the plan with fresh
   context and reports PASS / FAIL / PASS WITH CONCERNS.
3. **`/code-review`.** Applies `REVIEW.md`'s passes: Bugs, Security, Scope,
   Simplicity. Fix what it raises.
4. **Ship.** `git push -u origin <slug> && gh pr create`. The default branch is
   PR-only and `default-branch-guard.sh` blocks a direct push, so there is no
   shortcut here even for a one-line change. The user merges.

If step 1 or 2 fails, fixing it is this session's job. A one-line fix happens
here; anything substantial means a real return to Stage 3 — say so, and start
a fresh Build session rather than quietly turning the Ship session into one.

## Handing off between stages

Three boundaries, and the default at all three is **end the session** — why
that's worth doing is `CLAUDE.md`'s Session hygiene section; this is the
mechanics.

| Stage ends when | Next session |
|---|---|
| `brief/<slug>.md` committed | Stage 2 — Plan, in plan mode |
| `plans/<slug>.plan.md` committed | Stage 3 — Build, `/model sonnet` |
| Code committed | Stage 4 — Ship: verify, `verifier`, `/code-review`, PR |

At each one, follow the handoff rule in `CLAUDE.md`'s Session hygiene: stage
done, next action named in one line, fresh session suggested, stop there.
`/model sonnet` belongs with the Build handoff and stays on for Ship.

## Rules that don't bend

- Nothing gets implemented without a committed plan. This is the one hard
  rule; the rest is a default path.
- One session, one stage. A stage ends where the table above says it ends,
  and the next stage's first action belongs to the next session. Suggest the
  handoff instead of starting the work and mentioning the handoff afterwards.
- Don't run several *stages* together unasked. Report where things stand
  compactly — a status line and the next action — then offer to move to the
  next stage, and do it once the user agrees. This governs stage transitions,
  not the steps inside a stage: Stage 4's verify → `verifier` → review → PR
  run back to back without checking in between.
- For a genuinely trivial change (typo, version bump, one-line fix with an
  obvious test), say so and go straight to a branch and a PR. Skipping the
  brief is a judgment call to make out loud. Skipping the plan on anything
  larger than that is not.
- If a hook blocks you, that's a signal to stop and ask the user, not to
  work around it.
