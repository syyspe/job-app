# brief/ — Stage 1

One file per piece of work, named `<short-slug>.md`. Copy `TEMPLATE.md` to
start, or just talk it through with Claude and let it write the file.

A brief answers four things: what's wrong, what "done" looks like, roughly
how, and what's explicitly out of scope. It exists so that Stage 2's plan has
something to be checked against, and so that in three months you can tell
what past-you was actually trying to do.

The slug names the branch (`git checkout -b <slug>`) and the plan
(`plans/<slug>.plan.md`) — see the root `README.md` for the full recipe.

**Keep it thin.** A brief for a one-afternoon change can be six lines. Thin
is fine; invented requirements are not. If a section has nothing real in it,
delete the section.

**Done when:** it's committed. There's no approval step and no `status:`
field — you're the only reviewer, and flipping a flag against yourself is
ceremony, not a gate.

**Next:** Stage 2 (Plan). Open a session in plan mode against this brief and
commit `plans/<slug>.plan.md` before any code gets written. Run `/sdlc` if
you're unsure where a branch stands.
