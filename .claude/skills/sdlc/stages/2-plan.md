# Stage 2 — Plan

Call `EnterPlanMode` yourself, as the first action of the stage. Don't wait to
be asked and don't assume the user started the session in plan mode.

Then read `brief/<slug>.md` and iterate until the plan could be implemented
from the file alone, without the conversation that produced it.

Before settling the Affected files, check them against the other streams in
flight. Worktrees share one repo, so their branches are visible from here:

```bash
git fetch --quiet origin
me=$(git rev-parse --abbrev-ref HEAD)
git for-each-ref --no-merged=origin/HEAD --format='%(refname:short)' refs/heads refs/remotes/origin \
  | while read -r ref; do
      slug=${ref#origin/}; [ "$slug" = "$me" ] && continue
      git show "$ref:plans/$slug.plan.md" 2>/dev/null \
        | sed -n '/^## Affected files/,/^## Work order/p' | sed "s#^#$ref: #"
    done
```

A file on both lists, or a contract this plan changes that another relies on,
is an overlap. Git catches a shared file at merge time; it never catches a
contradiction. For each overlap, read that stream's plan and pick one, with
the user:

- **Sequence** — this stream waits for the other to merge, or branches from
  it (stacked; see the `worktree` skill).
- **Extract** — the shared groundwork becomes its own small slug that lands
  first, and both streams build on it.
- **Merge** — they're one feature; fold this brief into the other stream.

Record the choice under the plan's Parallel streams section. A stream with a
brief but no plan yet can't be checked this way. If the brief's Related
streams names one, ask the user what it's going to touch.

If the plan adds code that can fail at a boundary, follow the `error-handling`
skill: list the failure cases under Tests. If `CLAUDE.md`'s `Errors:` line
says the contract isn't decided, decide it in this plan — and the `Logging:`
contract with it, per the `logging` skill.

If the plan adds or reshapes UI, use the `frontend-design` skill when the
session lists it. If `CLAUDE.md`'s `UI:` line says the visual direction isn't
decided, decide it under the plan's Contracts, so the build session follows a direction
instead of inventing one.

Once `ExitPlanMode` is approved, write the plan into `plans/<slug>.plan.md` in
`plans/TEMPLATE.plan.md`'s shape and commit it.

Approving `ExitPlanMode` approves the plan, not the build. After committing,
stop: don't open a file from the work order, don't do step 1 "while we're
here" — say the plan is committed and name its first step in one line.

Then hand off: `SKILL.md` "Handing off".
