---
brief: brief/stage-check-committed.md
branch: stage-check-committed
date: 2026-09-23
---

# Stage check reads committed artifacts, not files on disk — Plan

## Affected files

- `.claude/hooks/session-start-check.sh` — count the brief and plan as done
  only when they are in `HEAD`. Report a file that is on disk but not
  committed as its own state inside the stage that produces it.
- `.claude/hooks/session-start-check.test.sh` (new) — regression tests,
  written the same way as `default-branch-guard.test.sh`.
- `.claude/skills/sdlc/SKILL.md` — make the "Work out where you are" rules
  use the same test as the hook. Also fix the frontmatter `description`,
  which says "derived from the artifacts on disk" (the user agreed to this
  small scope extension).

## Work order

1. **Hook: add a `committed` helper.** Put it next to `checklist_line`:

   ```bash
   committed() {
     git cat-file -e "HEAD:$1" 2>/dev/null
   }
   ```

   `checklist_line` calls `committed "$1"` instead of `[ -f "$1" ]`, so
   `[x]` now means "in HEAD".

2. **Hook: change the stage chain.** The `if/elif` from line 95 on becomes:
   - `! committed "$brief"` and `[ -f "$brief" ]` →
     stage `Stage 1 (Brief) — brief written, not committed.`,
     next `commit $brief. That commit ends the stage.`
   - `! committed "$brief"` (not on disk either) → the current "not started"
     text, unchanged.
   - `! committed "$plan"` and `[ -f "$plan" ]` →
     stage `Stage 2 (Plan) — plan written, not committed.`,
     next `commit $plan BEFORE any code. That commit ends the stage. Full
     instructions: .claude/skills/sdlc/stages/2-plan.md`
   - `! committed "$plan"` → the current "brief committed, no plan yet"
     text, unchanged.
   - The dirty-tree, no-code and Stage 4 branches stay as they are.

   Keep one flat `if/elif` chain in the current style, with no nesting.
   These things stay as they are: the "not a skeleton layout" silence guard
   (line 66, which only looks for layout on disk), and the code-landed probe
   (line 75, which already reads `git log`, and which the brief puts out of
   scope). Update the header comment (lines 7–9) to say "which of brief/plan
   are committed in HEAD".

3. **New `.claude/hooks/session-start-check.test.sh`.** Use the same
   structure as `default-branch-guard.test.sh`: `set -uo pipefail`, a throwaway
   `mktemp -d` repo on `master` with an `EXIT` trap, `pass`/`fail` counters, a
   `check <expected-substring>` helper, and the summary line with the exit
   code at the end. Set up the repo with `.claude/.bootstrapped` committed
   and a `brief/` dir, then check out branch `demo`. Each check runs the hook
   with `CLAUDE_PROJECT_DIR=$repo` and decodes the output with
   `python3 -c '...json.load(sys.stdin)["hookSpecificOutput"]["additionalContext"]'`.
   It has to decode because `json.dumps` escapes the em dash, so a raw grep
   would miss. Each check then does a `grep -F` for the expected text. The
   states are walked in order through one repo:
   1. No brief → `Stage 1 (Brief) — not started.`
   2. Brief on disk, not committed → `Stage 1 (Brief) — brief written, not
      committed.` and `[ ] brief/demo.md`
   3. Brief committed → `Stage 2 (Plan) — brief committed, no plan yet.` and
      `[x] brief/demo.md`
   4. Plan on disk, not committed (tree dirty) → `Stage 2 (Plan) — plan
      written, not committed.` This is the case that used to say Stage 3.
   5. Plan committed, clean → `Stage 3 (Build) — plan committed, no code yet.`
   6. Plan committed, untracked code file → `Stage 3 (Build) — plan
      committed, work in progress.`
   7. Code committed → `Stage 4 (Ship)`
   8. On `master` → `on the default branch`

   Commits inside the test use `-c user.email=t@example.com -c user.name=t`,
   as the existing test does.

4. **`SKILL.md`, "Work out where you are".** Change step 2 to: the branch
   name is the slug; an artifact counts only once it is committed, meaning
   `git cat-file -e HEAD:<path>` succeeds for `brief/<slug>.md` and
   `plans/<slug>.plan.md`. An artifact that isn't in `HEAD` puts you in the
   stage that produces it. If the file is already on disk, that stage's next
   action is to commit it. Steps 3–4: change "Both present" to "Both
   committed". In the frontmatter `description`, change "derived from the
   artifacts on disk" to "derived from the artifacts committed on the
   branch".

5. Commit the three files together, using the noreply author and committer
   from the global CLAUDE.md.

## Tests

- New: `.claude/hooks/session-start-check.test.sh`, covering the 8 states
  above.
- Updated: none.
- Verification commands:
  - `bash .claude/hooks/session-start-check.test.sh` → `8 passed, 0 failed`
    (or however many checks there are, with 0 failed)
  - `bash .claude/hooks/default-branch-guard.test.sh` → 0 failed (it should
    be unaffected)
  - `CLAUDE_PROJECT_DIR=$PWD bash .claude/hooks/session-start-check.sh` on
    this branch → plan committed, reports Stage 3/4 as expected
  - `npm test`, the repo's PR gate, which should be unaffected but still
    has to pass.

---

**Next stage:** run `/sdlc`.
