---
brief: brief/040-markdown-attachments.md
branch: 040-markdown-attachments
date: 2026-11-20
---

# Markdown attachments — Plan

Context: the CV masters are now `.md` and `mkcv.py` renders `.md`, but the
agent still saves its drafts as `.txt`. This stream moves the agent's text
attachments to `.md` (`text/markdown`) and makes the saved ad's header valid
Markdown.

**Scope change from the brief: the corpus walk keeps `.txt`.** Brief items 5
and 6 (an `.md`-only walk, and dropping `.txt` files that were indexed before)
are withdrawn. The live config proves the brief's premise wrong. The CV
entries already point straight at the `.md` templates, so no `.txt` master
copy is reached and nothing is indexed twice. An `.md`-only walk would drop
14 files: the Portfolio `facts` file, all five configured `style` letters and
all eight synced copies. That would leave the `style` corpus empty. The plan
commit amends the brief to record this. `agent/profile/` is not touched.

Settled from the brief's remaining open questions:

- **Other `.txt` hard-coding.** Only `fileNames` (`draftApplication.ts`) and
  the blob type in `draftForm` (`jobApp.ts`). `smtp.ts`'s `text/plain` is the
  summary email body and stays. The server stores multer's mimetype and the
  original name, and serves downloads with `res.download`, which sets the
  type from the extension. No server change.
- **Email cover letter's attachment line.** The framing tells the model to
  name the CV as the `.pdf` the person renders from it. This is prompt-only and
  the runner doesn't check it.

## Affected files

- `brief/040-markdown-attachments.md`: amend in the plan commit. Strike items
  5 and 6, with a one-line reason. Drop the corpus bullets from Approach and
  Related streams, replace the Rejected paragraph with the reverse decision,
  and answer the open questions.
- `agent/runner/lib/draftApplication.ts`: `fileNames` writes `.md` for all
  three files. `savedAdText`'s header becomes a Markdown list
  (`- Source: …`, `- Apply to: …`, `- Saved: …`), so it renders as three lines
  rather than one joined paragraph. The labels, their order and the title and
  body after it stay as they are.
- `agent/runner/lib/jobApp.ts`: the blob type in `draftForm` becomes
  `text/markdown; charset=utf-8`.
- `agent/test/fakeJobAppAds.ts`: `FakeDraft` files also record the part's
  `type` (`value.type`), so the content type can be asserted.
- `agent/runner/prompts/draft.framing.md`: one CV bullet saying the CV and the
  cover letter are Markdown and the CV keeps the template's Markdown structure
  (headings, lists, emphasis). The email `coverLetter` line names the CV
  attachment as the `.pdf` the person renders from the CV.
- `agent/runner/prompts/draft.example.md`: the CV section says to keep the
  template's Markdown headings as well as its section order.
- `docs/job-search-agent.md`:
  - Streams row: Brief `committed`, State `in progress` in the plan commit,
    then `done` in the PR.
  - The paragraph under the table: 040 moves the agent's text attachments to
    `.md`. Drop "after which the corpus walk reads `.md` files only".
  - Section 7: "All `.md`", the table's four names in `.md`, the header as a
    Markdown list, and the email letter's CV name as the `.pdf`.
  - Section 3 is unchanged.
- `README.md`: "Ad drafting" says "three `.md` attachments". "Profile corpus"
  is unchanged.
- Tests beside each of these (see Tests).

## Work order

1. Plan commit: this file, the brief amendment, and the Streams row and
   paragraph (Brief `committed`, State `in progress`).
2. Drafts: `fileNames`, the `savedAdText` list and the `draftForm` type, plus
   `FakeDraft.type`. Update `draftApplication.test.ts` and `jobApp.test.ts`.
3. Prompts: `draft.framing.md` and `draft.example.md`.
4. Docs: section 7 and README "Ad drafting".
5. `npm run lint`, `npm run build`, `npm test -- --maxWorkers=2`, then the
   build commit.

## Tests

- Updated, `draftApplication.test.ts`: the four file-name rows and the
  placeholder CV name use `.md`. The two saved-ad tests expect the list
  header: `- Source: …\n- Apply to: …\n- Saved: 2026-11-19\n\nTest Lead\n\n…`,
  and the Finnish one `- Lähde: …`.
- Updated, `jobApp.test.ts`: the `upload` fixture's names are `.md`, and
  `draftAd sends …` expects each recorded file to carry
  `type: 'text/markdown; charset=utf-8'`. If `File.type` comes back
  normalised, assert the exact string the round trip yields and mention it in
  the commit.
- Any other test that builds a `FakeDraft` and compares `files` whole (grep
  `fake.drafts`) gains the `type` field.
- No new failure cases: no new boundary, and only names and a content type
  change.
- Verification command: `npm test -- --maxWorkers=2` (with `npm run lint` and
  `npm run build`).

---

**Next stage:** run `/sdlc`.
