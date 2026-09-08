---
brief: brief/toast-notifications.md
branch: toast-notifications
date: 2026-09-08
---

# Toast notifications for successes and errors — Plan

## Context

The app is almost silent about whether an action worked. `LoginForm`'s inline
`role="alert"` is the only feedback anywhere; every mutation in
`useApplications` (`src/components/ApplicationsView.tsx`) re-throws its error
out of an async event handler, so a failure shows up as an unhandled promise
rejection in the console and nothing in the UI. A 401 mid-session silently
drops the user back to the login form.

This adds one toast mechanism — a provider above `<App />`, a `useToast()` hook
with `showSuccess` / `showError`, and a presentational stack — and wires it to
auth events and to every mutation path. `LoginForm`'s inline error goes away so
there is one mechanism, not two. No new dependencies.

Decisions taken from the brief's open questions:

- **Durations:** success 4000 ms, error 8000 ms, both in one exported constant
  in `src/lib/toast.ts`.
- **Stack cap:** 3 — a burst drops the oldest (`.slice(-MAX_TOASTS)`).
- **Toast state survives re-renders** because it lives in the provider, above
  `<App />`. Nothing more is needed.

## Affected files

- `src/lib/toast.ts` — **new.** `ToastKind`, `Toast`, `ToastApi` types,
  `ToastContext`, the `useToast()` hook (throws if used outside the
  provider), and the `TOAST_DURATIONS_MS` (`{ success: 4000, error: 8000 }`)
  and `MAX_TOASTS` constants. No JSX, so it exports no component and stays
  clear of `react/only-export-components` — which is why the constants live
  here rather than in `ToastProvider.tsx`, where exporting them alongside a
  component trips that rule.
- `src/components/ToastProvider.tsx` — **new.** Owns the `Toast[]` state, ids,
  the per-toast `setTimeout`, the cap, and `dismiss`. Renders
  `{children}` plus `<ToastHost>`.
- `src/components/ToastHost.tsx` — **new.** Presentational stack: props
  `toasts` and `onDismiss`, no state.
- `src/main.tsx` — wrap `<App />` in `<ToastProvider>`.
- `src/App.tsx` — `useToast()`; toasts for login success/failure and logout.
  `handleLogin` catches instead of letting the rejection reach `LoginForm`.
- `src/components/LoginForm.tsx` — drop the `error` state, the `try/catch` and
  the inline `<p role="alert">`; `handleSubmit` just awaits `onLogin`.
- `src/components/ApplicationsView.tsx` — `useApplications` gains `useToast()`;
  `run` takes an optional success message, reports failures, and stops
  re-throwing.
- `src/index.css` — two colour vars (`--ok`, `--danger`) in `:root` and in the
  `prefers-color-scheme: dark` block, matching the existing var style.
- `src/App.css` — `.toast-stack`, `.toast`, `.toast-success`, `.toast-error`.
- Tests: new `ToastHost.test.tsx`, new `ToastProvider.test.tsx`, updated
  `App.test.tsx`, `LoginForm.test.tsx`, `ApplicationsView.test.tsx`, and one
  assertion added to `e2e/auth.spec.ts`.

## Two constraints that shape the design

1. **The context value holds only `showSuccess` / `showError` — never the toast
   list.** The list stays in provider state and reaches `ToastHost` as a prop.
   Consumers (`App`, `useApplications`) must not re-render when a toast
   appears.
2. **`showSuccess` / `showError` must be referentially stable** (`useCallback`
   with `[]`/`[dismiss]` deps, wrapped in a `useMemo`'d context value).
   `useApplications`' mount effect depends on `run`, which will depend on these
   — an unstable identity re-runs the initial load on every render, and a
   failing load would then toast in a loop.

## Work order

Red-green-refactor per `.claude/skills/simple-code/SKILL.md`: test first for
each new behaviour.

1. **`src/lib/toast.ts`.** Types, `ToastContext =
   createContext<ToastApi | null>(null)`, and `useToast()` returning the
   context or throwing `'useToast must be used inside a ToastProvider'`.

2. **`ToastHost.tsx` + `ToastHost.test.tsx`.** Renders
   `<div className="toast-stack">` (always present) with one
   `<div className="toast toast-{kind}">` per toast:
   - error → `role="alert"`; success → `aria-live="polite"`.
   - Kind shown by more than colour: an `aria-hidden` glyph (`✓` / `!`) and a
     `visually-hidden` `Success:` / `Error:` prefix (the `.visually-hidden`
     class already exists in `index.css`).
   - Close control: `<button type="button" aria-label={`Dismiss: ${message}`}>`
     calling `onDismiss(toast.id)` — one accessible name per toast, so tests
     query by role/name with no ambiguity.

3. **`ToastProvider.tsx` + `ToastProvider.test.tsx`.** Module-level id counter;
   `show(kind, message)` appends then `.slice(-MAX_TOASTS)` and schedules
   `setTimeout(() => dismiss(id), TOAST_DURATIONS_MS[kind])`. Provider renders
   `<ToastContext value={api}>{children}<ToastHost … /></ToastContext>` (React
   19 context-as-provider form). Tests drive it through a small probe component
   that calls `useToast()`, with
   `vi.useFakeTimers({ shouldAdvanceTime: true })`; advance timers inside
   `act()`. `shouldAdvanceTime` is required — with plain fake timers every
   `userEvent` interaction hangs until the test times out.

4. **`main.tsx`.** Wrap `<App />` in `<ToastProvider>` inside `<StrictMode>`.

5. **Auth toasts — `App.tsx`, `LoginForm.tsx`, and their tests.**
   - `handleLogin`: on success `showSuccess('Logged in')`; on any rejection
     `showError('Invalid username or password')` — it does not re-throw.
   - `handleLogout`: `showSuccess('Logged out')` after `setUser(null)`.
   - `LoginForm` loses its error state and inline alert.
   - `LoginForm.test.tsx`: delete the "a rejected onLogin shows the alert"
     test — that mechanism is gone; keep the submit test.
   - `App.test.tsx`: render inside `<ToastProvider>`; add a failed-login test
     (stub `/api/login` → 401) asserting an alert with 'Invalid username or
     password'.

6. **Mutation toasts — `ApplicationsView.tsx` + test.** `run` becomes:

   ```ts
   const run = useCallback(
     async (task: () => Promise<void>, successMessage?: string) => {
       try {
         await task()
         if (successMessage) showSuccess(successMessage)
       } catch (error) {
         if (error instanceof UnauthorizedError) {
           showError('Your session expired — please log in again')
           onUnauthorized()
           return
         }
         showError(error instanceof Error ? error.message : 'Something went wrong')
       }
     },
     [onUnauthorized, showSuccess, showError],
   )
   ```

   The success message is passed in because `run` swallows the error, so a
   handler can't tell success from failure on its own; the messages still live
   at the call sites. `api.ts`'s `checkOk` already puts the server's `error`
   field on the thrown `Error`, so `error.message` is the server's message.

   Per-handler messages: `'Application added'`, `'Application saved'`,
   `'Application deleted'`, `'Attachment uploaded'`, `'Attachment removed'`.
   The mount effect's `run(reload)` passes no success message, so a failed
   initial load falls through to the error branch — brief item 8.

7. **CSS.** `.toast-stack` fixed bottom-right, column-reverse, `z-index`,
   `gap`, and `pointer-events: none`; `.toast` gets `pointer-events: auto`, a
   border, radius, padding, and a left accent border coloured per kind. The
   container must not intercept clicks — Playwright clicks buttons underneath
   it.

8. **Verify** (step "Tests" below), then commit.

## Tests

- New `src/components/ToastHost.test.tsx`:
  - a success toast renders its message in an `aria-live="polite"` element
  - an error toast renders with `role="alert"`
  - clicking `Dismiss: <message>` calls `onDismiss` with that toast's id
- New `src/components/ToastProvider.test.tsx`:
  - `showSuccess` / `showError` from `useToast()` put a toast on screen
  - a success toast is gone after `TOAST_DURATIONS_MS.success`; an error toast
    is still there at that point and gone after `TOAST_DURATIONS_MS.error`
  - a toast can be dismissed early by its close button
  - a 4th toast drops the oldest (`MAX_TOASTS`)
- Updated `src/components/ApplicationsView.test.tsx`: local `renderView()`
  wrapping in `<ToastProvider>`; add — a successful add shows 'Application
  added'; a failed create (stub → 400 `{ error: 'Company is required' }`) shows
  that server message as an alert and produces no unhandled rejection; the
  existing 401 test also asserts the session-expiry alert.
- Updated `src/App.test.tsx`: wrap in `<ToastProvider>`; add the failed-login
  alert test.
- Updated `src/components/LoginForm.test.tsx`: remove the inline-alert test.
- Updated `e2e/auth.spec.ts`: after `logIn(page)`, assert the 'Logged in' toast
  is visible.
- Verification commands: `npm test` (the gate — expect
  `Test Files N passed / Tests N passed`, no `failed` line), plus `npm run
  lint`, `npm run build`, and `npm run test:e2e` (expect `N passed`).

## Risks / rollback

- The fixed-position stack could intercept clicks and break e2e specs —
  `pointer-events: none` on the container is the guard; `npm run test:e2e` is
  the check.
- An unstable `showSuccess`/`showError` identity would re-fire the initial-load
  effect on every render (see constraint 2). If the applications list starts
  reloading in a loop, that is the cause.
- Nothing here touches the server, the database, or any file on disk. Rollback
  is reverting the branch commit.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
