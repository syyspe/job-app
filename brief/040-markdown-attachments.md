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
5. ~~The corpus walk indexes `.md` files only.~~ Withdrawn in the plan: see
   "Amended in Stage 2" below.
6. ~~A `.txt` file that an earlier build indexed is dropped from the index.~~
   Withdrawn with item 5.
7. Section 7 of `docs/job-search-agent.md` and the README's "Ad drafting"
   section describe `.md`. The stream's row in the Streams table moves to
   `in progress` in the plan commit and to `done` in the PR.

## Approach

- Draft naming lives in `fileNames` in `agent/runner/lib/draftApplication.ts`,
  and it becomes `.md`. The content type is set in `draftForm` in
  `agent/runner/lib/jobApp.ts`. The server keeps the multer mimetype it is
  sent and the original name's extension, so nothing server-side changes.
- Old `.txt` attachments already in job-app stay as they are. They are my
  history. Converting them would rewrite files I may already have sent.

Amended in Stage 2: the corpus walk keeps `.txt`, and items 5 and 6 are
withdrawn. Its premise didn't hold. The live config points the CV entries
straight at the `.md` templates, so no `.txt` copy is reached and nothing is
indexed twice. An `.md`-only walk would drop 14 files: the Portfolio `facts`
file, all five configured `style` letters and all eight synced copies. That
would leave the `style` corpus empty.

## Out of scope

- Converting existing `.txt` attachments, synced copies or corpus files.
- Rendering Markdown to PDF from the agent. PDFs are never rendered by the
  agent (section 7), and `mkcv.py` stays a manual step.
- Previewing or rendering Markdown in the job-app UI.
- Changing the draft JSON format, the notes field or the naming rules apart
  from the extension.
- The private `prompts/draft.md`. I update it myself if it mentions `.txt`.

## Related streams

- Before: `037-application-drafts` (the naming and upload this changes). It is
  done. `035a-corpus-sync` is untouched now that the walk keeps `.txt`.
- `039-daily-run` runs both the drafting and the sync, and it needs no change.

## Open questions

Settled in the plan: the only `.txt` hard-coding is `fileNames` and
`draftForm`'s type, and the framing names the email letter's CV attachment as
the rendered `.pdf`.

---

**Next stage:** run `/sdlc`.
