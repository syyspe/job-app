# Stage 4 — Ship

A fresh session, opening on a clean tree with the build committed. Run these
in order, as one continuous sequence — don't stop between them to ask how to
proceed.

**Light path, for low-risk diffs only.** If the diff is docs only (`*.md`,
comments) or an internal refactor with no behaviour change, run steps 1, 3
and 5 and skip `verifier` and `/security-review`. Say in the PR body that the
light path was used and why. A diff that touches a hook, config, a
dependency or anything executable is not low-risk: it runs every step.

1. **Verify.** Run the verification command from `CLAUDE.md` and report its
   real output, not a paraphrase. If it says "3 failed," say that.
2. **`verifier`.** The subagent re-checks the diff against
   `plans/<slug>.plan.md` with fresh context and reports PASS / FAIL / PASS
   WITH CONCERNS. It also covers scope-against-the-plan: anything changed that
   wasn't planned, anything planned that wasn't done.
3. **`/review`.** Run it and fix what it raises. Never run `/code-review`
   unless the user asks — see `.claude/skills/review/SKILL.md`.
4. **`/security-review`** when the diff touches a real boundary — user input,
   auth, secrets, deserialization, file or network I/O, a new dependency. Say
   so when you skip it, and why.
5. **Ship.** `git push -u origin <slug> && gh pr create`. The default branch is
   PR-only and `default-branch-guard.sh` blocks a direct push, even for a
   one-line change.

   In the PR body, name anything in the diff that neither `brief/<slug>.md`
   nor the plan asked for.

The user reviews and merges.

## When a step fails

If step 1 or 2 fails, fixing it is this session's job. A one-line fix happens
here; anything substantial means a real return to Stage 3 — say so, and start
a fresh Build session rather than quietly turning the Ship session into one.
