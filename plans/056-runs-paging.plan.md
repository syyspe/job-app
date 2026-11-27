---
brief: brief/056-runs-paging.md
branch: 056-runs-paging
date: 2026-11-27
---

# Ad inbox: page the runs list, one run at a time — Plan

Decisions on the brief's open questions (agreed with the user 2026-11-27):

- **While a run is in progress, it replaces the recent run.** Only the
  current run's live output shows; the paged recent run and its pager come
  back when it finishes. The panel never shows more than one run.
- **The run on show always has its output open**, whichever page it is on.
- **The pager says "Run 2 of 10"** for runs; applications keep "Page 2 of 4".

## Affected files

- `src/components/Pagination.tsx` — two new required props: `label` (the
  `<nav>`'s `aria-label`, today hard-coded `"Application pages"`) and `unit`
  (the word before the position, `"Page"` / `"Run"`). No defaults: both call
  sites pass them.
- `src/components/Pagination.test.tsx` — pass the new props; assert the nav is
  found by the given label and the text uses the given unit.
- `src/components/ApplicationsView.tsx` — pass `label="Application pages"
  unit="Page"` (behaviour unchanged; its test at line 277 still queries that
  name).
- `src/components/AgentRunPanel.tsx` — split out a `RecentRuns({ runs })`
  child holding `const [page, setPage] = useState(1)`, using
  `paginate(runs, page, 1)` from `src/lib/paging.ts`. It renders the empty
  message when `runs` is empty, else the existing `<ul aria-label="Recent
  runs">` with the one `RecentRun` (always `open`), then
  `<Pagination label="Run pages" unit="Run" …>`. `AgentRunPanel` renders
  `CurrentRun` when `runs.current` is set, otherwise `RecentRuns`. Because
  `RecentRuns` unmounts while a run is current, its page resets to the newest
  run when that run finishes — no effect or reset logic needed. `RecentRun`
  loses its `open` prop (always open).
- `src/components/AgentRunPanel.test.tsx` — update to one-at-a-time (below).
- `src/ads.css` — `.run-panel .pager { margin-top: 0; }` so the panel's own
  `gap` spaces the pager instead of `.pager`'s list-foot margin stacking on
  top of it.
- `docs/architecture.md` — line ~61-64: "the last ten runs" → "the last ten
  runs one at a time through `Pagination`, the current run in their place
  while one is in progress"; line ~43 unchanged.

Unchanged: `src/lib/paging.ts`, `useAgentRuns`, `RECENT_LIMIT`, the server.
`e2e/agentRuns.spec.ts` and `src/lib/useAgentRuns.test.tsx` keep working
unchanged: they query the "Recent runs" list's first/only item after the run
finishes, and the empty-state copy is unchanged.

## Work order

1. `Pagination`: add `label` and `unit` props; update its tests; pass them
   from `ApplicationsView`.
2. `AgentRunPanel`: add `RecentRuns` with page state and `paginate(…, 1)`;
   current run replaces it; drop `open`; update its tests.
3. `ads.css` pager margin inside the run panel.
4. `docs/architecture.md` line.

## Tests

- Updated `Pagination.test.tsx`: renders `navigation` named by `label`;
  "names the position" asserts `Run 2 of 4` with `unit="Run"`; the rest pass
  `label`/`unit` and are otherwise unchanged.
- Updated `AgentRunPanel.test.tsx`:
  - running test: with `{ current: running, recent: [finished] }`, the log
    shows and the "Recent runs" list and the "Run pages" navigation are
    absent.
  - "a finished run shows its outcome…": with two recent runs, the list holds
    one item, the newest (`failed`, Daily run) with `details` open; clicking
    Next shows the older (`succeeded`, its output visible, `details` open) and
    `Run 2 of 2`; Previous goes back.
  - one recent run → no "Run pages" navigation.
  - spend test: newest shows its spend; after Next, the collect run shows
    none.
  - a rerender with `current` set then cleared again starts back at the
    newest run (page reset by unmount).
- Verification command: `npm test -- --maxWorkers=2`, plus `npm run lint`,
  `npm run build`, and `npm run test:e2e` (check ports 5173/3001 first per
  CLAUDE.md; fall back to `test:e2e:prod`).

---

**Next stage:** run `/sdlc`.
