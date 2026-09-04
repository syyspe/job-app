---
brief: brief/directory-structure.md
branch: directory-structure
date: 2026-09-04
---

# Idiomatic directory structure for `src/` and `server/` — Plan

## Context

Both halves of the app are flat — 15 files under `src/`, 9 under `server/` —
so a filename says nothing about what kind of thing it is. The concrete cost:
`server/applications.ts` (183 lines) is row interfaces + mappers + request
validation + four route handlers at once, which forced
`server/attachments.ts` to import `toAttachment`/`unlinkIfExists` *from the
applications router*. `CLAUDE.md` — the file every session reads first — still
claims `server/` doesn't exist and points at a `src/assets/` that isn't there.

Outcome: grouped directories, the mixed server module split along those
groups, no behaviour change, and `CLAUDE.md` describing the real tree.

## Target layout

```
src/                      server/
  main.tsx                  index.ts        (entrypoint — unchanged)
  App.tsx                   app.ts          (wiring only)
  App.test.tsx              app.test.ts
  App.css                   types.ts
  index.css                 routes/         applications.ts + .test.ts
  types.ts                                  attachments.ts  + .test.ts
  components/               models/         application.ts, attachment.ts
    ApplicationForm.tsx     lib/            validation.ts, files.ts
    ApplicationList.tsx     middleware/     errors.ts
    ApplicationDetail.tsx   db/             index.ts
    AttachmentList.tsx
    (+ the three .test.tsx)
  lib/api.ts
  test/setupTests.ts
```

Brief's two open questions, decided:

- **`src/lib/api.ts`**, not `src/api/client.ts` — one word, and it mirrors
  `server/lib/`.
- **`server/middleware/errors.ts`**, not `server/lib/errors.ts` — the
  directory names the Express contract (`err, req, res, next`), which `lib/`
  does not. It is where request logging or auth lands next.
- `server/db/index.ts` for `openDatabase` (imported as `'./db/index.ts'` —
  `nodenext` has no directory resolution, so the extension is explicit).

## Affected files

Every source file under `src/` and `server/` moves or has an import path
rewritten. The pattern, once:

- **Moves are `git mv`** so rename detection holds; tests move with the code
  they test (`CLAUDE.md` co-location rule), and Vitest's existing
  `src/**/*.test.{ts,tsx}` / `server/**/*.test.ts` globs keep matching.
- **Imports stay relative**, gaining one `../` where a file moved a level
  down: `'./types.ts'` → `'../types.ts'` in `src/components/*`,
  `'./api.ts'` → `'../lib/api.ts'`, `'./db.ts'` → `'../db/index.ts'` in
  `server/routes/*.test.ts`. No path aliases (per brief).

Named files that change beyond a path rewrite:

- `server/applications.ts` → `server/routes/applications.ts` — keeps the four
  handlers and `createApplicationsRouter`; loses `ApplicationRow`,
  `AttachmentRow`, `toApplication`, `toAttachment`, `ApplicationInput`,
  `validateInput`, `unlinkIfExists`.
- `server/models/application.ts` — `ApplicationRow` + `toApplication`
  (exported now; it was file-private).
- `server/models/attachment.ts` — `AttachmentRow` + `toAttachment`.
- `server/lib/validation.ts` — `ApplicationInput` + `validateInput`.
- `server/lib/files.ts` — `unlinkIfExists` (keeps its comment).
- `server/middleware/errors.ts` — `jsonErrorHandler`, moved out of `app.ts`
  along with the `multer` and `NextFunction`/`Request`/`Response` imports it
  is the only user of. `app.ts` drops to wiring.
- `server/routes/attachments.ts` — imports `toAttachment`/`AttachmentRow` from
  `../models/attachment.ts` and `unlinkIfExists` from `../lib/files.ts`; the
  import from the applications router is gone.
- `vite.config.ts` — `setupFiles: ['./src/test/setupTests.ts']`. The only
  config edit; nothing else in `package.json`, the tsconfigs, `.oxlintrc.json`
  or the Playwright configs references a moved path (`server/index.ts` stays
  put, which is what `dev:server`, `start` and both Playwright configs name).
- `CLAUDE.md` — Architecture section rewritten (see step 4).

## Work order

Two commits, each green on its own — a pure-move commit reads as renames, and
the split then shows as a real diff.

**Commit 1 — relocate only.**

1. `git mv` the `src/` files into `components/`, `lib/`, `test/`; `git mv` the
   `server/` files into `routes/` and `db/index.ts`. `server/applications.ts`
   moves intact — `attachments.ts` temporarily imports it as
   `'./applications.ts'` (same directory), still.
2. Rewrite the shifted relative imports and `vite.config.ts`'s `setupFiles`.
3. Run the verification commands. Commit.

**Commit 2 — split, and document.**

4. Extract `models/application.ts`, `models/attachment.ts`,
   `lib/validation.ts`, `lib/files.ts` out of `routes/applications.ts`; point
   `routes/attachments.ts` at `models/`+`lib/` instead of at the applications
   router. Extract `middleware/errors.ts` out of `app.ts`.
5. Rewrite `CLAUDE.md` → Architecture: the real `src/` and `server/` trees
   above (drop the "`server/` — not created yet" line and the non-existent
   `src/assets/`), plus one line each on where a new component, route and
   model goes.
6. Check `README.md` for stale paths. Expected: none — its layout table lists
   process directories only, and its server section names npm scripts, not
   files. Correct anything that does turn up.
7. Run the verification commands. Commit.

## Tests

- **New:** none. This is a move-and-split with no new behaviour.
- **Updated:** import paths only, in all seven test files. **No assertion
  changes** — per the brief, an assertion that has to change means something
  went wrong.
- Verification command: `npm test` (the gate), plus `npm run lint`,
  `npm run build` and `npm run test:e2e`. Expect
  `Test Files N passed / Tests N passed` with no `failed` line, and `N passed`
  from Playwright.

## Risks / rollback

Low — no runtime behaviour changes and both commits are pure refactors on a
branch; `git reset --hard` to the pre-move commit undoes either.

The one thing to watch: `git mv` plus an import rewrite in the same commit can
drop below git's rename-similarity threshold on the smallest files. Splitting
into two commits is what keeps that readable; check `git show --stat -M` after
commit 1 and adjust nothing if renames show.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
