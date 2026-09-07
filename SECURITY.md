# Security policy

A single-user job application tracker, and the test bed for the
[ai-sdlc-skeleton](https://github.com/syyspe/ai-sdlc-skeleton) workflow. It's
built to run on one person's own machine against a local SQLite file — not
as a hosted multi-tenant service. Reports are still welcome.

## Reporting a vulnerability

Use GitHub's **[private vulnerability
reporting](https://github.com/syyspe/job-app/security/advisories/new)**
(Security → Report a vulnerability). Please don't open a public issue for
anything exploitable.

It's one person maintaining this in spare time: expect an acknowledgement
within a week or so, not within hours.

## What's in scope

- Authentication and sessions — `server/lib/passwords.ts`,
  `server/lib/cookies.ts`, `server/middleware/auth.ts`. Anything that lets a
  request act as a user it isn't.
- File uploads and attachment serving — path traversal out of `UPLOADS_DIR`,
  or reading another user's attachment.
- SQL construction anywhere in `server/`.
- `.github/workflows/claude-review.yml` — anything that lets an untrusted
  commenter reach the `ANTHROPIC_API_KEY` secret or the workflow's write
  permissions.

## What's not

- **Deploying this on the open internet.** There's no rate limiting, no
  account lockout, no password reset and no signup, and CSRF defence is the
  session cookie's `httpOnly` + `sameSite: lax` rather than a token; the
  single login is seeded from env vars. That's a deliberate fit for a local
  single-user tool, not an oversight to report.
- The credentials in `e2e/` — they belong to an ephemeral database that
  Playwright creates and throws away on every run.
