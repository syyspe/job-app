---
brief: brief/mcp-delete-attachment.md
branch: mcp-delete-attachment
date: 2026-09-28
---

# Delete and replace attachments from the MCP server — Plan

## Context

The MCP server can attach and read files but can't delete or replace them.
Updating a CV today leaves two attachments with the same name and no way to
tell which is newer. This plan adds `delete_attachment` (over the existing
`DELETE /api/attachments/:id`), a new `PUT /api/attachments/:id` that swaps the
file in place and keeps the id, a `replace_attachment` tool over that endpoint,
and an `uploadedAt` timestamp on attachments.

The brief's open question is settled: **existing attachments get
`uploaded_at = ''`** (empty, meaning "unknown"). There is no backfill.

## Affected files

- `server/db/index.ts`: add `uploaded_at TEXT NOT NULL DEFAULT ''` to the
  `attachments` table in `SCHEMA`, the same column the migration adds, so
  fresh and migrated databases match.
- `server/lib/migrations.ts`: add `migrateAttachmentUploadedAt`, which checks
  `table_info(attachments)` like its siblings and runs
  `ALTER TABLE attachments ADD COLUMN uploaded_at TEXT NOT NULL DEFAULT ''`.
  Call it from `migrate`.
- `server/models/attachment.ts`: add `uploaded_at` to `AttachmentRow` and map
  it to `uploadedAt` in `toAttachment`.
- `server/types.ts` and `src/types.ts`: add `uploadedAt: string` to
  `Attachment`, in both copies (they are kept in step by hand).
- `server/routes/attachments.ts`:
  - `uploadHandler`'s INSERT sets `uploaded_at` to `datetime('now')`.
  - New `checkAttachmentOwned(db)` middleware. It uses `findOwnedAttachment`
    and returns 404 `{ error: 'not found' }` **before** multer runs, so a PUT
    to an unknown id leaves no stray file on disk. This mirrors
    `checkApplicationExists`.
  - New `replaceHandler(db, uploadsDir)`: returns 400 `file is required` when
    no file was sent. Otherwise it UPDATEs `stored_name`, `original_name`,
    `mime_type` and `uploaded_at = datetime('now')` for the id, removes the
    old file with `unlinkIfExists(join(uploadsDir, old.stored_name))`, calls
    `touchApplication`, and responds 200 with `toAttachment` of the re-read
    row.
  - Route: `router.put('/attachments/:id', checkAttachmentOwned(db),
    upload.single('file'), replaceHandler(db, uploadsDir))`.
- `mcp/lib/client.ts`:
  - `sendForm` takes a method first, the same way `sendJson` does:
    `sendForm<T>(method: 'POST' | 'PUT', path, form)`.
  - New `remove(path): Promise<void>` sends DELETE through `send`, so it gets
    the same re-login and `ApiError` handling. It is named `remove` because
    `delete` is a keyword.
  - Build note: `remove` pushed `createApiClient` past the 40-line limit, so
    the session cookie and 401 re-login moved out into
    `createSessionSender(config)`, which returns the `send` it uses.
- `mcp/tools/attachments.ts`:
  - Generalise `downloadAttachment`'s 404 mapping into
    `namingMissingAttachment<T>(id, request: () => Promise<T>)`, which rethrows
    an `ApiError` 404 as `no attachment with id ${id}`. `read_attachment`,
    `delete_attachment` and `replace_attachment` all use it, which gives brief
    criterion 5.
  - Extract `fileForm(path)` out of `registerAttach` (`readLocalFile`, then a
    `FormData` holding the `File`) and share it with replace.
  - `attach_file` passes `'POST'` to `sendForm`.
  - `delete_attachment({ id })` calls `client.remove` and returns
    `jsonResult({ deleted: id })`.
  - `replace_attachment({ id, path })` calls `fileForm(path)` and then
    `sendForm<Attachment>('PUT', /api/attachments/${id}, form)`, and returns
    `jsonResult` of the updated attachment.
  - Register both tools in `registerAttachmentTools`.
- `src/components/AttachmentList.test.tsx`, plus any other `src/` test fixture
  that builds an `Attachment` literal: add `uploadedAt`. Search `src/` for
  `storedName:` to find them; `tsc -b` fails on any that are missed.
- `README.md` "Claude Desktop (MCP)": change "seven tools" to "nine" and add
  `delete_attachment` and `replace_attachment` to the list.

## Work order

1. Timestamp: schema column, migration and its test, row/mapper, both `types.ts`,
   upload INSERT, and the `src/` fixtures. Run `npm test` to confirm it's green.
2. `PUT /api/attachments/:id`: write the route tests first (red), then the
   middleware, handler and route.
3. MCP client: the `sendForm` method parameter (and the `attach_file` call
   site) and `remove`.
4. MCP tools: `namingMissingAttachment`, `fileForm`, `delete_attachment` and
   `replace_attachment`, tests first.
5. README tool list.
6. Run `npm test`, `npm run lint` and `npm run build`, then commit.

## Tests

- New, in `server/lib/migrations.test.ts`: add an `attachments` table with a
  row to the legacy schema in `beforeEach`. Test that the migration adds
  `uploaded_at` as `''` on the existing row, and that migrating twice is a
  no-op.
- New, in `server/routes/attachments.test.ts`:
  - An upload returns a non-empty `uploadedAt`.
  - A PUT replaces the file in place. The id is the same; `originalName`,
    `mimeType` and `storedName` are the new file's; the download returns the
    new contents; the old stored file is gone from disk; `uploadedAt` moved
    (set it to `2020-01-01 00:00:00` directly in the DB first, the same way
    the `updatedAt` tests do).
  - A PUT moves the parent application's `updatedAt`.
  - A PUT without a file returns 400.
  - A PUT to an unknown id returns 404 and writes nothing into `uploadsDir`.
  - Extend the "second user cannot…" test: a PUT from the other user returns
    404.
- New, in `mcp/tools/attachments.test.ts`:
  - `delete_attachment` removes the attachment: `get_application` shows no
    attachments afterwards.
  - `delete_attachment` on an unknown id names the id.
  - `replace_attachment` keeps the id, takes the new name, type and contents
    (checked through `read_attachment`), and leaves the application with one
    attachment.
  - `replace_attachment` on an unknown id names the id.
  - `replace_attachment` on a missing local path names the path.
- Updated: `src/components/AttachmentList.test.tsx` and any other fixtures,
  for the new field.
- Updated: `mcp/server.test.ts`, which asserts the exact tool list — now nine
  tools. (Added during the build; the plan originally missed it.)
- Verification command: `npm test` (it must show no `failed` line), then
  `npm run lint` and `npm run build`.
- Manual check, optional: restart Claude Desktop (it caches the tool list per
  spawned process), then replace a CV through `replace_attachment` and confirm
  that `get_application` shows one attachment with a fresh `uploadedAt`.

## Risks / rollback

- The migration adds a column to a real database. It is additive, and older
  code ignores the column, so rolling back the code needs no schema change.
- A replace deletes the old file from disk. It does so only after the row
  points at the new file, so a failure before that point leaves the old
  attachment intact.

---

**Next stage:** run `/sdlc`.
