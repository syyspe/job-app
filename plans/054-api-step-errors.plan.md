---
brief: brief/054-api-step-errors.md
branch: 054-api-step-errors
date: 2026-11-26
---

# API step errors: the maxItems 400 and saying why a step failed — Plan

Context: under `engine: "api"` every evaluation fails with a 400, because
`z.array(...).max(n)` becomes `maxItems` in the JSON schema and the API rejects
it. The run only said `cli_failed`, so it took a hand-written probe to find
the cause. This plan strips `maxItems` from what gets sent while keeping the
zod limits, renames the category to `model_failed`, and carries the API's
status and message from the step up to the run output and the summary.

Decided with the user (the brief's open questions):
- The detail lives **within the run only**. It travels in the step reports
  and never reaches the server: `last_error` stays a fixed category
  (`server/lib/adValidation.ts` `ERROR_CATEGORY`), with no migration. An ad
  that failed in an earlier run whose summary was never sent shows only its
  category.
- A **CLI engine** failure carries **no detail**. `runSandboxed` changes
  only the category name.

## Affected files

- `agent/runner/lib/sandbox.ts`: `FailureCategory` changes `'cli_failed'`
  to `'model_failed'`, and the failed `SandboxResult` gets an optional
  `detail?: string`. `stepSchema` passes zod's `override` option to
  `z.toJSONSchema` and deletes `maxItems` from every node, so pre-screen,
  evaluation, drafting and the probe schema all lose it, under both engines.
  The comment above `runSandboxed` gets the new name.
- `agent/runner/lib/apiStep.ts`: `failed(category, detail?)`. Every
  `Anthropic.APIError` that isn't a timeout becomes
  `failed('model_failed', apiErrorDetail(err))`, where `apiErrorDetail`
  returns `` `${err.status ?? 'no response'}: ${err.apiMessage ?? err.message}` ``
  plus `` ` (request ${err.requestID})` `` when there is a request id. For
  example: `400: output_config.format.schema: For 'array' type, property 'maxItems' is not supported (request req_…)`.
  The 401/403 budget stop doesn't change.
- `agent/runner/lib/evaluate.ts`, `prescreen.ts`, `draft.ts`: each outcome's
  failed member gets `detail?: string`. They already return the
  `SandboxResult` unchanged on failure, so the detail passes straight through.
  `invalid_result` and `ask_mismatch` carry none.
- `agent/runner/lib/oneLine.ts` (new): `oneLine(value)`, which is
  `summary.ts`'s `clean` moved here unchanged (control and line-break
  characters become spaces). Run output now carries ad titles and API text
  as well, and a title must not be able to start a stdout line of its own.
  The run panel reads stdout.
- `agent/runner/lib/stepFailure.ts` (new): `interface FailedAttempt
  { adId: number; title: string; source: string; category: string;
  detail?: string }` and `formatFailedAttempt(step, attempt)` →
  `` `${step} failed: ${title}, ${source}: ${category}` `` plus
  `` ` — ${detail}` `` when there is detail, passed through `oneLine`.
- `agent/runner/lib/evaluationRun.ts`: `evaluateOne` returns the moved ad and
  a `FailedAttempt | null`. `EvaluationReport` gets `failedAttempts:
  FailedAttempt[]`: every failed attempt this run, whether the ad is
  retrying or reached `failed`. `formatEvaluationReport` adds one
  `evaluation failed: …` line per attempt after the counts. The skipped
  report has `[]`.
- `agent/runner/lib/draftRun.ts`: the same shape. `draftOne` returns its
  `DraftResult` and a `FailedAttempt | null`, `DraftReport.failedAttempts`,
  and `drafting failed: …` lines.
- `agent/runner/lib/prescreenRun.ts`: the same shape. `prescreenOne` returns
  the screened ad or null, plus a `FailedAttempt | null`,
  `PrescreenReport.failedAttempts`, and `pre-screen failed: …` lines.
- `agent/runner/lib/summary.ts`: imports `oneLine` in place of its own
  `clean`. `SummaryInput` gets `failedAttempts: FailedAttempt[]`. A Failed
  line is `` `${title}, ${source}: ${lastError}` ``, plus
  `` ` — ${detail}` `` when this run has a failed attempt with that ad's id
  and a detail.
- `agent/runner/lib/dailyRun.ts`: `sendSummary` passes
  `[...(report.evaluation?.failedAttempts ?? []), ...(report.drafting?.failedAttempts ?? [])]`.
  Pre-screen failures never move an ad to `failed`, so they aren't passed.
- `agent/runner/commands/{evaluate,draft,run}.ts`: no change. They already
  print every line the `format*Report` functions return.
- Docs: `README.md` (the `"api"` failure paragraph, both category lists) and
  `docs/in-app-agent.md` §3 (the table, the "keeps its name until 052"
  paragraph, the unknown-model sentence) and §8 (the 052 entry no longer
  renames anything). Also `docs/job-search-agent.md` (the two
  `cli_failed` mentions) and `docs/architecture.md` (the `stepSchema` entry:
  also without `maxItems`). Every one says `model_failed`. The README and
  `docs/in-app-agent.md` §3 also say that an API failure prints a line with
  the status and message, and that the summary shows it beside a failed ad.
- `brief/052-retire-claude-p.md`: "What done looks like" item 3 becomes a
  note that 054 already renamed `cli_failed` to `model_failed`, and that
  stored `cli_failed` values display as they are. Its open question about
  migrating stored values goes.

## Work order

1. `sandbox.ts`: the rename and `detail?`, and `stepSchema` without
   `maxItems`. Tests: `stepSchema` on a nested array has no `maxItems`
   anywhere, and keeps string `maxLength`. A schema guard checks that none of
   `PRESCREEN_SCHEMA`, `EVALUATION_SCHEMA` or `DRAFT_SCHEMA` contains
   `"maxItems"` once `JSON.stringify`'d. Update the `exit1`/`is_error` cases
   to `model_failed`. Follow the type errors through `evaluate.ts`,
   `prescreen.ts`, `draft.ts` and the tests that name `cli_failed`.
2. `apiStep.ts`: `apiErrorDetail` and the detail on `model_failed`, with
   tests.
3. `oneLine.ts` and `stepFailure.ts`, with tests. `summary.ts` switches to
   `oneLine`, and its existing cleaning test still passes.
4. `evaluationRun.ts`, `draftRun.ts` and `prescreenRun.ts` collect
   `failedAttempts` and format their lines, with tests.
5. `summary.ts` gets the Failed-line detail and `dailyRun.ts` passes
   `failedAttempts`, with tests.
6. Docs and the 052 brief, then `grep -rn cli_failed` outside `brief/`,
   `plans/` and `.git`. The only hits left are the test that a stored
   `cli_failed` value still displays.

## Tests

- New:
  - `sandbox.test.ts`: `stepSchema` strips nested `maxItems` and keeps
    `maxLength`. A guard over the three step schemas checks for no
    `maxItems` (the brief's item 3).
  - `apiStep.test.ts`: a 400 whose body has `error.message` and a request id
    → `{ kind: 'failed', category: 'model_failed', detail: '400: <message> (request <id>)' }`.
    A 500 after retries → the same shape with 500. A connection error →
    `detail` starting `no response: `. A 401 → `model_failed` with detail,
    and the budget is stopped as now.
  - `stepFailure.test.ts`: a line with detail and one without. A title with
    a newline stays on one line.
  - `evaluationRun.test.ts` / `draftRun.test.ts` / `prescreenRun.test.ts`: a
    failed step with detail appears in `failedAttempts` with the ad's id,
    title and source. The formatted report has one `… failed:` line per
    failure, and none when nothing failed.
  - `summary.test.ts`: a failed ad with a matching attempt gets
    `— <detail>`. One without (failed in an earlier run) shows only the
    category. A stored `lastError: 'cli_failed'` still renders as is.
  - `dailyRun.test.ts`: a run whose evaluation fails an ad into `failed`
    with detail sends a summary whose Failed line carries that detail.
- Updated: every test naming `cli_failed` (`sandbox.test.ts`,
  `apiStep.test.ts`, `prescreen.test.ts`, `prescreenRun.test.ts`,
  `draftRun.test.ts`) now names `model_failed`. Report fixtures gain
  `failedAttempts: []`. `evaluate.test.ts`'s "too many reasons" case stays
  `invalid_result`, which is what the zod check gives today. The brief says
  `bad_output`, but the code says otherwise, and item 2 needs no change.
- Failure cases (the API step boundary): any non-timeout `APIError` →
  `model_failed` with `"<status|no response>: <apiMessage|message>[ (request <id>)]"`.
  401/403 also stop the budget. Timeouts stay `timeout` with no detail. A
  non-SDK error is still rethrown. Nothing new reaches the server: the
  transition still sends only the category.
- Verification command: `npm test -- --maxWorkers=2`, plus `npm run build`
  and `npm run lint`.

---

**Next stage:** run `/sdlc`.
