---
slug: nav-and-buttons
date: 2026-09-04
---

# Top nav bar + button color contrast fix

## Problem

The app name "Job applications" is currently rendered as an `<h1>` inside the
page body (`src/App.tsx`), alongside a separate `.session-bar` div that holds
the username and logout button below it. There's no persistent chrome — the
app identity and session controls read as part of the page content rather
than as a stable header. Separately, `.button-primary` (`src/index.css`) uses
`--accent: #aa3bff` text on `--accent-bg: rgba(170, 59, 255, 0.1)` in light
mode — low-contrast purple-on-near-white that's hard to read. The dark-mode
pairing (`--accent: #c084fc` on `rgba(192, 132, 252, 0.15)`) is fine as-is
and should not change.

## What done looks like

1. A top nav bar replaces the current in-body `<h1>` + `.session-bar`
   arrangement: it shows the app name "Job applications" on one side, and
   (when logged in) the username and a logout button on the other.
2. When logged out, the nav still shows the app name; username/logout are
   only shown when a user is present (same condition as today).
3. The nav bar renders above `<main>`, outside the `max-width`-constrained
   content column, so it can span full width if desired.
4. The app name in the nav is still exposed as a heading (`h1` or
   equivalent accessible heading role) — `e2e/smoke.spec.ts` asserts
   `getByRole('heading', { name: 'Job applications' })` and must keep
   passing unmodified.
5. `.button-primary`'s light-mode colors are changed to a clearly readable
   combination (sufficient contrast between text and background). Dark-mode
   `.button-primary` colors are untouched.
6. Existing component/unit tests (`App.test.tsx`, `LoginForm.test.tsx`, etc.)
   pass unmodified in intent — selectors that assumed `.session-bar`
   structure may need updating, but behavior (what's rendered, when) does
   not change beyond the nav restructuring itself.

## Approach

- Structural: introduce a `<nav>` (or `<header>`) element, likely as a small
  new piece of `App.tsx` markup rather than a new component, given its size.
  Open question below on whether it becomes its own component.
- Styling: move `.session-bar` layout rules into the new nav's CSS, keep
  `main` unchanged except for removing the old `<h1>` and session bar.
- Color fix: adjust `--accent`/`--accent-bg` values (or introduce distinct
  button-specific tokens) only inside `:root` (the light-mode default block),
  leaving the `@media (prefers-color-scheme: dark)` block untouched. Exact
  new values are a plan/build-time decision — the requirement is contrast,
  not a specific hex.

## Out of scope

- Any change to the dark-mode palette.
- Redesigning `.button` (secondary/default) styling — only `.button-primary`
  is flagged as unclear in light mode.
- Responsive/mobile-specific nav behavior beyond what already exists for the
  rest of the layout.
- Adding new dependencies (e.g. icon libraries) for the nav.

## Open questions

- Should the nav be its own component (`src/components/NavBar.tsx`) with its
  own test, matching the pattern of the other six presentational components,
  or is it small enough to stay inline in `App.tsx`? Leaning toward a
  component for consistency with the "six presentational components, each
  with a test beside it" convention — plan stage should decide.
- Exact replacement colors for `.button-primary` in light mode — pick a
  concrete pair (e.g. a solid darker purple background with white text, or a
  strengthened border) at plan/build time and confirm contrast visually.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/nav-and-buttons.plan.md` before writing
any code.
