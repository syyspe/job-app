# Why each stage gets its own session

The handoff rules in `SKILL.md` are the mechanics. This is the reasoning
behind them — read it when a rule looks like ceremony, or when deciding
whether to break one.

Every turn resends the whole conversation, so context length is a recurring
cost, not a one-time one — and Opus-tier tokens weigh about 2.5x Sonnet-tier
against a subscription's usage limit. A stage's context is fully spent once
its artifact is committed; carrying it into the next stage means paying for it
on every turn that follows, forever.

- **A session per stage, not per feature.** Each committed artifact is a
  natural clear point. `session-start-check.sh` re-derives the stage from
  what's on disk, so a fresh session re-orients for almost nothing. Three
  boundaries: brief committed, plan committed, code committed.
- **Match the model to the stage.** Stages 1–2 are where the judgment is and
  are worth the Opus rate. Stage 3 executes a work order that is already
  written down and is the most turn-dense stage; Stage 4 is five mechanical
  steps that mostly delegate. `/model sonnet` at the Build handoff, and leave
  it there through Ship.
- **Prefer a subagent to reading.** Anything read into a session is paid for
  on every later turn; the same read inside a subagent costs one summary. Use
  `Explore` for "where does X live", and let `verifier` (pinned to Sonnet)
  read the diff in Stage 4 rather than re-reading it in the main session.
- **Don't resume a cold session.** The prompt cache goes stale after roughly
  an hour, so picking a long session back up after a break re-reads its whole
  context at full price. Stepping away mid-stage: commit what exists and start
  fresh later.

There's a second reason the boundaries are hard stops, and it isn't about
tokens at all: a session that just built something is the worst-placed judge
of whether it works. Fresh context is the point, not a side effect.
