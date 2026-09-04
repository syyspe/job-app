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
3. **`/review`.** Fix what it raises. It runs all four `REVIEW.md` passes
   (Bugs, Security, Scope, Simplicity) as one inline pass against the diff —
   see `.claude/skills/review/SKILL.md` for exactly what it covers. The
   built-in `/code-review` is not part of the default sequence: it doesn't
   read `REVIEW.md`, and above `low`/`medium` effort it fans out into several
   parallel subagents that get expensive fast. Reach for it deliberately, as
   an extra pass, when a change is high-stakes enough to want its
   differently-scoped bug/cleanup sweep on top of `/review`.
4. **`/security-review`** when the diff touches a real boundary — user input,
   auth, secrets, deserialization, file or network I/O, a new dependency.
   `/review`'s Security pass already ran, scaled to what the project is;
   `/security-review` goes deeper, so say out loud when you're skipping it and
   why — a docs-only or internal-refactor diff doesn't need it.
5. **Ship.** `git push -u origin <slug> && gh pr create`. The default branch is
   PR-only and `default-branch-guard.sh` blocks a direct push, so there is no
   shortcut here even for a one-line change.

   In the PR body, name anything in the diff that neither `brief/<slug>.md`
   nor the plan asked for. `/review`'s Scope pass checks the diff against
   both; `verifier` separately re-checks it against the plan with fresh
   context. Unplanned work isn't automatically wrong, but it should reach the
   user as a decision, not as a surprise found while reading.

The user reviews and merges.

## When a step fails

If step 1 or 2 fails, fixing it is this session's job. A one-line fix happens
here; anything substantial means a real return to Stage 3 — say so, and start
a fresh Build session rather than quietly turning the Ship session into one.
