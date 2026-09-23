---
slug: stage-check-committed
date: 2026-09-23
---

# Stage check reads committed artifacts, not files on disk

## Problem

`.claude/hooks/session-start-check.sh` decides whether the brief and plan are
committed by checking that the files exist on disk (`[ -f "$brief" ]`,
`[ -f "$plan" ]`). A brief written but not committed is reported as
"brief committed". The plan check has the same flaw: an uncommitted plan with
a dirty tree is reported as "Stage 3 (Build) — plan committed, work in
progress", although plan-before-code, the one hard rule, has not been met.
The "Work out where you are" rules in `.claude/skills/sdlc/SKILL.md` ask the
same existence question, so the skill and the hook share the flaw.

This was noticed during the previous work item (`sdlc-process-review`).
Nothing went wrong because of it, so this is an improvement, not a fix for an
incident.

## What done looks like

1. The hook treats the brief as committed only when `brief/<slug>.md` is
   present in `HEAD`.
2. The hook treats the plan as committed only when `plans/<slug>.plan.md` is
   present in `HEAD`.
3. When an artifact exists on disk but is not committed, the hook keeps the
   session in the stage that produces it and names the missing step, e.g.
   "Stage 1 (Brief) — brief written, not committed. Next: commit it; that
   commit ends the stage."
4. The "Work out where you are" rules in `SKILL.md` use the same
   committed-in-`HEAD` test, so the skill and the hook give the same answer.
5. A new `.claude/hooks/session-start-check.test.sh`, beside the existing
   `default-branch-guard.test.sh`, covers: brief written but uncommitted, plan
   written but uncommitted, and the committed cases still reporting as they
   do today.

## Approach

"Committed" means the file is present in `HEAD`:
`git cat-file -e HEAD:<path>`. An artifact that exists on disk but fails that
check puts the session in the stage that produces it, with "commit it" as the
next action.

## Out of scope

- The other hooks in `.claude/hooks/`.
- The "code committed" check. It already reads git history.
- Rewording the stage files or other docs beyond the `SKILL.md` "Work out
  where you are" rules.

---

**Next stage:** run `/sdlc`.
