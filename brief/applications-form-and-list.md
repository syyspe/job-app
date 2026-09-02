---
slug: applications-form-and-list
date: 2026-09-02
---

# Add, list and manage job applications

## Problem

There is no real tracking today — job applications live as folders and files
scattered on the laptop. Nothing is current, so answering "where did that one
land?" means digging through directories and guessing from file dates. The
records that matter (which company, which role, what stage it's at, which CV
went out) exist only implicitly, in file names and memory.

Worth fixing now because the record is only useful while applications are
live; reconstructing it after the fact is not worth doing at all.

## What done looks like

1. A form adds an application with: company, role/job title, date applied,
   status, link to the posting, notes.
2. Status is one of a fixed set: applied → screening → interview → offer /
   rejected.
3. All applications are listed in one view, showing at minimum company, role,
   date applied and status.
4. An existing application can be edited — every field, including status.
5. An application can be deleted.
6. Files can be attached to an application (CV, cover letter, portfolio, and
   anything else), and are listed with the application.
7. An attached file can be downloaded back out, and removed.
8. Records and files survive a restart of both the browser and the server.

## Approach

Frontend is the existing React + Vite app in `src/`. Backend is new, in
`server/`: Express with better-sqlite3 for storage. Application records live
in SQLite; uploaded files are written to an `uploads/` directory on disk with
the database holding the filename, original name and type label.

Files on disk rather than blobs in SQLite: the database stays small, and the
files stay openable outside the app, which is how they are used today. The
tradeoff accepted is that the DB and `uploads/` can drift apart — deleting an
application has to delete its files too.

Backend now rather than localStorage: chosen deliberately over a
browser-only first slice, to avoid migrating the data later.

The frontend talks to the API over HTTP; no shared code between `src/` and
`server/` beyond the record shape.

## Out of scope

- Auth and multi-user. Single user, on one laptop.
- Deployment and hosting. It runs locally.
- Search, filtering and sorting. A plain list until there is enough in it to
  need them.
- Reminders and follow-up notifications.
- Importing the existing folders of files.

## Open questions

- This is three separable pieces of work in one branch — backend + CRUD API,
  the form and list UI, and file upload. The plan should sequence them so a
  partial build is still coherent.
- Where `uploads/` and the SQLite file live relative to the repo, and how
  they are kept out of git.
- Whether the frontend dev server proxies to the API or the API serves the
  built frontend.

---

**Next stage:** commit this, then Stage 2 (Plan). Open a session in plan mode
against this file and commit `plans/applications-form-and-list.plan.md`
before writing any code.
