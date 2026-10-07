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

## Contracts

- Errors: `<the error contract, if this plan decides it — see the
  error-handling skill>`
- Logging: `<the logging contract, decided with it — see the logging skill>`
- UI: `<the visual direction — typography, color, layout, tone; see the
  frontend-design skill>`

Keep a line only if `CLAUDE.md` still says it is not decided and this plan
decides it: Errors and Logging with the first boundary, UI with the first UI.
Delete the section if no line is left.

## Parallel streams

- `<other slug>` — `<what overlaps>`; `<sequence | extract | merge>`:
  `<what that means for this plan>`

Delete this section if no stream in flight overlaps this plan's Affected
files or contracts.

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
