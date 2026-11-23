---
brief: brief/045-inbox-hide-closed.md
branch: 045-inbox-hide-closed
date: 2026-11-23
---

# Inbox: hide closed ads — Plan

Context: dismissed and duplicate ads clutter the inbox (26 blank "Untitled ad"
Duunitori rows on 2026-11-23). This change is client-only. The inbox stops
offering or listing those two states. A blank-titled row that is still visible
gets a "<Source> ad · <date first seen>" label. `GET /api/ads`, MCP and the
agent stay as they are.

## Affected files

- `src/lib/adStates.ts`: drop `'duplicate'` and `'dismissed'` from
  `AD_STATE_ORDER`, and change its doc comment to say the two closed states
  are left out of the inbox on purpose. `AD_STATE_ORDER` is used only by
  `AdsView`, and the list only shows the selected state, so with no button the
  two states are never listed. `AD_STATE_LABELS` keeps every state, because
  its `Record<AdState, …>` type needs them all.
- `src/lib/sources.ts` (new): `SOURCE_LABELS` maps `duunitori → Duunitori`,
  `academicwork → Academic Work`, `nordea → Nordea` and
  `valtiolle → Valtiolle`. `sourceLabel(source)` returns the mapped name, or
  the slug itself when the source is unknown (e.g. `e2e` or a hand-over
  source).
- `src/lib/dates.ts`: add `formatDay(sqliteTimestamp)`, which returns just the
  date part. It uses `DATE` and parses the same way `formatTimestamp` does.
- `src/components/AdRow.tsx`: a blank title becomes
  `` `${sourceLabel(ad.source)} ad · ${formatDay(ad.firstSeenAt)}` ``.
  `AdFacts` still shows the raw slug.
- `src/ads.css`: remove the `duplicate`/`dismissed` selectors from the three
  closed-state rule groups. Those rows are no longer rendered, so the
  selectors are dead. `title_rejected` and `unsuitable` keep their styling.
- `e2e/ads.spec.ts`: the dismiss spec can no longer open a Dismissed filter.
  It asserts instead that the row is gone, that no Dismissed filter button
  exists, and that `GET /api/ads` still returns the ad as `dismissed`.

## Work order

1. `formatDay` and its tests in `src/lib/dates.test.ts`.
2. `src/lib/sources.ts` and `src/lib/sources.test.ts`.
3. `AdRow` fallback label, then update its test.
4. Trim `AD_STATE_ORDER`, then update and add the `AdsView` tests.
5. Prune the dead CSS selectors.
6. Update the e2e dismiss spec.

## Parallel streams

- `046-duunitori-terms-decision` did not pick (d), so it touches no inbox
  code and nothing overlaps; sequence: 046 waits for this stream to merge
  before it merges. Nothing here waits on 046.
- `inbox-redesign` (later, not started) will rework the same filter row.
  This plan only removes two buttons, so the redesign has nothing to undo.

## Tests

- New: `dates.test.ts`: `formatDay('2026-11-21 08:00:00')` → `21 Nov 2026`.
- New: `sources.test.ts`: a known slug maps to its name, and an unknown slug
  is returned unchanged.
- Updated: `AdRow.test.tsx`: "a blanked ad reads Untitled ad" becomes "a
  blanked ad reads its source and first-seen date", expecting
  `Duunitori ad · 1 Nov 2026` from the sample ad. "Untitled ad" must not
  appear.
- Updated: `AdsView.test.tsx`: the filter-order test loses `Duplicate 0` and
  `Dismissed 0`.
- New: `AdsView.test.tsx`: feed a dismissed ad and a duplicate ad, each with
  a distinct title. Expect no Dismissed or Duplicate button, and neither title
  in the document after clicking through every filter button.
- Updated: `e2e/ads.spec.ts`, the dismiss spec as described above.
- Failure cases: none. Nothing new can fail.
- Verification command: `npm test -- --maxWorkers=2`, `npm run lint` and
  `npm run build`. Then `npm run test:e2e:prod`, after checking port 3002 is
  free.

---

**Next stage:** run `/sdlc`.
