---
brief: brief/action-buttons.md
branch: action-buttons
date: 2026-09-22
---

# Detail-panel action layout + a unified button scheme — Plan

## Context

`brief/action-buttons.md` puts three problems on one surface: `Archive` lives
in the collapsed row head as a bespoke control (`.row-archive`) while the
other two application actions live in the detail panel; `.form-actions` is
`align-self: flex-start`, so `Delete application` sits beside `Save` instead
of on the panel's right edge where the `Remove file` buttons above it sit;
and the button scheme was left half-designed by `brief/nav-and-buttons.md`
(2026-09-04), which shipped `.button-primary` and put the rest out of scope.
What's left is a ~1.5% hover step, a `.button-danger:hover` that repeats the
rule above it, no `:active` anywhere, and the app's two most destructive
actions styled as plain buttons.

Decisions taken during planning (the brief's open questions):

1. **Archive-from-detail may vanish the row.** With "Show archived" off, the
   row and its open panel unmount together. Accepted as-is — `handleDelete`
   already makes a row disappear the same way. **No change to
   `handleSetArchived`** (`ApplicationsView.tsx:73`).
2. **Archive takes the ordinary tier.** The tier set is exactly three:
   primary, ordinary, danger. `.row-archive`'s low-emphasis role goes away
   with `.row-archive`, so no tier is left without a call site.
3. **Hover tints, press fills.** Each tier gets a three-step ramp in its own
   colour, extending the `--accent` / `--accent-tint` pairing the palette
   already uses.
4. **The right edge belongs to the button, not the `actions` prop.**
   `ApplicationForm`'s `actions` stays `ReactNode` and learns nothing; a
   placement class from `App.css` pushes `Delete application` to the edge.
5. **`.row-button` and `.toast-dismiss` are not tiered buttons.** One is the
   row surface itself, the other an inline dismiss `×`. Both stay as they
   are; the brief puts `.row-button` out of scope.

## The tier scheme

| Tier | Classes | Means | Call sites |
|---|---|---|---|
| Primary | `button button-primary` | The one submit per form | `Save`, `Add application`, `Log in`, `Create user`, `Save` (password reset) |
| Ordinary | `button` | Reversible, routine | `Attach a file`, `Archive`/`Unarchive`, `Cancel` (×2), `Reset password`, `Delete` (opens the confirm), `Admin`/`Applications`, `Log out` |
| Danger | `button button-danger` | The click that destroys | `Delete application`, `Remove file`, `Confirm delete` |

Every existing call site already matches this except the two the brief names:
`Delete application` and `Remove file` move from ordinary to danger. **No
other component's classes change** — `NavBar`, `LoginForm`, `UserForm` and
`UserRow` are already correct under this scheme, so don't touch them.

States, for all three tiers:

```
            rest           hover            press (:active)
ordinary    --surface      --surface-hover  --surface-press
primary     --accent-tint  --accent FILL    --accent-press FILL
danger      --surface      --danger-tint    --danger FILL
```

Filled states take `color: var(--surface)`. Each state rule sets
`background`, `color` and `border-color` explicitly, and the modifier rules
stay *after* the base rules in the file — `.button:active` and
`.button-primary:hover` have equal specificity, so source order is what
decides a pressed primary.

## Affected files

- `src/index.css` — four new token pairs, in both the `:root` and the
  `@media (prefers-color-scheme: dark)` blocks, placed beside the tokens they
  extend (`--surface-*` after `--surface-raised`, `--accent-press` after
  `--accent-tint`, `--danger-tint` after `--danger`):

  | Token | Light | Dark |
  |---|---|---|
  | `--surface-hover` | `#e7ecf0` | `#2b343e` |
  | `--surface-press` | `#d8dfe5` | `#3a4653` |
  | `--accent-press` | `#073f4b` | `#9adceb` |
  | `--danger-tint` | `#f8e0de` | `#3b1f1d` |

  Then the tier rules: add `color` to `.button`'s `transition` list; repoint
  `.button:hover` at `--surface-hover` and add `.button:active`; add
  `.button-primary:hover` (fill) and `.button-primary:active`; **replace**
  the dead `.button-danger:hover` (which re-set a `border-color` the rule
  above already sets) with the tint, and add `.button-danger:active` (fill).
  Leave the `.button:focus-within` block alone — `AttachmentList`'s hidden
  file input depends on it, and the comment above it says so.
- `src/App.css` — `.form-actions` drops `align-self: flex-start` (so the row
  spans the form) and gains `flex-wrap: wrap`; add
  `.form-actions .action-end { margin-left: auto }`. `.action-end` is
  placement, not a tier — it says "this button sits on the form's right
  edge", which is the same edge `.attachment-item`'s `space-between` aligns
  to, without either rule knowing about the other.
- `src/applications.css` — delete `.row-archive`, `.row-archive:hover`,
  `.row-head`, `.row-head .row-button`, and the comment at the top of that
  group explaining why the two controls sit side by side. It stops being
  true: the row head has one child again.
- `src/components/ApplicationList.tsx` — delete the archive `<button>` and
  the `<div className="row-head">` wrapper around it, so `.row-button`
  becomes the `<li>`'s direct child (it already has `width: 100%`). Pass
  `onSetArchived` straight down to `<ApplicationDetail>`. `ApplicationRow`'s
  and `ApplicationList`'s props are otherwise unchanged — `onSetArchived`
  already exists at both levels and keeps its signature.
- `src/components/ApplicationDetail.tsx` — new prop
  `onSetArchived: (archived: boolean) => void`. `actions` becomes a fragment
  of two buttons, in this order:

  ```tsx
  actions={
    <>
      <button
        type="button"
        className="button"
        onClick={() => onSetArchived(!application.archived)}
      >
        {application.archived ? 'Unarchive' : 'Archive'}
      </button>
      <button
        type="button"
        className="button button-danger action-end"
        onClick={onDelete}
      >
        Delete application
      </button>
    </>
  }
  ```

  The label and the `!archived` flip move here verbatim from
  `ApplicationList` — same strings, same logic, new home.
- `src/components/AttachmentList.tsx` — `Remove file` becomes
  `className="button button-danger"`. Nothing else changes; `Attach a file`
  stays an ordinary `<label className="button">`.

`ApplicationForm.tsx`, `ApplicationsView.tsx` and `src/lib/*` are not
touched.

## Work order

1. `src/index.css`: tokens first, then the tier rules. Self-contained — check
   it against any existing button before moving on.
2. `src/App.css`: `.form-actions` + `.action-end`.
3. `src/components/ApplicationDetail.tsx`: the new prop and the two-button
   `actions` fragment.
4. `src/components/ApplicationList.tsx`: remove the archive button and the
   `.row-head` wrapper; thread `onSetArchived` to the detail.
5. `src/applications.css`: delete the now-unused rules and their comment.
6. `src/components/AttachmentList.tsx`: the one-class change.
7. Tests, per the list below.
8. `npm test`, `npm run lint`, `npm run build`, then `npm run test:e2e`.

## Tests

No test in the repo asserts on a class name (`toHaveClass`/`className`/
`classList` appear in none of them), so the whole styling half of this change
breaks nothing. Everything below follows from Archive moving into the panel.

- **Updated: `src/components/ApplicationDetail.test.tsx`** — all four existing
  renders need the new `onSetArchived={vi.fn()}` prop. The order assertion at
  line 29 becomes
  `['Remove file', 'Save', 'Archive', 'Delete application']`, and its name
  should say so. The parent-element test at line 44 still holds — `Save`,
  `Archive` and `Delete application` are all direct children of
  `.form-actions`, because a fragment adds no element.
- **New: `src/components/ApplicationDetail.test.tsx`** — clicking `Archive`
  calls `onSetArchived(true)`; with `archived: true` the button reads
  `Unarchive` and calls `onSetArchived(false)`. This is where the label/flip
  logic now lives, so this is where it gets covered.
- **Updated: `src/components/ApplicationList.test.tsx`** — the three tests
  from line 167 (`a row offers Archive…`, `clicking the archive button
  reports the opposite of the row flag`, and the `data-archived` test, which
  needs no change) currently render with `expandedId={null}`, where no
  Archive button exists at all. `expandedId` holds a single id, so the two
  tests that need *both* rows' archive controls can't see them at once:
  render with `expandedId={1}` for the active row and `rerender` with
  `expandedId={2}` for the archived one. The brief's list of tests to update
  missed this file — it is the one that needs real restructuring, not just an
  extra click.
- **Updated: `src/components/ApplicationsView.test.tsx:172`** — expand the row
  before clicking Archive: `await user.click(screen.getByRole('button', {
  name: /Acme/ }))`, then click `Archive`. The `fetch` assertion is unchanged.
- **Updated: `e2e/archive.spec.ts:16`** — click `row` to expand before the
  archive click. The unarchive click on line 23 needs *no* expand: because
  `handleSetArchived` leaves `expandedId` alone (decision 1), the row that
  `showArchived` brings back is still expanded, and a click there would
  collapse it. The assertion on line 24 (`Archive` is back) only holds while
  the panel is open — after an unarchive the panel stays open, so it passes
  as written.
- Verification command: `npm test` — expect
  `Test Files N passed / Tests N passed` with no `failed` line. Then
  `npm run lint` clean and `npm run test:e2e` → `N passed`.

## Manual check (both palettes)

The point of the change is visual, and no test covers colour. Run
`npm run dev` + `npm run dev:server`, expand an application, and check in
light and dark (OS appearance toggle):

- `Save` — `Archive` — gap — `Delete application`, with `Delete application`
  flush with the `Remove file` buttons above it.
- Hover and press are each plainly visible on all three tiers.
- Tab to every button: the focus ring still lands, including on
  `Attach a file` (the `:focus-within` case).

Contrast, for the record — filled states carry their label at ≥6.5:1 in both
palettes (white on `--accent` 7.8:1, on `--accent-press` 11.4:1, on
`--danger` 6.6:1; dark ink on `--accent` 8.5:1, on `--accent-press` 10.9:1,
on `--danger` 6.7:1), and the danger tint carries `--danger` text at 5.2:1
light / 6.0:1 dark. All above AA for normal text.

Motion needs no new rule: the `prefers-reduced-motion` block in `index.css`
is a `*` selector, so the added `color` transition is already inside it.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
