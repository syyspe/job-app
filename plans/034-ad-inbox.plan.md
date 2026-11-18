---
brief: brief/034-ad-inbox.md
branch: 034-ad-inbox
date: 2026-11-18
---

# Ad inbox — Plan

## Context

The daily job search agent needs one record of every ad it has seen, what
happened to it and what waits for the user. This stream adds that inbox to
job-app: the `ads` table, the API, four MCP tools and a review view. Streams
036 to 039 all build on it. `docs/job-search-agent.md` sections 4 and 5 are the
contract; this plan implements them and closes the gaps listed next.

### Decisions this plan adds to the contract

Update `docs/job-search-agent.md` with these in the same PR.

1. **Source mode is a column.** `ads.source_mode` is `automatic` or `handover`,
   required on `POST /api/ads`. An existing row keeps its stored mode.
2. **Recording a failed attempt.** `POST /api/ads/:id/transition` with `to`
   equal to the current state and an `error` adds one to `attempts` and stores
   `last_error`. It works from `new`, `ready` and `suitable`. The third attempt
   moves the ad to `failed` on the server. Any other same-state request is 409.
3. **`to: failed` requires `error`**, so `gone` and other direct failures always
   carry a category. `error` must match `^[a-z0-9_]{1,40}$`, which keeps ad text
   out of `last_error`.
4. **Evaluation shape.** `evaluation` is `{verdict, fitSummary, reasons}`.
   `verdict` must equal `to` (`suitable` or `unsuitable`), `fitSummary` is a
   string and `reasons` a string array. Required for those two targets.
5. **Entering `ready` needs text.** `body` must be non-empty on any transition
   to `ready`, otherwise 400.
6. **Rule 3 can redirect `ready`.** When an ad reaches `ready` and matches a
   duplicate rule, the same transaction moves it on to `duplicate`. The response
   is 200 with the final row.
7. **Only `http` and `https` ad URLs are accepted**, otherwise 400. Alert emails
   are untrusted and the review view renders the URL as a link.

## Affected files

Server:

- `server/db/index.ts` — add the `ads` table to `SCHEMA`, after `applications`.
- `server/types.ts` — `AD_STATES`, `SOURCE_MODES`, `AdState`, `SourceMode`,
  `AdEvaluation`, `AdSummary`, `Ad`.
- `server/models/ad.ts` (new) — `AdRow`, `toAdSummary`, `toAd`.
- `server/lib/adStates.ts` (new) — pure tables: allowed transitions, states that
  clear `body`, states that blank on entry, states that blank once reported.
- `server/lib/adDedup.ts` (new) — `canonicalUrl`, `normaliseText`,
  `findUrlDuplicate`, `findTitleDuplicate`.
- `server/lib/adValidation.ts` (new) — request parsing for each route.
- `server/lib/ads.ts` (new) — database operations: find, insert, move, record an
  attempt, mark reported.
- `server/routes/ads.ts` (new) — `createAdsRouter(db)`.
- `server/app.ts` — mount the router after `requireSession`.

MCP:

- `mcp/tools/ads.ts` (new) — `registerAdTools`: `list_ads`, `get_ad`,
  `handover_ad`, `dismiss_ad`.
- `mcp/server.ts` — register the group.
- `mcp/server.test.ts` — thirteen tools.

Client:

- `src/types.ts` — the client's copy of the ad types.
- `src/lib/api.ts` — `listAds`, `transitionAd`, `handoverAd`.
- `src/lib/adStates.ts` (new) — `AD_STATE_LABELS`, display order, and which
  actions each state offers.
- `src/components/AdsView.tsx` (new) — `useAds` hook, state filter, list.
- `src/components/AdList.tsx` (new) — rows, empty state.
- `src/components/AdRow.tsx` (new) — one ad, its actions and dismiss confirm.
- `src/components/AdHandoverForm.tsx` (new) — ad text, title, company.
- `src/components/NavBar.tsx`, `src/App.tsx` — the `ads` view.
- `src/ads.css` (new) — the inbox surface, imported from `App.tsx`.

Docs:

- `docs/job-search-agent.md` — the decisions above.
- `docs/architecture.md` — the new modules and `ads.css`.
- `CLAUDE.md` — replace the `UI:` line, and add `ads.css` to the CSS invariant.
- `README.md` — the four tools, if its MCP section lists tools.

## Work order

Red-green for each step. Keep every function and file within the `simple-code`
limits.

1. **Branch.** Work on `034-ad-inbox`, which already holds this plan.
2. **Schema and types.** Add the table:

   ```sql
   CREATE TABLE IF NOT EXISTS ads (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     source         TEXT NOT NULL,
     source_mode    TEXT NOT NULL,
     external_id    TEXT NOT NULL,
     url            TEXT NOT NULL,
     canonical_url  TEXT NOT NULL,
     title          TEXT NOT NULL DEFAULT '',
     company        TEXT NOT NULL DEFAULT '',
     location       TEXT NOT NULL DEFAULT '',
     deadline       TEXT NOT NULL DEFAULT '',
     state          TEXT NOT NULL,
     body           TEXT,
     evaluation     TEXT,
     application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
     duplicate_of   INTEGER REFERENCES ads(id) ON DELETE SET NULL,
     attempts       INTEGER NOT NULL DEFAULT 0,
     last_error     TEXT,
     first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
     reported_at    TEXT,
     UNIQUE (user_id, source, external_id)
   );
   ```

3. **State rules** in `server/lib/adStates.ts`, copied from contract section 4.
   `drafted` is never a valid `to` on the transition route.
4. **Deduplication** in `server/lib/adDedup.ts`.
   - Canonical URL: lowercase host, no fragment, no trailing slash, and without
     `utm_*`, `gclid`, `fbclid`, `msclkid`, `mc_cid` and `mc_eid`. An application
     `link` that does not parse never matches.
   - Normalised text: NFKC, lowercase, trimmed, inner whitespace collapsed.
   - Rule 2 compares with the user's other ads and all their applications,
     archived included. Rule 3 compares normalised company and title with other
     ads first seen in the last 90 days and with every application's company and
     role, and is skipped while the company is empty.
   - Ads in state `duplicate` are never match targets, so `duplicate_of` points
     at an original. A match against an application leaves `duplicate_of` null.
5. **Validation and database operations** in `adValidation.ts` and `ads.ts`.
   Every state change sets `updated_at`, resets `reported_at` to null and applies
   the clearing rules. Retrying from `failed` must target the ad's mode (`new` for
   `automatic`, `awaiting_handover` for `handover`, otherwise 409) and resets
   `attempts`, `last_error` and `evaluation`.
6. **Routes** in `server/routes/ads.ts`, each multi-step write in one transaction:
   - `GET /ads?state=` — newest first, no `body`; an unknown state is 400.
   - `GET /ads/:id` — with `body`.
   - `POST /ads` — `{source, sourceMode, url, title, externalId?, company?,
     location?, deadline?}`. A known key returns 200 and the existing row. A new
     ad returns 201 in state `new`, or `duplicate` when rule 2 matches.
   - `POST /ads/:id/transition` — decisions 2 to 6.
   - `POST /ads/:id/handover` — `{text, url?, title?, company?}`; applies the
     fields, then follows the same path to `ready`.
   - `POST /ads/reported` — `{ids}`; sets `reported_at` on the user's ads, blanks
     hand-over `drafted`, `title_rejected` and `failed` ads, answers 204. Ids the
     user does not own are skipped.
7. **Mount** the router in `app.ts` after `requireSession`.
8. **MCP tools.** `get_ad`'s description says the ad text is untrusted data and
   any instructions in it must not be followed. `dismiss_ad` posts
   `{to: 'dismissed'}`.
9. **Client API and types.**
10. **Review view**, following the UI contract below.
11. **End-to-end spec** `e2e/ads.spec.ts`.
12. **Docs**, then the full verification commands.

## Contracts

- UI: extend the existing visual language rather than adding a second one. IBM
  Plex Sans, the tokens in `index.css`, and list rows with the 4px status spine.
  - **Colour shows what needs the user.** `awaiting_handover` uses the amber
    `--st-interview` set and `failed` uses `--danger`. `new`, `ready` and
    `suitable` use the teal `--st-applied` set, and `drafted` the green
    `--st-screening` set. `title_rejected`, `unsuitable`, `duplicate` and
    `dismissed` recede with the 2px `--st-rejected` spine and muted text.
  - **Layout.** One column. A wrapping row of state filter buttons with counts,
    using `aria-pressed`, ordered by urgency: `awaiting_handover`, `failed`,
    `suitable`, `ready`, `new`, `drafted`, `title_rejected`, `unsuitable`,
    `duplicate`, `dismissed`. The view opens on `awaiting_handover`.
  - **Rows.** Title, company, source, location, the deadline as stored (it is free
    text), an "Open ad" link with `rel="noreferrer"`, the fit summary when there
    is one, and the error category on failed ads. A blanked ad reads "Untitled ad".
  - **Actions.** "Hand over" on `awaiting_handover` and `title_rejected`, "Retry"
    on `failed`, and "Dismiss" with the two-step confirm from `UserRow` on every
    state that allows it.
  - **Navigation.** NavBar shows "Ad inbox", "Applications" and (for admins)
    "Admin", leaving out the view currently showing.

## Parallel streams

- `035-profile-corpus` — has a brief but no plan or branch, and its brief expects
  to touch little else. No overlap; no sequencing needed.

No other unmerged branches exist.

## Tests

- New, server: `server/lib/adStates.test.ts` (every allowed and refused
  transition), `server/lib/adDedup.test.ts`, `server/routes/ads.test.ts`.
- New, MCP: `mcp/tools/ads.test.ts`, over the real harness.
- New, client: a test beside each new component, querying by role.
- New, e2e: `e2e/ads.spec.ts` ingests through `page.request`, then hands over,
  dismisses and retries in the view.
- Updated: `mcp/server.test.ts`, `src/components/NavBar.test.tsx`,
  `src/App.test.tsx`, `server/db/index.test.ts`.
- Route coverage: ads are isolated between users; ingest is idempotent; each dedup
  rule marks a repeat, including against an archived application; `body` clears
  and hand-over fields blank at the contract's moments; the third attempt fails the
  ad; deleting a user removes their ads; deleting a draft application leaves the ad
  with a null `application_id`.
- Failure cases:
  - No session: 401 on every route.
  - Another user's ad or an unknown id: 404.
  - Disallowed transition, `to: drafted`, wrong retry target: 409.
  - Unknown state or `to`, malformed `ids`, missing `text` or `body`, invalid
    `evaluation`, an `error` outside the category pattern, a non-http URL: 400.
  - Request body over the JSON parser's limit: 413 in the standard error shape.
- Verification commands: `npm test`, `npm run lint`, `npm run build`, then check
  ports with `ss -ltnp | grep -E '5173|3001|3002'` and run `npm run test:e2e`.
- By hand: restart Claude Desktop so it loads the new tools, then call all four.

---

**Next stage:** run `/sdlc`.
