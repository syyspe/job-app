#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): hard-enforces simple-code's file-length
# limit (.claude/skills/simple-code/SKILL.md — 300 lines). This is the one
# limit in that skill that's cheaply checkable across any language; the
# rest (function length, params, nesting, complexity) need language-aware
# parsing and stay advisory via the skill itself.
#
# Exit 0 to allow, exit 2 to block (stderr is shown to Claude as the reason).

set -euo pipefail

LIMIT=300
EXCLUDE_EXTENSIONS=(md json yaml yml txt lock csv svg log)

input=$(cat)
file_path=$(echo "$input" | python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)

[ -z "$file_path" ] && exit 0
[ -f "$file_path" ] || exit 0

ext="${file_path##*.}"
for excluded in "${EXCLUDE_EXTENSIONS[@]}"; do
  [ "$ext" = "$excluded" ] && exit 0
done

lines=$(wc -l < "$file_path")
if [ "$lines" -gt "$LIMIT" ]; then
  echo "Blocked: '$file_path' is now $lines lines (limit: $LIMIT per .claude/skills/simple-code/SKILL.md). Split it before continuing — don't note it for later." >&2
  exit 2
fi

exit 0
