---
slug: 033-job-search-agent
date: 2026-11-18
---

# Daily job search agent

## Problem

Finding suitable job ads and starting an application is repeated manual work:
read the alerts, open the ads, compare them with my profile, then draft a
cover letter and CV. I want an agent to do that once a day and leave draft
applications in job-app for me to go through.

The feature is too large for one stream. This stream decides how it is split
and what the pieces agree on. The pieces then run through the loop one at a
time.

## What done looks like

This stream (033) is done when:

1. The cross-stream contracts below are decided and recorded: the ad inbox's
   data and states, the source connector interface, the agent's permissions,
   and the draft format.
2. One brief per implementation stream is committed in `brief/`, in build
   order, each small enough for its own plan, build and PR.
3. No application code changes in this stream.

The finished feature, across all streams, is done when:

1. Once a day, without me starting it, the agent collects new ads from the
   supported sources.
2. It rejects obvious mismatches by title and evaluates the remaining ads
   against my profile, using subagents when there are many.
3. For each suitable ad it creates a job-app application with status `draft`,
   holding a fit summary, the saved ad, a cover letter `.txt` and a tailored
   CV `.txt`.
4. Anything only I can answer, such as motivation or an unconfirmed fact, is a
   clearly marked question in the draft and is never invented.
5. An ad that already has an application or was already processed produces no
   second draft.
6. I receive one summary email when a run has something to report: new drafts,
   rejected titles and failed sources.
7. A day missed because the PC was off is caught up on the next run.
8. The agent never sends an application.

## Approach

### Sources

| Source | How ads arrive |
|---|---|
| Academic Work | Alert email, then the public ad page, without logging in |
| Kuntarekry | Alert or feed, then the public ad page, without logging in |
| Valtiolle.fi | Alert or feed, then the public ad page, without logging in |
| Duunitori | Duunivahti email titles are screened; I open promising ads and hand them over |

Rules for every automatic source: a daily cap on opened ads, pauses between
requests, no login, and stop for the day on a block or rate-limit response.
Each source is a separate connector feeding the same ad inbox, so one can be
added or switched off without touching the rest.

**Duunitori is never fetched by the agent.** Its
[terms](https://duunitori.fi/compliance/kayttoehdot) (updated 2026-11-13)
prohibit scraping, storing or otherwise systematically copying the service's
content. Rejected alternatives: a logged-in fetch of the personal
recommendations page, which also stores my credentials in an unattended job
and puts the account at risk; and opening every emailed link automatically,
which is still systematic copying.

Barona is left out for now because I found no published terms for it.
Työmarkkinatori's API is left out because access is for organisations and tied
to a business ID.

### Runtime

Claude Code runs unattended from a daily timer in WSL. It can reach the local
job-app API, use subagents and reuse the existing skills. Rejected: a cloud
routine, which would need the API exposed to the internet, and a custom Agent
SDK service, which adds API billing and more code to maintain.

### Mail

A new dedicated mailbox receives the job alerts and sends the summary to my
normal address. The agent never has access to my personal mail.

### Profile corpus

Local semantic search over my CVs, cover letters and other application
materials, so the material is not sent to an embedding provider. CV templates
are the source of facts. Earlier letters are style examples only, because they
may contain errors.

### Drafts

Drafts follow the existing `job-application-process`,
`job-application-writing` and `job-app-tracker` skills. PDFs are rendered only
after I have finished editing, so they don't go stale.

### Safety

Emails and ad pages are untrusted input and may contain instructions aimed at
the agent. Steps that read them get no access to mail sending, credentials or
job-app writes. The summary recipient is fixed in configuration. Secrets stay
outside the repo. Ad text is kept only for ads that become drafts.

### Proposed streams

Built in this order, so the pipeline can be tried end to end on hand-supplied
ads before any automatic collection exists:

1. `ad-inbox`: job-app stores incoming ads and their states, with API, MCP
   tools, a review view and the hand-over action.
2. `profile-corpus`: the local semantic index and its search tool.
3. `ad-evaluation`: title screening, full evaluation and subagent fan-out.
4. `application-drafts`: creates the job-app draft and its files.
5. `alert-sources`: the mailbox reader and the source connectors.
6. `daily-run`: the timer, catch-up, run limits and the summary email.

The streams run one after another. `profile-corpus` touches little else, so it
is the one candidate for a parallel worktree alongside `ad-inbox`.

## Out of scope

- Sending or submitting applications.
- Logging in to any job site.
- Automatic fetching from Duunitori.
- Barona and Työmarkkinatori as sources.
- Rendering PDFs during the daily run.

## Open questions

- Do the Kuntarekry and Valtiolle.fi terms allow this use? I could not find
  them. Each connector must check before it is enabled.
- Do Kuntarekry or Valtiolle.fi offer a feed an individual may use, or are
  alert emails the only route?
- What do the alert emails of Academic Work, Kuntarekry and Valtiolle.fi
  actually contain? Real samples are needed.
- What are the title rejection rules? Trainee, part-time and excluded
  technologies are clear, but a "junior" title is not always a mismatch.
- What counts as suitable after full evaluation, and what are the daily caps
  on opened ads and created drafts?
- Which embedding model and vector store handle Finnish and English well
  locally? They need dependency approval, as will the mail client.
- Do the existing skills work in an unattended Claude Code run? They assume
  other tools and a separate memory store for work history.
- Does the WSL timer run reliably when Windows starts, and does an unattended
  run fit within Claude usage limits?

---

**Next stage:** run `/sdlc`.
