---
brief: none — skipped by agreement; scope is pinned by the lint output
branch: lint-clean
date: 2026-09-03
---

# Clear the two set-state-in-effect lint warnings — Plan

## Context

`npm run lint` exits 0 but prints two `react(set-state-in-effect)` warnings.
The goal is a silent lint run, without contorting code that is already
correct. The two warnings are not the same kind of problem:

- **`src/App.tsx:24`** — `useEffect(() => { void reload() }, [])`. `reload()`
  awaits `listApplications()` before calling `setApplications`, so the state
  update lands in a microtask, not synchronously during the effect. This is
  the canonical fetch-on-mount effect and the warning is a false positive.
- **`src/ApplicationForm.tsx:52`** — `useEffect(() => setInput(initial ??
  emptyInput), [initial])` is a real synchronous setState in an effect, and
  it has a real consequence. `ApplicationDetail` (`src/ApplicationDetail.tsx:34`)
  passes `initial={toInput(application)}`, a fresh object on every render, so
  the effect refires on every parent render. Any `App`-level `reload()` — a
  save, an attachment upload, an attachment removal — therefore wipes whatever
  the user has typed into the open edit form.

Removing that effect fixes the warning and the wipe together. It is safe
because the reset it performs is already handled by remounting: the edit form
only exists inside `ApplicationDetail`, which is rendered under
`<li key={application.id}>` (`src/ApplicationList.tsx:30`), so expanding a
different row mounts a fresh `ApplicationForm` and `useState(initial ??
emptyInput)` seeds it from the new application. The add form in `App.tsx`
never receives `initial` and clears itself in `handleSubmit`.

## Affected files

- `src/App.tsx` — suppress the false positive on the mount-time fetch with a
  targeted disable comment naming the rule and the reason.
- `src/ApplicationForm.tsx` — delete the `useEffect` reset and the now-unused
  `useEffect` import.
- `src/ApplicationForm.test.tsx` — add a test pinning the new behavior.

## Work order

1. In `src/ApplicationForm.tsx`, delete the `useEffect` block at lines 52–54
   and drop `useEffect` from the `react` import on line 1 (leaving
   `import { useState } from 'react'`). `initial` stays as the seed for
   `useState` and nothing else changes.
2. In `src/ApplicationForm.test.tsx`, add a test that a rerender with a new
   `initial` object does not clobber in-progress input — this is the behavior
   the deleted effect used to break:

   ```tsx
   test('keeps in-progress edits when the parent rerenders', async () => {
     const user = userEvent.setup()
     const initial = { company: 'Acme', role: 'Engineer', dateApplied: '2026-01-15',
                       status: 'interview' as const, link: '', notes: '' }
     const { rerender } = render(
       <ApplicationForm initial={initial} submitLabel="Save" onSubmit={vi.fn()} />,
     )

     await user.clear(screen.getByRole('textbox', { name: 'Role' }))
     await user.type(screen.getByRole('textbox', { name: 'Role' }), 'Staff Engineer')
     rerender(
       <ApplicationForm initial={{ ...initial }} submitLabel="Save" onSubmit={vi.fn()} />,
     )

     expect(screen.getByRole('textbox', { name: 'Role' })).toHaveValue('Staff Engineer')
   })
   ```

   Match the surrounding file's style (`initial` spelled out as a local, roles
   queried by accessible name). Confirm it fails against the current effect
   before deleting it, if convenient — otherwise just confirm it passes after.
3. In `src/App.tsx`, add above line 24:

   ```tsx
   // oxlint-disable-next-line react/set-state-in-effect -- reload() sets state after an await, not synchronously
   ```

   Verify the directive actually silences the warning by re-running lint; if
   oxlint 1.81 rejects that spelling, fall back to
   `// eslint-disable-next-line react/set-state-in-effect`, which oxlint also
   honors. Do **not** disable the rule in `.oxlintrc.json` — it must stay live
   for the rest of the codebase.
4. Run `npm run lint` and confirm it prints no warnings at all.

## Tests

- New: `src/ApplicationForm.test.tsx` — "keeps in-progress edits when the
  parent rerenders" (step 2).
- Updated: none. The existing "keeps the edit form values after save" test
  passes an object that never changes identity, so it is unaffected.
- Verification command: `npm test` (expect `Test Files N passed / Tests N
  passed`, no `failed` line), plus `npm run lint` printing nothing.
- Also run `npm run test:e2e` — `e2e/applications.spec.ts` drives the edit
  form through save, attachment upload and delete, which is exactly the path
  the removed effect used to interfere with.

## Risks / rollback

Low. One behavior change: an open edit form now keeps unsaved input across a
list reload instead of being reset to the stored values. That is the
improvement, not a side effect — but it is a visible change, so it belongs in
the PR description. Rollback is reverting the branch; nothing here touches
data, the server, or config.

---

**Next stage:** commit this plan *before* writing code. Run `/sdlc` for what
follows it.
