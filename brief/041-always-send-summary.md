---
slug: 041-always-send-summary
date: 2026-11-20
---

# Always send the daily summary

## Problem

`npm run agent:run` only emails a summary when it has something to report:
`composeSummary` (`agent/runner/lib/summary.ts`) returns `null` when there
are no ads, source failures or problems, and `sendSummary`
(`agent/runner/lib/dailyRun.ts`) then sends nothing. There is no way to
configure the run to send the summary anyway.

## What done looks like

1. The daily-run config accepts an optional boolean `summary.alwaysSend`,
   next to `summary.recipient`.
2. `summary.alwaysSend: true` → the summary email is sent on every run that
   reaches the summary step, including when there is nothing to report.
3. `summary.alwaysSend: false` or missing → current behaviour unchanged: no
   email when there is nothing to report.
4. The nothing-to-report email uses the usual summary format, just empty:
   the normal subject and body builder with nothing to list, still ending
   with the "Open job-app" link.
5. README's "Daily run" section documents the key.

## Approach

Add the optional boolean to the `summary` object in
`agent/runner/lib/runnerConfig.ts`, pass it through `commands/run.ts` with
the recipient, and have the summary step send the composed-but-empty summary
when it's set rather than stopping at "nothing to report".

## Out of scope

- A separate subject or wording for the empty email.
- Any change to what a non-empty summary contains.

## Open questions

- What the subject line reads with zero counts — the plan checks
  `subjectOf` and makes sure it reads sensibly.
- What `agent:run`'s stdout summary line says when an empty summary was sent
  (`summary: sent` is the likely answer).

---

**Next stage:** run `/sdlc`.
