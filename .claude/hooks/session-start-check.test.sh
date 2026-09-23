#!/usr/bin/env bash
# Regression tests for session-start-check.sh — the hook that tells every
# session which stage it is in. A brief or plan only counts once it is
# committed in HEAD; one that is merely on disk keeps the session in the
# stage that produces it.
#
# Self-contained: builds a throwaway git repo whose default branch is
# `master`, walks it through each stage in order, and checks the stage line
# the hook reports. No test framework, because the skeleton doesn't pick one
# for you.
#
# Run: bash .claude/hooks/session-start-check.test.sh

set -uo pipefail

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/session-start-check.sh"

repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT

commit() {
  git -C "$repo" add -A
  git -C "$repo" -c user.email=t@example.com -c user.name=t \
    commit -q -m "$1"
}

git -C "$repo" init -q -b master
mkdir -p "$repo/.claude" "$repo/brief" "$repo/plans"
touch "$repo/.claude/.bootstrapped"
commit init
git -C "$repo" checkout -q -b demo

pass=0
fail=0

# check <expected substring of the hook's context>
check() {
  expected="$1"

  context=$(CLAUDE_PROJECT_DIR="$repo" bash "$HOOK" | python3 -c \
    'import json, sys
print(json.load(sys.stdin)["hookSpecificOutput"]["additionalContext"])')

  if printf '%s' "$context" | grep -qF -- "$expected"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL: wanted %s\n      got:\n%s\n' "$expected" "$context"
  fi
}

check 'Stage 1 (Brief) — not started.'

echo brief >"$repo/brief/demo.md"
check 'Stage 1 (Brief) — brief written, not committed.'
check '[ ] brief/demo.md'

commit brief
check 'Stage 2 (Plan) — brief committed, no plan yet.'
check '[x] brief/demo.md'

# The case that used to report Stage 3: an uncommitted plan dirties the tree.
echo plan >"$repo/plans/demo.plan.md"
check 'Stage 2 (Plan) — plan written, not committed.'

commit plan
check 'Stage 3 (Build) — plan committed, no code yet.'

echo code >"$repo/code.txt"
check 'Stage 3 (Build) — plan committed, work in progress.'

commit code
check 'Stage 4 (Ship)'

git -C "$repo" checkout -q master
check 'on the default branch'

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
