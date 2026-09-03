---
brief: brief/prod-build-serve.md
branch: prod-build-serve
date: 2026-09-03
---

# Serve the production build from Express — Plan

## Context

Today there's no single-process way to run this app the way it's actually
deployed: `npm run dev` (Vite, :5173) proxies `/api` to a separate
`npm run dev:server` (Express, :3001) — good for HMR, useless for answering
"does the built app actually work end to end." This plan makes `createApp`
able to serve `dist/` alongside the existing API, adds a SPA fallback so
deep-links/refreshes don't 404, and adds one `npm start` command that builds
and runs it all on one configurable port. The two-process dev workflow is
untouched.

Two things in the brief's suggested approach were live-verified against this
repo's actual `express@5.2.1` and don't hold as written — both are corrected
below:

1. **`jsonErrorHandler` can't "stay first."** It's Express error-handling
   middleware — it only catches errors from things registered *before* it.
   Confirmed by running it: with the handler left in its current (last)
   position and the static/SPA-fallback block added after it, a missing
   `index.html` (e.g. `dist/` not built) produces Express's raw HTML stack
   trace instead of a clean JSON error — a path-disclosing leak in exactly
   the code path meant to avoid that. Fix: move `jsonErrorHandler` to after
   the static/SPA-fallback block. When `staticDir` is omitted (both existing
   tests), that block is skipped and `jsonErrorHandler` ends up in the exact
   same position it's in today — no behavior change for
   `applications.test.ts` / `attachments.test.ts`.
2. **`app.get('*', ...)` throws at startup on Express 5** (path-to-regexp's
   stricter wildcard syntax). Confirmed live. Use a plain `app.use` guard
   middleware instead of a wildcard route — simpler and doesn't depend on
   path-to-regexp semantics at all.

## Affected files

- `server/app.ts` — `createApp` gains an optional third parameter
  `{ staticDir }`; when set, wires up `express.static` + a SPA-fallback guard;
  `jsonErrorHandler` moves to be registered last.
- `server/index.ts` — computes `staticDir` from `import.meta.dirname`, reads
  `PORT` from env (default 3001), passes both through.
- `package.json` — new `start` script.
- `.env.example` — add commented `# PORT=3001` for discoverability (optional
  var, not required — matches the brief's "no new required env var").
- `README.md` — extend "Running the server": split into the two-process dev
  path (documenting the `:5173`/`:3001` split, which isn't spelled out in
  README today even though it's true today) and the new `npm start` path.
  This is slightly more than the brief's item 7 strictly requires, but it's
  the same section already being touched and fixes a real, cheap-to-fix gap.
- `server/app.test.ts` (new) — covers the new branch in `createApp`; neither
  existing server test file exercises `staticDir`.
- `playwright.prod.config.ts` (new) — boots `npm start` as a single server
  and points Playwright's `baseURL` at it, reusing the existing `e2e/*.spec.ts`
  specs unchanged, so the same user-facing behavior is verified against the
  actual production build, not just the dev proxy setup.
- `package.json` — also gets a `test:e2e:prod` script for the above.
- `CLAUDE.md` — one-line addition to the Commands section noting
  `test:e2e:prod` alongside the existing `test:e2e` line, so it's
  discoverable the same way `test:e2e` is today.

## Work order

1. **`server/app.ts`**
   - Add `import { join } from 'node:path'`.
   - Add `type CreateAppOptions = { staticDir?: string }` and change the
     signature to
     `createApp(db: Database.Database, uploadsDir: string, { staticDir }: CreateAppOptions = {}): ExpressApp`.
   - After the two `/api` router mounts, add:
     ```ts
     if (staticDir) {
       app.use(express.static(staticDir))
       app.use((req, res, next) => {
         if (req.method !== 'GET' || req.path.startsWith('/api')) {
           next()
           return
         }
         res.sendFile(join(staticDir, 'index.html'))
       })
     }
     ```
   - Move `app.use(jsonErrorHandler)` to after that block (i.e. last line
     before `return app`).

2. **`server/index.ts`**
   - Add `import { join } from 'node:path'`.
   - `const staticDir = join(import.meta.dirname, '../dist')` (matches
     Vite's default `outDir`, confirmed unchanged in `vite.config.ts`).
   - `const port = Number(process.env.PORT) || 3001`.
   - `createApp(db, uploadsDir, { staticDir })`.
   - `app.listen(port, ...)` and the log line use `port` instead of the
     hardcoded `3001`.
   - Accepted edge case, not worth guarding: running `dev:server` without
     ever having built will make a direct `GET localhost:3001/` 500 with a
     JSON error (missing `index.html`) instead of 404. Nothing in the
     two-process dev flow hits port 3001 directly (Vite proxies only
     `/api`), so this is unvisited in practice.

3. **`package.json`** — add
   `"start": "npm run build && node --env-file-if-exists=.env server/index.ts"`
   (same native-TS-execution pattern `dev:server` already proves works, no
   new deps; no `--watch`, since `start` is a one-shot run). Also add
   `"test:e2e:prod": "playwright test --config=playwright.prod.config.ts"`.

4. **`.env.example`** — append `# PORT=3001` as a commented line.

5. **`README.md`** — rewrite "Running the server" as two labeled subsections:
   dev (two processes, `:5173` + `:3001`, proxy) and production
   (`npm start`, `PORT` default 3001). Keep the terse prose style of the
   existing section. Mention `npm run test:e2e:prod` alongside `test:e2e` in
   whichever section documents testing (or right after the production
   subsection) as "runs the existing e2e specs against the built app instead
   of the dev servers."

6. **`server/app.test.ts`** (new, `// @vitest-environment node`, following
   `applications.test.ts`'s `mkdtempSync` + `app.listen(0)` + `fetch`
   pattern):
   - `beforeEach`: temp dir with `static/index.html` and `static/asset.css`
     written to disk; `openDatabase` on a temp db path; `createApp(db,
     uploadsDir, { staticDir })`; listen on an ephemeral port.
   - test: `GET /asset.css` → 200, body is the static file's content.
   - test: `GET /some/deep/route` (unknown, non-api) → 200, body is
     `index.html`'s content (SPA fallback).
   - test: `GET /api/does-not-exist` → 404, body is **not** `index.html`'s
     content (confirms the SPA fallback doesn't swallow unmatched `/api`
     routes — this is Express's existing default-404 behavior, unchanged by
     this feature, so the assertion is "not swallowed," not "is JSON").

7. **`playwright.prod.config.ts`** (new) — mirror the existing
   `playwright.config.ts` structure but with a single `webServer` entry
   running the real deliverable command, `npm start`, instead of the two dev
   processes:
   ```ts
   import { defineConfig } from '@playwright/test'
   import { mkdtempSync } from 'node:fs'
   import { tmpdir } from 'node:os'
   import { join } from 'node:path'

   const dataDir = mkdtempSync(join(tmpdir(), 'job-app-e2e-prod-'))
   const port = 3002 // distinct from dev:server's 3001, so both configs can coexist

   export default defineConfig({
     testDir: './e2e',
     use: { baseURL: `http://localhost:${port}` },
     webServer: {
       command: 'npm start',
       url: `http://localhost:${port}/api/applications`,
       reuseExistingServer: !process.env.CI,
       timeout: 120_000, // npm start runs a full build first
       env: {
         PORT: String(port),
         DB_PATH: join(dataDir, 'app.db'),
         UPLOADS_DIR: join(dataDir, 'uploads'),
       },
     },
   })
   ```
   Same `e2e/*.spec.ts` files run unmodified — they exercise UI behavior via
   `baseURL`, nothing dev-server-specific. This is a separate command
   (`npm run test:e2e:prod`), not folded into `npm run test:e2e`/the default
   Playwright config, so the existing dev-mode e2e run's time/flakiness
   profile is unchanged and prod e2e is opt-in (run in Stage 4 verification
   or CI, not on every `test:e2e` invocation).

8. **`CLAUDE.md`** — add `test:e2e:prod` to the Commands section next to the
   existing `test:e2e` line (one sentence: runs the same e2e specs against
   `npm start` instead of the dev servers).

## Tests

- New: `server/app.test.ts` (three cases above). Picked up automatically —
  `vite.config.ts`'s `test.include` already globs `server/**/*.test.ts`.
- New: `playwright.prod.config.ts` + `test:e2e:prod` script — runs the
  existing `e2e/applications.spec.ts` and `e2e/smoke.spec.ts` against `npm
  start` instead of the dev servers. Expect `N passed` (same specs, same
  pass count as `npm run test:e2e`).
- Updated: none — `applications.test.ts` / `attachments.test.ts` keep calling
  `createApp(db, uploadsDir)` with two args unchanged; the third parameter
  defaults to `{}`, reproducing today's exact middleware order.
- Manual: after `npm run build`, run `npm start` and check `/`, a static
  asset, an unknown deep path, and `/api/...` by hand; separately confirm
  `npm run dev` + `npm run dev:server` still boot and proxy (no touched code
  path affects `vite.config.ts` or either dev script).
- Verification commands: `npm test` (expect `Test Files N passed / Tests N
  passed`, no `failed` line) and `npm run test:e2e:prod` (expect `N passed`).

## Risks / rollback

Purely additive and backward compatible — the new `createApp` parameter
defaults to `undefined`/`{}`, reproducing every existing caller's current
behavior exactly. No schema/data changes. Revertible with `git revert`, no
follow-up cleanup.

---

**Next stage:** commit this plan *before* writing code. Then implement the
work order, run the verification command above, and hand the change to the
`verifier` subagent (Stage 4) before opening a PR.
