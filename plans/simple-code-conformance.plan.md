---
brief: brief/simple-code-conformance.md
branch: simple-code-conformance
date: 2026-09-23
---

# Bring the codebase within simple-code limits, enforced by oxlint — Plan

## Audit (done in planning, oxlint 1.81.0)

The five rules were run with the exact config below (length rules with
`skipBlankLines`/`skipComments`) over `src/ server/ mcp/ e2e/`. All options
are supported, and `overrides` with `files` globs work.

| Rule | Violations |
|---|---|
| `max-lines` 300 | none |
| `max-depth` 2 | none |
| `complexity` 10 | none |
| `max-params` 3 | `server/middleware/errors.ts:4` `jsonErrorHandler` (4). This is the Express error-middleware arity, so it gets the scoped override rather than a code change |
| `max-lines-per-function` 40 | 11 source functions (below), plus `server/routes/applications.test.ts:38` (52), which the test-file override exempts |

Source functions over 40 lines when blank lines and comments are skipped:

| Function | Lines |
|---|---|
| `src/components/ApplicationForm.tsx:47` `ApplicationForm` | 87 |
| `src/components/ApplicationsView.tsx:24` `useApplications` | 82 |
| `src/components/ApplicationsView.tsx:122` `ApplicationsView` | 76 |
| `mcp/lib/client.ts:42` `createApiClient` | 72 |
| `src/components/AdminView.tsx:15` `useUsers` | 50 |
| `src/components/UserForm.tsx:13` `UserForm` | 48 |
| `src/components/ApplicationDetail.tsx:27` `ApplicationDetail` | 44 |
| `src/components/ApplicationList.tsx:39` `ApplicationRow` | 44 |
| `src/App.tsx:14` `App` | 43 |
| `src/components/AttachmentList.tsx:11` `AttachmentList` | 41 |

(`useApplications` and `ApplicationsView` are both in `ApplicationsView.tsx`,
which makes 11 functions in 10 rows.)

Open questions from the brief:
- **The 13th function.** The brief's raw count included `UserRow` (41) and
  `migrateApplicationsToUser` (41). Both come in under 40 once blank lines and
  comments are skipped, so they need no change. The brief's header count of 13
  most likely included the test callback at `applications.test.ts:38`, which
  is exempt.
- **oxlint options.** Every option this needs is available in the installed
  version. Override `files` globs resolve relative to the config file, and
  `.oxlintrc.json` sits at the repo root.

To re-run the audit at any time, run `npm run lint` once commit 3 lands.

## Affected files

- `src/lib/apiAction.ts` (new): `useApiAction(onUnauthorized)`, the `run`
  callback that `useApplications` and `useUsers` currently duplicate word for
  word. It shows the success toast, and on `UnauthorizedError` it shows the
  session-expired toast and calls `onUnauthorized`; any other error shows its
  message. Returns `run`.
- `src/components/ApplicationsView.tsx`: split `useApplications` and
  `ApplicationsView`.
- `src/components/AdminView.tsx`: shrink `useUsers`.
- `src/components/ApplicationForm.tsx`: split `ApplicationForm`.
- `src/components/UserForm.tsx`: extract the role select.
- `src/components/ApplicationDetail.tsx`, `ApplicationList.tsx`,
  `AttachmentList.tsx`: extract one subcomponent each.
- `src/App.tsx`: extract the current-user loading into a hook.
- `mcp/lib/client.ts`: move the stateless helpers out of `createApiClient`.
- `src/components/AdminView.test.tsx`: add a session-expiry test (see Tests).
- `.oxlintrc.json`: the five rules plus two overrides.
- `.claude/skills/simple-code/SKILL.md`: say oxlint enforces the limits and
  describe the test-file exemption.
- `docs/architecture.md`: list `apiAction.ts` under `src/lib/`, and note the
  hook and component names that moved.

## Work order

Rules for every step: behavior, markup, class names, labels, and the order
of fields and buttons stay exactly as they are. New subcomponents stay
**unexported** in the same file, which keeps
`react/only-export-components` quiet and needs no new test files. Existing
tests must pass **unmodified**, since they are the proof of no behavior
change. Run `npm test` after each file.

### Commit 1: client (`src/`)

1. **`src/lib/apiAction.ts`**: move the `run` `useCallback` out of both
   hooks into `useApiAction(onUnauthorized)` (it uses `useToast` itself), with
   the same dependency list.
2. **`useApplications`**: use `useApiAction`. Add one local helper
   `change(call: () => Promise<unknown>, message: string)` that does
   `run(async () => { await call(); await reload() }, message)`. Each handler
   then becomes a single `change(...)` call. `handleDelete` keeps its own
   `run` body, because it also collapses `expandedId`. The initial `load`
   effect stays as it is.
3. **`useUsers`**: same pattern (`useApiAction` plus `change`).
   `handleResetPassword` doesn't reload, so it keeps calling `run` directly.
4. **`ApplicationsView`**: move the sort, archived-filter and page state,
   plus the three `useMemo`s, into a local hook
   `useListView(applications, pageSize)`. It returns the page slice, the
   counts, and setters that already reset the page to 1 (`changeSort`,
   `changeShowArchived`, `resetPage`), so the JSX has no inline multi-line
   callbacks. Refer to `useApplications`' return value as an object
   (`apps.handleUpdate`) rather than destructuring ten names. If the
   component is still over 40, extract the left `<section>` into an
   unexported `AddApplicationPanel({ onAdd })`.
5. **`ApplicationForm`**:
   - Replace `handleDateChange` with a pure module-level
     `withDateApplied(input, dateApplied): ApplicationInput` (same
     draft→applied rule), and render Date applied through the existing
     `TextField` (`type="date"`, `required={input.status !== 'draft'}`). The
     markup is identical.
   - Extract unexported `StatusField({ value, onChange })` (the select) and
     `NotesField({ value, onChange })` (the textarea).
   - Move the seven fields into an unexported
     `ApplicationFields({ input, onChange })`, where `onChange` receives the
     whole next `ApplicationInput`. `ApplicationForm` keeps the state, the
     submit/reset and the `<form>`/actions frame.
   - If `ApplicationFields` is still over 40, split it at a contiguous point
     in the field order (Company, Role, Date applied, Deadline | Status,
     Link, Notes) instead of changing the order.
6. **`UserForm`**: extract an unexported `RoleField({ value, onChange })`
   (the role select). This brings it to about 36 lines.
7. **`ApplicationRow`**: extract the toggle `<button>` into an unexported
   `RowSummary({ application, expanded, onToggle })`.
8. **`ApplicationDetail`**: extract the two action buttons into an
   unexported `DetailActions({ archived, onSetArchived, onDelete })`.
9. **`AttachmentList`**: extract the `<li>` into an unexported
   `AttachmentItem({ attachment, onRemove })`.
10. **`App`**: extract `useCurrentUser()`, the `user` state, `loaded` state
    and the load effect, returning `{ user, setUser, loaded }`. It stays in
    `App.tsx`, unexported.
11. Add the AdminView session-expiry test (see Tests). Then run
    `npm test`, `npm run build` and `npm run lint`, and commit:
    "Bring client code within simple-code limits".

### Commit 2: MCP (`mcp/`)

12. **`mcp/lib/client.ts`**: move to module level everything that doesn't
    touch `cookie`:
    - `fetchOrExplain(baseUrl, path, spec)`
    - `login(config)`, which calls `fetchOrExplain(config.baseUrl, …)`
    - `checked(response)`
    - `readJson<T>(response)`
    - `readFile(response): Promise<ApiFile>`, the current `getFile` body

    `createApiClient` keeps `let cookie`, `sessionCookie`, `sendWithSession`,
    `send` (with its single 401 re-login), and the four returned methods,
    each now a one-line `readJson(await send(...))` or
    `readFile(await send(...))`. Error messages stay byte-identical, since
    `mcp/lib/client.test.ts` pins them. Then run `npm test` and commit:
    "Bring MCP client within simple-code limits".

(Server needs no code commit. Its only hit is covered by the override in
step 13.)

### Commit 3: enforcement

13. **`.oxlintrc.json`**: keep the existing plugins and rules, and add:
    ```jsonc
    "max-lines-per-function": ["error", { "max": 40, "skipBlankLines": true, "skipComments": true }],
    "max-lines": ["error", { "max": 300, "skipBlankLines": true, "skipComments": true }],
    "max-params": ["error", { "max": 3 }],
    "max-depth": ["error", { "max": 2 }],
    "complexity": ["error", { "max": 10 }]
    ```
    plus
    ```jsonc
    "overrides": [
      { "files": ["**/*.test.ts", "**/*.test.tsx", "e2e/*.spec.ts"],
        "rules": { "max-lines-per-function": "off", "max-lines": "off" } },
      { "files": ["server/middleware/errors.ts"],
        "rules": { "max-params": "off" } }
    ]
    ```
    Give the second override a short comment saying Express needs the 4-arity
    to recognise error middleware (JSONC comments are fine in
    `.oxlintrc.json`). Confirm that `npm run lint` reports **no errors**.
    Separately, confirm that temporarily adding a 5th parameter anywhere else
    does error, then revert that.
14. **`SKILL.md`**:
    - Under Limits, add that `npm run lint` enforces all five as errors, with
      lengths counted without blank lines and comments.
    - Test files (`*.test.ts(x)`, `e2e/*.spec.ts`) are exempt from the two
      length rules only.
    - In the dependency-arity paragraph, say that an exemption is a scoped
      `overrides` entry in `.oxlintrc.json`, never an inline disable.
15. **`docs/architecture.md`**:
    - Add `apiAction.ts` to the `src/lib/` list.
    - Mention `useListView` beside `useApplications`.
    - Under `mcp/lib/`, `client.ts`'s description is unchanged.
16. Run all three commands and commit: "Enforce simple-code limits in
    oxlint".

## Tests

- New: `AdminView.test.tsx`, "a 401 while loading users shows the
  session-expired toast and calls onUnauthorized". It follows the existing
  `ApplicationsView.test.tsx` session-expiry test. It pins the shared
  `useApiAction` behavior on the one surface that doesn't test it today.
- Updated: none. Existing tests pass unmodified, which proves there's no
  behavior change.
- Verification command: `npm run lint && npm test && npm run build`. Lint
  shows no errors (the existing `only-export-components` warnings may remain),
  and the test output is `Test Files N passed / Tests N passed`. Optionally,
  run `npm run test:e2e` (check ports 5173/3001 first, per CLAUDE.md) as an
  extra check that the UI is unchanged.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
