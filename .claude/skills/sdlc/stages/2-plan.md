# Stage 2 — Plan

Call `EnterPlanMode` yourself, as the first action of the stage. Don't wait to
be asked and don't assume the user started the session in plan mode —
remembering to flip the mode is the most-forgotten step in the loop, and it's
yours to remember, not theirs.

Then read `brief/<slug>.md` and iterate until the plan could be implemented
from the file alone, without the conversation that produced it. That is the
bar: the build session will have the file and nothing else.

Once `ExitPlanMode` is approved, write the plan into `plans/<slug>.plan.md` in
`plans/TEMPLATE.plan.md`'s shape and commit it — that commit is what Stage 4
compares the diff against.

## The boundary that gets crossed by accident

Approving `ExitPlanMode` approves the *plan*. It is not a go-ahead to build
now, and this is the one most often crossed without noticing: the plan is
fresh in context, step 1 looks small, and starting it costs nothing visible.

Committing the plan ends the stage. Don't open a file from the work order,
don't do step 1 "while we're here" — say the plan is committed, name its first
step in one line, and hand off.

Next: Stage 3 (Build), in a fresh session, `/model sonnet`.
