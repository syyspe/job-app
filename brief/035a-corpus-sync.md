---
slug: 035a-corpus-sync
date: 2026-11-19
---

# Corpus sync

## Problem

The profile index only changes when I run `npm run profile:index` on the
laptop. I will probably forget to, and adding an edited application's files to
the corpus means copying them by hand first. I often use job-app from my phone,
so a CLI-only path makes me go to the laptop for something the app could
start.

## What done looks like

1. An application has an "Add to profile" action in the UI, usable from a
   phone, where I pick which of its attachments to mark. job-app stores a flag
   per attachment.
2. A marked attachment shows as pending sync until a sync clears it. Nothing
   is shown once it has synced.
3. I can remove a mark before the sync.
4. A runner-side `profile:sync` command copies the marked attachments into a
   `style` corpus folder, runs the incremental index build and clears the
   flags.
5. Marking an attachment again after editing it replaces the earlier copy in
   the corpus, so the next build re-embeds it.
6. Any file type can be marked. The build indexes what it reads today (`.txt`
   and `.md`) and lists the rest as skipped in the sync summary.
7. `039-daily-run` can run the sync as one step of the daily run.

## Approach

The contract is in `docs/job-search-agent.md`:

- [Streams](../docs/job-search-agent.md#streams): what this stream adds.
- [Agent permissions](../docs/job-search-agent.md#2-agent-permissions): the
  runner holds the job-app credentials, the profile search tool does not.
- [Private configuration](../docs/job-search-agent.md#3-private-configuration):
  corpus entries and which file types the walk reads.
- [Profile corpus and embeddings](../docs/job-search-agent.md#8-profile-corpus-and-embeddings):
  the incremental build the sync reuses.

Marking is per attachment, chosen in the UI, rather than a flag on the whole
application. Attachments carry no type, so guessing the CV and cover letter
from file names would be unreliable.

The UI doesn't limit which file formats can be marked. The build already skips
and lists unsupported types, so the format rule stays in one place and
`040-markdown-attachments` changes it there.

## Out of scope

- Removing a file from the profile after it has synced. I delete it from the
  corpus folder myself.
- Extracting text from PDF or docx.
- Scheduling the sync, which `039-daily-run` does.
- Marking `facts` sources. Synced files are always `style`.
- Changing attachment formats, which `040-markdown-attachments` does.

## Related streams

- Before: `035-profile-corpus` provides the index build this reuses.
- After: `039-daily-run` runs the sync each day. `040-markdown-attachments`
  moves the agent's text attachments and the corpus walk to `.md`.
- Alongside: `036-ad-evaluation` and `037-application-drafts` search the index
  this keeps current.

## Open questions

- `profile:sync` needs job-app credentials, but `agent/profile/` must have
  none. Where does the command live: in the runner tree `036-ad-evaluation`
  starts, or as an earlier piece of it?
- Is the sync's corpus folder a new config key, or an existing `style` entry
  in `corpus`?
- How is a copy named so that re-marking replaces it: by attachment id or by
  file name?
- How does the sync report that the Ollama laptop is unreachable, and does it
  keep the flags for the next run when it is?

---

**Next stage:** run `/sdlc`.
