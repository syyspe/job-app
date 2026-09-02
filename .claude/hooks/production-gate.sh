#!/usr/bin/env bash
# PreToolUse hook (Bash): approval gate for anything that looks like a
# production deploy. Deploying is the one thing here that's genuinely hard
# to undo, so it stops and asks regardless of how routine it looks —
# adjust the match condition to whatever your real deploy command looks
# like, and RELEASE_APPROVAL to however you actually record sign-off
# (an env var set by a release-approval step in CI is one option; a file
# checked into a short-lived location is another).
#
# Matching runs against the command's *code*, not its prose: heredoc bodies
# and quoted strings are stripped first. Otherwise a commit message that
# merely mentions deploying to production blocks its own commit, which is a
# confusing way to learn that a gate exists.
#
# Exit 0 to allow, exit 2 to block (stderr is shown to Claude as the reason).

set -euo pipefail

input=$(cat)

# Match against the command's code, not the prose it carries.
cmd=$(python3 "$(dirname "${BASH_SOURCE[0]}")/command-code.py" <<< "$input" 2>/dev/null)

# TODO: match your real deploy invocation.
if [[ "$cmd" == *"deploy"* && "$cmd" == *"production"* ]]; then
  if [ -z "${RELEASE_APPROVAL:-}" ]; then
    echo "Production deploys need release authorization. Get sign-off and set RELEASE_APPROVAL=1, or hand this off to a human." >&2
    exit 2
  fi
fi

exit 0
