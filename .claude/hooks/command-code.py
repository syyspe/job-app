"""Read a PreToolUse hook payload on stdin, print the Bash command's *code*.

Heredoc bodies and quoted strings are stripped, so a hook matching on
keywords sees what the command will actually run and not the prose it
carries. Without this, a commit message that merely mentions deploying to
production, or pushing to master, trips the gate meant to catch the real
thing — a confusing way to learn that a guardrail exists.

Shared by production-gate.sh and default-branch-guard.sh. Prints an empty
line if the payload has no command, so callers can treat "nothing to match
against" the same as "no match".
"""

import json
import re
import sys

HEREDOC_BODY = r"""<<-?\s*(["']?)(\w+)\1.*?^\s*\2\s*$"""
UNTERMINATED_HEREDOC = r"""<<-?\s*["']?\w+["']?.*"""
SINGLE_QUOTED = r"""'[^']*'"""
DOUBLE_QUOTED = r'''"(?:\\.|[^"\\])*"'''


def code_of(command):
    command = re.sub(HEREDOC_BODY, " ", command, flags=re.S | re.M)
    # An unterminated heredoc runs to the end of the command.
    command = re.sub(UNTERMINATED_HEREDOC, " ", command, flags=re.S)
    command = re.sub(SINGLE_QUOTED, " ", command)
    return re.sub(DOUBLE_QUOTED, " ", command)


def main():
    payload = json.load(sys.stdin)
    print(code_of(payload.get("tool_input", {}).get("command", "")))


if __name__ == "__main__":
    main()
