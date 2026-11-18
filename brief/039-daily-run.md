---
slug: 039-daily-run
date: 2026-11-18
---

# Daily run

## Problem

The pipeline's steps exist by this point, but I would still have to start them
myself. The agent should run once a day without me, catch up after a day when
the PC was off, and tell me only when there is something to report.

## What done looks like

1. Windows Task Scheduler starts the runner once a day through `wsl.exe`, and a
   missed start runs as soon as possible afterwards.
2. One entry point runs collection, screening, evaluation, drafting and the
   summary in order.
3. A lock file prevents overlapping runs.
4. A day missed because the PC was off is caught up on the next run.
5. Per-run caps leave the remaining ads queued for the next run.
6. If the Ollama laptop is unreachable, collection and title screening still run,
   and the summary reports it as a source failure.
7. One summary email goes to the configured recipient when there are unreported
   drafts, title rejections, failures or source failures, and none is sent
   otherwise.
8. Nothing is marked reported until the mail server accepts the message, so a
   failed send is retried on the next run.

## Approach

The contracts are fixed in `docs/job-search-agent.md`:

- [Daily run](../docs/job-search-agent.md#9-daily-run): scheduling, locking,
  catch-up and the summary rule.
- [Pipeline and runtime](../docs/job-search-agent.md#1-pipeline-and-runtime):
  the steps the entry point runs.
- [Agent permissions](../docs/job-search-agent.md#2-agent-permissions): the
  fixed summary recipient.
- [Private configuration](../docs/job-search-agent.md#3-private-configuration):
  where the lock, counters and logs live.
- [Profile corpus and embeddings](../docs/job-search-agent.md#8-profile-corpus-and-embeddings):
  what happens when the laptop is off.

## Out of scope

- New sources, evaluation rules or draft content.
- Sending or submitting applications.
- Rendering PDFs.

## Related streams

- Before: `034-ad-inbox`, `035-profile-corpus`, `036-ad-evaluation`,
  `037-application-drafts` and `038-alert-sources` provide every step it runs.
- After: none. This stream completes the feature in
  `033-job-search-agent`.

## Open questions

- Does Task Scheduler start the run reliably when Windows starts?
- How is the job-app API running at the moment the task starts?
- Is the Ollama laptop on at the chosen run time?
- Does an unattended run fit within Claude usage limits?

---

**Next stage:** run `/sdlc`.
