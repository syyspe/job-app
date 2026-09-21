---
brief: brief/mcp-update-application.md
branch: mcp-update-application
date: 2026-09-21
---

# An update tool for the MCP server — Plan

## Context

The MCP server can create, read, re-status and archive an application, but
nothing else. `set_application_status` (`mcp/tools/applications.ts`) refetches
the application, re-sends every field unchanged apart from `status`, and so
cannot supply a `dateApplied` — which means moving a draft to `applied` always
trips `checkDateApplied`. Claude Desktop's only way through was to recreate the
application, re-upload its attachments and archive the original: a new id, a
broken trail, a guessed date. Every other field has the same hole (a moved
deadline, a fixed link, a note).

Outcome: one `update_application` tool taking an id plus any subset of the
seven editable fields, replacing `set_application_status` outright. The merge
happens in `mcp/`; the server and `validateInput` are untouched — the tool PUTs
the same full-object shape the edit form already posts.

## Affected files

- `mcp/tools/applications.ts` — replace `registerSetStatus` with
  `registerUpdate`; lift the seven field schemas into one shared `fields` map
  so `create_application` and `update_application` describe them once.
- `mcp/tools/applications.test.ts` — rework the three
  `set_application_status` tests into `update_application` tests and add the
  partial-update, same-call `dateApplied`, and clear-a-field cases.
- `mcp/server.test.ts` — the tool-name list: `set_application_status` out,
  `update_application` in (still seven tools).
- `README.md` — the "Claude Desktop (MCP)" tool list (line ~107); the count
  stays seven.

Reused as-is, no changes: `fetchApplication` and `checkDateApplied`
(`mcp/lib/applications.ts`), `jsonResult` (`mcp/lib/results.ts`),
`ApiClient.sendJson` (`mcp/lib/client.ts`), `startHarness`/`callTool`/`jsonOf`/
`textOf` (`mcp/test/harness.ts`). Untouched: `server/`, including
`server/lib/validation.ts` and `PUT /api/applications/:id`.

## Work order

Red-green-refactor per `simple-code`: each step's test first.

1. **Share the field schemas.** In `mcp/tools/applications.ts`, add a `fields`
   object holding the seven base zod types with their existing descriptions
   (`company`, `role`, `dateApplied`, `deadline`, `status`, `link`, `notes`;
   `status` is the existing `statusField`). Rebuild `registerCreate`'s
   `inputSchema` from it — `fields.company`, `fields.role`, the rest with the
   `.default('')` / `.default('applied')` they already carry. No behaviour
   change; `npm test` stays green.

2. **`registerUpdate`.** New tool `update_application`:

   - Description: it updates one application; omitted fields keep their
     current value, and an empty string clears an optional one.
   - `inputSchema`: `{ id: idField, company: fields.company.optional(), … }`
     — all seven optional, no defaults. Absent must mean "leave it", so a
     `.default()` anywhere here would silently blank a field.
   - Handler: `async ({ id, ...given })` →
     `const existing = await fetchApplication(client, id)` (this is also what
     gives the unknown-id error), `const input = { ...toInput(existing),
     ...given }`, `checkDateApplied(input)`, then
     `client.sendJson<Application>('PUT', `/api/applications/${id}`, input)`
     wrapped in `jsonResult`. Zod drops absent optional keys, so the spread
     merges cleanly; nothing else is needed.

3. **Delete `registerSetStatus`** and swap it for `registerUpdate` in
   `registerApplicationTools`.

4. **Docs and the tool-list test.** `mcp/server.test.ts`'s sorted array and
   the README tool list.

Keep `toInput` as it is. Don't touch `server/`, `src/`, or the committed
`brief/` and `plans/` files from the earlier MCP stream — they are the record
of what was built then.

## Tests

All over the protocol through `mcp/test/harness.ts`, in
`mcp/tools/applications.test.ts`, matching the existing `call(...)` /
`jsonOf(...)` style.

- New: `update_application` changes only the fields given — set `status` and
  `notes` on an application created with a deadline, link and notes, and
  assert company, role, `dateApplied`, deadline and link are unchanged while
  the two given fields moved. (Replaces the old "leaves the other fields
  alone" test.)
- New: a draft with no `dateApplied` moved to `applied` **with** a
  `dateApplied` in the same call succeeds and returns the updated
  application — the brief's motivating case.
- Updated: moving a dateless draft onwards *without* `dateApplied` is still a
  tool error naming `dateApplied`, and `get_application` shows it unchanged
  (the old test, retargeted at `update_application`).
- Updated: unknown id → `no application with id 9999` (the old test,
  retargeted).
- New: an empty string clears an optional field — `link: ''` on an
  application that has one leaves `link` empty.
- Updated: `mcp/server.test.ts`'s seven-tool list.
- Verification command: `npm test` — expect `Test Files N passed / Tests N
  passed`, no `failed` line. Also `npm run lint` and `npm run build` (the
  build is what type-checks `mcp/`).

End-to-end sanity beyond the suite is optional and manual: `npm run dev:server`
with a seeded `.env`, then `npm run mcp` with the three `JOBAPP_*` vars and
`update_application` against a real draft.

## Risks / rollback

Nothing hard to reverse — one file of tool wiring, its tests and a README
line, all on a branch. The one behavioural sharp edge is in the schema, not
the rollback: giving any update field a zod `.default()` would turn an
omission into a blanking. Step 2 keeps every field `.optional()` with no
default, and the clear-a-field test pins the intended way to blank one.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
