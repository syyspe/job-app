---
slug: directory-structure
date: 2026-09-04
---

# Idiomatic directory structure for `src/` and `server/`

## Problem

Both halves of the app are flat: 15 files directly under `src/`, 9 directly
under `server/`. Nothing signals what kind of thing a file is, so the only way
to know whether `applications.ts` is a router, a model, or a helper is to open
it.

Two concrete symptoms, not just aesthetics:

- `server/applications.ts` (183 lines) is four things at once — row
  interfaces, row→domain mappers, request validation, and four route
  handlers. `server/attachments.ts` imports `toAttachment` and
  `unlinkIfExists` *from the applications router*, because there is nowhere
  else for shared helpers to live.
- `CLAUDE.md`'s Architecture section says "`server/` — **not created yet**"
  and describes a frontend-only project. It is already wrong, and it is the
  file every session reads first.

Why now: the tree is still small enough (~1,600 lines) that the move is one
sitting. Every feature added first makes it more expensive.

## What done looks like

1. `src/` is grouped: `components/` for the four React components,
   `lib/` for `api.ts`, `test/` for `setupTests.ts`; `App.tsx`, `main.tsx`,
   `types.ts` and the two CSS files stay at the root of `src/`.
2. `server/` is grouped by layer: `routes/`, `models/`, `lib/`, `db/`, with
   `app.ts`, `index.ts` and `types.ts` at the root of `server/`.
3. `server/applications.ts` is split — the row interfaces and the
   `toApplication`/`toAttachment` mappers move to `server/models/`, request
   validation and `unlinkIfExists` move to `server/lib/`, and what remains in
   `server/routes/applications.ts` is the four handlers plus the router
   factory.
4. `server/routes/attachments.ts` no longer imports anything from the
   applications router — both routers depend on `models/` and `lib/` instead.
5. `jsonErrorHandler` moves out of `app.ts` into `server/middleware/`, leaving
   `app.ts` as wiring only.
6. Unit tests stay co-located with the code they test (per `CLAUDE.md`), so
   they move with it — the Vitest `include` globs keep matching without
   change.
7. `npm test`, `npm run lint`, `npm run build` and `npm run test:e2e` all pass
   with no change to any test's *assertions* — only to its import paths.
8. `CLAUDE.md`'s Architecture section is rewritten to describe the real tree,
   including `server/`, and to say where a new component/route/model goes.
9. `README.md` is checked for stale path references and corrected.

## Approach

Imports stay relative (`../lib/api.ts`). No `@/` alias: it would need a
`paths` entry in `tsconfig.app.json` *and* a `resolve.alias` in
`vite.config.ts`, plus a messier equivalent on the server side where
`moduleResolution: nodenext` is in force — config cost with no payoff at two
levels of nesting.

Layer folders (`routes/`, `models/`, `lib/`) rather than feature folders
(`server/applications/{router,model}.ts`). Rejected the feature split because
there are exactly two features and they share a database and a mapper; layers
put the shared things somewhere obvious, feature folders would recreate the
cross-import problem this brief exists to fix.

`git mv` for the pure relocations so history follows the files, then the
`server/applications.ts` split as ordinary edits on top.

Sequencing that keeps the diff checkable: move first and get to green, then
split, and get to green again. The plan should make those separate steps.

## Out of scope

- No behaviour change. No endpoint, component, prop, or SQL statement changes
  meaning. If a test assertion has to change, something has gone wrong.
- No new dependencies, no new npm scripts, no build-tool changes beyond what a
  moved file forces.
- No splitting of the React components — they are 49–130 lines and each does
  one thing. Only the server's mixed modules get split.
- `e2e/` keeps its current flat shape; three specs is not a directory problem.
- No path aliases (see Approach).

## Open questions

- Does `src/lib/` earn its keep for a single 70-line `api.ts`, or should it be
  `src/api/client.ts`? Plan decides; low stakes either way.
- `server/middleware/errors.ts` for one 12-line handler may be a directory
  with one small file in it forever. The alternative is `server/lib/errors.ts`.
  Plan picks one.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/directory-structure.plan.md` before
writing any code.
