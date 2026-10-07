---
brief: brief/<matching-file>.md
branch: <branch-name>
date: <YYYY-MM-DD>
---

# <Short title> — Plan

## Affected files

- `<path>` — `<what changes and why>`

## Work order

1. ...
2. ...

## Tests

- New: `<test to add>`
- Updated: `<test to update>`
- Failure cases: `<each way a new boundary can fail, and what the caller
  gets — see the error-handling skill; delete if nothing new can fail>`
- Verification command: `<the command from CLAUDE.md that must pass>`

## Risks / rollback

Anything hard to reverse, and how to undo it. Delete this section if nothing
here is hard to reverse — most changes aren't.

---

**Next stage:** run `/sdlc`.
