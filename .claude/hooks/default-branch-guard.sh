#!/usr/bin/env bash
# PreToolUse hook (Bash): blocks pushes to the default branch. This repo is
# PR-only — the default branch advances by merge, never by direct push, so
# every change gets REVIEW.md's passes and a look from you before it lands.
#
# This is the local half of that policy. The server-side half is branch
# protection (or a ruleset) on the remote; set it up if your GitHub plan
# allows it, since a hook only governs agent sessions in this repo, not what
# someone types in their own terminal.
#
# Escape hatch, for the rare legitimate case: ALLOW_DEFAULT_PUSH=1, the same
# shape as production-gate.sh's RELEASE_APPROVAL.
#
# Exit 0 to allow, exit 2 to block (stderr is shown to Claude as the reason).

set -euo pipefail

input=$(cat)
# Match against the command's code, not the prose it carries — otherwise a
# commit message mentioning a push to the default branch blocks its own
# commit. See command-code.py.
command=$(python3 "$(dirname "${BASH_SOURCE[0]}")/command-code.py" <<< "$input" 2>/dev/null)

case "$command" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

if [ "${ALLOW_DEFAULT_PUSH:-}" = "1" ]; then
  exit 0
fi

# No pipeline here: pipefail would turn "no origin/HEAD ref" into a hard exit.
default_branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
default_branch="${default_branch#origin/}"
if [ -z "$default_branch" ]; then
  for candidate in main master; do
    if git show-ref --verify --quiet "refs/heads/$candidate" 2>/dev/null; then
      default_branch="$candidate"
      break
    fi
  done
fi

if [ -z "$default_branch" ]; then
  exit 0  # can't tell what the default branch is — don't guess, don't block
fi

# Everything after "push" that isn't a flag: first word is the remote, the
# rest are refspecs. No refspec means git pushes the current branch.
args=""
seen_push=0
for word in $command; do
  if [ "$word" = "push" ]; then
    seen_push=1
  elif [ "$seen_push" -eq 1 ]; then
    case "$word" in
      -*) ;;
      *) args="$args $word" ;;
    esac
  fi
done

# shellcheck disable=SC2086
set -- $args
if [ "$#" -gt 0 ]; then
  shift  # drop the remote
fi

if [ "$#" -eq 0 ]; then
  target=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
else
  target=""
  for spec in "$@"; do
    dest="${spec##*:}"              # src:dest, :dest, or a bare branch name
    dest="${dest#refs/heads/}"
    if [ "$dest" = "$default_branch" ]; then
      target="$default_branch"
    fi
  done
fi

if [ "$target" = "$default_branch" ]; then
  echo "Blocked: '$default_branch' is this repo's default branch, and it only \
advances through a reviewed, merged PR — never a direct push. Push a branch \
instead and open a PR: git push -u origin <branch> && gh pr create. If this \
genuinely has to bypass review, that's a human's call, not yours." >&2
  exit 2
fi

exit 0
