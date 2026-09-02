# Project Instructions for Claude

> Template: replace every `<placeholder>` before use. This file is read by
> Claude at the start of every session in this repo — it's the highest
> leverage file in the whole skeleton. Keep it accurate; stale instructions
> are worse than none.

## Setup

If `.claude/.bootstrapped` does not exist in this repo, this project
hasn't been configured yet. Before doing anything else this session —
before answering unrelated questions — start the guided setup: open
`.claude/skills/bootstrap/SKILL.md` and follow it exactly, one question at
a time, beginning with the project's name and purpose. Give a one-line
intro and the first question in your very first message; don't wait to be
asked and don't ask permission to begin.

## Commands

- Build: `<build command>`
- Test: `<test command>`
- Lint: `<lint command>`
- Format: `<format command>`

Expected healthy output for tests: `<e.g. "N passed, 0 failed">`

## Conventions

- Language/runtime: `<language + version>`
- Framework: `<framework + version>`
- Dependency policy: `<e.g. "no new dependencies without approval">`
- `<other hard rules — e.g. "money is always Decimal, never float">`
- `<testing convention — e.g. "every endpoint needs an integration test">`

## Architecture

- `<top-level dir>/` — `<what lives here>`
- `<top-level dir>/` — `<what lives here>`
- `<note on generated code, if any — e.g. "schemas/ is generated, never edit by hand">`

## Things Claude gets wrong here

> Add to this list the second time Claude makes the same mistake — see
> `REVIEW.md` for the review-feedback loop that feeds this section.

- `<example: "don't bump dependency versions without being asked">`
- `<example: "package X is frozen, changes go in package Y">`

## Working agreement

- Nothing gets implemented without a committed plan first — see
  `plans/README.md`.
- Skills in `.claude/skills/` encode policy — check the relevant one
  before starting work that matches its trigger conditions; don't wait to
  be flagged. In particular: `simple-code` applies to every function and
  file you touch while writing or editing code, unconditionally — its
  limits and no-cleverness/no-defensive-code rules are active from the
  first line, not a checklist for after `verifier` or review catches
  something.
- Hooks in `.claude/hooks/` are hard guardrails, not suggestions — if one
  blocks you, that's a signal to stop and check with me, not to work
  around it.
- The default branch is PR-only. Never push to it directly, however small
  the change or however clearly it was asked for — commit on a branch and
  open a PR. `default-branch-guard.sh` enforces this. It's a solo repo, so
  I'm the reviewer; the point is that the diff gets looked at once, in one
  place, before it lands.

## The loop

Work moves through four stages. Each ends by committing an artifact, and that
commit is what starts the next stage — one kebab-case slug names the branch
and every artifact on it.

| Stage | Artifact | Unlocked by |
|---|---|---|
| 1. Brief | `brief/<slug>.md` | — |
| 2. Plan | `plans/<slug>.plan.md` | brief committed |
| 3. Build | code + tests | plan committed **before** code |
| 4. Ship | PR reviewed per `REVIEW.md`, merged | verification passes, `verifier` PASS |

There are no approval flags to flip — an artifact exists or it doesn't, and
that's the whole state. Run the `sdlc` skill (`/sdlc`) to see where the
current branch stands and what the next action is.

Stages are the default path, not a cage. For a genuinely trivial change — a
typo, a version bump, a one-line fix with an obvious test — say so and go
straight to a branch and a PR. Skipping the brief is a judgment call you can
make out loud; skipping the plan on anything that isn't trivial is not.

## Session hygiene

Every turn resends the whole conversation, so context length is a recurring
cost, not a one-time one — and Opus-tier tokens weigh about 2.5x Sonnet-tier
against a subscription's usage limit. The loop above already provides the
seams; use them.

- **A session per stage, not per feature.** Each committed artifact is a
  natural clear point. `session-start-check.sh` re-derives the stage from
  what's on disk, so a fresh session re-orients for almost nothing, while
  carrying a finished stage's context forward is paid for on every turn that
  follows. When a stage's artifact lands, say so and suggest starting the
  next one fresh.
- **Match the model to the stage.** Stages 1–2 are where the judgment is and
  are worth the Opus rate. Stage 3 executes a work order that is already
  written down, and it's the most turn-dense stage — suggest `/model sonnet`
  when a build starts.
- **Prefer a subagent to reading.** Anything read into this session is paid
  for on every later turn; the same read inside a subagent costs one summary.
  Use `Explore` for "where does X live", and hand verification to `verifier`
  (pinned to Sonnet) rather than re-reading the diff here.
- **Don't resume a cold session.** The prompt cache goes stale after roughly
  an hour, so picking a long session back up after a break re-reads its whole
  context at full price. Stepping away mid-stage: commit what exists and
  start fresh later.
