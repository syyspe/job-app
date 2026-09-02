---
name: simple-code
description: Use whenever writing, editing, or refactoring code in any language (Stage 3 build) or reviewing a diff (Stage 4 review). Trigger before adding a new function, class, or file, and any time a function/file is growing or picking up a new parameter or nesting level.
---

# Simple Code

Write only what's needed to satisfy the current `plan.md`. Nothing extra
"for later," nothing defensive against inputs that can't occur, nothing
clever that a plainer version would express just as well.

## Red-Green-Refactor

The required workflow for any new behavior, not just bug fixes:

1. **Red** — write a failing test for the smallest next slice of behavior.
2. **Green** — write the minimum code to pass it. Resist adding anything
   the test doesn't require yet.
3. **Refactor** — simplify without changing behavior, re-running tests
   after each step.

This is the same discipline the root `README.md` (Stage 3) and
`plans/TEMPLATE.plan.md` already name for bug fixes — this skill makes it
the default for all new code.

## Limits

| Metric | Limit | When you hit it |
|---|---|---|
| Function length | ≤ 40 lines | Split it. |
| File length | ≤ 300 lines | Split it. |
| Parameters | ≤ 3 | A 4th means bundle related params into a struct/object — restructure, don't add a comment justifying it. |
| Nesting | ≤ 2 levels | Use a guard clause / early return instead of a 3rd level. |
| Cyclomatic complexity | ≤ 10 | Split the function. |

Never suppress a limit or add a lint-disable to get past it — restructure
instead. Hitting a limit is a signal the unit is doing too much, not a
formatting problem.

## No defensive code

Don't handle inputs or states that can't occur given the caller and type
guarantees. Only validate at real boundaries: user input, external APIs,
file/network I/O. Trust internal code and framework guarantees everywhere
else.

## No cleverness over simplicity

Prefer the boring, obvious implementation. Avoid one-liners or
abstractions that trade readability for brevity. Three similar lines beat
a premature abstraction. Don't design for hypothetical future
requirements.

## Readability first

A reader should understand behavior from the code without re-deriving it.
Name things for what they mean, not how they're implemented.

## Self-check before finishing

- Does every function/file respect the limits above?
- Is there any handling for a case that can't actually happen?
- Is there a simpler version of this that reads just as fast?

## Project-specific additions

`<add any thresholds or exceptions specific to this repo here>`
