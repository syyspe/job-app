---
slug: 040-markdown-attachments
date: 2026-11-20
---

# Markdown attachments

## Problem

The CV masters are now the `.md` templates, and `tools/mkcv.py` renders `.md`
directly. The CVs and cover letters the agent drafts, though, are still saved
as `.txt`. So a draft built from a Markdown master comes back as plain text with
a different extension, and I have to rename it before `mkcv.py` treats it as
Markdown.

The corpus walk also reads both `.txt` and `.md`. Each master has an older
`.txt` copy beside it, so a folder entry that reaches both indexes the same
facts twice. Now that drafting from the `.md` masters is the one path, it is
time for the agent's text files and the corpus to settle on a single format.

## What done looks like

1. The drafted cover letter, CV and saved ad are uploaded with `.md` names, so
   the table in
   [section 7](../docs/job-search-agent.md#7-draft-format) reads `.md` in
   place of `.txt`. The naming rules don't change otherwise.
2. They are uploaded as `text/markdown; charset=utf-8`, not `text/plain`.
3. The draft framing tells the model that the CV and cover letter are Markdown,
   and the CV keeps the structure of the `.md` master. The synthetic
   `draft.example.md` agrees.
4. The saved ad's header (source, apply to, saved date) is valid Markdown and
   reads the same as it does today.
5. The corpus walk indexes `.md` files only. The build summary's skipped list
   says `not .md`, and it lists `.txt` files like any other skipped type.
6. A `.txt` file that an earlier build indexed is dropped from the index on the
   next build, the same as a deleted file, so the index doesn't keep stale
   entries the walk no longer reaches.
7. Section 3 and section 7 of `docs/job-search-agent.md` and the README's
   "Profile corpus" and "Ad drafting" sections describe `.md`. The stream's row
   in the Streams table moves to `in progress` in the plan commit and to
   `done` in the PR.

## Approach

- Draft naming lives in `fileNames` in `agent/runner/lib/draftApplication.ts`,
  and it becomes `.md`. The content type is set in `draftForm` in
  `agent/runner/lib/jobApp.ts`. The server keeps the multer mimetype it is
  sent and the original name's extension, so nothing server-side changes.
- The corpus extension set is `INDEXED_EXTENSIONS` in
  `agent/profile/lib/corpus.ts`, and the skipped-list wording is in
  `agent/profile/lib/build.ts`. Item 6 is about how the incremental build
  treats a file that is still on disk but now unsupported: it has to drop it,
  not keep it.
- Old `.txt` attachments already in job-app stay as they are. They are my
  history. Converting them would rewrite files I may already have sent.
- `035a-corpus-sync` copies a marked attachment under its own extension, so a
  marked old `.txt` attachment syncs and is then skipped and listed. That is
  the "format rule stays in one place" that 035a's brief chose, and the summary
  makes it visible.

Rejected: keeping `.txt` in the walk for old synced copies. The synced copies
come from attachments I mark one by one, so a `.txt` one is easy to see in the
skipped list and to re-save as `.md` if I want it. Keeping both formats is what
duplicates the masters.

## Out of scope

- Converting existing `.txt` attachments, synced copies or corpus files.
- Rendering Markdown to PDF from the agent. PDFs are never rendered by the
  agent (section 7), and `mkcv.py` stays a manual step.
- Previewing or rendering Markdown in the job-app UI.
- Changing the draft JSON format, the notes field or the naming rules apart
  from the extension.
- The private `prompts/draft.md`. I update it myself if it mentions `.txt`.

## Related streams

- Before: `035a-corpus-sync` (sync copies keep their extension, so the walk
  rule here decides what gets indexed) and `037-application-drafts` (the
  naming and upload this changes). Both are done.
- `039-daily-run` runs both the drafting and the sync, and it needs no change.

## Open questions

- Does the incremental build drop a file whose path is still on disk but has
  become unsupported, or does it only drop missing paths? The plan reads
  `build.ts` and settles item 6.
- Does `fileComponent` or anything downstream (the email cover letter's
  attachment-name line, for one) hard-code `.txt` beyond `fileNames`? The plan
  greps for it.
- Should the email application's cover letter name the CV attachment as the
  rendered `.pdf` rather than the `.md` the agent saved? Today it names
  whatever the model writes, so this may be prompt-only.

---

**Next stage:** run `/sdlc`.
