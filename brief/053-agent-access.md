---
slug: 053-agent-access
date: 2026-11-26
---

# Agent access as its own user flag

## Problem

Only admins can use the agent: the run panel and `/api/agent` sit behind
`requireAdmin` (051, `docs/in-app-agent.md` §7). That's not what the
admin/basic split is for. Admin means managing users; whether someone may
spend the runner's credentials and Claude API budget is a separate
decision, and today it can't be granted without also handing out user
management.

## What done looks like

1. Users carry a boolean agent-access flag, stored in `users` and present
   on the `User` type in both `server/types.ts` and `src/types.ts`.
2. The `/api/agent` routes check the flag, not the role. A signed-in user
   without it gets `403`; a basic user with it can start and list runs.
3. The run panel shows for users with the flag and is hidden for those
   without, whatever their role.
4. The admin can set the flag for any user from that user's row in the admin
   list, through an admin-only endpoint beside the role one.
5. New users start without it. The migration turns it on for existing
   admins, so nothing changes for them on upgrade.
6. `docs/in-app-agent.md` §7 and `docs/architecture.md` describe the flag
   instead of admin-only runs.
7. `npm test` and `npm run test:e2e` pass.

## Approach

Role and agent access are independent: an admin without the flag can't run
the agent either. Mirror the role change: a column on `users` with a
migration in `server/db/`, the flag in the user mapper, an endpoint like
`PUT /api/users/:id/role` under the existing `requireAdmin` mount, and a
`requireAgentAccess` middleware replacing `requireAdmin` at `/api/agent` in
`app.ts`. The create-user form stays as it is; access is granted afterwards
from the row.

Rejected: admins always allowed. That keeps agent access tied to role, which
is the coupling this removes.

## Out of scope

- Who the runner acts as. Runs still use the runner's own credentials and
  belong to the install, not to the user who started them.
- The CLI and Task Scheduler paths (`npm run agent:*`), which never pass
  through the API's auth.
- Per-user spend caps. 050's monthly cap stays install-wide.
- A checkbox on the create-user form.

## Related streams

- 051 (merged) built the admin-only run panel and `/api/agent`. This
  changes its gate.
- 052 (not started) removes the `claude -p` engine and touches
  `docs/in-app-agent.md` §3 and §8, not §7. No overlap expected.

## Open questions

- Whether the flag has its own endpoint or the role endpoint becomes a
  general user update. The plan decides.

---

**Next stage:** run `/sdlc`.
