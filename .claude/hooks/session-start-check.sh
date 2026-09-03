#!/usr/bin/env bash
# SessionStart hook, two jobs:
#
#   1. Unconfigured clone (no .claude/.bootstrapped) — push the session into
#      the bootstrap skill.
#   2. Configured repo — report where the current branch stands in the loop
#      and what the next action is. The stage is derived from the artifact
#      chain itself (which of brief/plans exist for the branch slug), never
#      from separate state and never from an approval flag: an artifact
#      exists or it doesn't.
#
# Both paths only inject context — this hook never blocks anything, and any
# probe that can't run (no git, missing dirs) falls back to silence.

set -euo pipefail
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

if [ ! -f .claude/.bootstrapped ]; then
  cat <<'EOF'
{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "This is an unconfigured clone of the ai-sdlc-skeleton (no .claude/.bootstrapped marker). Start the bootstrap flow immediately in your first message: a one-line intro plus the first question (project name and purpose) in the same message — don't ask permission to begin, and don't bundle further questions in with it. Follow .claude/skills/bootstrap/SKILL.md exactly: one question at a time, waiting for each reply, including its tech-stack scaffolding step."}}
EOF
  exit 0
fi

HOWTO="Orientation, not a script to recite: if the user opens with something \
open-ended (what next, let's continue, hi), lead with the stage and next \
action in at most two lines. Otherwise hold this as context and answer what \
was asked. The sdlc skill has the full loop map and the exact commands."

emit() {
  MSG="$1" python3 -c 'import json, os
print(json.dumps({"hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": os.environ["MSG"],
}}))'
  exit 0
}

checklist_line() {
  if [ -f "$1" ]; then
    printf '  [x] %s\n' "$1"
  else
    printf '  [ ] %s\n' "$1"
  fi
}

slug=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
[ -n "$slug" ] || exit 0

case "$slug" in
  main | master | HEAD)
    emit "Loop status: on the default branch ($slug) — no work stream checked out.

Next: Stage 1 (Brief). Pick a short kebab-case slug, run git checkout -b
<slug>, then write brief/<slug>.md from brief/TEMPLATE.md. That one slug names
the branch and the plan that follows it.

$HOWTO"
    ;;
esac

brief="brief/$slug.md"
plan="plans/$slug.plan.md"

if [ ! -f "$brief" ] && [ ! -f "$plan" ] && [ ! -d brief ]; then
  exit 0  # not a skeleton layout (or the dirs were removed) — say nothing
fi

chain=$(
  checklist_line "$brief"
  checklist_line "$plan"
)

if [ ! -f "$brief" ]; then
  stage="Stage 1 (Brief) — not started."
  next="write $brief from brief/TEMPLATE.md with the user (Problem, What done
looks like, Approach, Out of scope, Open questions), then commit it. Keep it
thin — a short honest brief beats a padded one. There's no approval step; the
commit is the handoff to Stage 2."
elif [ ! -f "$plan" ]; then
  stage="Stage 2 (Plan) — brief committed, no plan yet."
  next="call the EnterPlanMode tool now, as your first action — don't wait to
be asked and don't assume the user started the session in plan mode. Then read
$brief and iterate on the approach until it could be implemented from the file
alone. Once ExitPlanMode is approved, write the plan to $plan from
plans/TEMPLATE.plan.md and commit it BEFORE any code — that commit is the audit
trail Stage 4 review checks the diff against. Then stop: the commit ends the
stage. Approving ExitPlanMode approves the plan, not a go-ahead to build now —
don't start the work order in this session. Say the plan is committed, name its
first step, and suggest picking Build up in a fresh session with /model
sonnet."
elif [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  stage="Stage 3 (Build) — plan committed, work in progress."
  next="finish the plan's work order, then run the verification command from
CLAUDE.md and hand the change to the verifier subagent. If implementation
departed from the plan, update $plan in the same commit. Once the code is
committed, verification is green and the verifier reports PASS, the stage is
over — /code-review, push and the PR are Stage 4, in a fresh session."
else
  stage="Stage 3 (Build) → Stage 4 (Ship) — plan committed, working tree clean."
  next="implement $plan's work order, or if it's already committed and verified,
run Stage 4 here: /code-review (REVIEW.md's passes), push, and open a PR. Check
git log against the plan's work order rather than assuming which of the two it
is. If it's the build that's still to do, that's this session's whole job —
end it once the verifier reports PASS and leave Stage 4 to a fresh one."
fi

emit "Loop status — branch: $slug

$chain

$stage
Next: $next

$HOWTO"
