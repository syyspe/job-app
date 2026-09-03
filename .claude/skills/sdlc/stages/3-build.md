# Stage 3 — Build

Implement the work order in `plans/<slug>.plan.md`.

- `simple-code` applies from the first line, not as a cleanup pass afterwards.
- For a bug fix, commit the failing test *before* the fix, and don't edit it
  while fixing. A test edited during the fix has stopped being evidence.
- If the implementation departs from the plan, update `plans/<slug>.plan.md`
  in the same commit rather than letting them drift.

## The stage ends at that commit

Nothing else belongs here — not the verification command, not `verifier`, not
`/code-review`. A build session is the worst-placed judge of its own build: it
knows what the code was *meant* to do, which is exactly the assumption
verification exists to break. Hand it to a session that has to read the diff
cold.

Next: Stage 4 (Ship), in a fresh session, still on `/model sonnet`.
