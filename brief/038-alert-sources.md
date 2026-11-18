---
slug: 038-alert-sources
date: 2026-11-18
---

# Alert sources

## Problem

Until now ads reach the pipeline only by hand. The agent should collect them from
the job alerts I already receive, while respecting each site's terms: no login,
limited requests, and no automatic fetching from Duunitori.

## What done looks like

1. The runner reads alert emails from a new dedicated mailbox and has no access
   to my personal mail.
2. Connectors exist for Academic Work, Kuntarekry, Valtiolle.fi and Duunitori,
   and each can be switched off without touching the others.
3. New candidates reach the inbox through `POST /api/ads`, and the mail watermark
   advances only after ingest succeeds.
4. `PoliteHttp` enforces each source's daily cap and pauses, sends no credentials
   and ends that source's day on the first `blocked`. It fetches only `https`
   URLs on the connector's `fetchHosts`, redirects included.
5. A block or rate-limit response leaves the ad `new` and counts no attempt.
6. The runner refuses to enable an automatic source with no `termsCheckedOn`.
7. Duunitori is a `handover` connector. Its titles are screened from the email,
   and the agent never fetches its pages.
8. Connector tests use synthetic alert emails only.

## Approach

The contracts are fixed in `docs/job-search-agent.md`:

- [Source connector interface](../docs/job-search-agent.md#6-source-connector-interface):
  the connector types, `PoliteHttp` and per-source config.
- [Ad inbox data](../docs/job-search-agent.md#4-ad-inbox-data): the states a
  fetch result leads to.
- [Agent permissions](../docs/job-search-agent.md#2-agent-permissions): what the
  runner may reach.
- [Private configuration](../docs/job-search-agent.md#3-private-configuration):
  where secrets, source switches and watermarks live.

Each automatic connector is enabled only after its source's terms have been
checked and the date recorded in private config.

## Out of scope

- Logging in to any job site.
- Automatic fetching from Duunitori.
- Barona and Työmarkkinatori as sources.
- The timer and the summary email.

## Related streams

- Before: `034-ad-inbox` provides ingest, and `036-ad-evaluation` the `agent/`
  skeleton and title rules.
- After: `039-daily-run` schedules collection and reports source failures.

## Open questions

- Do the Kuntarekry and Valtiolle.fi terms allow this use?
- Do Kuntarekry or Valtiolle.fi offer a feed an individual may use, or are alert
  emails the only route?
- What do the alert emails of Academic Work, Kuntarekry and Valtiolle.fi actually
  contain? Real samples are needed.
- What should each source's daily cap on opened ads be?
- Which mail client should the runner use? It needs dependency approval.
- Which provider should host the dedicated mailbox?

---

**Next stage:** run `/sdlc`.
