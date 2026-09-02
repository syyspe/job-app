# .claude/skills/ — encoded policy

A skill is a rule you'd otherwise have to remember to state. Skills here
trigger automatically during Stage 2 (Plan) and Stage 3 (Build) so the rule
applies without you having to bring it up. They're advisory controls: they
make correct behavior likely, unlike hooks (`.claude/hooks/`), which make
violations impossible.

`simple-code/` is the one filled-out example, and the one worth keeping on
every project. The other three aren't policy — they drive the process
itself: `sdlc/` (`/sdlc` — which stage the branch is in and what's next),
`bootstrap/` (one-time project setup), and `worktree/` (parallel work
streams).

Add more folders following the same shape — one directory per skill,
containing a `SKILL.md` with frontmatter describing when it triggers. Good
candidates on a personal project are the things you keep re-explaining: a
house style for a particular kind of module, a checklist for a deploy target,
the conventions of an API you keep integrating with.

Prefer `CLAUDE.md` for anything that's always true, and a skill for anything
that's true only in a specific situation — a skill that always triggers is
just `CLAUDE.md` with extra steps.
