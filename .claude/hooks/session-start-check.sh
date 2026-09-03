#!/usr/bin/env bash
# SessionStart hook, two jobs:
#
#   1. Unconfigured clone (no .claude/.bootstrapped) — push the session into
#      the bootstrap skill.
#   2. Configured repo — report where the current branch stands in the loop
#      and what the next action is. The stage is derived from the artifact
#      chain itself — which of brief/plan exist for the branch slug, and
#      whether code has landed since the plan commit — never from separate
#      state and never from an approval flag. Every boundary is computable
#      here; the sdlc skill says why that constraint drives where
#      verification sits.
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
was asked. The line above is the imperative only — the sdlc skill has the full \
loop map, the exact commands, and the reasoning behind each stage. Read it \
before departing from the next action named here."

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

# Has code landed since the plan was committed? Dated from the commit that
# ADDED the plan, not the last one to touch it — a build session is told to
# amend the plan in the same commit as the code it drifted from, and dating
# from that would hide the very code it's meant to detect.
code=""
if [ -f "$plan" ]; then
  plan_commit=$(git log --diff-filter=A --format=%H -1 -- "$plan" 2>/dev/null)
  if [ -n "$plan_commit" ]; then
    code=$(git log --format=%H "$plan_commit"..HEAD -- . \
      ':(exclude)brief' ':(exclude)plans' 2>/dev/null)
  fi
fi

chain=$(
  checklist_line "$brief"
  checklist_line "$plan"
  if [ -n "$code" ]; then
    printf '  [x] code committed\n'
  else
    printf '  [ ] code committed\n'
  fi
)

# One imperative per state. The reasoning behind each lives in the sdlc skill,
# which HOWTO points at — repeating it here is what let the two drift apart.
if [ ! -f "$brief" ]; then
  stage="Stage 1 (Brief) — not started."
  next="write $brief from brief/TEMPLATE.md, interviewing the user one question
at a time, then commit it. That commit ends the stage. Full instructions:
.claude/skills/sdlc/stages/1-brief.md"
elif [ ! -f "$plan" ]; then
  stage="Stage 2 (Plan) — brief committed, no plan yet."
  next="call the EnterPlanMode tool now, as your first action. Read $brief and
iterate, then write $plan from plans/TEMPLATE.plan.md and commit it BEFORE any
code. Stop there — approving ExitPlanMode approves the plan, it is not a
go-ahead to build in this session. Full instructions:
.claude/skills/sdlc/stages/2-plan.md"
elif [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  stage="Stage 3 (Build) — plan committed, work in progress."
  next="finish $plan's work order and commit it; if the implementation departed
from the plan, update $plan in the same commit. That commit ends the stage.
Verification, verifier, /code-review and the PR are Stage 4 — don't run them
here. Full instructions: .claude/skills/sdlc/stages/3-build.md"
elif [ -z "$code" ]; then
  stage="Stage 3 (Build) — plan committed, no code yet."
  next="implement $plan's work order and commit it — simple-code applies from
the first line. That commit is this session's whole job and ends the stage.
Full instructions: .claude/skills/sdlc/stages/3-build.md"
else
  stage="Stage 4 (Ship) — code committed since the plan."
  next="read .claude/skills/sdlc/stages/4-ship.md and run its steps in order,
as one continuous sequence, without stopping to ask in between: the
verification command from CLAUDE.md, the verifier subagent against $plan,
/code-review, /security-review if the diff touches a real boundary, then git
push -u origin $slug && gh pr create. The user reviews and merges."
fi

emit "Loop status — branch: $slug

$chain

$stage
Next: $next

$HOWTO"
