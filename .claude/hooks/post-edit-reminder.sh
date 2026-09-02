#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): runs your formatter/linter after every edit
# so drift doesn't accumulate across a session. This is a stub — wire in the
# real commands from CLAUDE.md's "Commands" section once they're filled in.
#
# Exit 0 always (formatting issues should surface as normal lint/CI failures,
# not block the edit that triggered them) unless you want it stricter.

set -euo pipefail

# TODO: replace with your real formatter, e.g.:
#   npx prettier --write "$file_path" 2>/dev/null || true
# or leave this as a no-op if formatting is handled elsewhere (pre-commit,
# CI auto-fix, editor integration).

exit 0
