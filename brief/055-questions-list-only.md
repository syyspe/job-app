---
slug: 055-questions-list-only
date: 2026-11-27
---

# Open questions: list them, drop the answer boxes

## Problem

An application's detail view shows each open question (`[[ASK:qN]]` marker,
from 047) with an answer textarea and a "Save answers" button. I don't need
them. Listing the open questions is enough: I answer by editing the `.md`
attachment directly with its Edit button.

## What done looks like

1. The "Open questions" section still lists each open question (id and text)
   and the count.
2. It has no answer fields, no "Save answers" button and no "Blank answers
   stay open" hint.
3. The UI no longer calls the answers endpoint. The `onAnswer` wiring through
   `ApplicationDetail`/`ApplicationsView` and the client's `answerQuestions`
   go.
4. `POST /api/applications/:id/answers` and the MCP `answer_questions` tool
   stay as they are, so Claude Desktop can still fill answers.

## Approach

The list is read from the markers in the attachments, so when I delete a
marker by editing the file, its question drops off the list without any
extra mechanism.

## Out of scope

- Changing the endpoint, `server/lib/askMarkers.ts` or the MCP tools.
- Updating the notes' `→ <answer>` lines when a question is answered through
  the editor. Only the answers endpoint writes those.

## Related streams

- 047-draft-questions added the boxes this removes.

---

**Next stage:** run `/sdlc`.
