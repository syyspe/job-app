---
brief: brief/055-questions-list-only.md
branch: 055-questions-list-only
date: 2026-11-27
---

# Open questions: list only — Plan

Context: the detail view's "Open questions" block (047) has an answer textarea
per question and a "Save answers" button. The user answers by editing the
`.md` attachment directly, so the block becomes a read-only list. The
`/answers` endpoint and the MCP `answer_questions` tool stay unchanged.
Client-side only: no server, `mcp/` or `agent/` file changes.

## Affected files

- `src/components/OpenQuestions.tsx` — drop `onAnswer`, the `useState`
  answers, `nonBlankAnswers`, the textareas, the button and the hint. Keep
  the `<section aria-labelledby>` region, its header (`h3` "Open questions"
  plus "`N` to answer"), and `return null` when no question is open. Each
  question renders as an `<li>` inside a `<ul className="open-questions-list">`:
  `<span className="question-id">{id}</span>`, then the
  `<span className="question-text">` if text is present (same markup as the
  current label's span). Props: `{ questions: OpenQuestion[] }`.
- `src/components/ApplicationDetail.tsx` — remove `onAnswer` from
  `DraftEditing`, and pass only `questions` to `<OpenQuestions>`.
- `src/components/ApplicationList.tsx` — delete `ListDrafting`. The list's
  `drafting` prop becomes `DraftEditing`. `rowDrafting(drafting, expanded)`
  only overrides `questions` (it loses the `applicationId` parameter and the
  `onAnswer` closure). Keep the comment about expanded-only questions.
- `src/components/ApplicationsView.tsx` — remove `answerQuestions` from the
  import and `handleAnswer` from `changeHandlers`. Pass `drafting={apps.drafting}`.
  The `useOpenQuestions` comment becomes "an upload or edit can change which
  markers remain".
- `src/lib/api.ts` — delete `answerQuestions`. `getOpenQuestions` stays.
- `src/applications.css` — drop `.open-questions-hint` from the shared muted
  selector. Add `.open-questions-list` (`margin: 0; padding: 0;
  list-style: none; display: flex; flex-direction: column; gap: var(--s-2)`).
  Use existing tokens only. The region keeps its tint and 4px accent spine.
- `README.md` (the "To finish a draft" bullet, ~l.476) — the app lists the
  open questions, and you answer one by editing the `.md` with **Edit**,
  which removes its marker. Answering by id, with the `→ <answer>` line in
  the notes, goes through Claude Desktop's `answer_questions` (and the
  endpoint).
- `docs/architecture.md` (~l.41) — "`OpenQuestions` (one answer field per
  open…" becomes "lists each open `[[ASK:qN]]` question". Leave the
  `/answers` endpoint line (~l.117) alone.

## Work order

1. `OpenQuestions.tsx` + `applications.css` + `OpenQuestions.test.tsx`.
2. Remove `onAnswer` along the chain: `ApplicationDetail`, `ApplicationList`,
   `ApplicationsView`, `api.ts`, plus their tests.
3. README + architecture doc.
4. `npm run build`, `npm run lint`, `npm test -- --maxWorkers=2`. Commit.

## Parallel streams

056–059 have briefs only, so no Affected files to compare against. Of
them, only 058-draft-on-demand mentions open questions, and only as
`agent:draft`'s output (server/agent side). This plan touches only `src/`
components and docs, so no overlap is expected. Nothing to sequence.

## Tests

- Updated `src/components/OpenQuestions.test.tsx`: keep "renders nothing
  when no question is open". Replace the label test with: the region
  "Open questions" shows "2 to answer" and a list whose items read
  `q1 Why Acme?` and `q2`. The same test checks there's no `textbox` and no
  `Save answers` button. Delete the three Save-answers tests.
- Updated `src/components/ApplicationDetail.test.tsx`: remove `onAnswer` from
  the `drafting()` helper. "open questions show above the attachments and
  report their answers" becomes "open questions show above the attachments":
  it keeps the position check and drops the typing, clicking and `onAnswer`
  assertion.
- Updated `src/components/ApplicationList.test.tsx`: remove `onAnswer` from
  the `drafting` fixture.
- Updated `src/components/ApplicationsView.test.tsx`: `stubDraftApi` drops
  the `/answers` route. Questions now close when the letter's text is saved:
  the `PUT /api/attachments/5/text` sets the flag, so the stub matches the
  brief's "delete the marker by editing". The "answering them" test becomes
  "expanding a row lists its open questions": it shows the `q1 Why Acme?`
  item and never calls `/api/applications/1/answers`. The ".md editing" test
  additionally checks that the Open questions region goes away after the
  save, which covers the refetch-on-reload path.
- Unchanged: `e2e/agentRuns.spec.ts` only checks that the region is visible.
  Server `/answers` tests and MCP tool tests stay.
- Failure cases: none new. This removes a call and adds no boundary.
- Verification command: `npm test -- --maxWorkers=2` (plus `npm run build`
  and `npm run lint`).

---

**Next stage:** run `/sdlc`.
