---
slug: sdlc-process-review
date: 2026-09-23
---

# Give each SDLC rule one home

## Problem

The four-stage process (brief → plan → build → ship) itself works. The
problem is that its rules appear in too many places. The stage table, the
rule that one slug names everything, plan-before-code, the commit being the
handoff, and one-stage-per-session each appear in several of `README.md`,
`CLAUDE.md`, `.claude/skills/sdlc/SKILL.md`, the four `stages/*.md` files,
`brief/README.md`, `plans/README.md`, and the messages printed by
`.claude/hooks/session-start-check.sh`. Every session pays to read them
again, and every change to the process has to be made in all of those places
without missing one. Much of the text explains why a rule exists instead of
saying what to do.

An outside review (GitHub Copilot, model MAI-Code-1.1-Flash, 2026-09-23)
found this, and a look at the files confirms it. For example, the stage table
appears three times: `README.md`, `CLAUDE.md` "The loop" and `SKILL.md`.

## What done looks like

1. Each of these rules is stated in full in exactly one file: the stage
   table, slug naming, plan-before-code, commit-as-handoff, one stage per
   session, and the trivial-change exception. Every other file that mentions
   a rule points to that file instead of stating the rule again.
2. `CLAUDE.md` keeps only the rules a session has to act on before it opens
   the `sdlc` skill, as short lines that point to the skill.
3. Explanatory prose ("why this boundary exists") is in one place,
   `session-economy.md` or the root `README.md`, and is gone from the files
   that give the instructions.
4. The hook messages name the stage and the next action, and point to the
   stage file instead of restating its rules.
5. What the process does is unchanged: the same four stages, the same
   artifacts, the same hard rule that no code is written before a plan is
   committed, and the same guardrail hooks.

## Approach

Edit the docs only. For each repeated rule, the plan picks where it should
live and lists every other place it appears, each to be deleted or replaced
with a pointer. The plan should name each file and section it touches.

Adding a single "rules" file on top of the existing ones was rejected,
because it would be one more copy, not a replacement.

## Out of scope

- Code, tests, or build configuration.
- New automation or new workflow steps.
- The session-start hook reporting a brief as committed when it only exists
  on disk. That is a real bug, but it gets its own branch.
- Changing which stages exist or what counts as each stage's artifact.

## Open questions

- Should the session-boundary rules (end the session at each stage, don't
  offer to continue) stay as firm as they are, or become a default? The user
  decides this; the plan only records the answer.
- Does Stage 4 need `verifier`, `/review` and `/security-review` for every
  diff, or should the lighter checks be enough for low-risk diffs (docs-only
  changes, internal refactors)? If the answer changes Stage 4, the change
  belongs in this plan. If not, Stage 4 stays as it is.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/sdlc-process-review.plan.md` before
writing any code.
