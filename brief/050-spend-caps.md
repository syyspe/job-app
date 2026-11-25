---
slug: 050-spend-caps
date: 2026-11-25
---

# Cap Claude API spend per month and report it

## Problem

049's per-run cap stops one runaway run but not a month of them, and
nothing tells the user what the agent is spending. Before the API engine
carries the daily run unattended, spend needs a monthly ceiling and a
visible figure in the summary.

## What done looks like

1. The config key `api.monthlyUsd`, default `30`.
2. The state file `~/.local/state/job-agent/api-spend.json`, shaped
   `{ "months": { "YYYY-MM": <usd> } }` and keyed by local month. It's
   written through a temp file and a rename, updated after each response,
   with months older than the previous one dropped on write.
3. A run checks the month before each new model step. At or over the cap,
   the remaining model steps are skipped like a failed gate, and the summary
   names it (`API monthly cap reached: …`).
4. The summary email carries `Claude API: $<run> this run, $<month> this
   month of $<cap>` whenever the run made an API call, and `agent:run`
   prints `api: $<run> run, $<month> month` as its last line.
5. If 051 has landed, the run panel shows that line's figures. If not, the
   printed line is the contract 051 reads.
6. The README documents the cap, the ledger and the Anthropic Console spend
   limit as a backstop.
7. Unit tests cover the ledger (month rollover, pruning, crash-safe write),
   the cap check and the summary line.
8. This stream's row in `docs/in-app-agent.md` "Streams" is updated.

## Approach

`docs/in-app-agent.md` §6 is the contract. The ledger sits behind 049's
run spend counter: each response's cost goes to both, and the gate checks
both caps. Under `engine: "cli"`, there's no cost, no ledger write and no
summary line.

## Out of scope

- The API step itself and the per-run cap: 049.
- The run panel's layout: 051. This stream only feeds it a figure.
- Fetching prices from Anthropic, since prices stay in config (049).

## Related streams

Order in `docs/in-app-agent.md` §8: after 049. Needs: 049. It touches
051's run panel only if 051 merged first. 052 needs this stream.

## Open questions

None.

---

**Next stage:** run `/sdlc`.
