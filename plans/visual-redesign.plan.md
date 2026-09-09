---
brief: brief/visual-redesign.md
branch: visual-redesign
date: 2026-09-09
---

# A designed look and feel, across every surface — Plan

## Context

The app works — auth, CRUD, attachments, sorting and toasts have all landed —
but it has styling rather than design. `src/index.css` is 85 lines holding
eight colour tokens, one font, one radius and one accent; with no type scale
and no spacing scale, every rule in `App.css` invents its own number. The
result is browser defaults with a hairline border around them.

This is the last layer between the app and something pleasant to open daily,
and it is worth doing in one pass: a system decided once and applied
everywhere is what produces coherence, whereas a token added per branch is how
you end up with eight radii.

**Behaviour does not change.** Same routes, requests, state, validation and the
draft→applied rule. No new npm dependencies. The only test changes are
assertions that encode today's exact strings.

## Design direction

**The pipeline is the picture.** Status is the spine of the interface, not a
parenthetical. Three devices carry it, defined once and used everywhere:

1. **A coloured spine** on each row's leading edge, so the list's left margin
   becomes a scannable read of where everything stands.
2. **Hue walks cool → warm with progress** — slate (draft), petrol (applied),
   green (screening), amber (interview), gold (offer). Colour temperature
   encodes momentum.
3. **Closed applications recede.** `rejected` drops to a neutral spine and a
   muted company name. `offer` carries the only saturated warm colour in the
   product — the interface visibly changes temperature when you get one.

Everything else stays quiet and disciplined: one typeface, no decorative
gradients, and exactly one drop shadow in the whole app (toasts, which really
do float). Surfaces separate by a 1px line and a fill step, not by shadow.

Decisions settled here so they are not re-litigated at build time:

- **Typeface:** IBM Plex Sans (variable, OFL), self-hosted. Humanist and calm,
  strong at 13–14px, real tabular figures for the date columns.
- **Light/dark:** `prefers-color-scheme` only. No toggle — that is persisted
  state, and this is a presentational change. The two palettes are designed
  independently, not one set of values inverted.
- **Status label case:** capitalised (`Interview`, not `interview`). This is
  what makes the badge read as an element rather than a parenthetical, and it
  costs one e2e regex.
- **Radii:** two, not one — cards are rounder than the controls inside them.

## Affected files

**New**

- `public/fonts/ibm-plex-sans-latin-wght-normal.woff2` — the variable font
  (45,712 bytes). Fetch with:
  ```
  mkdir -p public/fonts && curl -fsSL -o public/fonts/ibm-plex-sans-latin-wght-normal.woff2 \
    https://cdn.jsdelivr.net/npm/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2
  ```
  Verified reachable and not gitignored. Latin subset only; weight axis 100–700.
- `src/lib/dates.ts` + `src/lib/dates.test.ts` — the two date formatters.
- `src/lib/status.ts` — `STATUS_LABELS`, the display label per `Status`.
- `src/applications.css` — the list surface (rows, spine, chip, detail,
  attachments, empty state). Split out because `index.css` + `App.css` alone
  would push `App.css` past `simple-code`'s 300-line file limit.

**Changed**

- `src/index.css` — `@font-face`, the whole token system (light + dark),
  element resets, `.button`, the global focus rule, `.visually-hidden`.
- `src/App.css` — the app frame: nav, `main`, layout grid, panels, forms, sort
  bar, toasts. Every value drawn from a token.
- `src/App.tsx` — import `./applications.css` alongside `./App.css`.
- `index.html` — `<link rel="preload">` for the font.
- `src/components/ApplicationList.tsx` — row markup and the empty state.
  Built as three functions rather than one: the `<li>` moved into a local
  `ApplicationRow` and the empty state into a local `EmptyState`, because
  keeping it inline put `ApplicationList` at 59 lines, past `simple-code`'s
  40-line function limit. Same DOM either way.
- `src/components/ApplicationDetail.tsx` — formatted timestamps.
- `src/components/ApplicationForm.tsx` — status `<option>` labels via
  `STATUS_LABELS` (values stay lowercase).
- `src/components/ApplicationsView.tsx` — wrap the add form in a titled panel.
- `src/components/LoginForm.tsx` — wrap in a centred panel.
- `CLAUDE.md` — the architecture section says "the two CSS files"; make it
  three and name what each owns. Also add a bullet for the two new `src/lib`
  display-formatting modules, which the section would otherwise omit.

**Not touched:** `src/lib/sorting.ts`, `src/lib/api.ts`,
`ApplicationSort.tsx` (restyled by CSS only — same markup, same contract),
`ToastHost.tsx`, `NavBar.tsx`, `AttachmentList.tsx`, and everything under
`server/`.

## The token system

All tokens live in `src/index.css`. Light on bare `:root`, dark redefined
under `@media (prefers-color-scheme: dark)`.

### Type and space

```
--font-sans: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
--fs-xs: 0.8125rem;   /* 13px — meta, timestamps */
--fs-sm: 0.875rem;    /* 14px — labels, secondary row line, chips */
--fs-base: 1rem;      /* 16px — body, inputs */
--fs-lg: 1.25rem;     /* 20px — nav title, panel headings */
--fs-xl: 1.5625rem;   /* 25px — reserved for the largest heading */
--lh-tight: 1.25;  --lh-body: 1.5;
--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
--s-5: 24px; --s-6: 32px; --s-7: 48px;
--r-sm: 6px;   /* controls, chips */
--r-md: 10px;  /* cards, panels */
--shadow-float: 0 6px 20px rgba(10, 20, 30, 0.18);  /* toasts only */
```

Weights: 400 body, 500 emphasis, 600 headings. A 1.25 modular scale, base 16px.

### Surface palette

| Token | Light | Dark |
|---|---|---|
| `--canvas` | `#EDF0F3` | `#10151A` |
| `--surface` | `#FFFFFF` | `#191F26` |
| `--surface-raised` | `#F7F9FA` | `#212932` |
| `--ink` | `#141A21` | `#E7ECF1` |
| `--ink-muted` | `#57626F` | `#98A5B3` |
| `--line` | `#D5DCE3` | `#2C353F` |
| `--line-strong` | `#B6C0CA` | `#3E4A57` |
| `--accent` | `#0C5A6B` | `#5FC6D9` |
| `--accent-tint` | `#DCEBEF` | `#12313A` |
| `--ok` | `#1F7A5A` | `#4FBF92` |
| `--danger` | `#B3261E` | `#F2857C` |

`body` gets `--canvas`; cards and panels get `--surface`.

### Status palette

Three tokens per status — spine, chip background, chip text. Every pair below
clears WCAG AA (all ≥ 5.3:1); keep that true if any value is adjusted.

Light:

| Status | `--st-*` (spine) | `--st-*-bg` | `--st-*-fg` |
|---|---|---|---|
| draft | `#7A8794` | `#EAEDF0` | `#46515D` |
| applied | `#0E6E80` | `#DBEEF2` | `#0A5260` |
| screening | `#1F7A5A` | `#DCEFE7` | `#175C44` |
| interview | `#8A6A10` | `#F6ECD3` | `#6B5209` |
| offer | `#C25A0C` | `#FBE7D4` | `#8F420A` |
| rejected | `#8B939C` | `#ECEEF0` | `#5A626B` |

Dark:

| Status | `--st-*` (spine) | `--st-*-bg` | `--st-*-fg` |
|---|---|---|---|
| draft | `#8C99A6` | `#232B33` | `#A9B5C1` |
| applied | `#3FB4C7` | `#10333A` | `#6FD3E2` |
| screening | `#4FBF92` | `#13332A` | `#7FDCB4` |
| interview | `#D2A93C` | `#33290F` | `#E8C86A` |
| offer | `#F08A3C` | `#3A2412` | `#F7AE72` |
| rejected | `#7E868F` | `#22272C` | `#98A0A8` |

The mapping is made once, in `applications.css`, by keying on the row's
`data-status` and assigning three local aliases the row and chip then read:

```css
.application-item[data-status='interview'] {
  --st: var(--st-interview);
  --st-bg: var(--st-interview-bg);
  --st-fg: var(--st-interview-fg);
}
```

Six such rules — no colour map in TypeScript.

## Work order

1. **Font.** Run the `curl` above; confirm the file is 45,712 bytes. Add
   `@font-face` at the top of `index.css` with `font-weight: 100 700;
   font-style: normal; font-display: swap;` and `format('woff2')` — *not*
   `woff2-variations`, which is deprecated and silently fails in some
   browsers. Add to `index.html`:
   ```html
   <link rel="preload" href="/fonts/ibm-plex-sans-latin-wght-normal.woff2"
         as="font" type="font/woff2" crossorigin />
   ```
   The `crossorigin` attribute is required even same-origin — fonts always
   fetch in CORS mode, and without it the file downloads twice.

2. **Tokens.** Replace the body of `index.css` with the system above. Keep
   `.visually-hidden` and `.button` (restyled). Keep `.button:focus-within`
   — `AttachmentList` hides a file input inside a `.button` label, so that
   rule is load-bearing, not a mistake. Add alongside it a global
   `:focus-visible` rule covering inputs, selects, textarea, radios, links and
   buttons: `outline: 2px solid var(--accent); outline-offset: 2px`. Set
   `accent-color: var(--accent)` on radios so the native controls join the
   system. Close with the reduced-motion block collapsing transition and
   animation durations.

3. **`src/lib/dates.ts`** — two pure functions, module-level formatters:
   ```ts
   const DATE = new Intl.DateTimeFormat('en-GB',
     { day: 'numeric', month: 'short', year: 'numeric' })
   const TIME = new Intl.DateTimeFormat('en-GB',
     { hour: '2-digit', minute: '2-digit' })

   export function formatDate(isoDate: string): string {
     return DATE.format(new Date(`${isoDate}T00:00:00`))
   }

   export function formatTimestamp(sqliteTimestamp: string): string {
     const at = new Date(sqliteTimestamp.replace(' ', 'T'))
     return `${DATE.format(at)}, ${TIME.format(at)}`
   }
   ```
   Two details are load-bearing. The `T00:00:00` suffix forces local-time
   parsing — `new Date('2026-03-01')` is parsed as *UTC* midnight and renders
   as 28 Feb west of Greenwich. And the locale is pinned to `'en-GB'` rather
   than left to the machine, so the tests are deterministic. Neither function
   guards against `''`: both callers already check, and `simple-code` forbids
   defending against inputs that can't occur.

4. **`src/lib/status.ts`** — `export const STATUS_LABELS: Record<Status,
   string>` mapping each value to its capitalised label. Use it for the row
   chip *and* the form's `<option>` text; the `value` attributes stay
   lowercase, which is what every existing test asserts against.

5. **Row markup** (`ApplicationList.tsx`). Keep one button per row. DOM order
   must stay company → role → status → deadline; CSS grid areas put status and
   deadline on the right without reordering the DOM:
   ```jsx
   <li className="application-item" data-status={application.status}>
     <button type="button" className="row-button"
             aria-expanded={expandedId === application.id}
             onClick={() => onToggle(application.id)}>
       <span className="row-company">{application.company}</span>
       <span className="row-role">{application.role}</span>
       <span className="row-status">{STATUS_LABELS[application.status]}</span>
       {application.deadline &&
         <span className="row-deadline">due {formatDate(application.deadline)}</span>}
     </button>
   ```
   ```css
   .row-button {
     display: grid;
     grid-template-columns: minmax(0, 1fr) auto;
     grid-template-areas: 'company status' 'role deadline';
   }
   ```
   `aria-expanded` is new and improves the row; it does not affect the
   accessible *name*, so no test is disturbed by it.

6. **Row states** — four visibly different, per the brief. Draw the spine as
   an absolutely-positioned `::before` on a `position: relative` card, not as
   `border-left`, so width changes don't reflow the text:
   - *resting* — `--surface` fill, 1px `--line`, spine 4px at `--st`
   - *hover* — `--surface-raised` fill, `--line-strong` border
   - *focus* — accent outline, `outline-offset: -2px` so the card doesn't clip it
   - *expanded* — `--surface-raised`, `--line-strong`, spine 6px, and a
     hairline divider between the row button and the detail below

   `rejected` recedes via a 2px neutral spine and a `--ink-muted` company
   name — **not** `opacity`, which would drop the row below AA.

7. **Empty state** — replace `<p>No applications yet.</p>` with a titled block:
   "Nothing tracked yet" over "Add your first application with the form."
   Active voice, and it points at the thing to do.

8. **The frame** (`App.css`). Nav on `--surface` with a bottom hairline, title
   at `--fs-lg`/600 (text stays exactly "Job applications" — a smoke test
   matches it). `main` keeps `max-width: 1120px`. Keep the 900px breakpoint
   and the `320px | 1fr` grid exactly as they are — `e2e/layout.spec.ts`
   asserts side-by-side above it and stacked below.

9. **Panels and forms.** Add form wrapped in `ApplicationsView` as
   `<section className="panel"><h2>Add an application</h2>…` — the heading
   text differs from the "Add application" button, so `getByRole('button')`
   stays unambiguous. Login form wrapped in a centred `.login-panel`
   (max-width ~380px, `margin: 0 auto`), no heading: the nav's `h1` already
   names the app, and an `<h2>Log in</h2>` above a "Log in" button is
   redundant copy. Labels at `--fs-sm`/500/`--ink-muted`; inputs full-width
   with `--r-sm`, 1px `--line`, `--surface` fill. The edit form keeps no
   heading — it sits inside the row it belongs to.

10. **Sort bar.** CSS only: a toolbar band above the list, native select and
    native radios kept visible and coloured via `accent-color`. No segmented
    control — hiding the radios to restyle them would need `:has()` gymnastics
    to get the focus ring back, and the brief asks for the same contract, not
    a new one.

11. **Timestamps** (`ApplicationDetail.tsx`) — two sibling `<span>`s inside
    `.timestamps`, separated by flex gap rather than the current `·`:
    `<span>Created {formatTimestamp(…)}</span>` and the same for Updated.

12. **Toasts and attachments** — restyle from tokens. Toasts keep the
    left-border device, gain `--shadow-float`, and take their accent from
    `--ok` / `--danger`. Attachment rows get the list's line treatment.

13. **`CLAUDE.md`** — update the architecture bullet to name three CSS files
    and what each owns.

## Tests

- **New** `src/lib/dates.test.ts` — `formatDate('2026-03-01')` is
  `'1 Mar 2026'` (and specifically not `28 Feb`, which is the bug the
  `T00:00:00` suffix prevents); `formatTimestamp('2026-01-15 09:00:00')` is
  `'15 Jan 2026, 09:00'`.
- **New** in `ApplicationList.test.tsx` — the row exposes `aria-expanded`
  matching `expandedId`; the empty state renders its guidance.
- **Updated** `ApplicationList.test.tsx:67` — `/Globex.*due 2026-03-01/`
  becomes `/Globex.*due 1 Mar 2026/`. Line 69's `/^Acme/` and its
  `.not.toMatch(/due/)` still hold under the new markup.
- **Updated** `ApplicationDetail.test.tsx:84` — the single
  `'Created … · Updated …'` string becomes two `getByText` assertions,
  `'Created 15 Jan 2026, 09:00'` and `'Updated 16 Jan 2026, 10:30'`.
- **Updated** `e2e/applications.spec.ts:26` — `/interview/` becomes
  `/Interview/`. Playwright's name matching is case-sensitive.
- **Unchanged and must stay passing:** `ApplicationDetail.test.tsx:40` (button
  text and order), `:56` (Save and Delete share `.form-actions` as their
  direct parent), every `ApplicationForm.test.tsx` assertion (all query by
  `value`, not option label), and `e2e/layout.spec.ts`'s bounding-box checks.

**Verification command:** `npm test`, then `npm run lint` and `npm run build`,
then `npm run test:e2e`.

Healthy output is `Test Files N passed / Tests N passed` with no `failed`
line, and `N passed` from Playwright.

**Manual pass** — `npm run dev` plus `npm run dev:server` in a second
terminal, against a seeded database:

- Both themes via DevTools' `prefers-color-scheme` emulation, with a row in
  every one of the six statuses.
- Tab through login, nav, add form, sort bar, a row, an expanded row and the
  attachment controls — every stop shows a visible ring.
- Drag the window across 900px; confirm the two columns stack and nothing
  overflows horizontally.

## Risks / rollback

- **The font download can fail** (no network in the build session, or a moved
  CDN path). The fallback stack renders the app correctly meanwhile, so this
  degrades rather than blocks — but don't paper over it: if the fetch fails,
  stop and say so rather than shipping a `@font-face` pointing at a missing
  file.
- **A binary lands in the repo.** 45KB, OFL-licensed, and the first one here.
  Reverting is `git rm public/fonts/…` plus the `@font-face` and preload.
- Everything else is CSS and markup on a branch — `git checkout` undoes it.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
