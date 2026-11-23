---
slug: 047-draft-questions
date: 2026-11-23
---

# Answer a draft's open questions, and edit Markdown attachments, in the UI

## Problem

When `agent:draft` writes a draft application, the cover letter and CV can
carry `[[ASK:qN]]` markers where only I can supply the answer (motivation,
unconfirmed facts). The question texts sit in the application's notes as
`qN: <question>` lines under "Open questions"; the markers sit inside the
`.md` attachments. Nothing in the job-app UI ties the two together, and I
have no way to change an attachment's text from outside the UI either. The
only route today is to write a new file elsewhere and add it as a new
attachment. I want to answer the questions in the app directly.

## What done looks like

1. An application whose `.md` attachments contain `[[ASK:…]]` markers — any
   status, not only `draft` — shows its open questions, each with an answer
   field.
2. Saving answers puts each answer, verbatim, in place of every marker with
   that id, in every `.md` attachment of the application that carries it.
3. Partial saves work: answered questions are filled in, unanswered markers
   stay in the text to answer later.
4. The agent's original file is never overwritten. The first save of a
   document creates an edited copy beside it (e.g. `…_cover_letter.md` →
   `…_cover_letter (edited).md`); later saves update that copy.
5. Each answered question is marked answered in the notes, showing both the
   question and the answer (e.g. `q1: <question>` followed by `→ <answer>`).
6. Any `.md` attachment — not only the agent's — can be edited as raw text in
   the UI, with the same keep-the-original rule as 4.
7. The editor has a rendered Markdown preview.

## Approach

Answers are substituted verbatim — no agent involvement. The edited-copy rule
keeps the agent's draft retrievable without adding attachment version
history; history was the alternative, rejected as schema and storage work for
little gain at this scale.

The existing `PUT /attachments/:id` replaces a file by upload and overwrites
it, so the keep-the-original behaviour needs something new on the server.

## Out of scope

- Agent re-drafting from the answers (the agent rewriting the letter around
  them). The server never imports `agent/`, so it would be a requested state
  picked up by the next `agent:run` / `agent:draft`, like 046's Duunitori
  fetch — a second mechanism, left for a later stream.
- Editing non-`.md` attachments (`.docx`, `.pdf`, `.txt`).
- Answering via the job-app MCP tools from Claude Desktop — **unless** it
  fits this stream naturally and is low effort; the plan decides and records
  which.

## Related streams

- 037-application-drafts — defines the `[[ASK:qN]]` markers, the
  `questions` entries and the notes format (`agent/runner/lib/draftOutput.ts`,
  `draftApplication.ts`). This stream reads what 037 writes.
- No other worktrees checked out.

## Open questions

- Where the UI reads the questions from: parsing the notes' "Open questions"
  lines, or storing them structurally when the draft is created. The notes
  are free text I can edit, so parsing them is fragile.
- How `profile_sync` ("Add to profile") interacts with an edited copy — does
  the mark stay on the original, move, or apply to neither?
- The Markdown preview: a renderer is a new dependency, which needs my
  approval, against a small hand-rolled one.
- What "edited copy" naming looks like when the original name has no `.md`
  suffix, or a copy with that name already exists.
- Whether the MCP answering fits (see Out of scope).

---

**Next stage:** run `/sdlc`.
