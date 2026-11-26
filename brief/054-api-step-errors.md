---
slug: 054-api-step-errors
date: 2026-11-26
---

# API step errors: the maxItems 400 and saying why a step failed

## Problem

Under `engine: "api"`, every evaluation fails. A daily run started from the
UI sent a summary that read only `Failed (1) - Systems Engineer S/C
Technology, duunitori: cli_failed`. Sending the same request directly showed
the API answering **400**: `output_config.format.schema: For 'array' type,
property 'maxItems' is not supported` (request
`req_011ChSAUsJdb33o6K48263ke`). The `maxItems` comes from
`reasons: z.array(z.string()).max(10)` in `EVALUATION_SCHEMA`. The CLI engine
accepted it, but the API doesn't. `DRAFT_SCHEMA` has the same problem and
will fail as soon as an ad is evaluated as suitable. `PRESCREEN_SCHEMA` is
accepted, and so are string `minLength`/`maxLength`.

It took a hand-written probe to find this, because the API step reports every
non-auth API error as `cli_failed` and drops the status and message. Under the
API engine that category also names a CLI that isn't involved.

## What done looks like

1. Evaluation and drafting requests under `engine: "api"` are accepted by the
   API. The schemas sent to the model carry no `maxItems`.
2. The limits still hold: the runner's own zod check of the output still
   enforces them. Output over a limit is `bad_output`, as now.
3. A test fails if any step schema (pre-screen, evaluation, drafting) sends
   `maxItems`.
4. The `cli_failed` category is renamed `model_failed`, for both engines.
   Values already in the state files keep working.
5. When an API step fails, the run output gets one line per failure naming the
   ad, the HTTP status and the API's message.
6. The summary email's Failed list shows that detail beside the ad, not just
   the category.

## Approach

Remove `maxItems` where the step schema is built (`stepSchema` in
`agent/runner/lib/sandbox.ts`), so every step and both engines get it, and
keep the `.max()` in the zod schemas for the runner's own check. Rejected:
dropping `.max(10)` from the zod schemas, which loses the check.

The failure detail travels with the failed result from the API step up to the
run output and the summary. Exactly how is the plan's to decide.

## Out of scope

- Requeueing the ads that already failed this way. The user requeues them by
  hand after the merge.
- Richer failure detail for the CLI engine beyond what it gives today.

## Open questions

- Is the detail kept with the ad's state, so a later run's summary can show
  it, or only within the run that failed?
- The CLI engine's failures: does `model_failed` carry any detail there
  (for example the exit code), or none?

---

**Next stage:** run `/sdlc`.
