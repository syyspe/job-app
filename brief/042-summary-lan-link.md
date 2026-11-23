---
slug: 042-summary-lan-link
date: 2026-11-23
---

# LAN link in the daily summary

## Problem

The daily summary email ends with a single `Open job-app: <url>` line
(`agent/runner/lib/summary.ts`). The URL comes from `JOBAPP_API_URL`, which
is localhost. That's the right link on the laptop, but the user often reads
these emails on their phone, where localhost doesn't reach job-app. They
need a link to the machine's LAN address (`https://192.168.100.9:3001`) as
well.

## What done looks like

1. The daily-run config accepts an optional string `summary.lanUrl`, next to
   `summary.recipient` and `summary.alwaysSend`, in the private
   `~/.config/job-agent/config.json`.
2. `summary.lanUrl` set → the summary body keeps the existing
   `Open job-app: <JOBAPP_API_URL>` line and adds, directly under it:
   `Open job-app (LAN): <summary.lanUrl>`.
3. `summary.lanUrl` missing → the email is unchanged.
4. The LAN address lives only in the private config, never in the repo.
5. README's "Daily run" section documents the key.

## Approach

Add the optional key to the `summary` object in
`agent/runner/lib/runnerConfig.ts`. Pass it through `commands/run.ts` and
`dailyRun.ts` alongside `appUrl`, and have `bodyOf` in `summary.ts` add the
extra line when it's set.

Rejected: hardcoding the LAN address, because it's private and
machine-specific. Also rejected: a list of extra links, because one is all
that's needed.

## Out of scope

- Changing the existing localhost link or where it comes from.
- Making job-app reachable from the LAN (firewall, TLS certificate); that's
  already the case or is a separate concern.

## Open questions

- How strictly to validate `summary.lanUrl`: zod's URL check, or just a
  non-empty string. The plan decides.

---

**Next stage:** run `/sdlc`.
