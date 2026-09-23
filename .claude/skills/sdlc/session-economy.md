# Why the process is shaped this way

`SKILL.md` and the stage files say what to do. This file is the only place
that says why — read it when a rule looks like ceremony, or when deciding
whether to break one.

## Why each stage gets its own session

Every turn resends the whole conversation, so context length is a recurring
cost, not a one-time one — and Opus-tier tokens weigh about 2.5x Sonnet-tier
against a subscription's usage limit. A stage's context is fully spent once
its artifact is committed; carrying it into the next stage means paying for it
on every turn that follows, forever.

- **A session per stage, not per feature.** Each committed artifact is a
  natural clear point. `session-start-check.sh` re-derives the stage from
  what's on disk, so a fresh session re-orients for almost nothing.
- **Read only the stage file you land in.** A session works one stage; the
  other three stage files would be dead weight for the rest of it.
- **Match the model to the stage.** Stages 1–2 are where the judgment is and
  are worth the Opus rate. Stage 3 executes a work order that is already
  written down and is the most turn-dense stage; Stage 4 is five mechanical
  steps that mostly delegate. `/model sonnet` at the Build handoff, and leave
  it there through Ship.
- **Prefer reading to a subagent.** Sessions here are short, a few turns
  each, so a file read into the main session is resent only a handful of
  times. A subagent starts cold and re-derives context the session already
  has, which costs more than the read it replaces — so don't use `Explore`
  for "where does X live". The exception is `verifier` in Stage 4: there the
  fresh context is the point (see below), not a saving.
- **Don't resume a cold session.** The prompt cache goes stale after roughly
  an hour, so picking a long session back up after a break re-reads its whole
  context at full price.

## Why the boundaries are hard stops

It isn't only about tokens: a session that just built something is the
worst-placed judge of whether it works. It knows what the code was *meant* to
do, which is exactly the assumption verification exists to break. Fresh
context is the point, not a side effect — so checking the build is the next
session's job, done by a session that has to read the diff cold.

## Why the commit is the only state

- **Verification opens Stage 4 instead of closing Stage 3.** Every boundary
  is a commit, and whether verification has run is the one thing a fresh
  session can't read off disk — so nothing gates on it. Anything that has to
  be *remembered* to be true isn't state; only what's committed is.
- **No approval flags.** There is no `status:` field and no sign-off step.
  With one person as the only reviewer, flipping a flag against yourself is
  ceremony, not a gate. You approve something by committing it, and an
  artifact exists or it doesn't — that's the whole state machine, readable
  with `ls`.
- **Stage 4 is detected from the commit that *added* the plan.** A build
  session amends the plan in the same commit as the code it drifted from, so
  dating from the last commit to touch the plan would hide the very code the
  check is meant to detect.

## Why each stage's rules are what they are

- **A brief doesn't invent requirements.** A brief that answers questions the
  user never considered is a plan's worth of assumptions wearing a brief's
  clothes. Thin and honest is worth more than full and made up.
- **Plan before code.** This is the one piece of process that earns its keep
  unconditionally: a written plan is what keeps a session from confidently
  building the wrong thing for an hour, and it is what Stage 4 compares the
  diff against. It has to be implementable from the file alone because the
  build session gets the file and nothing else.
- **The plan and the code change in the same commit.** A plan that silently
  drifts from the code is worse than no plan.
- **The plan session calls `EnterPlanMode` itself.** Remembering to flip the
  mode is the most-forgotten step in the loop, so it's the session's job, not
  the user's.
- **Approving `ExitPlanMode` gets mistaken for a go-ahead to build.** It is
  the boundary most often crossed without noticing: the plan is fresh in
  context, step 1 looks small, and starting it costs nothing visible. It
  approves the plan only.
- **The failing test is committed before the fix.** A test edited during the
  fix has stopped being evidence.
- **Unplanned work is named in the PR body.** It isn't automatically wrong,
  but it should reach the user as a decision, not as a surprise found while
  reading.
- **Stage 4's light path.** A docs-only or internal-refactor diff can't
  change what the app does or where its boundaries are. The verification
  command and `/review`'s four passes (Scope included) still run; `verifier`
  and `/security-review` add cost for little a diff like that
  can get wrong. Anything executable — a hook, config, a dependency — can, so
  it takes the full sequence.
