---
brief: brief/035a-corpus-sync.md
branch: 035a-corpus-sync
date: 2026-11-19
---

# Corpus sync — Plan

Context: the profile index only changes when the user runs `npm run
profile:index` on the laptop, and corpus files are copied by hand. This adds a
per-attachment "Add to profile" mark in the UI (usable from a phone) and a
runner-side `npm run profile:sync` that copies the marked attachments into a
`style` corpus folder, rebuilds the index incrementally and clears the marks.
`039-daily-run` later calls the same function as one step of the daily run.

Decisions taken with the user (the brief's open questions):

- **Location:** the command starts the runner tree, `agent/runner/`, which
  holds job-app credentials and has its own small HTTP client. `agent/runner/`
  may import `agent/profile/lib/` and `agent/lib/`, and `agent/profile/` never
  imports `agent/runner/`. Nothing in `agent/` imports `server/` or `mcp/`. The
  "no job-app credentials" rule now applies to `agent/profile/`, not to all of
  `agent/`.
- **Folder:** a new optional config key `syncFolder` (absolute path).
  `loadProfileConfig` appends it to `corpus` as a `style` entry, so
  `profile:index`, `profile:sync` and search all see it. The existing
  two-entries check in `listCorpusFiles` rejects overlap with another entry.
- **Copy name:** `<attachmentId>-<sanitised original name>`, where the name is
  `basename(originalName)` with every character outside `[A-Za-z0-9._-]`
  replaced by `_`. Before writing, every `<id>-*` file in `syncFolder` is
  removed, so a renamed re-upload still replaces the copy and the next build
  drops the old copy and embeds the new one.
- **Ollama down:** the command runs `checkOllama` first. If the check fails,
  it exits 1 with `Ollama health check failed: <reason>`, copies nothing and
  leaves every mark in place. Marks are cleared only after `buildIndex`
  completes, so a failure mid-build keeps them for the next run, and copying
  again is idempotent.
- **UI:** a per-attachment toggle (details under Contracts).

## Affected files

Server and client:

- `server/db/index.ts`: `profile_sync INTEGER NOT NULL DEFAULT 0` on
  `attachments` in `SCHEMA`.
- `server/lib/migrations.ts`: `migrateAttachmentProfileSync`, following the
  `migrateAttachmentUploadedAt` pattern, added to `migrate`.
- `server/models/attachment.ts`: `profile_sync` on `AttachmentRow`, mapped to
  `profileSyncPending: boolean`.
- `server/types.ts`, `src/types.ts`: `profileSyncPending: boolean` on
  `Attachment`. The two copies are kept in step by hand.
- `server/routes/attachments.ts`: two routes.
  - `GET /api/attachments/pending-sync` returns the caller's attachments whose
    flag is set, as `Attachment[]`. It is registered **before**
    `GET /attachments/:id`.
  - `PUT /api/attachments/:id/profile-sync` takes `{ "pending": boolean }`
    and returns the updated `Attachment`. A non-boolean body gives
    `HttpError(400, 'pending must be true or false')`, and an attachment the
    caller doesn't own gives 404 `not found` (through `findOwnedAttachment`).
    It does not touch the application's `updated_at`: the mark is not an
    edit. Replacing a file (`PUT /attachments/:id`) leaves the flag as it is.
- `src/lib/api.ts`: `setAttachmentProfileSync(id, pending): Promise<Attachment>`.
- `src/components/AttachmentList.tsx`: an `onSetProfileSync(id, pending)` prop
  and the toggle in each row.
- `src/components/ApplicationDetail.tsx`: passes `onSetProfileSync` through.
- `src/components/ApplicationsView.tsx`: `handleSetProfileSync` through
  `change(...)`. Toasts: `Marked for profile sync` and `Profile mark removed`.
- `src/applications.css`: an `.attachment-actions` group (flex, wrap, gap
  `--s-2`) so the row's buttons wrap on a phone, and `.sync-pending` (muted
  text, `--fs-sm`), read from `index.css` tokens.

Agent:

- `agent/lib/paths.ts`: `envPath(env)`, which gives
  `$XDG_CONFIG_HOME|~/.config` + `/job-agent/env`.
- `agent/profile/lib/config.ts`: `syncFolder` is an optional absolute path. If
  it is set, it is appended to the returned `corpus` as
  `{ path, label: 'style' }`, and the returned config keeps `syncFolder` too.
- `agent/profile/lib/build.ts`: `formatBuildSummary(summary, skipped):
  string[]`, moved out of `commands/build.ts`'s `printSummary` so the sync
  can print the same lines.
- `agent/profile/commands/build.ts`: prints with `formatBuildSummary`.
- `agent/runner/lib/env.ts`: `loadJobAppEnv(path)`. It reads the file with
  `util.parseEnv` (no `process.env` mutation) and returns `{ baseUrl,
  username, password }` from `JOBAPP_API_URL`, `JOBAPP_USERNAME` and
  `JOBAPP_PASSWORD`. A missing file is `CliError(2, '<path>: file not
  found')`. A missing variable is `CliError(2, '<path>: JOBAPP_… is not
  set')`.
- `agent/runner/lib/jobApp.ts`: `createJobAppClient(config)` with
  `listPendingSync()`, `downloadAttachment(id): Promise<Uint8Array>` and
  `setProfileSync(id, pending)`. It logs in lazily through `/api/login` and
  keeps the session cookie, retrying once on a 401, the same flow as
  `mcp/lib/client.ts` but written here rather than imported. Its own
  `PendingAttachment { id, originalName }` type covers the fields the sync
  reads. Every failure is a `CliError(1, …)`, as listed under Tests.
- `agent/runner/lib/sync.ts`: `syncProfile({ jobApp, config, store, ollama })`
  returns `{ synced: string[], build: BuildSummary, skipped: string[] }`.
  1. List the pending attachments.
  2. For each one, download it, remove any `<id>-*` file in `syncFolder` and
     write `<id>-<safe name>`.
  3. Run `listCorpusFiles(config.corpus)` and then `buildIndex`.
  4. Clear each synced flag.

  It does no health check, because the caller does one, so `039-daily-run`
  can check Ollama once for sync, evaluation and drafting. Split into small
  helpers (`copyName`, `writeCopy`) per `simple-code`.
- `agent/runner/commands/sync.ts`: the `profile:sync` entry under
  `runCommand`. Steps in order:
  1. Load the config. If `syncFolder` is unset, exit with
     `CliError(2, '<config path>: syncFolder is required for profile:sync')`.
  2. Load the env.
  3. Run `checkOllama`, which gives exit 1 on failure.
  4. `mkdirSync(syncFolder, { recursive: true })`.
  5. Open the index and run `syncProfile`, closing the store in `finally`.
  6. Print the output:

     ```text
     synced N attachments
       <copy name>
     ```

     then the `formatBuildSummary` lines. With nothing marked it prints
     `synced 0 attachments` and still builds.
- `agent/test/fakeJobApp.ts`: an HTTP stand-in on port 0 for the four
  endpoints the client uses (login, pending list, download, flag PUT). It
  records the flag calls, accepts one username and password, and has
  switchable failures. It is like `fakeOllama.ts`, and `agent/` tests do not
  import `server/`.
- `package.json`: `"profile:sync": "node agent/runner/commands/sync.ts"`.

Docs:

- `docs/job-search-agent.md`:
  - The Streams row: `in progress` in the plan commit, `done` in the PR.
  - §3: the `env` row names the three `JOBAPP_*` variables, and the config
    example gains `syncFolder`.
  - §8: a "Corpus sync" bullet covering naming, mark lifecycle, health check
    first, flags cleared after the build, and that `syncProfile` is what 039
    calls.
- `docs/architecture.md`: the `agent/` intro (credentials only in
  `agent/runner/`), a new `agent/runner/` section, the new server routes and
  the attachment column.
- `CLAUDE.md`:
  - The `agent/` architecture line: no job-app credentials in
    `agent/profile/`, the runner holds them, and no imports from `server/`
    or `mcp/` anywhere in `agent/`.
  - `profile:sync` in Commands, noting it reads `~/.config/job-agent/env`.
  - The `Logging:` line already covers `agent/profile/` printing to stdout.
    Extend it to `agent/runner/commands/`.
- `README.md` "Profile corpus": `syncFolder`, the env file and `profile:sync`.

## Work order

1. Server: schema column + migration, model mapping, both `types.ts`, the two
   routes, with their tests.
2. Client: the `api.ts` helper, `AttachmentList` toggle + CSS, wiring through
   `ApplicationDetail` / `ApplicationsView`, with tests.
3. Agent profile changes: `envPath`, `syncFolder` in `loadProfileConfig`,
   `formatBuildSummary` (the existing `build.test.ts` output must stay
   byte-identical), with tests.
4. Runner: `fakeJobApp.ts`, `env.ts`, `jobApp.ts`, `sync.ts`,
   `commands/sync.ts`, the `package.json` script, with tests.
5. Docs: `job-search-agent.md`, `architecture.md`, `CLAUDE.md`, `README.md`.
6. `npm test`, `npm run lint`, `npm run build`. Then a manual check against
   the dev server (mark from the UI, run `npm run profile:sync`, confirm the
   copy, the summary and that the mark is gone), if the LAN Ollama is
   reachable.

## Contracts

- UI: extends the existing attachment row without adding a new visual
  language.
  - An unmarked row shows its link, then `Add to profile` (plain `.button`),
    then `Remove file`.
  - A marked row shows its link, muted `Pending profile sync` text, `Don't
    add` (plain `.button`), then `Remove file`.
  - The marked state isn't something the user needs to act on (it waits for
    the runner), so it gets no colour, only muted text.
  - Once synced, nothing is shown.
  - The buttons wrap below the link on narrow screens.
  - Accessible names include the file (`aria-label="Add <name> to profile"`
    and `"Don't add <name> to profile"`), so a list of several rows stays
    unambiguous for `getByRole`.

## Tests

- New:
  - `server/routes/attachments.test.ts`:
    - mark → appears in `pending-sync`
    - unmark → gone
    - another user's attachment → 404 on PUT and absent from the list
    - `pending: "yes"` → 400
    - replacing the file keeps the flag
    - `updated_at` unchanged by a mark
  - `server/db/index.test.ts` (or the migrations test beside it): a
    pre-existing `attachments` table gains `profile_sync` = 0.
  - `src/components/AttachmentList.test.tsx`:
    - an unmarked row offers `Add … to profile` and calls
      `onSetProfileSync(id, true)`
    - a marked row shows `Pending profile sync` and `Don't add …`, which calls
      `(id, false)`
  - `agent/lib/paths.test.ts`: `envPath` with and without
    `XDG_CONFIG_HOME`.
  - `agent/profile/lib/config.test.ts`:
    - `syncFolder` is appended as a `style` entry
    - a relative `syncFolder` is a config error naming `syncFolder`
    - an absent `syncFolder` leaves `corpus` unchanged
  - `agent/profile/lib/corpus.test.ts`: a `syncFolder` inside another entry's
    folder is rejected by the two-entries check.
  - `agent/runner/lib/jobApp.test.ts` against `fakeJobApp`: lists, downloads,
    sets flags, and re-logs in once on a 401.
  - `agent/runner/lib/sync.test.ts`:
    - the copy is named `<id>-<safe name>`
    - `../evil name.md` becomes `<id>-evil_name.md` inside `syncFolder`
    - re-marking with a new name removes the old `<id>-*` copy, and the
      build reports it updated or removed
    - a `.pdf` lands in the folder and in `skipped`
    - flags are cleared only after a completed build
    - an embed failure leaves the flags set
  - `agent/runner/commands/sync.test.ts` (`runNode` with fake Ollama + fake
    job-app):
    - a successful run prints the summary and exits 0
    - nothing marked prints `synced 0 attachments` and exits 0
- Updated:
  - `agent/profile/commands/build.test.ts`: unchanged expectations, which
    guard the `formatBuildSummary` move.
  - Any test asserting a full `Attachment` shape with `toEqual` gains
    `profileSyncPending: false`, in `mcp/tools/attachments.test.ts`,
    `server/routes/applications*.test.ts` and component fixtures.
- Failure cases (each exits with one stderr line, no stack, empty stdout):
  - `syncFolder` not set → 2, `<config path>: syncFolder is required for
    profile:sync`.
  - Env file missing → 2, `<env path>: file not found`. A `JOBAPP_*` variable
    missing → 2, naming the variable.
  - Ollama unreachable or model missing → 1, `Ollama health check failed:
    <reason>`. Nothing is copied and no flag PUT reaches the fake.
  - Job-app unreachable → 1, `cannot reach job-app at <url>`.
  - Login rejected → 1, `job-app login failed: check JOBAPP_USERNAME and
    JOBAPP_PASSWORD in <env path>` (the password is never printed).
  - Any other non-OK job-app response → 1, `job-app <METHOD> <path>:
    <status> <error>`, where the API's `{error}` message is passed through.
  - An embed failure mid-build → 1, the existing `Ollama embedding failed: …`.
    The flags stay set and the copies stay on disk, and the next run rewrites
    them.
  - Server: a non-boolean `pending` → 400 JSON error, and an unknown or
    unowned attachment → 404 `not found`, both through `jsonErrorHandler`.
- Verification command: `npm test` (plus `npm run lint`, `npm run build`).

## Risks / rollback

- The `profile_sync` column is additive with a default, and older code ignores
  it. To roll back, revert the code and the column stays harmlessly.
- Synced copies and their index entries are the user's to delete by hand (out
  of scope per the brief).

---

**Next stage:** run `/sdlc`.
