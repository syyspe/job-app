---
brief: brief/list-pagination.md
branch: list-pagination
date: 2026-09-22
---

# Paginate the application list — Plan

## Context

`ApplicationsView` renders every application it fetches. At ~20 rows the list
is a column several screens tall: you can't see the shape of it, the sort bar
and the foot-of-list archived toggle end up screens apart, and the add form
scrolls away with it. The fix is to show one page of rows at a time, with the
page size read from the environment at server startup so a deployed instance
can change it without rebuilding the client bundle.

Paging stays on the client: the view already holds the whole array, filters it
by `archived` and sorts it, so paging is one more pure transformation at the
end of that chain. `GET /api/applications` and the applications SQL do not
change.

Three decisions settled with the user in Stage 2:

- **Control:** `[ Previous ]  Page 2 of 4  [ Next ]`, one quiet row at the foot
  of the list, directly under the last row and above the archived toggle.
- **Bad `PAGE_SIZE`:** throw at startup, the way a missing `DB_PATH` does.
  Unset still means 7.
- **Carrier:** a new `GET /api/config` returning `{ "pageSize": 7 }`, behind
  `requireSession` like every other data route.

## Affected files

Server

- `server/lib/config.ts` — **new.** `DEFAULT_PAGE_SIZE = 7` and
  `parsePageSize(raw: string | undefined): number`, which returns the default
  when unset and throws on anything that isn't a whole number ≥ 1.
- `server/routes/config.ts` — **new.** `createConfigRouter(pageSize)`, one
  route: `GET /config` → `res.json({ pageSize })`.
- `server/app.ts` — `CreateAppOptions` gains `pageSize?: number`, defaulting to
  `DEFAULT_PAGE_SIZE` so existing callers (`app.test.ts`, the route tests, the
  MCP harness) are untouched. Mount `createConfigRouter(pageSize)` on `/api`
  immediately after `requireSession`.
- `server/index.ts` — `const pageSize = parsePageSize(process.env.PAGE_SIZE)`
  beside the `DB_PATH`/`UPLOADS_DIR` reads, passed into `createApp`, and named
  in the startup log alongside db and uploads.
- `server/types.ts` — add `AppConfig { pageSize: number }`.

Client

- `src/types.ts` — the same `AppConfig` (the two files are kept in step by
  hand).
- `src/lib/api.ts` — `getConfig(): Promise<AppConfig>`, a `GET /api/config`
  built like `listApplications`.
- `src/lib/paging.ts` — **new.** The whole paging rule, pure and 1-based:

  ```ts
  export interface Page<T> {
    items: T[]
    page: number
    pageCount: number
  }

  // pageSize is null until /api/config answers; an unknown size means one page
  // holding everything, which is what the list showed before it was paged.
  export function paginate<T>(items: T[], page: number, pageSize: number | null): Page<T> {
    if (pageSize === null) return { items, page: 1, pageCount: 1 }
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
    const current = Math.min(Math.max(page, 1), pageCount)
    const start = (current - 1) * pageSize
    return { items: items.slice(start, start + pageSize), page: current, pageCount }
  }
  ```

  Returning the clamped `page` is what keeps the view off an empty page: `page`
  state is a request, and what renders is always the clamped answer. Deleting
  or archiving the last row of the last page slides the user back a page with
  no effect and no reset logic.
- `src/components/Pagination.tsx` — **new**, presentational, no application
  types:

  ```tsx
  export function Pagination({ page, pageCount, onChange }: PaginationProps) {
    if (pageCount <= 1) return null

    return (
      <nav className="pager" aria-label="Application pages">
        <button type="button" className="button" disabled={page === 1} onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <span aria-live="polite">Page {page} of {pageCount}</span>
        <button type="button" className="button" disabled={page === pageCount} onClick={() => onChange(page + 1)}>
          Next
        </button>
      </nav>
    )
  }
  ```

  `pageCount <= 1 → null` mirrors `ArchivedToggle`'s `count === 0` guard, and
  is the whole of "no control when everything fits". `aria-live` on the
  position is what announces the move, since the buttons stay put.
- `src/components/ApplicationsView.tsx` — `useApplications` gains a
  `pageSize: number | null` state and loads it with the list in one round:

  ```ts
  async function load() {
    const [config, list] = await Promise.all([getConfig(), listApplications()])
    setPageSize(config.pageSize)
    setApplications(list)
  }
  ```

  replacing `run(reload)` in the mount effect (keep the existing
  `eslint-disable` comment; `reload` stays as the mutations' refetch). The view
  gains `const [page, setPage] = useState(1)` and, after the existing
  `visibleApplications` memo:

  ```ts
  const { items: pageApplications, page: currentPage, pageCount } = useMemo(
    () => paginate(visibleApplications, page, pageSize),
    [visibleApplications, page, pageSize],
  )
  ```

  `ApplicationList` gets `pageApplications`; `hiddenArchivedCount` keeps the
  full archived count, so the empty states are unchanged. `<Pagination>` goes
  between `ApplicationList` and `ArchivedToggle`. Three things reset to page 1,
  because each one reshuffles what page 2 even means: `ApplicationSort`'s
  `onChange`, `ArchivedToggle`'s `onChange`, and the add form's `onSubmit`
  (`async (input) => { await handleAdd(input); setPage(1) }` — a failed add
  resets too, which is harmless: the error toast and the still-filled form
  carry the outcome).
- `src/applications.css` — the pager's rules, after `.archived-toggle`, and
  nowhere else. `.pager` is a `flex` row, `justify-content: space-between`,
  `flex-wrap: wrap`, `gap: var(--s-3)`, `margin-top: var(--s-4)`,
  `font-size: var(--fs-sm)`, `color: var(--ink-muted)` — the same quiet tier as
  `.sort-bar` and `.archived-toggle`. `.pager span` gets
  `font-variant-numeric: tabular-nums` so the position doesn't jitter. These
  are the app's first disabled buttons, so add a scoped
  `.pager .button:disabled` (muted text, `--line` border, `cursor: default`)
  and neutralise `.button:hover` for it in the same rule — scoped here rather
  than in `index.css`'s `.button`, to keep the change in one stylesheet. Every
  value is a token; no new media query — the row wraps on its own at 360px.

Docs and e2e config

- `.env.example` — `# PAGE_SIZE=7` beside `# PORT=3001`, with a one-line
  comment in the file's existing voice (how many applications a page of the
  list shows; unset means 7).
- `README.md` — "Running the server": add `PAGE_SIZE` as an optional var with
  the default, that the list is paged by it, and that changing it needs a
  server restart only — no rebuild.
- `CLAUDE.md` — Architecture: the component count (eleven → twelve) and
  `Pagination` beside `ArchivedToggle` "at the foot of its list"; a
  `src/lib/paging.ts` mention with the other `src/lib` helpers; `config.ts` in
  both the `server/routes/` and `server/lib/` bullets; the `applications.css`
  ownership line gains the pager.
- `playwright.config.ts` and `playwright.prod.config.ts` — `PAGE_SIZE: '3'` in
  the API `webServer` env, with a comment saying it's there so the e2e specs
  can page a small list. Safe for the existing specs: the default sort is
  newest-created-first, and each spec asserts on the row it just added, which
  is always on page 1.

## Work order

1. `server/lib/config.ts` + `server/lib/config.test.ts`.
2. `server/routes/config.ts` + `server/routes/config.test.ts`; `AppConfig` in
   `server/types.ts`; wire the router and the option in `server/app.ts`; read
   the env in `server/index.ts`.
3. `AppConfig` in `src/types.ts` and `getConfig` in `src/lib/api.ts`.
4. `src/lib/paging.ts` + `src/lib/paging.test.ts`.
5. `src/components/Pagination.tsx` + `Pagination.test.tsx`.
6. Wire `ApplicationsView`: load the config, hold `page`, slice, reset on
   sort/archived/add, render the pager.
7. The pager's rules in `src/applications.css`.
8. Update `ApplicationsView.test.tsx` (see Tests).
9. `e2e/pagination.spec.ts`, plus `PAGE_SIZE` in both Playwright configs.
10. `.env.example`, `README.md`, `CLAUDE.md`.
11. `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`.

## Tests

New

- `server/lib/config.test.ts` — unset → 7; `'12'` → 12; throws on `'0'`,
  `'-3'`, `'abc'`, `'2.5'`, `''`.
- `server/routes/config.test.ts` — `GET /api/config` returns the `pageSize`
  `createApp` was given (pass a non-default, e.g. 3, so the assertion can't
  pass by accident); no session → 401.
- `src/lib/paging.test.ts` — slices page 1 and page 2; a partial last page; an
  exact multiple leaves no empty trailing page; a too-high `page` clamps to the
  last page and reports it; `page` below 1 clamps up; `[]` → one empty page;
  `pageSize: null` → every item on page 1 of 1.
- `src/components/Pagination.test.tsx` — renders nothing at `pageCount` 1;
  names the position "Page 2 of 4"; Previous disabled on page 1, Next disabled
  on the last page; each click reports `page ± 1`. Query by role and name.
- `e2e/pagination.spec.ts` — log in, add four applications, then: exactly three
  rows on page 1, position reads `Page 1 of \d+`, Previous is disabled, Next
  moves to `Page 2 of \d+` and enables Previous, Previous comes back. Counts
  stay loose about the total, like `archive.spec.ts` — the specs share one
  database.

Updated

- `src/components/ApplicationsView.test.tsx` — the blanket `fetch` stubs now
  have to answer `/api/config` as well as `/api/applications`; replace them
  with one `stubFetch(applications, { pageSize })` helper that routes by URL
  (and keeps the existing POST/PUT/401 behaviours the individual tests need).
  Then add: a list longer than the page size renders only one page's rows and
  Next reveals the rest; everything fitting on one page renders no pager;
  changing the sort returns to page 1; toggling archived returns to page 1 and
  the toggle still counts every archived application; adding an application
  returns to page 1.
- `e2e/*.spec.ts` — no assertion changes expected (each spec works on the row
  it just added, which sorts to page 1), but re-read them once `PAGE_SIZE=3` is
  in the config and fix anything that assumed a longer page.

Verification command: `npm test` (the gate), with `npm run lint`,
`npm run build` and `npm run test:e2e` alongside it.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
