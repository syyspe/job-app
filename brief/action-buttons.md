---
slug: action-buttons
date: 2026-09-22
---

# Detail-panel action layout + a unified button scheme

## Problem

Three things, one surface.

**Archive sits apart from every other action.** `Archive`/`Unarchive` lives in
the collapsed row head (`ApplicationList.tsx:58`), styled by `.row-archive`
(`applications.css:122`) — a bespoke control outside the `.button` system. The
detail panel's own actions are `Save` and `Delete application`, so the three
things you can do to an application are split across two places and two visual
languages.

**Two right edges in one column.** `.form-actions` is `align-self: flex-start`
(`App.css:92`), so `Delete application` sits immediately right of `Save`. The
`Remove file` buttons directly above it are pushed to the panel's right edge by
`.attachment-item`'s `justify-content: space-between`. Same column, same
width, two different alignments — and a destructive action reading as if it
were as routine as `Save`.

**The button scheme is half-designed, and it is documented as such.**
`brief/nav-and-buttons.md` (2026-09-04) deliberately designed `.button-primary`
and put "redesigning `.button` (secondary/default) styling" explicitly out of
scope. It never came back. What's left:

- `.button:hover` (`index.css:166`) swaps `--surface` (`#fff`) for
  `--surface-raised` (`#f7f9fa`) — about a 1.5% luminance step, effectively no
  feedback at all.
- `.button-danger:hover` (`index.css:185`) sets `border-color: var(--danger)`,
  which `.button-danger` already sets one rule above. A dead rule: danger
  buttons have no hover state of their own.
- The danger tier is used in admin (`UserRow.tsx:75`) but not for the two most
  destructive actions in the app — `Delete application`
  (`ApplicationDetail.tsx:39`) and `Remove file` (`AttachmentList.tsx:34`) are
  both plain `.button`.
- No `:active` state anywhere, so nothing confirms a press.

Worth fixing now because the layout change touches exactly these buttons: doing
the move without the scheme would mean placing three buttons side by side whose
relative weight is undefined.

## What done looks like

1. `Archive`/`Unarchive` renders inside the detail panel's `.form-actions`,
   between `Save` and `Delete application`, using the shared button system.
   `.row-archive` and its rules are gone; the row head holds only the expand
   button.
2. `Delete application` is right-aligned, flush with the right edge of the
   `Remove file` buttons above it, in both the light and dark palettes.
3. Reading left to right, the action row is `Save` — `Archive` — gap —
   `Delete application`.
4. Every button in the app belongs to one named tier, and a tier is chosen by
   what the action does, not by which screen it's on. The tier set and the
   assignment for each existing button is decided at plan stage; today's
   `.button` / `.button-primary` / `.button-danger` / `.row-archive` /
   `.row-button` is the starting point, not the target.
5. Each tier has a hover and an `:active` state that is plainly visible in both
   light and dark mode — not a near-neutral background swap.
6. `Delete application` and `Remove file` carry the destructive tier, matching
   `UserRow`'s delete confirm.
7. `.button-danger:hover` is no longer a no-op.
8. Every colour used comes from a token in `index.css`. New tokens are allowed;
   literal hex values in `App.css`, `applications.css` or `admin.css` are not.
9. The focus ring still works on every button, including the
   `.button:focus-within` case that `AttachmentList`'s hidden file input
   depends on (`index.css:189` calls this out as load-bearing).
10. Hover and press transitions stay inside the existing
    `prefers-reduced-motion` guard.
11. Tests that click `Archive` from the collapsed row are updated to expand the
    row first: `ApplicationsView.test.tsx:172` and `e2e/archive.spec.ts:16,23`.
12. `npm test`, `npm run lint` and `npm run test:e2e` all pass.

## Approach

- **Layout.** `.form-actions` becomes full-width (drop `align-self:
  flex-start`) and `Delete application` gets `margin-left: auto`. That puts it
  on the form's right edge, which is the same edge `.attachment-item` aligns
  to, without either rule knowing about the other.
- **Passing Archive down.** `ApplicationDetail` already takes an `actions` prop
  that `ApplicationForm` renders after the submit button. Archive reaches the
  detail the same way Delete does — a callback prop threaded from
  `ApplicationList`'s `onSetArchived`, which already exists. No new state and
  no new plumbing above `ApplicationRow`.
- **Tiers.** Name the tiers and assign every call site, so "which button is
  this" is answered by the tier, not by the component. The scheme should
  distinguish at least: the one submit action per form, ordinary actions,
  destructive actions, and low-emphasis actions that shouldn't compete with
  the row content (today's `.row-archive` fills that last role).
- **Hover.** The fix is contrast, not decoration: a hover step has to be
  readable at a glance in both palettes, which the current `#fff` → `#f7f9fa`
  is not. `:active` gets its own treatment so a press is confirmed.
- **Tokens.** The palette already pairs a colour with a tint for the accent
  (`--accent` / `--accent-tint`) and with a bg/fg pair for every status
  (`--st-*`, `--st-*-bg`, `--st-*-fg`). `--danger` has no partner. Extending
  that existing pattern is preferred over inventing a parallel one; exact
  values are a plan/build decision, and the requirement is a visible step in
  both palettes, not a specific hex.
- Rejected: putting `Delete application` behind a confirm cluster like
  `UserRow`'s. It's a real improvement and it isn't this change — noted below.

## Out of scope

- Confirmation, undo, or a toast-with-undo for delete or archive. The confirm
  cluster in `admin.css` stays where it is.
- Any change to the status colours, the type scale, the spacing scale or the
  layout grid.
- Nav, login and admin *layout* — those surfaces' buttons are re-tiered, but
  nothing moves.
- New dependencies, including any icon set. Buttons stay text.
- The row head's expand button (`.row-button`) as an interaction — it keeps its
  current behaviour and its grid; only the space Archive vacates changes.

## Open questions

- Archiving is one click from the list today. Moving it into the detail makes
  it expand-then-click, and when "Show archived" is off, archiving from inside
  the detail makes the row disappear out from under the pointer with the panel
  open. Accept that, or does archive-from-detail need to collapse the row
  first? The move is what was asked for; this records the consequence.
- Which tier does `Archive` take — an ordinary action alongside `Save`, or a
  low-emphasis one? It's reversible and non-destructive, which argues for
  ordinary, but it sits next to the form's submit.
- Does the row head need anything in the space Archive leaves, or does the
  expand button simply take the full width?
- `ApplicationForm`'s `actions` prop currently takes a single node. With two
  buttons plus alignment, does the right edge belong to the prop's contents or
  to `.form-actions` itself?

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/action-buttons.plan.md` before writing any
code.
