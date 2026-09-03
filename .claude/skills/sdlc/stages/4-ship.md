# Stage 4 — Ship

A fresh session, opening on a clean tree with the build committed. Run these
in order, as one continuous sequence — don't stop between them to ask how to
proceed.

1. **Verify.** Run the verification command from `CLAUDE.md` and report its
   real output, not a paraphrase. If it says "3 failed," say that.
2. **`verifier`.** The subagent re-checks the diff against
   `plans/<slug>.plan.md` with fresh context and reports PASS / FAIL / PASS
   WITH CONCERNS. It also covers scope-against-the-plan: anything changed that
   wasn't planned, anything planned that wasn't done.
3. **`/code-review`.** Fix what it raises. What it actually does, so you don't
   expect passes it doesn't run:
   - **Scope is the diff**, not the codebase — `git diff @{upstream}...HEAD`
     plus any uncommitted changes. It opens surrounding files for context but
     anchors findings to changed lines. To review code the branch didn't
     touch, pass a path: `/code-review high src/`.
   - **It does not read `REVIEW.md`.** Its passes are fixed: correctness bugs,
     cleanup (reuse, simplification, efficiency), and one conventions angle
     that checks the diff against `CLAUDE.md`. `REVIEW.md`'s severity policy
     and excluded paths do not bind it.
   - **Security is not among those passes.** See step 4.
4. **`/security-review`** when the diff touches a real boundary — user input,
   auth, secrets, deserialization, file or network I/O, a new dependency.
   Say out loud when you're skipping it and why; a docs-only or
   internal-refactor diff doesn't need it.
5. **Ship.** `git push -u origin <slug> && gh pr create`. The default branch is
   PR-only and `default-branch-guard.sh` blocks a direct push, so there is no
   shortcut here even for a one-line change.

   In the PR body, name anything in the diff that neither `brief/<slug>.md`
   nor the plan asked for. Nothing automated checks the diff against the
   brief — `verifier` compares it to the plan, and `/code-review` to
   `CLAUDE.md`. Unplanned work isn't automatically wrong, but it should reach
   the user as a decision, not as a surprise found while reading.

The user reviews and merges.

## When a step fails

If step 1 or 2 fails, fixing it is this session's job. A one-line fix happens
here; anything substantial means a real return to Stage 3 — say so, and start
a fresh Build session rather than quietly turning the Ship session into one.
