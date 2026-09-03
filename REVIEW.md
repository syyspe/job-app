# Review Policy

This file defines the review passes Claude runs on every pull request (Stage
4). Keep it authoritative and specific rather than generic.

**What actually reads it.** `.github/workflows/claude-review.yml` does — its
prompt names this file, so the CI review on a PR runs the four passes below.
The local `/code-review` command does **not**: it is a built-in with fixed
passes of its own (correctness bugs, plus cleanup for reuse, simplification
and efficiency, plus one conventions angle that checks the diff against
`CLAUDE.md`). It also reviews only the diff — `git diff @{upstream}...HEAD`
plus uncommitted changes — unless you hand it a path, a branch, or a PR
number.

So in a local Stage 4, three of the four passes below arrive by other routes:
`verifier` covers the plan half of **Scope**, `/code-review` covers **Bugs**
and most of **Simplicity**, and **Security** needs `/security-review` run
explicitly. The brief half of **Scope** has no automation at all — that one is
yours, when you read the PR. Anything here you need to bind a local session
(an exclusion, a hard limit) has to be restated in `CLAUDE.md`, which is the
only policy file the built-in review sees.

## Passes

Every PR gets four passes, in this order:

1. **Bugs** — logic errors, regressions, edge cases, off-by-ones, unhandled
   error paths. Cross-reference against `plans/<branch>.plan.md` if one
   exists: does the diff match what was planned?
2. **Security** — injection risks, auth gaps, secrets or credentials
   committed, unsafe deserialization, missing validation on anything that
   crosses a real boundary (user input, external APIs, file/network I/O).
   Scale the depth to what the project actually is; a local CLI tool and a
   public web app do not deserve the same paragraph.
3. **Scope** — alignment with `brief/<slug>.md` and `plans/<slug>.plan.md`.
   Flag anything in the diff that neither document asked for. Unplanned
   work isn't automatically wrong, but it should be a decision, not a
   surprise.
4. **Simplicity** — function/file length, parameter count, nesting depth,
   and complexity within the limits in
   `.claude/skills/simple-code/SKILL.md`; flag defensive code handling
   cases that can't occur, and cleverness where a simpler version would
   read just as fast.

## Severity

- **Important** — fix before merge. Bugs, security issues, and unexplained
  scope deviations are always Important.
- **Nit** — style/preference, safe to defer. Cap: **5 nits per review**. If
  there are more than 5, only surface the 5 highest-value ones.

## Excluded paths

Do not review, or review at reduced strictness:

- Generated / vendored: `dist/`, `node_modules/`, `test-results/`,
  `playwright-report/`, `package-lock.json`.
- Already caught by tooling: TypeScript errors (`npm run build` runs `tsc
  -b`) and anything oxlint flags (`npm run lint`) — don't re-report those as
  review findings.
- Scaffold leftovers in `src/App.tsx`, `src/App.css`, `src/assets/` and
  `public/` are Vite's starter template, not written code. Review them only
  once real code starts replacing them.

## Response loop

- On a PR, tag `@claude` on a review comment to request a fix; Claude
  addresses it and pushes a correction (needs the CI workflow enabled).
- If a review catches the **same class of mistake** for the second time
  across different PRs, add it to the "Things Claude gets wrong here"
  section of `CLAUDE.md` so it's caught during implementation instead of
  review. This is the feedback loop that replaces an eval suite here — it
  costs one line and it works.

## Who decides

Claude's review findings are advisory. You approve the merge, and the default
branch only moves by merged PR — `default-branch-guard.sh` blocks a direct
push, so these passes can't be skipped by pushing past them. On anything
touching a protected path or a production deploy, the hooks in
`.claude/hooks/` stop the session and ask — see `production-gate.sh`.

Reviewing your own PR is not theatre as long as you actually read the diff.
The failure mode to watch for is merging a green check you didn't look at.
