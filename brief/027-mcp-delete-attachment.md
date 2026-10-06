---
slug: 027-mcp-delete-attachment
date: 2026-09-28
---

# Delete and replace attachments from the MCP server

## Problem

Files attached to an application sometimes need updating — a revised CV, a
reworked cover letter. The MCP server can only attach and read, so an update
means attaching the new version beside the old one. Both then show up under
the same filename, and nothing tells you which one is the latest.

(The `mcp-update-application` brief says removing attachments "already has
its own tools". It never did — the API endpoint exists, the MCP tool doesn't.)

## What done looks like

1. A `delete_attachment` MCP tool takes an attachment id and removes it,
   through the existing `DELETE /api/attachments/:id`.
2. A new `PUT /api/attachments/:id` endpoint replaces an attachment's file in
   place: the id stays the same, the file on disk, original name and MIME
   type become the new file's, and the old file is removed from disk.
3. A `replace_attachment` MCP tool takes an attachment id and a local file
   path and calls that endpoint in one call, returning the updated
   attachment.
4. Attachments carry an upload timestamp, set on upload and moved on replace.
5. Both tools fail on an unknown id the same way `read_attachment` does.

## Approach

Replace is a server endpoint rather than upload-then-delete in the MCP tool,
so the attachment keeps its id and there is never a moment with two copies or
none.

Rejected: `replace_attachment` as two calls to the existing endpoints —
simpler, but the id changes and a failed delete leaves the duplicate this is
meant to prevent.

## Out of scope

- The web UI: no Replace button, and no display of the new timestamp. The
  endpoint is MCP-only for now.

## Open questions

- What timestamp existing attachments get when the column is added.
