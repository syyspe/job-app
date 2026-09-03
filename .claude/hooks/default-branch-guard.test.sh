#!/usr/bin/env bash
# Regression tests for default-branch-guard.sh — the one hook that enforces
# this repo's only hard policy, and the one whose input (an arbitrary shell
# command) is irregular enough to get parsed wrong.
#
# Self-contained: builds a throwaway git repo whose default branch is
# `master`, then feeds the hook PreToolUse payloads and checks allow (exit 0)
# against block (exit 2). No test framework, because the skeleton doesn't
# pick one for you.
#
# Run: bash .claude/hooks/default-branch-guard.test.sh

set -uo pipefail

GUARD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/default-branch-guard.sh"

repo=$(mktemp -d)
trap 'rm -rf "$repo"' EXIT

git -C "$repo" init -q -b master
git -C "$repo" -c user.email=t@example.com -c user.name=t \
  commit -q --allow-empty -m init
git -C "$repo" checkout -q -b feature

pass=0
fail=0

# check <allow|block> <branch to be on> <command>
check() {
  expected="$1"
  branch="$2"
  command="$3"

  git -C "$repo" checkout -q "$branch"
  payload=$(CMD="$command" python3 -c 'import json, os
print(json.dumps({"tool_input": {"command": os.environ["CMD"]}}))')

  status=0
  printf '%s' "$payload" | (cd "$repo" && bash "$GUARD") >/dev/null 2>&1 \
    || status=$?

  if [ "$expected" = "block" ]; then
    want=2
  else
    want=0
  fi

  if [ "$status" -eq "$want" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL: wanted %s, got exit %s\n      %s\n' \
      "$expected" "$status" "$command"
  fi
}

# The bug this file was written for: a chained PR-opening command. Every
# non-flag word after "push" reads as a refspec, so the `master` belonging
# to `gh pr create` used to block a push to a feature branch.
check allow feature \
  'git push -u origin feature && gh pr create --base master --title x'
check allow feature 'git push -u origin feature; gh pr create --base master'
check allow feature 'git push -u origin feature | tee log'

# A second push later in the chain still has to be caught — which is why
# the fix splits into segments rather than stopping at the first separator.
check block feature 'git push origin feature && git push origin master'
check block master 'git push origin feature && git push'

# The plain cases.
check block master 'git push'
check block feature 'git push origin master'
check block feature 'git push -u origin master'
check allow feature 'git push'
check allow feature 'git push origin feature'
check allow feature 'git push -u origin feature'

# Refspec shapes.
check block feature 'git push origin HEAD:master'
check block feature 'git push origin feature:refs/heads/master'
check block feature 'git push origin feature:master'
check allow feature 'git push origin master:feature'

# Not a push at all.
check allow feature 'gh pr create --base master'
check allow feature 'git log master'
check allow feature 'echo master'

# Prose is stripped by command-code.py, so a commit message naming the
# default branch doesn't block its own commit.
check allow feature 'git commit -m "stop pushing to master"'

# Only `master` is this repo's default; `main` is just a branch name.
check allow feature 'git push origin main'

# The escape hatch.
status=0
payload=$(python3 -c 'import json
print(json.dumps({"tool_input": {"command": "git push origin master"}}))')
git -C "$repo" checkout -q feature
printf '%s' "$payload" \
  | (cd "$repo" && ALLOW_DEFAULT_PUSH=1 bash "$GUARD") >/dev/null 2>&1 \
  || status=$?
if [ "$status" -eq 0 ]; then
  pass=$((pass + 1))
else
  fail=$((fail + 1))
  printf 'FAIL: ALLOW_DEFAULT_PUSH=1 should allow, got exit %s\n' "$status"
fi

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
