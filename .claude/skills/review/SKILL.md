---
name: review
description: Use when the user wants a local code review of the current diff, or explicitly runs `/review` — the Stage 4 default. Runs REVIEW.md's four passes (Bugs, Security, Scope, Simplicity) as a single inline pass, no subagent fan-out, mirroring what `.github/workflows/claude-review.yml` sends to CI. Cheap alternative to the built-in `/code-review`, which ignores REVIEW.md and fans out into several parallel subagents. Reach for `/code-review` instead only when you deliberately want its deeper, differently-scoped pass.
---

# Local review against REVIEW.md

## Why this exists

The built-in `/code-review` does not read `REVIEW.md` — its passes are fixed
(correctness bugs, cleanup, one `CLAUDE.md`-conventions angle), and at
anything above `low`/`medium` effort it fans out into several parallel
subagents, which gets expensive fast (each subagent re-reads the diff and
surrounding context from scratch). `.github/workflows/claude-review.yml`
reviews every PR against `REVIEW.md` as a single Claude Code Action call, no
fan-out. This skill runs that same single-pass review locally, so Stage 4
doesn't have to either pay for the built-in's fan-out or wait for CI to find
out what it'll say.

Do the review yourself, directly in this session. Do not spawn a Task/Agent
subagent for it — a second context re-reading the same diff is exactly the
cost this skill exists to avoid.

## Scope

- No argument: `git diff` against the merge-base of the current branch and
  the default branch, plus any uncommitted changes.
- A PR number: `gh pr diff <number>`.
- A branch name or path: diff against that instead.

Read a changed file's full content only where you need surrounding context to
judge a specific finding — don't read the whole tree, and don't go digging
through git blame or past PRs for corroboration.

## Steps

1. Read `REVIEW.md` at the repo root for the passes, severity rule, nit cap,
   and excluded paths — it's the authority here, not this file.
2. If `plans/<slug>.plan.md` or `brief/<slug>.md` exists for the current
   branch, read it — the Scope pass checks the diff against both.
3. Run the four passes from `REVIEW.md`, in the order it gives, against the
   diff from Scope above.
4. Report findings using `REVIEW.md`'s Important/Nit split and its nit cap.
   Cite the file and line for each finding. No score-and-filter step, no
   confidence rubric — one read is the review.
5. Skip any path `REVIEW.md` excludes, or review it at the reduced strictness
   it specifies.

## Output

Print the review directly in the session — this is a local pass, not a PR
comment. Group findings by pass (Bugs, Security, Scope, Simplicity); if a
pass found nothing, say so in one line rather than omitting it silently.

## Not in scope for this skill

- Posting to a PR (`gh pr comment`) — CI's review already does that, and the
  `@claude` response loop in `REVIEW.md` handles follow-ups.
- Historical git-blame digging, cross-PR comment lookups, or a confidence
  scoring pass — that kind of digging is what makes the built-in expensive.
  If a finding genuinely needs it to confirm, say so and let the user decide
  whether it's worth a `/code-review` pass instead.
