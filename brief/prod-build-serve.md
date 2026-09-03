---
slug: prod-build-serve
date: 2026-09-03
---

# Serve the production build from Express

## Problem

There is no way to run this app the way it would actually be deployed. `npm
run dev` + `npm run dev:server` is a two-process dev setup where Vite serves
the frontend with HMR and proxies `/api` to a separate Express process on
:3001. There's no single command that builds the frontend and serves it
alongside the API from one process on one port — which is what "does the
built app actually work, end to end" needs to answer.

## What done looks like

1. `npm run build` (existing) still produces `dist/`.
2. Express (`server/app.ts` / `createApp`) can serve `dist/` as static files
   when told to, in addition to the existing `/api` routes.
3. Any GET request that isn't under `/api` and doesn't match a static file
   falls back to `dist/index.html` (SPA fallback), so refreshing or
   deep-linking doesn't 404. This is forward-looking — the app has no
   client-side router today — but it's the correct default for a built SPA
   and costs nothing now.
4. The server's port is configurable via a `PORT` env var, defaulting to
   3001 (matches current hardcoded value).
5. One command, `npm start`, runs the production build and then starts the
   server serving both the static build and the API on the configured port.
   It requires the same `.env` (`DB_PATH`, `UPLOADS_DIR`) as `dev:server`
   does today — no new required env var beyond the optional `PORT`.
6. `npm run dev` / `npm run dev:server` (the two-process HMR workflow)
   continue to work unchanged.
7. README's "Running the server" section documents `npm start` as how to run
   the app the way it'd actually be deployed, alongside the existing
   `dev`/`dev:server` two-process instructions.

## Approach

- Add a `dist/` static-serving path to `createApp` in `server/app.ts`,
  gated behind an explicit parameter (e.g. `createApp(db, uploadsDir, {
  staticDir })`) rather than an env var sniff — keeps `createApp` a pure
  function of its inputs, which is what the existing tests
  (`applications.test.ts`, `attachments.test.ts`) already rely on. Static
  serving and the SPA fallback are only wired up when `staticDir` is passed.
- Order matters: `/api` routes and the JSON error handler stay first, then
  `express.static(staticDir)`, then the SPA fallback (`res.sendFile` on
  `index.html` for any remaining GET). The SPA fallback must not swallow
  `/api/*` 404s — only apply it to non-`/api` GET requests.
- `server/index.ts` passes `path.join(import.meta.dirname, '../dist')` (or
  equivalent) as `staticDir` when starting the real server, and reads
  `PORT` from env with a `3001` default. `dev:server` keeps working exactly
  as today since `dist/` existing or not doesn't change dev behavior (Vite
  still owns the frontend in dev; nothing in `index.ts` conditions serving
  on `NODE_ENV`, it just always serves whatever's in `dist/` if present —
  simplest option, no mode flag to get wrong). Rejected: an `NODE_ENV`
  branch to toggle static serving — an extra flag that can drift from
  reality; unconditionally serving `dist/` when it exists is simpler and
  the dev workflow never touches `dist/` anyway.
- `package.json` gets `"start": "npm run build && node --env-file-if-exists=.env server/index.ts"`.

## Out of scope

- Any deployment target (Docker, hosting, process manager, systemd).
- Gzip/Brotli compression, caching headers, or other prod-hardening for
  static assets — `express.static` defaults are enough for local "production
  build" testing.
- Changing the dev workflow or removing the two-process setup.
- Adding a client-side router (the SPA fallback is added regardless, per
  above).

## Open questions

None outstanding — resolved during the brief conversation (command name:
`npm start`; port: configurable via `PORT`, default 3001; SPA fallback: yes).

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/prod-build-serve.plan.md` before writing
any code.
