# Stage 2 — Plan

Call `EnterPlanMode` yourself, as the first action of the stage. Don't wait to
be asked and don't assume the user started the session in plan mode.

Then read `brief/<slug>.md` and iterate until the plan could be implemented
from the file alone, without the conversation that produced it.

Once `ExitPlanMode` is approved, write the plan into `plans/<slug>.plan.md` in
`plans/TEMPLATE.plan.md`'s shape and commit it.

Approving `ExitPlanMode` approves the plan, not the build. After committing,
stop: don't open a file from the work order, don't do step 1 "while we're
here" — say the plan is committed and name its first step in one line.

Then hand off: `SKILL.md` "Handing off".
