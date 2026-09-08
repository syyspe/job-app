---
slug: toast-notifications
date: 2026-09-08
---

# Toast notifications for successes and errors

## Problem

The app tells the user almost nothing about whether an action worked. A failed
login is the only case with any feedback at all — `LoginForm` catches the error
and renders an inline `role="alert"`. Everything else is silent:

- Adding, saving, or deleting an application, and uploading or removing an
  attachment, all go through `useApplications`' `run()` in
  `ApplicationsView.tsx`. On success the list simply reloads; on failure the
  error is re-thrown out of an async event handler, so it surfaces as an
  unhandled promise rejection in the console and nothing at all in the UI.
- A `401` mid-session drops the user back to the login form with no
  explanation.
- Logging out gives no confirmation.

So a save that fails looks exactly like a save that worked but changed nothing
visible, and a session that expires looks like the app logged you out at
random. Worth fixing now because every mutation path already funnels through
one `run()` helper — the plumbing is cheap today and gets more expensive with
each feature added on top of it.

## What done looks like

1. A toast host renders a stack of transient messages over the app, available
   from both `App.tsx` (auth) and `ApplicationsView.tsx` (mutations).
2. Two kinds: success and error, visually distinguishable by more than colour
   alone.
3. Each toast auto-dismisses after a few seconds and can be dismissed early by
   a visible, keyboard-reachable close control. Error toasts stay long enough
   to read.
4. Accessibility: successes announce politely (`aria-live="polite"`), errors
   assertively (`role="alert"`). Tests query them by role/name, per the repo's
   testing convention.
5. Auth events raise toasts: login success, login failure ("Invalid username
   or password"), logout success, and session expiry ("Your session expired —
   please log in again") when a `401` bounces the user out.
6. Every mutation raises one on both paths — add, save, delete, upload
   attachment, remove attachment — success and failure alike. The error toast
   shows the server's message where `api.ts` gives one, falling back to a
   generic sentence.
7. No mutation leaves an unhandled promise rejection: `run()` handles the
   error instead of re-throwing.
8. The failed initial load of the applications list raises an error toast
   rather than failing silently.
9. `LoginForm`'s inline error is gone — one mechanism, not two.
10. `npm test` passes, including tests for a success toast, an error toast,
    and dismissal. `npm run test:e2e` passes.

## Approach

A `ToastProvider` holding the list of live toasts in state and a `useToast()`
hook exposing something narrow — `showSuccess(message)` / `showError(message)`
— so calling code never touches ids or timers. `main.tsx` wraps `<App />` in
the provider; the host component renders the stack. Placement follows the
existing layout: the presentational component in `src/components/`, the
context and hook alongside the other client helpers in `src/lib/`.

Messages are written at the call sites (`App.tsx`, `useApplications`), not
derived inside the toast layer — the toast layer knows nothing about
applications or auth.

`run()` in `useApplications` becomes the single place mutation failures are
reported: it already distinguishes `UnauthorizedError` from everything else, so
it gains an error toast on the general branch and a session-expiry toast on the
`401` branch, and stops re-throwing. Success messages stay at each individual
handler, since only they know whether it was an add, a save, or a delete.

No new dependencies — a toast stack is a `useState` array, a `setTimeout` per
entry, and some CSS. Rejected: pulling in `react-hot-toast` or similar, which
is more code to audit than to write, and the dependency policy says ask first.

Also rejected: keeping `LoginForm`'s inline error alongside the toasts. Two
mechanisms for the same event means deciding twice, forever; the login failure
message is short enough to read in a toast.

## Out of scope

- Undo actions inside a toast.
- Persisting or logging toasts anywhere — they are transient UI only.
- Reworking form-level validation feedback; field-level validity stays where
  it is.
- Toasts for navigation, sorting, expand/collapse, or attachment downloads.
- Animation beyond whatever falls out of a simple CSS transition.

## Open questions

- How long does a toast live — the same duration for success and error, or
  longer for errors? The plan should pick a number and put it in one place.
- Is there a cap on how many toasts stack at once, or does a burst of
  failures just pile up?
- Does an error toast need to survive the re-render that a failed reload
  triggers, or is the current stack state enough? Expected to be enough —
  worth confirming while building.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/toast-notifications.plan.md` before writing
any code.
