---
brief: brief/050-spend-caps.md
branch: 050-spend-caps
date: 2026-11-26
---

# Cap Claude API spend per month and report it — Plan

Context: 049's `createRunBudget` caps one run (`api.perRunUsd`) but nothing
caps a month or shows spend. This adds a monthly ledger behind that same
budget, a summary line, a printed `api:` line, and — since 051 has merged —
the figures on the run panel. Contract: `docs/in-app-agent.md` §6.

## Affected files

- `agent/runner/lib/apiSpend.ts` (new) — `createSpendLedger(path, now)`:
  `monthTotal(): number` and `add(usd): void` over
  `{ "months": { "YYYY-MM": usd } }`. Every call re-reads the file (like
  `dailyCounters` in `state.ts`), so a month rolling over mid-run and a
  parallel `agent:evaluate` both stay right. `add` writes through a temp
  file and a rename and keeps only the current and previous local month.
  Month key = `localDate(now()).slice(0, 7)`.
- `agent/runner/lib/state.ts` — export `readState`/`writeState` (today
  private) so the ledger reuses the zod-checked read and the crash-safe
  write instead of copying them. Invalid file → the existing
  `CliError(2, "<path>: not a valid state file; fix or delete it")`.
- `agent/runner/lib/apiBudget.ts` — `createRunBudget` takes
  `{ perRunUsd, monthlyUsd, prices, ledger }`. `charge` adds the response's
  cost to the run total **and** `ledger.add(cost)`, and counts the call.
  `stopReason` order: explicit `stop` → run cap → month cap
  (`API monthly cap reached: $<month> of $<cap>`, both `toFixed(2)`).
  `StepBudget` gains `spend(): ApiSpend | null`, where
  `ApiSpend = { runUsd, monthUsd, monthlyUsd }`; `UNLIMITED` and a run
  budget with no charged call return `null` ("whenever the run made an API
  call").
- `agent/runner/lib/runnerConfig.ts` — `api.monthlyUsd:
  z.number().positive().default(30)`, also in the `api` object's `.default`.
- `agent/runner/lib/engine.ts` — `EngineDeps` gains `stateDir`; `apiEngine`
  builds the ledger at `join(stateDir, 'api-spend.json')` with
  `() => new Date()` and passes it and `monthlyUsd` to `createRunBudget`.
  Still no I/O at construction. `loadEngine` passes `stateDir(env)`. The
  CLI engine is untouched: no ledger, no write, no line.
  This covers `agent:evaluate` and `agent:draft` too, since they share the
  engine — their spend counts toward the month.
- `agent/runner/lib/dailyRun.ts` — `DailyReport.apiSpend: ApiSpend | null`,
  set from `budget.spend()` at the end of `modelSteps` (and left `null` when
  model steps were skipped before any call). `sendSummary` passes it to
  `composeSummary`. The month cap at the start of a run surfaces through the
  existing `report.stopped` path (canStart is false from the first step), so
  "skipped like a failed gate, named in the summary" needs no new branch.
- `agent/runner/lib/summary.ts` — `SummaryInput.apiSpend?: ApiSpend | null`;
  when set, the body gains `Claude API: $<run> this run, $<month> this month
  of $<cap>` just before `Open job-app:`. `isEmpty` unchanged — spend alone
  doesn't force an email.
- `agent/runner/commands/run.ts` — `printReport` prints
  `api: $<run> run, $<month> month` (two decimals) after `summary: …` when
  `report.apiSpend` is set, so it's stdout's last line.
- `src/lib/agentRuns.ts` — `runSpend(output): { run: string; month: string }
  | null`: the last line matching `^api: \$(\d+\.\d{2}) run, \$(\d+\.\d{2})
  month$` (last, because stderr failure lines may follow it in the merged
  output).
- `src/components/AgentRunPanel.tsx` — `RecentRun`'s head shows
  `<span className="run-spend">API $0.42 run, $4.12 month</span>` when
  `runSpend` finds the line; nothing otherwise (collect runs, CLI engine).
- `src/ads.css` — `.run-spend { color: var(--ink-muted); }` (muted like
  `.run-time`; spend is information, not something needing the user).
- `README.md` — "Engine" section: `api.monthlyUsd`, the ledger file and its
  shape/pruning, the summary and `api:` lines, and setting an Anthropic
  Console spend limit above `monthlyUsd` as the backstop. The "Daily run"
  problems paragraph (~line 616) gains the monthly cap.
- `docs/architecture.md` — `apiSpend.ts` entry; `apiBudget.ts`/config
  entries (~349, ~364) mention the month cap and `spend()`.
- `docs/in-app-agent.md` — Streams row `050-spend-caps` → `done`.

## Work order

1. `state.ts` exports; `apiSpend.ts` + `apiSpend.test.ts`.
2. Config key; `apiBudget.ts` month cap, ledger charge, `spend()`; tests.
3. `engine.ts` wiring (`stateDir`); update `engine.test.ts` deps.
4. `dailyRun.ts` + `summary.ts` line; `run.ts` printed line; tests.
5. `runSpend` + panel span + CSS; tests.
6. README, architecture, Streams row.

## Tests

- New `agent/runner/lib/apiSpend.test.ts` (tmp dir): missing file → 0;
  `add` accumulates in the current month; month rollover (injected `now`
  moves Dec→Jan) starts a new key and keeps the previous; a month older than
  the previous is dropped on write; write leaves no `.tmp` and a valid file;
  an existing `.tmp` from a "crash" doesn't affect the read; invalid JSON or
  wrong shape → `CliError` code 2.
- `apiBudget.test.ts`: charge goes to both run and ledger; month at/over
  cap → `canStart()` false with `API monthly cap reached: $30.00 of $30.00`;
  a ledger already at cap stops before the first step; run cap still wins
  when both hit; `spend()` null before a call, figures after; `UNLIMITED.spend()`
  null.
- `runnerConfig.test.ts`: `monthlyUsd` defaults to 30; non-positive rejected.
- `engine.test.ts`: api engine charges land in `<stateDir>/api-spend.json`;
  cli engine writes nothing there.
- `summary.test.ts`: line present with `apiSpend`, absent without.
- `dailyRun.test.ts`: report carries `apiSpend` from the budget and the sent
  summary includes the line; a budget stopped by the month cap yields
  `report.stopped` and the summary problem.
- `src/lib/agentRuns.test.ts` (new): `runSpend` finds the line, takes the
  last when followed by stderr lines, null when absent.
- `AgentRunPanel.test.tsx`: a recent run whose output ends with the `api:`
  line shows "API $0.42 run, $4.12 month"; a collect run shows none.
- Failure cases: corrupt `api-spend.json` → `CliError(2)` from the ledger,
  which reaches `guarded` as that step's failure (run exits 1, summary lists
  it), the same as the other state files; never a stack.
- Verification command: `npm test -- --maxWorkers=2`, `npm run build`,
  `npm run lint`.

---

**Next stage:** run `/sdlc`.
