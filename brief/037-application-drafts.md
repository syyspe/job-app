---
slug: 037-application-drafts
date: 2026-11-18
---

# Application drafts

## Problem

A suitable ad is only useful once it has become an application I can finish.
Today I write each cover letter and tailored CV by hand. The agent should
prepare them in job-app, without inventing anything only I can answer and
without any way of sending an application.

## What done looks like

1. `POST /api/ads/:id/draft` creates the application with server-fixed status
   `draft`, stores its attachments, links the ad and moves it to `drafted`, all
   in one transaction.
2. A second call for the same ad answers 409 and creates nothing.
3. Each `suitable` ad gets a draft from a sandboxed `claude -p` step, up to a
   configured per-run cap, and ads over the cap stay queued.
4. The runner rejects output that fails the schema, or whose `[[ASK:id]]` markers
   differ from its `questions` list.
5. Motivation and unconfirmed facts appear as marked questions and are never
   invented, and `style` sources never supply a fact.
6. The application holds the fit summary, open questions and source in `notes`,
   with the saved ad, cover letter and CV attached as `.txt` files.
7. A hand-supplied ad runs end to end, from the inbox to a finished draft.
8. No code path in the agent submits an application.

## Approach

The contracts are fixed in `docs/job-search-agent.md`:

- [Draft format](../docs/job-search-agent.md#7-draft-format): model output,
  application fields and file names.
- [Inbox API](../docs/job-search-agent.md#5-inbox-api): the atomic draft route.
- [Agent permissions](../docs/job-search-agent.md#2-agent-permissions): the
  rules for the drafting step.
- [Private configuration](../docs/job-search-agent.md#3-private-configuration):
  where the headless prompts live.

The headless prompts are adapted from the `job-application-process`,
`job-application-writing` and `job-app-tracker` skills and stay in private
config. The model only returns JSON. The runner builds the files and calls the
API.

## Out of scope

- Rendering PDFs, which happens only after I finish editing.
- Sending or submitting applications.
- Collecting ads automatically.

## Related streams

- Before: `034-ad-inbox` provides the inbox, `035-profile-corpus` the search and
  `036-ad-evaluation` the sandboxed wrapper and `suitable` ads.
- After: `038-alert-sources` supplies real ads and `039-daily-run` schedules the
  step.

## Open questions

- Do the skills' rules survive adaptation to an unattended run? They assume
  other tools.
- How does a headless run get the work history the skills read from a separate
  memory store?
- What should the per-run draft cap be?
- What happens to a suitable ad whose company is still unknown? Job-app requires
  a company and a role on every application.

---

**Next stage:** run `/sdlc`.
