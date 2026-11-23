---
brief: brief/047-draft-questions.md
branch: 047-draft-questions
date: 2026-11-23
---

# Answer a draft's open questions, and edit Markdown attachments, in the UI — Plan

## Context

`agent:draft` leaves `[[ASK:qN]]` markers in a draft's `.md` attachments. The
matching question texts are kept in the notes as `qN: <question>` lines. At
the moment the only way to answer a question is to write a new file elsewhere
and attach it. This plan adds three things:

- an Open questions section on the application, with an answer field per
  question;
- a raw-text editor for any `.md` attachment;
- two MCP tools for the same answering.

All three save through one server-side rule: the original file is never
overwritten; the first save creates an "(edited)" copy beside it.

## Decisions (the brief's open questions)

- **Where the questions come from:** the markers decide. A question is open
  when its `[[ASK:qN]]` marker appears in a *current* document. A current
  document is an application's `.md` attachment that has no edited copy;
  where a copy exists, the copy is the current document. The question text
  is looked up from the notes, as the first line matching
  `^(q[0-9]{1,2}):\s*(.*)$`. If that line has been edited away, the text is
  `null` and the UI shows the bare id. No new table, no change to `agent/`,
  and drafts that already exist work as they are.
  - The server reads markers with `/\[\[ASK:(q[0-9]{1,2})\]\]/g`. A
    malformed marker is ordinary text.
  - Questions are listed in numeric order (q2 before q10).
- **How a copy is tracked:** by a new column, not by name. It is
  `attachments.edited_from INTEGER REFERENCES attachments(id) ON DELETE SET NULL`.
  - A row with `edited_from` set is a copy, and saving it overwrites it in
    place.
  - Saving an original that has no copy inserts a copy.
  - Saving an original that already has a copy is a 409. The UI never
    offers it: Edit is shown only on current documents.
  - Deleting an original turns its copy into a plain original. Editing that
    copy afterwards creates another copy, which is consistent with the rule.
- **Copy naming:** only an attachment whose `original_name` ends in `.md`
  (any case) is editable. That answers the "no `.md` suffix" question: such
  a file isn't editable. The copy's name is the original name with the
  final `.md`/`.MD` removed and ` (edited).md` appended. Since copies are
  tracked by `edited_from`, two attachments can have the same display name;
  that is allowed today and stays allowed.
- **Profile mark (`profile_sync`):** when a copy is created, the original's
  mark moves to the copy. The copy takes the original's value and the
  original becomes 0, so the runner syncs the finished text. After that the
  two marks are independent.
  - A save that overwrites a copy changes its `stored_name`. The runner's
    existing `storedName` 409 then keeps a pending mark, so the new bytes
    get synced.
- **Answer rules:** an answer is trimmed of outer whitespace. A blank answer
  means unanswered, and its marker stays. Otherwise the answer replaces
  every marker with that id, verbatim, in every current document carrying
  it.
  - In the notes, a line `→ <answer>` is inserted directly after that
    question's `qN:` line.
  - If no `qN:` line exists, `qN → <answer>` is appended as the last line
    of the notes.
  - A question cannot be answered twice: once answered, its marker is gone
    and it is no longer open.
- **MCP:** in scope. It is two thin tools over the new endpoints:
  `list_open_questions` and `answer_questions`.

## UI design (frontend-design, inside the decided visual language)

CLAUDE.md already fixes the direction: IBM Plex Sans, the `index.css`
tokens, the 4px spine, colour only for what needs the user, and receding
without opacity. These choices apply it to the two new surfaces. No new
token, font or value: every rule reads an existing `--*` token.

The open questions are the one thing in the expanded row that needs me, so
they are the one place the detail spends colour. Everything else stays
quiet.

```
│▌ Application form fields …                              │
│                                                         │
│  ┃ Open questions                         2 to answer   │  ← --accent-tint block, 4px --accent spine
│  ┃                                                      │
│  ┃ q1  Why does this company's product interest you?    │  ← id --ink-muted tabular; question --ink 500
│  ┃ ┌──────────────────────────────────────────────────┐ │
│  ┃ │                                                  │ │  ← textarea, the form's existing style
│  ┃ └──────────────────────────────────────────────────┘ │
│  ┃ q2  Can you confirm the Kubernetes certification?    │
│  ┃ ┌──────────────────────────────────────────────────┐ │
│  ┃ └──────────────────────────────────────────────────┘ │
│  ┃ [Save answers]   Blank answers stay open.            │  ← .button-primary; hint --ink-muted --fs-xs
│                                                         │
│  Hakemus_Acme_FI.md          Original, kept unchanged   │  ← superseded original recedes: --ink-muted name
│  Hakemus_Acme_FI (edited).md  [Edit] [Add to profile] … │
│  CV_Acme_FI.md               [Edit] [Add to profile] …  │
│  report.pdf                         [Add to profile] …  │
```

- **Open questions block** (`.open-questions`):
  - `--accent-tint` background, `--r-md` radius and `--s-4` padding;
  - a 4px `--accent` spine on the left, made with the same `::before`
    technique as `.application-item`, so the "needs you" idiom matches the
    list;
  - an `h3` "Open questions" at `--fs-base`/600, with a right-aligned count
    ("2 to answer", or "1 to answer") in `--ink-muted` `--fs-sm`;
  - each question is a `<label>`: the id (`q1`) in `--ink-muted` with
    tabular numerals, then the question text in `--ink`. The text is the
    accessible name. When it is `null`, the label is the id alone.

  The block appears only while questions are open. Once the last one is
  answered it goes away, and the "Answers saved" toast is the confirmation.
  There is no empty state.
- **Superseded original:** the name stays a download link, recoloured
  `--ink-muted`. "Original, kept unchanged" (`--fs-xs`, `--ink-muted`)
  replaces the Edit button, and Add to profile and Remove stay. This is the
  existing receding idiom, with no opacity.
- **Editor** (`.attachment-editor`):
  - it replaces the row's actions in place, under the file name, spanning
    the row width;
  - a textarea of about 20 rows, its line length capped at `72ch` so a
    letter reads as a letter;
  - it stays in Plex Sans rather than a monospace face, because the text is
    prose, not code;
  - below it, `[Save] [Cancel]`, where Save is `.button-primary`. On an
    original, the hint "Saving keeps the original and writes
    `<name> (edited).md`." appears in `--ink-muted` `--fs-xs` above the
    buttons.
- **Copy, sentence case throughout:** "Save answers" gives the toast
  "Answers saved", and editor Save gives "Attachment saved". Errors come
  from the server's message via the existing toast.
- **Quality floor:** focus rings come from the existing `:focus-visible`
  rules. Every field has a visible label, and the colours used are token
  pairs that already pass in both light and dark. No motion is added.

## Affected files

- `server/db/index.ts` — SCHEMA gains `edited_from` on `attachments`.
- `server/lib/migrations.ts` — `migrateAttachmentEditedFrom`, which runs
  `ALTER TABLE … ADD COLUMN edited_from INTEGER REFERENCES attachments(id) ON DELETE SET NULL`
  and is wired into `migrate`.
- `server/models/attachment.ts`, `server/types.ts`, `src/types.ts` —
  `edited_from` → `editedFromId: number | null` on `Attachment`. Add the
  `OpenQuestion { id: string; text: string | null }` type to both types
  files.
- `server/lib/askMarkers.ts` (new, pure, no I/O):
  - `openQuestionIds(text)`;
  - `fillAnswers(text, answers)`;
  - `questionTexts(notes)`, returning a Map of id → text;
  - `markAnswered(notes, answers)`;
  - `isMarkdown(name)`;
  - `editedName(name)`.
- `server/lib/markdownEdits.ts` (new, database and filesystem, no Express),
  shared by the attachments and questions routers:
  - `currentDocuments(db, applicationId)` — the `.md` rows that no other row
    names in `edited_from`.
  - `readTextIfExists(uploadsDir, row)` — `null` on ENOENT. This is the
    same accepted drift between the database and `uploads/` as
    `unlinkIfExists`.
  - `saveMarkdownText(db, uploadsDir, row, text)`:
    - writes `${randomUUID()}.md` into `uploadsDir`;
    - then either updates the copy's `stored_name`/`uploaded_at`, or inserts
      the copy with `mime_type 'text/markdown'`, `edited_from = row.id` and
      the moved mark;
    - returns `{ row, replacedStoredName }`. The caller unlinks the replaced
      file after its transaction commits, as `replaceHandler` does. A
      rolled-back save therefore leaves at worst an orphan new file and
      never loses the old one.
  - Throws `HttpError(400, 'only .md attachments can be edited')` and
    `HttpError(409, 'attachment has an edited copy; edit that instead')`.
- `server/routes/attachments.ts` — `PUT /attachments/:id/text` with body
  `{ text: string }`. It answers 200 with the attachment row written (the
  copy). It runs under `checkAttachmentOwned` and calls `touchApplication`.
- `server/routes/questions.ts` (new router factory `createQuestionsRouter(db, uploadsDir)`):
  - `GET /applications/:id/questions` returns `OpenQuestion[]` for the
    session user's application.
  - `POST /applications/:id/answers` takes the body
    `{ answers: Record<string, string> }`. It does these steps inside one
    `db.transaction`:
    1. checks every non-blank id is open;
    2. fills each current document that carries an answered id and saves it
       through `saveMarkdownText`;
    3. rewrites the notes with `markAnswered`;
    4. calls `touchApplication`.

    After the commit it unlinks the replaced files and answers 200 with the
    questions still open.
- `server/app.ts` — mount `createQuestionsRouter` after the attachments
  router, inside `requireSession`.
- `src/lib/api.ts`:
  - `getOpenQuestions(applicationId)`;
  - `answerQuestions(applicationId, answers)`;
  - `getAttachmentText(id)`, which fetches `attachmentUrl(id)`, passes it
    through `checkOk` and reads `.text()`;
  - `saveAttachmentText(id, text)`.
- `src/components/ApplicationsView.tsx`:
  - `useApplications` holds `questions: OpenQuestion[]` for the expanded
    application. They are loaded through `run` in an effect on
    `[expandedId, applications]`, so every reload refreshes them.
  - New handlers: `handleAnswer` ('Answers saved'), `handleSaveAttachmentText`
    ('Attachment saved') and `loadAttachmentText`, which runs through `run`
    so a failure toasts.
  - If the file passes 300 lines, `useApplications` moves to
    `src/components/useApplications.ts`.
- `src/components/ApplicationList.tsx`, `src/components/ApplicationDetail.tsx`
  — thread through `questions`, `onAnswer`, `onLoadAttachmentText` and
  `onSaveAttachmentText`. The detail renders `<OpenQuestions>` above
  `<AttachmentList>`, inside the form's children.
- `src/components/OpenQuestions.tsx` (new):
  - a `<section>` headed "Open questions";
  - one `<textarea>` per question, labelled as in UI design: the id plus
    the question text, or the id alone when the text is `null`;
  - one `type="button"` "Save answers" button that sends only the non-blank
    answers;
  - renders nothing when the list is empty.

  Every button is `type="button"` and every field a textarea, so nothing
  submits the surrounding application form.
- `src/components/AttachmentEditor.tsx` (new):
  - a `<textarea>` labelled `Edit <name>`, with Save and Cancel
    (`type="button"`);
  - on an original, the hint "Saving keeps the original and writes it as
    `<name> (edited).md`". `editedName` is duplicated in the client as a
    one-line helper in the component, since the client never imports
    `server/`.
- `src/components/AttachmentList.tsx` — an "Edit" button on current `.md`
  attachments only, meaning an `.md` name that no other attachment in the
  list names as `editedFromId`. Clicking it loads the text, then opens the
  editor in place of the row's actions; Save calls `onSaveText` and closes.
- `src/applications.css` — `.open-questions`, `.attachment-editor` and the
  superseded-original style, as set out in UI design. Tokens only.
  Textareas already get their styling from `index.css`/`App.css`.
- `mcp/tools/questions.ts` (new) — `registerQuestionTools(server, client)`:
  - `list_open_questions({ applicationId })` → GET;
  - `answer_questions({ applicationId, answers: z.record(z.string(), z.string()) })`
    → POST.

  Before either call, `fetchApplication` checks the application exists, as
  `attach_file` does.
- `mcp/server.ts` — register the question tools.
- `README.md` — add the two tools to the MCP tool list, and a line on Open
  questions and the edited copy.
- `docs/architecture.md` — entries for the new lib files, router, components
  and migration.

## Work order

1. Migration and schema: `edited_from`, the `editedFromId` mapping and the
   types. Migration test.
2. `askMarkers.ts`, red-green, with its unit tests.
3. `markdownEdits.ts` and `PUT /attachments/:id/text`, with the route tests.
4. The questions router and its mount in `app.ts`, with the route tests.
5. Client API functions, `AttachmentEditor` and the Edit button in
   `AttachmentList`, with component tests.
6. `OpenQuestions`, wired through `ApplicationsView` → `ApplicationList` →
   `ApplicationDetail`, with component and view tests.
7. The MCP question tools, with harness tests.
8. README, `docs/architecture.md`.

## Tests

- New:
  - `server/lib/askMarkers.test.ts` covers:
    - ids, including that a malformed marker is ignored and q2 sorts before
      q10;
    - `fillAnswers` replacing every occurrence;
    - `questionTexts` on the English and Finnish ("Avoimet kysymykset")
      notes;
    - `markAnswered` with the line present and with it missing;
    - `editedName` for `.md` and `.MD`.
  - `server/routes/questions.test.ts` covers:
    - GET returns `{id, text}` over current documents only: once a copy
      exists, the original's markers no longer count;
    - `text` is `null` when the notes line is gone;
    - a missing file on disk is skipped;
    - POST partial answers: the answered marker is replaced in both the
      letter and the CV, the unanswered marker stays, the copies are named
      `… (edited).md`, and the original files are byte-identical;
    - a second POST updates the same copy id with a new `storedName`, and
      the old file is unlinked;
    - the notes gain `→ <answer>` after `q1:`;
    - the profile mark moves to the copy;
    - `updatedAt` is bumped.
  - `server/routes/attachments.test.ts` (additions) covers:
    - PUT text creates the copy, and saving the copy overwrites it in place;
    - the mark moves;
    - `touchApplication` runs.
  - `server/lib/migrations.test.ts` (addition) covers that the column is
    added once, and that deleting an original sets the copy's
    `edited_from` to null.
  - `src/components/OpenQuestions.test.tsx` and
    `src/components/AttachmentEditor.test.tsx` query by role and label.
  - `mcp/tools/questions.test.ts` runs through `startHarness`.
- Updated:
  - `AttachmentList.test.tsx` covers that Edit is shown on a current `.md`,
    and not on a superseded original (which shows "Original, kept
    unchanged") or a `.pdf`;
  - `ApplicationDetail.test.tsx` and `ApplicationsView.test.tsx` cover the
    questions loading and the answer and save handlers.
- Failure cases, each as `{error, requestId}` through `jsonErrorHandler`:
  - `PUT /attachments/:id/text`:
    - 404 `not found` when another user owns it or it doesn't exist;
    - 400 `text must be a string`;
    - 400 `only .md attachments can be edited`;
    - 409 `attachment has an edited copy; edit that instead`;
    - 413 from `express.json` when the body is over 100 kB, which the
      handler passes through as a 4xx.
  - `GET` and `POST /applications/:id/…`:
    - 404 `application not found`;
    - 400 `answers must be an object of strings`;
    - 409 `q3 is not an open question`, which leaves nothing written, files
      or notes;
    - a write failure is a 500 with the transaction rolled back, and the old
      files are kept.
  - MCP: the tool throws, and a 404 becomes "no application with id N" via
    `fetchApplication`.
- Not added: an e2e spec. The route and component tests cover the flow.
- Verification command: `npm test -- --maxWorkers=2`, then `npm run lint`
  and `npm run build`.

## Departures during build

- `saveMarkdownText(db, uploadsDir, { row, text })` bundles the row and text
  into one argument, to stay within the three-parameter limit.
- The `PUT /attachments/:id/text` tests are in
  `server/routes/attachments.text.test.ts`, a sibling file (as `ads.*.test.ts`
  are), not added to the 500-line `attachments.test.ts`.
- `onSaveText`/`onSaveAttachmentText` returns whether the save went through.
  The editor closes only on success, so a refused save (a 413, say) keeps the
  text the user typed.
- The four new props travel as one `drafting` object (`DraftEditing`, and
  `ListDrafting` in the list, whose `onAnswer` names the application). The
  attachment list takes `editing: { onLoadText, onSaveText }`. Four flat props
  pushed five components over the 40-line limit.
- The editor's buttons are named `Save <name>` and `Cancel editing <name>`.
  A bare "Save" clashed with the application form's own Save.
- `OpenQuestions` sends answers only for the questions still listed. Typed
  text for a question answered since then would otherwise be re-sent and
  refused with a 409.
- `mcp/server.test.ts` pins the tool list, so it now lists fifteen tools.

## Risks / rollback

- The `edited_from` column is additive, and older code ignores it. To roll
  back, revert the code. The column and any "(edited)" rows stay as
  ordinary attachments.
- Claude Desktop only sees the new MCP tools after a restart.

---

**Next stage:** run `/sdlc`.
