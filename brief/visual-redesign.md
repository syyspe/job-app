---
slug: visual-redesign
date: 2026-09-09
---

# A designed look and feel, across every surface

## Problem

**The app has styling, but no design.** `src/index.css` is 85 lines and is the
whole system: eight colour tokens, one font (`system-ui`), one radius (4px),
one border weight, one accent. There is no type scale and no spacing scale, so
every rule in `App.css` picks its own number — 4, 6, 8, 12, 16, 20, 32px appear
with nothing deciding between them. The result is the browser's defaults with
a hairline border drawn around them, which is what "boring" means here: not
ugly, just undesigned.

Concretely, on every surface:

- **The list row is a single line of concatenated text.**
  `{company} — {role} ({status})` plus `· due {deadline}`
  (`ApplicationList.tsx:36-42`), inside a button with `background: none;
  border: none` (`App.css:88-96`). Nothing says a row is clickable, nothing
  marks the expanded one, and `status` — the one field you scan a job tracker
  by — is lowercase text in parentheses at the same size, weight and colour as
  everything else.
- **Timestamps print verbatim.** `Created 2026-01-15 09:00:00 · Updated
  2026-01-16 10:30:00` (`ApplicationDetail.tsx:43-45`) — the SQLite column
  value, shown to a human.
- **Both forms are six stacked labels with no shape.** `ApplicationForm`
  (`ApplicationForm.tsx:79-135`) has no heading, no grouping, no container; it
  is the same markup whether it is the add form in the left column or the edit
  form inside an expanded row.
- **The login screen is that bare form** flush to the top-left of a 1120px
  `main` (`App.tsx:44`, `App.css:1-5`) — the first thing anyone sees.
- **The nav is an `h1` and a button on a rule** (`NavBar.tsx:9-19`,
  `App.css:7-14`).
- **The empty state is `<p>No applications yet.</p>`** (`ApplicationList.tsx:24`).
- **Focus is visible on `.button` only** (`index.css:76-79`). Inputs, selects,
  the textarea, the row button and the sort radios get whatever the user agent
  happens to draw.

Worth doing now because the feature work is done — auth, CRUD, attachments,
sorting, toasts have all landed — so the visual layer is the only thing between
this and something pleasant to open daily. And it is worth doing in one pass:
a system decided once and applied to every surface is the thing that produces
coherence, whereas a token added per branch is how you end up with eight radii.

## What done looks like

1. A design system lives in `index.css` — type scale, spacing scale, surface
   and border tokens, status colours — and every rule in `App.css` draws from
   it instead of inventing values.
2. Nav, login screen, add form, edit form, sort bar, list rows, expanded
   detail, attachment list, empty state and toasts all read as one designed
   system. No surface left at the default.
3. A list row has visible hierarchy: role and company are distinguishable at a
   glance, status reads as its own element rather than a parenthetical, and
   dates are human-readable rather than ISO.
4. A row shows it is interactive — resting, hover, keyboard-focus and expanded
   are four visibly different states.
5. The sort bar is restyled and does exactly what it does now: the same
   `Sort by` select and direction radios, the same `sort` in / `onChange` out
   contract (`ApplicationSort.tsx`). No search, no filtering.
6. Every interactive element has a visible focus indicator — inputs, selects,
   textarea, radios, links and the row button included.
7. Light and dark are both deliberately designed, not one palette with the
   values swapped, and text and controls meet WCAG AA contrast in both.
8. Behaviour is unchanged. Same routes, same requests, same state, same
   validation, same draft→applied rule (`ApplicationForm.tsx:63-68`).
9. No new dependencies.
10. `npm test`, `npm run lint` and `npm run test:e2e` pass, with the assertions
    that encode today's exact strings updated — see the constraints below.

## Approach

**The visual direction is deliberately left open.** Stage 2 loads the
`frontend-design` skill and settles, in the plan: font choice and type scale,
the light and dark palettes, the surface/elevation model, and the status colour
mapping. Recording the choice in the plan is what stops it being re-litigated
at build time. What binds either way is items 7–9 above.

- **Plain CSS in the two existing files.** Tokens in `index.css`, layout and
  component rules in `App.css`. Rejected: CSS modules, Tailwind, a component
  library, CSS-in-JS — all are new dependencies, and 264 lines of CSS does not
  need a build step to manage it.
- **Markup changes only where a flat string blocks hierarchy.** That is the
  list row, the empty state, and probably the login screen's framing. Nav,
  both forms, the sort bar, the attachment list and the toasts should need
  class names and CSS, not restructuring.
- **Status colour comes from tokens keyed on `Status`**, one per value in
  `types.ts:6-13`, so the mapping is defined once rather than per component.
- **Date formatting goes in a pure helper in `src/lib/` with its own test**,
  not `toLocaleDateString` inline in three components. Rejected: a date
  library — no new deps, and `Intl.DateTimeFormat` is already in the platform.

**Constraints the design has to work within.** These are load-bearing; the
plan should check them before choosing a row shape:

- `e2e/applications.spec.ts:26` matches `getByRole('button', { name:
  /interview/ })`. Playwright's regex name match is case-sensitive, so a
  capitalised `Interview` badge breaks it unless the spec is updated.
- `e2e/layout.spec.ts:16` and `ApplicationList.test.tsx:49,50,67,69` match a
  row by regex over its accessible name — including
  `/Globex.*due 2026-03-01/`. The row therefore stays one button whose
  accessible name still contains company, role, status and deadline in that
  order. Splitting it into nested interactive elements breaks all four.
- `ApplicationDetail.test.tsx:84` asserts the exact string
  `Created 2026-01-15 09:00:00 · Updated 2026-01-16 10:30:00`, so reformatting
  timestamps changes that assertion.
- Tests query by accessible role and name (repo convention), which is why a
  visual change reaches them at all — and is also what keeps the redesign
  honest about accessible names.

## Out of scope

- **Search and filtering.** Its own brief, built on these components once they
  exist rather than retrofitted underneath them.
- Grouping the list by status, status counts, a pipeline or board view, drag
  and drop — that is an information-architecture change, not a look-and-feel
  one.
- Any change to what the forms submit or validate, and to sorting logic or the
  set of sortable fields (`src/lib/sorting.ts`).
- Confirmation or undo on destructive actions.
- Icons, illustrations, a logo, a favicon.
- Responsive work beyond keeping the existing 900px breakpoint
  (`App.css:24-28`) working at the widths it works at today.
- Server, API, database, and the domain types.

## Open questions

- **Is a web font worth it?** It would have to be self-hosted from `public/`
  — no new dependency and no third-party request on every load. A well-chosen
  system stack may be enough. The plan decides rather than leaving it to taste.
- **Does the status badge stay inside the row button?** Bounded by the e2e
  constraint above. Keeping it inside is cheapest; moving it out means updating
  those specs deliberately, which is fine if the design earns it.
- **A manual light/dark toggle, or `prefers-color-scheme` alone?** Leaning
  toward leaving it alone — a toggle is persisted state, and this brief is
  presentational.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/visual-redesign.plan.md` before writing any
code.
