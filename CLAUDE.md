# Project Instructions for Claude

> Read by Claude at the start of every session in this repo — the highest
> leverage file here. Keep it accurate; stale instructions are worse than
> none.

## Commands

- Build: `npm run build` (runs `tsc -b` then `vite build`)
- Test: `npm test` — this is the gate that must pass before a PR. End-to-end
  tests are separate: `npm run test:e2e` (Playwright, boots the dev server
  itself).
- Lint: `npm run lint` (oxlint)
- Format: none configured — oxlint covers lint only. Match surrounding style.
- Dev server: `npm run dev` (http://localhost:5173). This only starts the
  frontend — the API proxies `/api` to `http://localhost:3001`, so also run
  `npm run dev:server` in a second terminal or requests fail with
  `ECONNREFUSED 127.0.0.1:3001`.

Expected healthy output for tests: `Test Files N passed / Tests N passed`,
with no `failed` line. Playwright: `N passed`.

## Conventions

- Language/runtime: TypeScript 6.0.3 on Node 24.20.0 LTS (pinned in `.nvmrc`
  and `package.json`'s `engines.node`). ESM only — `"type": "module"`.
- Framework: React 19.2.8 + React DOM 19.2.8, built by Vite 8.2.2.
- Testing: Vitest 4.1.11 with Testing Library (jsdom) for unit/component
  tests, Playwright 1.62.1 for end-to-end.
- Dependency policy: no new dependencies without approval.
- Unit tests live beside the code they test as `src/**/*.test.tsx?`; that
  glob is what Vitest picks up. E2E specs go in `e2e/*.spec.ts`.
- Import `test`/`expect` from `vitest` explicitly — globals are off, so an
  undeclared `test` is a type error at build time, not a runtime surprise.
- Query by accessible role/name in tests (`getByRole`), not by CSS class or
  test id, unless there's no accessible handle.

## Architecture

- `src/` — the React app. `main.tsx` mounts, `App.tsx` is the root component;
  `src/assets/` holds bundled images/SVGs.
- `public/` — served verbatim at the site root, not processed by Vite.
- `e2e/` — Playwright specs, configured by `playwright.config.ts`.
- `server/` — **not created yet.** When the app needs a backend, the Node API
  goes here. Until then this is a frontend-only project.
- `dist/`, `node_modules/`, `test-results/`, `playwright-report/` are
  generated — never edit by hand, never commit.

## Things Claude gets wrong here

> Add to this list the second time Claude makes the same mistake — see
> `REVIEW.md` for the review-feedback loop that feeds this section.

_(empty — fills in from real mistakes.)_

## Working agreement

- Nothing gets implemented without a committed plan first — see
  `plans/README.md`.
- Skills in `.claude/skills/` encode policy — check the relevant one
  before starting work that matches its trigger conditions; don't wait to
  be flagged. In particular: `simple-code` applies to every function and
  file you touch while writing or editing code, unconditionally — its
  limits and no-cleverness/no-defensive-code rules are active from the
  first line, not a checklist for after `verifier` or review catches
  something.
- Hooks in `.claude/hooks/` are hard guardrails, not suggestions — if one
  blocks you, that's a signal to stop and check with me, not to work
  around it.
- The default branch is PR-only. Never push to it directly, however small
  the change or however clearly it was asked for — commit on a branch and
  open a PR. `default-branch-guard.sh` enforces this. It's a solo repo, so
  I'm the reviewer; the point is that the diff gets looked at once, in one
  place, before it lands.

## The loop

Work moves through four stages. Each ends by committing an artifact, and that
commit is what starts the next stage — one kebab-case slug names the branch
and every artifact on it.

| Stage | Artifact | Unlocked by |
|---|---|---|
| 1. Brief | `brief/<slug>.md` | — |
| 2. Plan | `plans/<slug>.plan.md` | brief committed |
| 3. Build | code + tests | plan committed **before** code |
| 4. Ship | PR reviewed per `REVIEW.md`, merged | verification passes, `verifier` PASS |

There are no approval flags to flip — an artifact exists or it doesn't, and
that's the whole state. Run the `sdlc` skill (`/sdlc`) to see where the
current branch stands and what the next action is.

Stages are the default path, not a cage. For a genuinely trivial change — a
typo, a version bump, a one-line fix with an obvious test — say so and go
straight to a branch and a PR. Skipping the brief is a judgment call you can
make out loud; skipping the plan on anything that isn't trivial is not.

## Session hygiene

Every turn resends the whole conversation, so context length is a recurring
cost, not a one-time one — and Opus-tier tokens weigh about 2.5x Sonnet-tier
against a subscription's usage limit. The loop above already provides the
seams; use them.

- **A session per stage, not per feature.** Each committed artifact is a
  natural clear point. `session-start-check.sh` re-derives the stage from
  what's on disk, so a fresh session re-orients for almost nothing, while
  carrying a finished stage's context forward is paid for on every turn that
  follows. When a stage's artifact lands, say so and suggest starting the
  next one fresh.
- **Match the model to the stage.** Stages 1–2 are where the judgment is and
  are worth the Opus rate. Stage 3 executes a work order that is already
  written down, and it's the most turn-dense stage — suggest `/model sonnet`
  when a build starts.
- **Prefer a subagent to reading.** Anything read into this session is paid
  for on every later turn; the same read inside a subagent costs one summary.
  Use `Explore` for "where does X live", and hand verification to `verifier`
  (pinned to Sonnet) rather than re-reading the diff here.
- **Don't resume a cold session.** The prompt cache goes stale after roughly
  an hour, so picking a long session back up after a break re-reads its whole
  context at full price. Stepping away mid-stage: commit what exists and
  start fresh later.
