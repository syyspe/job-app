---
brief: brief/039-daily-run.md
branch: 039-daily-run
date: 2026-11-20
---

# Daily run — Plan

The pipeline steps exist (`agent:collect`, `agent:evaluate`, `agent:draft`,
`profile:sync`). This stream adds one entry point, `npm run agent:run`, that
Windows Task Scheduler starts each evening at 20:00 through a wrapper script.
It runs every step in order under a lock, dismisses expired hand-overs, emails
one summary when there is something to report, and closes the corpus-sync
mark race. Decided with the user: the SMTP client is hand-written over
`node:tls` (no new dependency); the wrapper starts job-app (`npm start`) when
the API isn't answering; the documented run time is 20:00.

## Affected files

- `server/routes/attachments.ts` — `PUT /api/attachments/:id/profile-sync`
  takes an optional `storedName`. With `pending: false` and a `storedName`
  that no longer matches the row, it answers 409 `attachment changed since it
  was listed` and keeps the mark. Without `storedName` it stays unconditional
  (the UI's call is unchanged). A non-string `storedName` → 400.
- `server/routes/attachments.test.ts` — the three cases above.
- `agent/runner/lib/jobApp.ts` — `pendingSchema` gains `storedName`.
  `setProfileSync` is replaced by `clearProfileSync(id, storedName):
  Promise<boolean>` (false on 409). `JobAppRequest` gains `allow?: number[]`,
  statuses the sender returns instead of throwing — used only here.
  `adSummarySchema` gains `firstSeenAt`, `reportedAt`, `lastError`,
  `applicationId`. New `markReported(ids)` → `POST /api/ads/reported`.
- `agent/runner/lib/sync.ts` — clears each mark through `clearProfileSync`
  with the `storedName` it listed; `SyncResult` gains `changed: string[]`
  (copies whose mark was kept because the file was replaced mid-run).
- `agent/runner/commands/sync.ts` — prints `kept marked (changed during
  sync): <name>` lines.
- `agent/runner/lib/env.ts` — `loadSmtpEnv(path)` → `{host, username,
  password}` from `MAIL_SMTP_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`.
- `agent/runner/lib/runnerConfig.ts` — `loadDailyRunConfig(path)`:
  `handoverWaitDays` (int ≥ 1, default 7) and `summary.recipient` (required,
  `z.email()`).
- `agent/runner/lib/state.ts` — `removeFailures(reported: SourceFailure[])`
  rewrites `source-failures.json` without exactly those entries.
- `agent/runner/lib/lock.ts` (new) — `acquireRunLock(stateDir)` →
  `release()`. Creates `run.lock` with `openSync(..., 'wx')` holding the pid.
  On `EEXIST`: a live pid (`process.kill(pid, 0)` succeeds) → `CliError(1,
  'another run is in progress (pid N)')`; a dead or unreadable one is stale,
  removed and retried once.
- `agent/runner/lib/handoverExpiry.ts` (new) — pure `handoverExpired(ad,
  {waitDays, now})`: true once `now` ≥ `firstSeenAt` (UTC, SQLite format) +
  `waitDays` days, or once the local date is past an ISO `YYYY-MM-DD`
  deadline; a non-ISO deadline is ignored. `dismissExpiredHandovers(jobApp,
  options)` lists `awaiting_handover`, transitions the expired ones to
  `dismissed`, returns the count.
- `agent/runner/lib/smtp.ts` (new) — `sendMail(message, config, connect =
  tls.connect)`: implicit TLS on 465, `EHLO`, `AUTH PLAIN`, `MAIL FROM`,
  `RCPT TO`, `DATA`, `QUIT`, reading multi-line replies and checking each
  code. ASCII headers (`From`, `To`, `Subject`, `Date`, `MIME-Version`,
  `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding:
  base64`) and a base64 body in 76-char CRLF lines, so ad text can't break
  the protocol and needs no dot-stuffing. Accepted = 250 after the final `.`.
  30 s timeout for the whole exchange.
- `agent/runner/lib/summary.ts` (new) — pure `composeSummary({ads,
  sourceFailures, problems, appUrl})` → `{subject, text} | null`. `ads` are
  the unreported `drafted`, `title_rejected` and `failed` ads. Null when all
  four lists are empty. Subject from counts only (`job agent: 2 drafts, 1
  title rejected, 0 failed, 1 problem`). Body: one section per non-empty list
  — drafts (title, company, application id), title rejections (title,
  company, source, url, so one can be handed over), failed (title, source,
  `lastError`), source failures (`source date kind`), problems (step and
  message) — and the job-app link. Ad fields have control characters and
  line breaks replaced by spaces.
- `agent/runner/lib/dailyRun.ts` (new) — `runDaily(options)` with every
  dependency injected (jobApp, mailbox opener, state, connectors/config,
  checkHealth, gate, sync, evaluate/draft steps, send, now). Order:
  1. collect (`runCollect`, mailbox closed in `finally`);
  2. dismiss expired hand-overs;
  3. model steps — one `checkOllama`, then `ensureSandboxVerified` (below),
     which re-runs the sandbox check by itself when `claude` has updated. If
     either fails, record a problem and skip 4–6, touching no ad. A
     re-verification that passes is printed (`sandbox re-verified for claude
     X`) but is not a problem, so on its own it sends no email;
  4. `syncProfile`, only when `syncFolder` is set;
  5. `runEvaluation`, 6. `runDrafting`, both given the cached health result;
  7. report — list the three states, keep `reportedAt === null`, read source
     failures, compose; if non-null, send, then `markReported(ids)` and
     `removeFailures(included)`. A failed send marks nothing and clears
     nothing.
  Each of steps 1, 2, 4, 5, 6 runs in a guard that catches `CliError` only,
  records `{step, message}` as a problem and continues; any other error
  propagates. Returns a `DailyReport` (each step's counts, problems, `sent:
  boolean`).
- `agent/runner/lib/sandboxCheck.ts` — the check that
  `commands/sandboxCheck.ts` does inline moves here as `verifySandbox({claudeBin,
  stateDir, runProbes, now})` → `{version, probes, passed}`. It writes the
  record only when every probe passes. New `ensureSandboxVerified(options)`
  → `{version, reverified: boolean}`: when the record matches
  `installedVersion` it runs nothing. Otherwise it calls `verifySandbox`
  (two real `claude -p` probes, only on the first run after an update) and
  throws `CliError(1, 'sandbox check failed for claude X: <failed
  properties>')` if it doesn't pass, leaving nothing recorded so the next run
  tries again. `requirePassedCheck` stays as it is for `agent:evaluate` and
  `agent:draft`, which still refuse rather than probe.
- `agent/runner/commands/sandboxCheck.ts` — calls `verifySandbox`; output
  and exit codes unchanged.
- `agent/runner/commands/run.ts` (new) — `npm run agent:run`. Loads every
  config and env (exit 2 on any error, before the lock), takes the lock,
  calls `runDaily` with the real dependencies, releases the lock in
  `finally`, prints one line per step (reusing the existing commands' line
  formats) plus `summary: sent | nothing to report`. Exit 1 if any step
  failed or the send failed; Ollama or gate skips alone exit 0, since the
  email carries them.
- `agent/runner/daily-run.sh` (new, executable) — what the scheduled task
  runs. `cd` to the repo, append all output to
  `$XDG_STATE_HOME/job-agent/logs/run-YYYY-MM-DD.log`. Read
  `JOBAPP_API_URL` from the env file with `sed`. If `curl -sk -o /dev/null
  --max-time 3 "$url/api/login"` fails, start `setsid nohup npm start` with
  output to `logs/server.log` and poll every 2 s for up to 120 s. Then
  `npm run --silent agent:run` and exit with its status.
- `package.json` — `"agent:run": "node agent/runner/commands/run.ts"`.
- `agent/test/fakeJobAppAds.ts`, `agent/test/fakeJobApp.ts` — `reportedAt`
  and `POST /api/ads/reported`, `storedName` on pending attachments, and the
  conditional 409.
- `agent/test/fakeSmtp.ts` (new) — a `net` server scripted per test: records
  commands and the decoded message, and can refuse a chosen command or drop
  the connection.
- `docs/job-search-agent.md` — Streams row `039` → `in progress` in this plan
  commit and `done` in the PR. Section 2's gate paragraph adds that
  `agent:run` re-runs the check itself after a CLI update, while
  `agent:evaluate` and `agent:draft` still refuse. Section 3 gains `MAIL_SMTP_HOST`,
  `handoverWaitDays`, `summary.recipient`, `run.lock` and `logs/`. Section 8
  covers the conditional clear. Section 9 covers the entry point, step order,
  skip and problem rules, and the wrapper.
- `README.md` — new "Daily run" section: env and config keys; the Task
  Scheduler setup (daily at 20:00, "Run task as soon as possible after a
  scheduled start is missed", "Do not start a new instance", action
  `wsl.exe -d <distro> --exec bash -lic <repo>/agent/runner/daily-run.sh`,
  where `-i` loads `~/.bashrc` for node and `NODE_EXTRA_CA_CERTS`); and where
  the logs are.
- `CLAUDE.md` — the `agent:run` line under Commands.
- `docs/architecture.md` — the new runner files.

## Work order

1. Server: the conditional profile-sync clear and its tests.
2. Client and sync: `storedName`, `clearProfileSync`, `allow`, `changed` in
   `syncProfile` and the sync command, plus fakes and tests.
3. Config and env: `loadDailyRunConfig`, `loadSmtpEnv`, with tests.
4. State: `lock.ts` and `removeFailures`, with tests.
5. `handoverExpiry.ts` and tests (UTC first-seen, deadline day boundary).
6. `smtp.ts`, `fakeSmtp.ts` and tests.
7. `summary.ts` and tests.
8. `verifySandbox` and `ensureSandboxVerified` in `sandboxCheck.ts`, with
   tests (probes injected), and `commands/sandboxCheck.ts` switched to it.
9. `dailyRun.ts` and tests; `commands/run.ts`; the `package.json` script.
10. `daily-run.sh`.
11. Docs: README, `docs/job-search-agent.md`, `CLAUDE.md`,
    `docs/architecture.md`.

## Tests

- New: `lock.test.ts`, `handoverExpiry.test.ts`, `smtp.test.ts`,
  `summary.test.ts`, `dailyRun.test.ts`, `commands/run.test.ts` (via
  `runCommandFixture`).
- Updated: `attachments.test.ts`, `sync.test.ts`, `commands/sync.test.ts`,
  `jobApp.test.ts`, `sandboxCheck.test.ts`, `env.test.ts`, `runnerConfig.test.ts`, `state.test.ts`.
- `dailyRun` behaviour: steps run in order; nothing to report sends no mail;
  per-run caps leave the rest queued (the existing runs, wired); a hand-over
  past its wait or its deadline day is dismissed, one inside both is not.
- Failure cases:
  - Lock held by a live pid → exit 1 `another run is in progress (pid N)`,
    no step runs. Stale lock → taken over. Lock released after an
    unexpected error.
  - Config or env missing or invalid (`summary.recipient`,
    `MAIL_SMTP_HOST`, …) → one stderr line, exit 2, no lock taken.
  - Ollama unreachable → collect, screening and expiry still run; sync,
    evaluation and drafting are skipped with no ad moved; the summary lists
    `Ollama health check failed: unreachable`.
  - `claude` updated since the last check → the probes run once and the
    record is rewritten, then evaluation and drafting run as usual. Probes
    failing → the same skip, nothing recorded, and the problem names the
    failed properties. `claude` missing → the same skip, with the
    `not found on PATH` message. Ollama down → no probe runs.
  - Mailbox unreachable, or job-app failing during one step → problem
    recorded, later steps run, exit 1.
  - SMTP: connection refused, TLS or timeout → `cannot reach mail server at
    <host>`; 535 → `mail login failed: check MAIL_USERNAME and
    MAIL_PASSWORD in <env>`; any other unexpected code → `mail server
    refused <COMMAND> (<code>)`. In every case nothing is marked reported,
    source failures are kept, exit 1, and the next run resends.
  - `markReported` failing after the mail was accepted → exit 1; the next
    run sends those items again (see Risks).
  - Profile-sync clear with a stale `storedName` → 409, the mark kept, the
    copy listed under `changed`, and the next run syncs the new bytes.
  - A non-`CliError` thrown inside a step propagates with its stack.
- Verification command: `npm test -- --maxWorkers=2`, `npm run lint`,
  `npm run build`.

## Risks / rollback

- A crash between the accepted send and `markReported` repeats those items
  in the next summary. That is the deliberate side of rule 8: a duplicate is
  better than a lost report.
- WSL may stop the distro after the task's `wsl.exe` exits, taking the
  server `daily-run.sh` started with it. The run itself has finished by
  then, so the next run just starts the server again.
- Automatic re-verification trusts the probes as they are, against
  whatever the new CLI does. If an update changes behaviour the probes
  don't look at, the run carries on regardless. That was also true of a
  manual `agent:sandbox-check`; the difference is that no one reads the
  output now. Every re-verification is logged and printed, so it shows up
  in the run log.
- No schema migration; rollback is reverting the PR and deleting the
  scheduled task.

---

**Next stage:** run `/sdlc`.
