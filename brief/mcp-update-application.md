---
slug: mcp-update-application
date: 2026-09-21
---

# An update tool for the MCP server

## Problem

The MCP server can create an application, read it, move its status and
archive it — but it cannot change any other field. `set_application_status`
refetches the application and re-sends every field unchanged apart from
`status`, so moving a draft to `applied` trips `checkDateApplied`: the status
needs a `dateApplied` and there is no parameter to supply one.

Claude Desktop hit this marking a real draft as applied. Its only way through
was to recreate the application as applied, re-upload all five attachments,
and archive the original — a new id, a broken trail, and a date it had to
guess. Every other field has the same hole: a moved deadline, a fixed link or
a note is uneditable from MCP today.

## What done looks like

1. An `update_application` tool takes an id and any subset of the editable
   fields — company, role, dateApplied, deadline, status, link, notes — and
   leaves the omitted ones at their current values.
2. Moving a draft to `applied` with a `dateApplied` in the same call
   succeeds, and returns the updated application.
3. Omitting `dateApplied` while moving to a non-draft status still fails,
   with the existing message naming what's missing.
4. An unknown id fails the same way the other tools' unknown ids do.
5. `set_application_status` is gone — `update_application` covers it.
6. Tool tests exercise it over the protocol through `mcp/test/harness.ts`,
   as the existing tool tests do.

## Approach

One tool in `mcp/tools/applications.ts`, replacing `registerSetStatus`. It
fetches the existing application with `fetchApplication`, spreads the given
fields over `toInput(existing)`, runs `checkDateApplied` on the result and
PUTs it to `/api/applications/:id` — the same shape the edit form posts, so
the server needs no change at all.

Every field is optional in the zod schema, which is the whole point: absent
means "leave it", not "clear it". That makes clearing an optional field
(blanking a link) express itself as an empty string rather than an omission.

Rejected: keeping `set_application_status` alongside as a convenience. Status
is one field among seven, and two overlapping tools is surface Claude Desktop
has to choose between on every call.

Rejected: a PATCH endpoint on the server. The merge has to happen somewhere,
the client already fetches the application to validate the id, and a partial
route would be a second write path into the same row.

## Out of scope

- Attachments. Adding and removing them already has its own tools; this
  changes nothing there.
- Archiving, which keeps its own endpoint and its own tool.
- The web UI, which edits through a form that always posts every field.
- Any change to `/api/applications/:id` or `validateInput`.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/mcp-update-application.plan.md` before
writing any code.
