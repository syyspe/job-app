# plans/ — Stage 2

One plan per branch/PR, named to match: `brief/foo.md` → `plans/foo.plan.md`.
This is the one piece of process that earns its keep unconditionally —
"nothing gets implemented without a written plan" is what keeps a session
from confidently building the wrong thing for an hour.

Workflow:

1. Point Claude at the relevant `brief/*.md`. It puts *itself* into **plan
   mode** — both the `sdlc` skill and the session-start hook tell it to, so
   you don't have to remember to start the session that way.
2. Claude proposes a plan: affected files, work order, tests to add/update.
3. Iterate on it before any code is generated. This is the cheap place to
   change your mind.
4. Commit it here as `<slug>.plan.md`. That ends Stage 2 — Claude should say
   so and stop, not roll on into the work order.
5. Start a fresh session (auto mode, `/model sonnet`) and implement. The plan
   is the handoff, so the build session doesn't need the planning one's
   context. The merged diff should match this plan — Stage 4's `verifier` and
   review check exactly that, with fresh context.

Copy `TEMPLATE.plan.md` to get started. For independent parallel streams, use
the `worktree` skill (`.claude/skills/worktree/SKILL.md`) instead of switching
branches in place.

**Done when:** the plan is committed and you could implement it from the file
alone, without the conversation that produced it. If the implementation
departs from the plan, update the plan in the same commit — a plan that
silently drifts from the code is worse than no plan.

**Next:** Stage 3 (Build), in a fresh session — implement and commit, and
that's the whole stage. Run `/sdlc` for what follows it.
