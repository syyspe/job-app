---
slug: 058-draft-on-demand
date: 2026-11-27
---

# Draft on demand, through `claude -p`

## Problem

Today the daily run drafts every suitable ad on the API engine (Opus), so
the agent decides what gets a draft and every draft costs API credits. I
want to make that decision myself, and drafting is the most expensive step.
Running it through `claude -p` uses my Claude subscription instead of API
credits.

## What done looks like

1. An ad the evaluation kept has a **Draft** action in the ad inbox,
   beside Dismiss.
2. The summary email's job-app link (057) lands where that action is one
   click away. The link itself never starts a draft.
3. Clicking Draft starts a drafting run for that one ad, which shows in the
   run panel like the other runs. The result is the draft application, with
   CV, cover letter and open questions, as `agent:draft` writes today.
4. That drafting runs on the `claude -p` engine, under the existing sandbox
   gate, whatever `engine` the rest of the run uses.
5. The daily run never drafts (057). `agent:draft` from the command line
   keeps working for a named ad.
6. `brief/052-retire-claude-p.md` is amended: `claude -p` and its sandbox
   gate stay for drafting. Only the pre-screen and evaluation lose their
   `claude -p` path.

## Approach

The server already spawns `agent/runner/commands/{run,collect}.ts` for runs
started from the UI (`server/lib/agentRunner.ts`), coupled by path only. A
drafting run for one ad is a third kind on the same mechanism. The sandbox
check (`agent:sandbox-check`) keeps gating it, since it is now the only
`claude -p` step.

Rejected: drafting on the API on demand. Fewer drafts, but still credits.
Rejected: no agent drafting at all, with the draft written interactively in
Claude Desktop. More manual work than I want.

## Out of scope

- What the email says: 057.
- State names and labels: 059.
- Re-drafting from answered questions (still out, as in 047).

## Related streams

- 057-plain-daily-run removes drafting from the daily run and links here.
- 052-retire-claude-p: this stream narrows it (item 6).
- 051-run-from-ui: the spawn mechanism this extends.

## Open questions

- What happens if a daily run is in progress when I click Draft? Today
  `run.lock` serialises runs.
- Does a draft run in the inbox show its progress on the ad, or only in the
  run panel?
- If the sandbox check hasn't passed for the installed `claude`, does
  Draft re-run it, or refuse and say why?

---

**Next stage:** run `/sdlc`.
