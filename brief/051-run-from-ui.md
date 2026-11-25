---
slug: 051-run-from-ui
date: 2026-11-25
---

# Start and follow agent runs from the ad inbox

## Problem

A run happens only when Task Scheduler fires or the user starts one from a
WSL terminal. From a phone on the LAN, there's no way to collect new
alerts, or to evaluate and draft now. The goal is to do the whole flow from
the phone.

## What done looks like

1. A migration adds the `agent_runs` table with the columns in
   `docs/in-app-agent.md` §7. Rows left running are closed at server start.
2. `POST /api/agent/runs {kind}` and `GET /api/agent/runs` behave as §7
   says, behind `requireAdmin`: `201`, `400` for an unknown kind, `409`
   while a run is in progress, and `{current, recent}` with the last 10
   finished rows.
3. The server spawns the runner by §1's rules: argv fixed by `kind`,
   `process.execPath`, `shell: false`, the repo root as cwd, and the env
   allowlist. A test pins that no request value reaches argv or env.
4. `agent/runner/commands/collect.ts` takes `run.lock` as `run.ts` does. A
   child the lock refuses exits 1, and its message is the run's output.
5. Output lines are appended to the row as they arrive, capped at 64 KiB
   (the tail kept), and the server logs `agent run started` and `agent run
   finished` with IDs and the exit code, never output lines.
6. A run panel at the top of the ad inbox (`ads.css`) has Run now, Check
   mail, the current run's status and output, and the last runs. It polls
   every 3 s while a run is current and refreshes the list when the run
   finishes. Non-admins don't see it.
7. The panel, the inbox and the draft flow (047's questions and Markdown
   editing) work at 360 px width. The layout gaps found there are fixed in
   this stream.
8. Tests: router tests (auth, validation, 409, spawn rules against a fake
   spawner), component tests for the panel by role and name, and an e2e
   spec that starts a `collect` run against a stub runner.
9. The README gains a "Runs from the UI" section, and
   `docs/architecture.md` lists the new router, table and component. This
   stream's row in `docs/in-app-agent.md` "Streams" is updated.

## Approach

`docs/in-app-agent.md` §1 and §7 are the contract. It's a new router
factory, `server/routes/agentRuns.ts`, mounted from `app.ts` behind
`requireAdmin` at `/api/agent`. The spawn function is passed into the
factory, so tests never start a real runner. The panel is a new component
that calls `src/lib/api.ts`. It works the same with either engine, because
it only starts commands and shows their output.

## Out of scope

- The API engine: 049. The panel works with `engine: "cli"` too.
- Cost figures in the panel: 050 provides the `api:` line, and this stream
  shows it only if 050 has already landed.
- Replacing Task Scheduler, and off-LAN access.
- Cancelling a running run.

## Related streams

Order in `docs/in-app-agent.md` §8: first, alongside 049. Needs: nothing.
052 needs this stream.

## Open questions

- How the e2e spec points the server at a stub runner without a client
  value reaching the spawn. The likely answer is a server-side env setting
  read at startup, which the plan settles.

---

**Next stage:** run `/sdlc`.
