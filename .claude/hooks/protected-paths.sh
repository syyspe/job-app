#!/usr/bin/env bash
# PreToolUse hook (Edit|Write): blocks edits to paths this repo treats as
# generated or frozen. Fill in PROTECTED_PATTERNS for your project — see the
# "Architecture" section of CLAUDE.md for candidates (generated code,
# frozen legacy packages, etc).
#
# Exit 0 to allow, exit 2 to block (stderr is shown to Claude as the reason).

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# TODO: replace with your real protected paths, e.g.:
#   PROTECTED_PATTERNS=("schemas/*_generated.*" "legacy/v1/*")
PROTECTED_PATTERNS=()

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  # shellcheck disable=SC2053
  if [[ "$file_path" == $pattern ]]; then
    echo "Blocked: '$file_path' matches protected pattern '$pattern'. See CLAUDE.md → Architecture for why, and ask a human if this edit is actually needed." >&2
    exit 2
  fi
done

exit 0
