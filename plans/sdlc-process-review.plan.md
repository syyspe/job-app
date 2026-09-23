---
brief: brief/sdlc-process-review.md
branch: sdlc-process-review
date: 2026-09-23
---

# Give each SDLC rule one home — Plan

## Context

The same process rules are written out in `README.md`, `CLAUDE.md`, the
`sdlc` skill, its four stage files, `brief/README.md`, `plans/README.md`, the
two templates, the bootstrap skill and the session-start hook messages. Every
session reads them again, and every change to the process has to be made in
all of those places. Some copies have already drifted apart: the hook's
Stage 4 message says to run `/code-review`, which `4-ship.md` and `REVIEW.md`
forbid unless the user asks, and `CLAUDE.md` and `session-economy.md` give
opposite advice on whether to read files or use a subagent. This change is
docs only (plus the hook's message strings). Each rule gets one home and
every other mention becomes a pointer to it.

## Decisions (the brief's open questions, answered 2026-09-23)

- **Session boundaries stay firm.** At each boundary: say the stage is done,
  name the next action, suggest a fresh session, stop, and don't offer to
  continue. If the user asks to keep going, keep going. No change to how the
  rule behaves; only where it's written changes.
- **Stage 4 gets a lighter path for low-risk diffs.** For a diff that is
  docs only (`*.md`, comments) or an internal refactor with no behaviour
  change, run the verification command and `/review`, and skip `verifier`
  and `/security-review`. The PR body says the light path was used and why.
  Every other diff runs the full sequence. A diff that touches a hook,
  config, a dependency or anything executable is not low-risk.
- **Prefer reading to a subagent.** `CLAUDE.md`'s version stays.
  `session-economy.md` changes to match: the `verifier` still reads the
  diff in Stage 4, and `Explore` is not used for "where does X live".

## Where each rule lives

| Rule | Its one home | Everywhere else |
|---|---|---|
| Stage table (artifact, stage file, what ends the stage, next session's model/mode) | `.claude/skills/sdlc/SKILL.md` | a pointer |
| One slug names the branch and every artifact | `SKILL.md` | a pointer |
| Plan committed before any code (the one hard rule) | `SKILL.md` "Rules that don't bend" | `CLAUDE.md` keeps one line pointing to it |
| Commit is the handoff, no approval flags | `SKILL.md` | a pointer |
| One stage per session, stop at the boundary | `SKILL.md` "Handing off" | `CLAUDE.md` keeps one line pointing to it |
| Trivial-change exception | `SKILL.md` "Rules that don't bend" | a pointer |
| How to do one stage | `stages/N-*.md` | a pointer |
| All reasoning ("why") for the process | `.claude/skills/sdlc/session-economy.md` (retitled "Why the process is shaped this way") | deleted from the instruction files |

`README.md` keeps only what a human needs to find the process, plus its
existing "What this process deliberately leaves out" and "The default
branch is PR-only" sections. No other file restates either of those.

## Affected files

- `.claude/skills/sdlc/SKILL.md` — merge the stage table and the handoff
  table into one table: Stage | Artifact | Instructions | Ends when | Next
  session (e.g. "Stage 3 — `/model sonnet`, auto mode"). Keep "Work out
  where you are" (the procedure, with the git commands) and "Rules that
  don't bend". Delete the reasoning: lines 28–31 ("Every boundary is a
  commit, which is why…"), the "Date it from the commit that added the
  plan…" explanation at lines 50–53 (keep the instruction, move the reason),
  and lines 79–81 (keep one pointer: "Why: `session-economy.md`").
- `.claude/skills/sdlc/session-economy.md` — retitle it "Why the process is
  shaped this way" and make it the only file of reasoning. Receives: why
  verification opens Stage 4 (from `SKILL.md`), why the plan's add-commit is
  the date (from `SKILL.md`), why a build session is the worst judge of its
  own build (from `3-build.md` and `README.md`), why the failing test comes
  first (from `3-build.md`), why a brief shouldn't invent requirements (from
  `1-brief.md`), why plan-before-code (from `plans/README.md`), why there
  are no approval flags (from `brief/README.md` and `README.md`), and why
  `ExitPlanMode` approval gets mistaken for a build go-ahead (from
  `2-plan.md`). Rewrite the "Prefer a subagent to reading" bullet to
  "Prefer reading to a subagent" to match `CLAUDE.md`, with the reason.
- `.claude/skills/sdlc/stages/1-brief.md` — keep: write it from the
  template, interview one question at a time, write what they said, leave a
  section thin or delete it, commit. Delete the "wearing a brief's clothes"
  reasoning. Replace the trailing handoff sentence and "Next:" line with
  "Then hand off: `SKILL.md` 'Handing off'."
- `.claude/skills/sdlc/stages/2-plan.md` — keep: call `EnterPlanMode` first
  yourself, the implementable-from-the-file bar, write it in the template's
  shape, commit, and after committing don't open a work-order file. Reduce
  "The boundary that gets crossed by accident" to the instruction ("approving
  `ExitPlanMode` approves the plan, not the build; after committing, stop"),
  and move its reasoning. Same handoff pointer replaces "Next:".
- `.claude/skills/sdlc/stages/3-build.md` — keep the three bullets as
  instructions only, and "the stage ends at the commit; no verification,
  `verifier` or `/review` here". Move the reasoning. Same handoff pointer.
- `.claude/skills/sdlc/stages/4-ship.md` — add the low-risk light path as a
  short paragraph before step 1, using the definition in Decisions above.
  Step 3 shrinks to "Run `/review`, fix what it raises. Never run
  `/code-review` unless the user asks — see `.claude/skills/review/SKILL.md`."
  (That rule already lives in `REVIEW.md` and the review skill.) Step 4
  keeps its trigger list and "say so when you skip it". Step 5 drops the
  "unplanned work should reach the user as a decision" reasoning and keeps
  the instruction.
- `CLAUDE.md` — "Working agreement": keep the plan-before-code line and the
  stage-boundary line as one short line each, pointing to the `sdlc` skill.
  Keep the skills, hooks and PR-only lines, and drop PR-only's "the point
  is…" clause. Delete "The loop" (table plus trivial-change paragraph) and
  replace it with: "Four stages, one slug per branch — run `/sdlc`;
  `.claude/skills/sdlc/SKILL.md` has the table and the rules, including the
  trivial-change exception." "Session hygiene": keep the two rules as one
  line each, and move "Let `verifier` read the diff" into the reading rule.
  Drop the paragraph pointing to the seams, or reduce it to a pointer.
- `README.md` — shrink lines 5–25 to two or three sentences: four stages,
  each ends by committing an artifact, run `/sdlc`, and the rules are in
  `.claude/skills/sdlc/SKILL.md`. Delete the stage table and the
  arrow diagram. Replace "Starting a piece of work" (lines 189–222) and
  "Stage-by-stage notes" (lines 239–262) with one short section: run
  `/sdlc`; stage instructions are in `.claude/skills/sdlc/stages/`; the
  reasoning is in `session-economy.md`; parallel streams use the `worktree`
  skill. Keep "Repository layout", "The default branch is PR-only" and
  "What this process deliberately leaves out".
- `brief/README.md` — reduce to: what the directory holds, file naming,
  copy `TEMPLATE.md`, and a pointer to `.claude/skills/sdlc/stages/1-brief.md`.
  Delete "Done when", "Next" and the no-approval reasoning.
- `plans/README.md` — same treatment: what it holds, naming, copy
  `TEMPLATE.plan.md`, pointer to `stages/2-plan.md`. Delete the numbered
  workflow, "Done when" and "Next".
- `brief/TEMPLATE.md`, `plans/TEMPLATE.plan.md` — footer becomes
  "**Next stage:** run `/sdlc`." Existing briefs and plans keep their
  footers. They are historical records.
- `.claude/hooks/session-start-check.sh` — **message strings only**. Each
  state gives: stage, next action in one or two lines, and the stage file.
  - Default branch: drop "That one slug names the branch and the plan…".
  - Stage 2: keep "call the EnterPlanMode tool now, as your first action",
    "write and commit $plan", and the pointer. Drop the "Stop there —
    approving ExitPlanMode…" sentence (now in `2-plan.md`).
  - Stage 3 (both states): keep the action and the pointer. Drop "Verification,
    verifier, /code-review and the PR are Stage 4…".
  - Stage 4: replace the step list (which wrongly names `/code-review`) with
    "read .claude/skills/sdlc/stages/4-ship.md and run its steps in order."
  - `HOWTO`: keep the "lead with stage and next action in at most two lines,
    otherwise hold as context" instruction. Shorten the tail to "Rules and
    reasoning: the sdlc skill."
  - Leave logic, the bootstrap branch and the comments alone. The code
    comment at lines 73–76 is a code comment, not process prose, so it stays.
- `.claude/skills/bootstrap/SKILL.md` Step 10 — replace the hand-copied map
  block and the "three things" paragraph with: "Show the stage table from
  `.claude/skills/sdlc/SKILL.md` and its 'Rules that don't bend', plus that
  the default branch moves only by merged PR (the setup PR was the first)."
  In the numbered list, replace item 3's interview instructions with
  "Follow `.claude/skills/sdlc/stages/1-brief.md`." Replace the "Then stop"
  paragraph's reasoning with the handoff pointer.

Not touched: `REVIEW.md`, `.claude/skills/review/`, `.claude/skills/README.md`
(it explains skills, not the loop), the `verifier` agent, other hooks, and all
existing `brief/*.md` and `plans/*.plan.md` records.

## Work order

1. `SKILL.md`: merged table, reasoning removed, pointer to `session-economy.md`.
2. `session-economy.md`: retitle, take in every moved reason (list above),
   fix the subagent bullet.
3. The four stage files, including the Stage 4 light path and trimmed step 3.
4. `CLAUDE.md`.
5. `README.md`, `brief/README.md`, `plans/README.md`, both templates.
6. `bootstrap/SKILL.md` Step 10.
7. `session-start-check.sh` message strings.
8. Duplication sweep (see Tests), then commit everything in one commit.

## Tests

- New: none. This change is docs and message strings only.
- Hook check: `bash -n .claude/hooks/session-start-check.sh`, then run it for
  each state and read the output. It must still be valid JSON and name the
  stage file:
  `CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start-check.sh | python3 -m json.tool`
  on this branch (Stage 3 dirty or clean, Stage 4 after commit). Check the
  default-branch message by reading the diff, not by switching branches.
- Duplication sweep, which must come back clean outside each rule's home:
  `grep -rnE "kebab-case slug|before any code|trivial change|/model sonnet|/code-review" README.md CLAUDE.md brief/README.md plans/README.md brief/TEMPLATE.md plans/TEMPLATE.plan.md .claude/skills/sdlc .claude/skills/bootstrap/SKILL.md .claude/hooks/session-start-check.sh`
  Each hit must be either the home named in the table above, or a pointer
  or one-line reminder that names the home.
- Verification command: `npm test` and `npm run lint` must still pass
  (expected unaffected; this confirms nothing executable broke).
- Stage 4 path: this diff touches a hook, so it runs the **full** sequence,
  not the new light path.

## Risks / rollback

The only executable change is the hook's message strings. If a message breaks
the JSON output, every session loses its orientation line silently. The hook
check above covers this. To roll back, revert the commit.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
