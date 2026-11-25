---
slug: 048-in-app-agent-spec
date: 2026-11-25
---

# Spec the in-app agent and brief its implementation streams

## Problem

The agent's model steps run as sandboxed `claude -p` processes, which isn't
user friendly: getting things rolling means either waiting a day for the
scheduled daily run or starting the agent manually, and every `claude` CLI
update brings the sandbox-check dance. With Claude API credits and a key now
in hand, the agent can move into the app and be started from the UI —
streamlining the flow so the whole process can be done from a phone on the
LAN.

The implementation is too big for one stream, so this stream writes the spec
and the implementation streams' briefs; it builds nothing.

## What done looks like

1. A spec document (`docs/in-app-agent.md`) describing the target design: how
   the agent calls the Claude API, which steps move over, how a run is started
   and followed from the UI, where the key lives and how cost is controlled —
   answering the open questions below.
2. One brief per implementation stream (`brief/049-…` onward), each naming its
   order and dependencies on the others, ready for Stage 2.
3. The spec and the briefs keep `claude -p` working as the fallback until the
   in-app agent is proven; retiring it is its own, last brief.
4. No code, and no change to the current agent.

## Approach

The spec settles the design decisions below, then cuts the work into streams
with a cut-over order that leaves the `claude -p` path runnable throughout.
Phone access means LAN only — the app's existing LAN reach is enough.

## Out of scope

- Building any part of the agent.
- Remote / off-LAN access.
- Removing `claude -p` — a later brief, once the in-app agent is proven.
- Prompt contents and evaluation criteria — handled later if needed.

## Open questions

None of these is decided yet; the spec decides them.

- Where the agent runs: inside the Express API process, or a separate process
  the API starts (today `agent/` never imports `server/` and talks to it over
  HTTP).
- Scheduling: keep Task Scheduler for the daily run, or an in-app timer —
  with UI-started runs either way.
- Profile search (Ollama on the LAN): kept as is, exposed as a tool the
  API-based agent calls?
- Mail collection (no `claude -p` today): unchanged, or also startable from
  the UI?
- API key storage, spend caps (per run / monthly), and model choice.

---

**Next stage:** run `/sdlc`.
