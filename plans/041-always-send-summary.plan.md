---
brief: brief/041-always-send-summary.md
branch: 041-always-send-summary
date: 2026-11-20
---

# Always send the daily summary — Plan

`agent:run` emails a summary only when there is something to report:
`composeSummary` returns `null` for an empty run and `sendSummary` stops there.
The brief adds an opt-in `summary.alwaysSend` so the mail arrives every run,
which also tells the user that the run happened. The empty mail uses the usual
format.

Answers to the brief's open questions:
- Subject with zero counts: `subjectOf` already reads fine. It gives
  `job agent: 0 drafts, 0 title rejected, 0 failed, 0 source failures,
  0 problems`, so it needs no change. The body is just
  `Open job-app: <url>`, because `section` drops empty lists.
- Stdout: `summaryLine` returns `summary: sent` whenever `report.sent` is
  true, so an empty summary that was sent prints `summary: sent`. No change.

## Affected files

- `agent/runner/lib/runnerConfig.ts`: add
  `alwaysSend: z.boolean().default(false)` to the `summary` object in
  `dailyRunConfigSchema`.
- `agent/runner/lib/summary.ts`: `composeSummary` always returns a `Summary`
  and no longer returns `null`. The "nothing to report" decision moves to the
  caller, which knows the policy. Export
  `isEmpty(input: Pick<SummaryInput, 'ads' | 'sourceFailures' | 'problems'>): boolean`
  so the count check stays in this file.
- `agent/runner/lib/dailyRun.ts`: `DailyRunOptions.summary` gains
  `alwaysSend: boolean`. In `sendSummary`:
  `if (isEmpty(input) && !options.summary.alwaysSend) return`, then compose
  and send as now. Calling `markReported([])` and `removeFailures([])` on an
  empty run is harmless: the server's `parseReportedIds` accepts `[]`, and
  the loop doesn't run. So there's no extra branch.
- `agent/runner/commands/run.ts`: pass
  `alwaysSend: setup.daily.summary.alwaysSend` next to `recipient`. Reword the
  header comment ("when there is news") so it mentions the option.
- `README.md` "Daily run": the intro sentence and Setup step 2 document
  `"alwaysSend": true` (optional, default false). With it, the summary
  arrives every run and an empty one lists nothing but the link.

## Work order

1. Config: schema key plus `runnerConfig.test.ts` updates.
2. `summary.ts`: non-null `composeSummary` and `isEmpty`, plus
   `summary.test.ts` updates.
3. `dailyRun.ts` + `run.ts` wiring, plus `dailyRun.test.ts` and
   `run.test.ts` updates.
4. README.
5. `npm test -- --maxWorkers=2`, `npm run lint`, `npm run build`. Commit.

## Tests

- Updated, `runnerConfig.test.ts`: in "the wait defaults to 7 days…", the
  expected value gains `alwaysSend: false`. New case: `alwaysSend: true` is
  read. New `it.each` row: `alwaysSend: "yes"` exits 2 naming
  `summary.alwaysSend`.
- Updated, `summary.test.ts`: the "nothing to report composes no summary"
  test becomes "nothing to report composes the empty summary". It checks the
  all-zero subject above and a body of `Open job-app: <url>\n`. New: `isEmpty`
  is true for empty lists and false when any one list is non-empty.
- Updated, `dailyRun.test.ts`: the options factory sets
  `alwaysSend: false`, and "nothing to report sends no mail" stays as is.
  New: "nothing to report with alwaysSend sends the empty summary". It
  expects `report.sent` true, one message with the zero-count subject, and a
  body containing `Open job-app:`.
- Updated, `run.test.ts`: none needed. The fixture config omits
  `alwaysSend`, which exercises the default.
- Failure cases: the one new failure is a non-boolean `alwaysSend`. It
  exits 2 as `<path>: summary.alwaysSend: …` through the existing
  `parseConfigFile`, and the config test above covers it.
- Verification command: `npm test -- --maxWorkers=2` (plus `npm run lint`,
  `npm run build`).

---

**Next stage:** run `/sdlc`.
