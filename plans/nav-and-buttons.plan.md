---
brief: brief/nav-and-buttons.md
branch: nav-and-buttons
date: 2026-09-04
---

# Top nav bar + button contrast fix — Plan

## Context

`brief/nav-and-buttons.md` identifies two independent issues: the app's
`<h1>` and session controls (`src/App.tsx`) read as in-body content rather
than persistent chrome, and `.button-primary`'s light-mode colors
(`src/index.css`) are low-contrast purple-on-near-white. This plan resolves
both brief open questions: the nav becomes its own component (`NavBar`,
matching the existing six-component/one-test-each pattern), and the
contrast fix keeps the current tinted-pill button style but darkens the
underlying purple so it passes WCAG AA, rather than switching to a
solid-fill button.

Confirmed by direct inspection:

- `<h1>Job applications</h1>` in `App.tsx` renders unconditionally, even
  pre-login — the new nav must preserve that.
- `.session-bar` and `main`'s max-width rule both live in `src/App.css`,
  not `index.css`.
- `--accent`/`--accent-bg` are used in exactly three places in
  `index.css`: `.button-primary`'s `color`/`background`, and
  `.button:focus-within`'s outline. Darkening them in `:root` only also
  strengthens the focus-ring contrast (a side benefit, not a regression)
  and doesn't touch anything else.
- `App.test.tsx` and `LoginForm.test.tsx` have zero selectors tied to
  `.session-bar`, the `<h1>`, or the logout button's container — nothing
  needs updating there for the restructuring itself.
- `e2e/login.ts`'s `logIn` helper waits for
  `getByRole('button', { name: 'Log out' })` — this must keep being a
  `<button>` with that accessible name regardless of new container.

Contrast check (light mode): current `#aa3bff` text on the effective
near-white tinted background is ≈4.4:1, under the 4.5:1 AA threshold for
normal text. Darkening to `#7c3aed` (keeping the same `rgba(.., 0.1)` tint
pattern) brings it to ≈5.7:1, comfortably passing, while the pill
background stays visually the same style, just less washed out.

## Affected files

- `src/components/NavBar.tsx` — new. Renders `<nav className="nav-bar">`
  containing the `<h1>Job applications</h1>` (always) and, only when
  `user` is truthy, a `<div className="nav-bar-session">` with the
  username and a "Log out" button. Props: `{ user: User | null; onLogout:
  () => Promise<void> }`, matching `LoginForm`'s prop-interface pattern.
- `src/components/NavBar.test.tsx` — new, alongside the component per
  repo convention. Covers: heading renders with no user; username/logout
  button don't render with no user; both render and clicking "Log out"
  calls `onLogout` when a user is present. Query by role/label per
  `CLAUDE.md`, matching `LoginForm.test.tsx`'s style.
- `src/App.tsx` — remove the inline `<h1>` and `.session-bar` div; render
  `<NavBar user={user} onLogout={handleLogout} />` as a sibling above
  `<main>`, wrapped in a fragment since `App` currently returns `<main>`
  as its sole root element.
- `src/App.css` — replace the `.session-bar` rule with `.nav-bar` (flex
  row, `justify-content: space-between`, border-bottom, its own padding —
  full width, outside `main`'s `max-width: 1120px`) and
  `.nav-bar-session` (flex row with a gap, for the username + button
  group). Add a `.nav-bar h1` override for a nav-appropriate size (global
  `h1` is 28px, sized for in-page use).
- `src/index.css` — change light-mode `:root` `--accent` from `#aa3bff` to
  `#7c3aed` and `--accent-bg` from `rgba(170, 59, 255, 0.1)` to
  `rgba(124, 58, 237, 0.1)`. The `@media (prefers-color-scheme: dark)`
  block is untouched.

## Work order

1. Add the `--accent`/`--accent-bg` light-mode value change in
   `index.css` (independent of the nav work; do it first since it's a
   one-line isolated diff).
2. Create `NavBar.tsx` + `NavBar.test.tsx`; run the new test in isolation.
3. Wire `NavBar` into `App.tsx`, removing the old `<h1>`/`.session-bar`
   markup.
4. Update `App.css`: replace `.session-bar` with `.nav-bar` /
   `.nav-bar-session` / `.nav-bar h1`.
5. Run the full unit suite, `npm run build`, and `npm run lint`; then spot
   check visually via `npm run dev` (nav renders logged-out and
   logged-in, button contrast reads clearly in light mode, dark mode
   unchanged).
6. Run `npm run test:e2e` (covers the `getByRole('heading', ...)` assertion
   and the `logIn` helper's reliance on the "Log out" button).

## Tests

- New: `src/components/NavBar.test.tsx` (see above).
- Updated: none required — `App.test.tsx` and `LoginForm.test.tsx` have no
  selectors on the removed structure.
- Verification command: `npm test` (the PR gate per `CLAUDE.md`), plus
  `npm run build`, `npm run lint`, and `npm run test:e2e` before shipping.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for
what follows it.
