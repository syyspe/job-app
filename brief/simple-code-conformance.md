---
slug: simple-code-conformance
date: 2026-09-23
---

# Bring the codebase within the simple-code limits, and enforce them in oxlint

## Problem

The `simple-code` skill sets five limits: function length ≤ 40 lines, file
length ≤ 300, parameters ≤ 3, nesting ≤ 2 levels, and cyclomatic complexity
≤ 10. Only the skill enforces them, so they apply to new code while it is
being written, and nothing checks code that already exists.

A check of function length alone found 12 functions over 40 lines. The
check's header said 13, so one may be missing:

| Function | Lines |
|---|---|
| `src/components/ApplicationsView.tsx:24` `useApplications` | 94 |
| `src/components/ApplicationForm.tsx:47` `ApplicationForm` | 92 |
| `mcp/lib/client.ts:42` `createApiClient` | 83 |
| `src/components/ApplicationsView.tsx:123` `ApplicationsView` | 77 |
| `src/components/AdminView.tsx:15` `useUsers` | 59 |
| `src/components/UserForm.tsx:13` `UserForm` | 50 |
| `src/App.tsx:14` `App` | 48 |
| `src/components/ApplicationList.tsx:39` `ApplicationRow` | 44 |
| `src/components/ApplicationDetail.tsx:27` `ApplicationDetail` | 44 |
| `src/components/AttachmentList.tsx:11` `AttachmentList` | 42 |
| `src/components/UserRow.tsx:92` `UserRow` | 41 |
| `server/lib/seed.ts:23` `migrateApplicationsToUser` | 41 |

The other four limits haven't been checked at all.

Initial notes on the four largest:

- `useApplications` is six nearly identical "run the call, then reload"
  handlers.
- `ApplicationForm` is mostly form markup. Its date, status and notes
  fields could become small field components like the existing
  `TextField`.
- `createApiClient` is a factory whose inner functions are each short, but
  the enclosing function still counts toward the limit. Moving `login` and
  `send` out, with the session cookie passed in, would fix it.
- `ApplicationsView` is long mainly because of inline callbacks that also
  reset the page to 1.

## What done looks like

1. The plan starts with a full audit of all five limits across `src/`,
   `server/` and `mcp/`. Lengths are counted the way the lint rules will
   count them (blank lines and comments skipped).
2. Every violation the audit finds is fixed by restructuring. No inline
   lint-disable comments.
3. oxlint enforces all five limits as errors: `max-lines-per-function` 40,
   `max-lines` 300, `max-params` 3, `max-depth` 2, `complexity` 10. The two
   length rules skip blank lines and comments.
4. Test files (`**/*.test.ts(x)`, `e2e/*.spec.ts`) are exempt from the two
   length rules, but the other three rules still apply to them.
5. The dependency-dictated arity exemption from the skill (e.g. Express
   error middleware's `(err, req, res, next)`) is a scoped override in the
   oxlint config, not an inline disable.
6. The `simple-code` skill says the limits are enforced by oxlint and
   describes the test-file exemption, so the skill and the linter agree.
7. `npm run lint`, `npm test` and `npm run build` all pass. No behavior, UI
   or API changes.

## Approach

- **Keep the limits as they are.** They're reasonable for TS/React:
  components take one props object, and a component whose markup runs past
  40 lines usually has a subcomponent to extract. Raising the length limit
  was considered and rejected, because it would clear the list without
  improving the code.
- Skip blank lines and comments when counting length, so the rule doesn't
  push people to delete comments that explain things.
- **Work on one branch, with one commit per area** (client, server, MCP),
  and the lint config committed last, once everything passes.

## Out of scope

- Any change to behavior, UI or API. This is purely a refactor.
- Changing the numeric limits.

## Open questions

- Which function is the missing 13th?
- Is every oxlint option this needs available in the installed version?
  For example, `max-lines-per-function`'s `skipBlankLines`/`skipComments`,
  and per-file overrides in `.oxlintrc.json`.
