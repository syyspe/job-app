---
brief: brief/042-summary-lan-link.md
branch: 042-summary-lan-link
date: 2026-11-23
---

# LAN link in the daily summary — Plan

## Affected files

- `agent/runner/lib/runnerConfig.ts` — `dailyRunConfigSchema`'s `summary`
  object gains `lanUrl: z.url({ protocol: /^https?$/, error: 'must be an
  http or https URL' }).optional()`. This is the same check
  `agent/profile/lib/config.ts` already uses for `ollamaUrl`, so a typo
  (`192.168.100.9:3001` with no scheme) fails at load as exit 2 naming
  `summary.lanUrl`, instead of mailing a dead link. This settles the brief's
  open question.
- `agent/runner/lib/summary.ts` — `SummaryInput` gains `lanUrl?: string`.
  `bodyOf` adds `Open job-app (LAN): <lanUrl>` directly after the
  `Open job-app: <appUrl>` line when it's set, and nothing when it isn't.
  Written inline as `...(lanUrl ? [\`Open job-app (LAN): ${lanUrl}\`] : [])`,
  with no new helper.
- `agent/runner/lib/dailyRun.ts` — `DailyRunOptions['summary']` gains
  `lanUrl?: string`. The `composeSummary` call passes
  `lanUrl: options.summary.lanUrl`.
- `agent/runner/commands/run.ts` — `summary: { ... }` adds
  `lanUrl: setup.daily.summary.lanUrl`.
- `README.md` — "Daily run" → Setup step 2: add `lanUrl` to the "optionally"
  list and the JSON example (`"lanUrl": "https://<LAN address>:3001"`, a
  placeholder, never the real address). Add one sentence saying that, when
  it's set, the summary also carries a second link for reading on the phone.
- Tests beside each lib file (see Tests).

## Work order

1. Config: extend the schema in `runnerConfig.ts` and add its tests in
   `runnerConfig.test.ts`.
2. Summary: `SummaryInput.lanUrl` and the `bodyOf` line, plus tests in
   `summary.test.ts`.
3. Plumbing: `dailyRun.ts` options type and the `composeSummary` call, a
   `dailyRun.test.ts` case, then `commands/run.ts`.
4. README "Daily run" setup step 2.
5. `npm run build`, `npm run lint`, `npm test -- --maxWorkers=2`.

## Tests

- New (`runnerConfig.test.ts`, "daily run"):
  - `lanUrl is read`: `{ recipient, lanUrl: 'https://192.0.2.1:3001' }` →
    `summary.lanUrl` equals it.
  - The existing "defaults" test's `toEqual` stays unchanged, which proves a
    missing `lanUrl` stays absent rather than defaulted.
  - Add rows to the exit-2 `test.each`:
    `['a lanUrl that is not a URL', { summary: { recipient, lanUrl: '192.0.2.1:3001' } }, 'summary.lanUrl']`
    and a non-http scheme (`'ftp://192.0.2.1'`).
- New (`summary.test.ts`): `lanUrl` set → the text ends
  `Open job-app: ${appUrl}\nOpen job-app (LAN): ${lanUrl}\n`. The existing
  empty-summary and problems tests stay as they are and keep asserting the
  body with no LAN line (done-criterion 3).
- New (`dailyRun.test.ts`): add `lanUrl?: string` to `Overrides`, and a test
  where a run with `alwaysSend: true` and `lanUrl` set sends a message whose
  text contains the LAN line. This proves the value is passed through.
- Failure cases: an invalid `summary.lanUrl` → `CliError(2, "<path>:
  summary.lanUrl: must be an http or https URL")` from `parseConfigFile`,
  before the lock is taken, exactly as an invalid `recipient` already
  behaves. Nothing new can fail at run time.
- Verification command: `npm test -- --maxWorkers=2` (healthy:
  `Test Files N passed / Tests N passed`, no `failed`), plus `npm run build`
  and `npm run lint`.

---

**Next stage:** run `/sdlc`.
