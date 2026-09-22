---
slug: list-pagination
date: 2026-09-22
---

# Paginate the application list, with a configurable page size

## Problem

`ApplicationsView` fetches every application in one call, filters and sorts
the array in the browser, and hands the whole thing to `ApplicationList`.
Every row that exists is rendered, always.

That was fine at five applications. It stops being fine somewhere around
twenty. The list is a stack of cards, not a table — each row is a full-width
surface with a status spine, and twenty of them is a column several screens
tall. Three things break at that length:

- **You can't see the shape of the list.** Scanning "what's outstanding" means
  scrolling, and by the time you reach the bottom the top is gone. A tracker
  you have to scroll to read is a file, not a dashboard.
- **The controls drift out of reach.** The sort bar is above the list and the
  archived toggle is at its foot (#34) — at twenty rows those two sit screens
  apart, and the archived toggle is effectively hidden. The `list-controls`
  brief flagged exactly this ("the deciding factor is whether a long list
  makes it unfindable"); a long list is now the case that answers it.
- **The side-by-side layout loses its point.** The add form is a peer column
  to the list; scrolling the list scrolls the form off with it.

Worth fixing now because the list has no upper bound and nothing in the UI
acknowledges that. Every feature landed on the list surface so far — the
status spine, the detail panel, the archive toggle — has assumed a list you
can see all of at once.

## What done looks like

1. The application list shows at most one page of applications at a time.
2. Page size is configuration, not a constant in the source. Default 7 when
   unset.
3. Page size can be changed on a deployed instance without rebuilding the
   client bundle.
4. `.env.example` documents the new variable, in the same voice as the
   entries already there, and the README/`CLAUDE.md` say what it does if
   either currently implies the list is unpaged.
5. There is a control for moving between pages, and the user's current
   position in the list is visible from it. Its design — shape, wording,
   placement, narrow-width behaviour — is Stage 2's to settle (see Approach).
6. When everything fits on one page, no pagination control renders at all.
7. The view never shows an empty page. Changing sort, toggling archived,
   adding, deleting or archiving an application all leave the user on a page
   that has rows on it.
8. The archived toggle stays reachable and keeps its meaning: it is about the
   whole list, not the current page, and its count stays the full count of
   hidden archived applications.
9. The "nothing tracked yet" empty state is unchanged when there are no
   applications at all — an empty list is not a zero-page list.
10. The pagination control is reachable by keyboard with a visible focus ring,
    and has accessible names a test can query by role.
11. Every colour, size and space comes from a token in `index.css`. New rules
    land in exactly one stylesheet — `applications.css` if the control is part
    of the list surface, `App.css` if it's part of the frame — not both.
12. The list and its controls hold together from ~360px up to full layout
    width.
13. Tests: the paging logic has unit tests of its own; `ApplicationsView.test.tsx`
    covers paging, reset and the one-page case; any e2e spec that assumes
    every seeded row is visible is updated.
14. `npm test`, `npm run lint` and `npm run test:e2e` all pass.

## Approach

- **Paging stays on the client.** `ApplicationsView` already holds the
  unfiltered array, filters it by `archived` and sorts it with
  `sortApplications`; paging is one more transformation at the end of that
  chain, and a page state beside `sort` and `showArchived`. The slice itself
  belongs in a pure helper in `src/lib/` next to `sorting.ts`, so it can be
  tested without rendering anything.
- **Rejected: server-side `LIMIT`/`OFFSET`.** It would force sorting and the
  archived filter into SQL, change the shape of `GET /api/applications`, and
  break the archived count the foot toggle needs — a large change to the data
  path for a dataset that is one person's job applications. The list is small
  enough to fetch; it is only too long to *render*.
- **Page size is read by the server at runtime and handed to the client.** A
  `PAGE_SIZE` env var read in `server/index.ts` alongside `DB_PATH` and
  `UPLOADS_DIR`, defaulting to 7, and surfaced to the browser through the API.
  Which response carries it — a new `/api/config`, a field on `/api/me`, or
  something else — is the plan's call.
- **Rejected: `VITE_PAGE_SIZE` at build time.** Vite would bake it into the
  bundle, so changing the page size on a running instance would mean
  `npm run build`. That is a compile-time constant with an env var's syntax,
  not configuration.
- **The pagination control's design is deliberately not specified here.**
  Where it sits relative to the list and the archived toggle, whether position
  reads as "Page 2 of 4" or as numbered pages, what it does at 360px, and
  whether a "Load more" continuation would serve a tracker better than discrete
  pages are all real design questions with real trade-offs. **Stage 2 must run
  the `frontend-design` skill** and settle them in the plan, against the
  existing surfaces: the `.button` tiers from #33, the quiet sort bar and the
  foot-of-list archived toggle from #34.

## Out of scope

- Server-side pagination, and any change to the applications SQL or to the
  shape of `GET /api/applications`.
- The sort model, the archived filter, and any new filter or search.
- A UI control for changing page size, and per-user page-size preference.
  One value, from the environment.
- Persisting the current page across reloads.
- The admin user list. It can grow too, but it isn't this list and it isn't
  this brief.
- New dependencies, including any pagination component library.

## Open questions

- Which response carries the page size to the client — a new `/api/config`,
  a field on `/api/me`, or another carrier?
- What should an unusable `PAGE_SIZE` (`0`, negative, non-numeric) do: throw
  at startup the way a missing `DB_PATH` does, or fall back to 7?
- Does changing sort or toggling archived send the user back to page 1, or
  try to keep them near where they were? Page 1 is the simpler rule; whether
  it's the right one is open.
- When archived rows are shown, do they page in with everything else, or does
  mixing them into the page count confuse what "show 4 archived" promised?
- Does the pagination control belong above the list, below it, or both — and
  how does it relate to the archived toggle that already sits at the foot?

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/list-pagination.plan.md` before writing any
code.
