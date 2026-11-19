---
brief: brief/035-profile-corpus.md
branch: 035-profile-corpus
date: 2026-11-19
---

# Profile corpus — Plan

## Context

Ad evaluation (036) and drafting (037) need the relevant parts of the user's
CVs, cover letters and other material, searchable without an embedding
provider and with facts told apart from style examples. This stream adds a
local index built from the corpus paths in private config, embedded by the
LAN Ollama service, and a read-only `search_profile` MCP server for the
`claude -p` steps. Contracts: `docs/job-search-agent.md` sections 2, 3 and 8.

### Decisions this plan adds to the contract

Record these in `docs/job-search-agent.md` (sections 3 and 8) in the same PR.

1. **Vector store: plain SQLite, brute force.** `better-sqlite3` (already a
   dependency) holds chunks and their vectors as Float32 blobs; search ranks
   by cosine similarity in JS. No new dependency. It is comfortable to ~10k
   chunks (~40 MB at 1024 dimensions, ~10–20 ms a search). Storage sits behind
   `agent/profile/lib/store.ts` alone, so moving to `sqlite-vec` later is one
   file plus a rebuild — the index is derived data, never a source of truth.
2. **Index file:** `~/.local/share/job-agent/profile.db`
   (`$XDG_DATA_HOME/job-agent/profile.db` when set). Config is
   `~/.config/job-agent/config.json` (`$XDG_CONFIG_HOME/job-agent/…`).
3. **Config keys this stream owns** (other keys are ignored here):

   ```json
   {
     "ollamaUrl": "http://<laptop>:11434",
     "embeddingModel": "<model>",
     "corpus": [
       { "path": "/abs/path/cv-templates", "label": "facts" },
       { "path": "/abs/path/letters", "label": "style" }
     ]
   }
   ```

   `path` is absolute and is a file or a folder; a folder is walked
   recursively for `.txt` and `.md` files, which inherit its label. Other file
   types are skipped and listed in the build summary. A file reachable from two
   entries is a config error.
4. **Incremental rebuild, run by the user.** `npm run profile:index` stores a
   SHA-256 per file and label; a rerun embeds only new or changed files, drops
   deleted ones, and skips the rest. A different configured `embeddingModel`
   wipes the index and re-embeds everything. The model is written to the index
   only when a build completes, so an interrupted model change leaves an index
   search refuses rather than a mixed one. Each file is replaced in its own
   transaction, so an interrupted same-model build leaves every file either
   old-and-consistent or new.
5. **Search refuses** when the index is missing, has no completed model, or was
   built with a model other than the configured one — the error says to run
   `npm run profile:index`.
6. **Health check** `checkOllama(config)` returns `{ ok: true }` or
   `{ ok: false, reason }` with `reason` one of `unreachable`, `bad_response`,
   `model_missing` (fixed categories, fit for the summary's source failures).
   It reads `GET /api/tags` with a 3 s timeout; `model` or `model:latest`
   counts as present. It returns rather than throws, because its caller (the
   runner) recovers by skipping evaluation and drafting.
7. **Location: `agent/profile/`**, the start of the `agent/` tree the runner
   joins in 036. It is its own process with no job-app credentials and no
   import from `mcp/` or `server/`. `@modelcontextprotocol/sdk` and `zod` are
   approved for `agent/` as well as `mcp/` (CLAUDE.md's dependency line).
8. **Follow-up stream `035a-corpus-sync`** (after 035, before 039 calls it):
   an "Add to profile" action on an application sets a flag in job-app; a
   `profile:sync` command on the runner side copies the flagged
   applications' CV and cover letter attachments into a `style` corpus folder
   (one file per application, overwritten on re-sync), runs the incremental
   build and clears the flags. Marking is by the UI action only, never
   automatic. 039 runs the sync each day. Its brief is written in its own
   Stage 1 session; this stream only needs folder entries and the incremental
   build to make it cheap. The letter suffix places it in build order next to
   035 without taking a new number; the sdlc numbering command ignores it
   (`[0-9]{3}-` does not match `035a-`), which is fine because the number is
   already claimed by 035.

### Stream state table in `docs/job-search-agent.md`

Committed **with this plan** (Stage 2, docs only), so the table is on the
branch from the start and a parallel `035a` worktree can branch from it. A new
section "Streams", placed after the intro, replacing the intro's "034 to 039"
with a pointer to it:

| Stream | Brief | State | Needs |
|---|---|---|---|
| `033-job-search-agent` | committed | done | — |
| `034-ad-inbox` | committed | done | — |
| `035-profile-corpus` | committed | in progress | — |
| `035a-corpus-sync` | not written | open | 035 |
| `036-ad-evaluation` | committed | open | 034, 035 |
| `037-application-drafts` | committed | open | 036 |
| `038-alert-sources` | committed | open | 034 |
| `039-daily-run` | committed | open | 035a, 037, 038 |

With a "Picking the next stream" note for `/sdlc` Stage 1:

- The next stream is the first `open` row, top to bottom, whose **Needs** are
  all `done`. Use its slug as written; do not take a new number from the sdlc
  numbering command.
- Before starting it, check `git branch -a --list '*<slug>*'`: a branch means
  the stream is already in progress elsewhere (the table on the default branch
  only changes on merge), so take the next eligible row.
- Brief **committed** → Stage 1 is already done: create the branch and go to
  Stage 2. Brief **not written** → Stage 1 writes `brief/<slug>.md` from
  `brief/TEMPLATE.md`, using this file's sections as its contract.
- Each stream updates its own row: `in progress` in its plan commit, `done` in
  its PR. A stream that adds a follow-up adds the row in the same commit.

This PR sets `035-profile-corpus` to `done` in its docs step.

### LAN access (brief's open question)

WSL runs `networkingMode=mirrored`, so outbound connections to the LAN work
as from Windows; the Hyper-V firewall rule is only needed for *inbound* to
WSL. The laptop must run Ollama with `OLLAMA_HOST=0.0.0.0:11434` and allow
inbound TCP 11434 on its own firewall. Check from WSL with
`curl http://<laptop>:11434/api/tags`. README documents this.

### Embedding model (brief's open question)

The model name lives in private config only. README recommends `bge-m3`
(multilingual, Finnish included, 1024 dimensions, long context) and the
`profile:search` command exists so the user can judge Finnish and English
results on the real corpus before 036 relies on them.

## Affected files

New, `agent/`:

- `agent/lib/paths.ts` — `configPath(env)`, `indexPath(env)` from XDG vars or
  `HOME` defaults.
- `agent/lib/cliError.ts` — `CliError(exitCode, message)`, the one agent error
  type; `runCommand(main)` prints a `CliError` as one stderr line and exits
  with its code, and lets anything else propagate (Node prints the stack,
  exit 1).
- `agent/profile/lib/config.ts` — `loadProfileConfig(path)`: read, JSON-parse,
  zod-validate the keys above; every failure is `CliError(2, …)` naming the
  file and field.
- `agent/profile/lib/corpus.ts` — `listCorpusFiles(entries)` →
  `{ files: {path, label, source}[], skipped: string[] }`; `source` is the path
  relative to its entry (the file name for a file entry). Missing path →
  `CliError(2)`.
- `agent/profile/lib/chunk.ts` — `chunkText(text)`: split on blank lines,
  pack paragraphs up to 1500 characters, cut a longer paragraph at whitespace.
- `agent/profile/lib/ollama.ts` — `createOllama({url, model})` →
  `{ embed(texts) }` (`POST /api/embed`, batches of 16, 120 s timeout;
  validates `embeddings` is an array of equal-length number arrays matching the
  input count) and `checkOllama(config)`. Embed failures throw
  `CliError(1, 'Ollama embedding failed: <status|unreachable|bad response>')`.
- `agent/profile/lib/store.ts` — schema (`meta`, `files(path, label, hash)`,
  `chunks(file_path → files ON DELETE CASCADE, ordinal, text, vector)`),
  `openIndex(path, {readonly})`, `readMeta`, `fileHashes`, `replaceFile`,
  `removeFile`, `resetIndex`, `completeBuild(model, dimensions)`,
  `allChunks(label?)`.
- `agent/profile/lib/build.ts` — `buildIndex({files, store, ollama, model})`
  → summary `{added, updated, removed, unchanged, chunks}`.
- `agent/profile/lib/search.ts` — `cosine`, `searchIndex({store, ollama,
  model}, {query, label?, limit})` → `{source, label, text, score}[]`, with the
  refusals in decision 5 and a dimension check.
- `agent/profile/server.ts` — `createProfileServer(search)`: registers only
  `search_profile` (`query` 1–2000 chars, optional `label` `facts|style`,
  `limit` 1–20 default 5). The description says `style` results never supply a
  fact.
- `agent/profile/index.ts` — stdio entry: load config (exit 2 on error), open
  the index read-only, connect. Writes nothing to stdout.
- `agent/profile/commands/build.ts`, `commands/health.ts`,
  `commands/search.ts` — `profile:index` (health first, then build, summary on
  stdout), `profile:health` (prints `ok` or the reason, exit 0/1),
  `profile:search "<query>" [facts|style]` (results on stdout).
- `agent/test/fakeOllama.ts` — test HTTP server on port 0: `/api/tags`,
  `/api/embed` with deterministic trigram-hash vectors, a request counter and
  switchable failures.
- Tests beside each module (listed under Tests).

Changed:

- `package.json` — scripts `profile:index`, `profile:health`,
  `profile:search`, `profile:mcp` (`node agent/profile/…`).
- `tsconfig.server.json` — `include` adds `agent`.
- `vite.config.ts` — test `include` adds `agent/**/*.test.ts`.
- `CLAUDE.md` — Commands (`profile:*`), dependency line (`agent/`), test globs,
  tsconfig line, Architecture bullet for `agent/` (no job-app credentials in
  `agent/profile/`; nothing writes to stdout in its MCP entry).
- `docs/architecture.md` — new `agent/` section.
- `docs/job-search-agent.md` — the Streams section and its note (with the
  plan commit); decisions 1–8 into sections 3 and 8, and row `035` → `done`
  (build).
- `README.md` — "Profile corpus" section: config example (synthetic), Ollama
  on the laptop and LAN check, recommended model, the four commands, when to
  rebuild.

## Work order

1. Wiring: `tsconfig.server.json`, `vite.config.ts`, `package.json` scripts,
   `agent/lib/paths.ts`, `agent/lib/cliError.ts` with tests.
2. `config.ts`, `corpus.ts`, `chunk.ts` with tests.
3. `agent/test/fakeOllama.ts`, `ollama.ts` (embed + `checkOllama`) with tests.
4. `store.ts` and `build.ts` with tests (incremental, model change,
   interruption).
5. `search.ts` with tests.
6. `server.ts` and `index.ts` with tests (InMemoryTransport, spawned entry).
7. The three commands with spawned-process tests.
8. Docs: README, CLAUDE.md, `docs/architecture.md`, `docs/job-search-agent.md`
   (decisions 1–8, row `035` → `done`). The Streams section itself already
   landed with the plan commit.
9. `npm test`, `npm run lint`, `npm run build`; commit.

## Contracts

- Errors: `agent/` CLIs and the profile MCP entry follow the existing CLI
  rule — config errors one stderr line, exit 2, no stack; an Ollama failure
  during a command one stderr line, exit 1; anything unexpected propagates
  with its stack. The MCP tool signals failure by throwing, as in `mcp/`.
- Logging: `agent/profile/` is outside the server logging contract, like
  `mcp/`. Commands print their result to stdout; the MCP entry never writes to
  stdout. The runner's logging is decided in 036/039.

## Tests

All `// @vitest-environment node`, synthetic fixtures in temp dirs.

- New: `agent/lib/cliError.test.ts` — `CliError` printed as one line with its
  exit code; other errors propagate.
- New: `agent/lib/paths.test.ts` — XDG vars win, `HOME` fallback.
- New: `agent/profile/lib/config.test.ts` — valid config; extra keys ignored.
- New: `agent/profile/lib/corpus.test.ts` — folder walk, label inherited,
  `source` relative, `.pdf` skipped and listed.
- New: `agent/profile/lib/chunk.test.ts` — packing, long paragraph cut, empty
  text → no chunks.
- New: `agent/profile/lib/ollama.test.ts` — embed batches and order; health
  `ok`, `:latest` match.
- New: `agent/profile/lib/build.test.ts` — first build embeds all; unchanged
  rerun makes zero embed requests; one changed file re-embedded alone; deleted
  file removed; label change re-embeds that file; model change re-embeds all.
- New: `agent/profile/lib/search.test.ts` — closest chunk first, `label`
  filter, `limit`, results carry label and source.
- New: `agent/profile/server.test.ts` — `listTools` is exactly
  `['search_profile']`; a call returns results; bad `label` rejected.
- New: `agent/profile/index.test.ts`, `commands/*.test.ts` — spawned
  processes, below.
- Failure cases:
  - Config file missing / invalid JSON / missing or wrong-typed key /
    non-http(s) `ollamaUrl` / relative `path` / unknown label / file in two
    entries / corpus path missing → exit 2, one line naming file and field, no
    stack, empty stdout (each command and the MCP entry).
  - Ollama unreachable, non-2xx, malformed body, wrong embedding count →
    `profile:index` exit 1 with one line; `checkOllama` returns `unreachable`
    / `bad_response`; timeout → `unreachable`; model not pulled →
    `model_missing`.
  - Embed fails mid-build after a model change → search refuses (no completed
    model); mid same-model build → earlier files stay searchable.
  - Index missing, model mismatch, dimension mismatch → search throws "run
    npm run profile:index"; the MCP tool returns it as `isError`.
- Verification command: `npm test` (plus `npm run lint`, `npm run build`).
- Manual, with real private config: `npm run profile:health`,
  `npm run profile:index` twice (second run all unchanged),
  `npm run profile:search` with a few Finnish and English queries.

---

**Next stage:** run `/sdlc`.
