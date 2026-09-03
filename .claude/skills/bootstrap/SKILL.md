---
name: bootstrap
description: Use at the start of a session in a freshly cloned/templated copy of this skeleton that hasn't been configured yet (no .claude/.bootstrapped file — CLAUDE.md's Setup section names this explicitly). Also user-invocable any time as /bootstrap to redo setup. Walks through project name, purpose, tech stack, and real current versions one question at a time, optionally scaffolds the project for the chosen stack, then fills in every current placeholder across CLAUDE.md, README.md, REVIEW.md, and .claude/hooks/, and finishes by walking the user into Stage 1 — their first brief/<slug>.md.
---

# Bootstrap a new project from this skeleton

This repo is a template — the person you're talking to just cloned or
templated it to start a *new* project, not to edit the skeleton itself.
Your job is to set it up: ask a few questions, optionally scaffold the
chosen tech stack at real current versions, then fill in every
`<placeholder>` in the repo with real values.

## Rule: one question at a time

Ask exactly one question per message, then wait for the reply before
asking the next. Never bundle several open questions into one message.
Keep each message short: a sentence of context (if needed) plus the one
question.

When that question is an `AskUserQuestion`, give it **at most four
options** — the tool rejects a fifth outright ("Invalid tool parameters")
and you lose the turn. "Other" is appended automatically and doesn't count
against the four, so route the catch-all cases through it rather than
spending an option on them.

## Rule: never guess a version number

Any time a version number is presented to the user (in a question's
options or in a command about to run), it must come from an actual lookup
performed in this session — not from memory. Version numbers you
"remember" can be stale or wrong. See Step 3 for the lookup mechanism per
ecosystem.

## Step 1 — project name and purpose

Ask: what is this project called, and in one sentence, what does it do?
Wait for the answer before moving on.

## Step 2 — tech stack

Use `AskUserQuestion` with exactly these four options. **Four is the
maximum the tool accepts** — a fifth makes the whole call fail with
"Invalid tool parameters", so don't add one:

- **Next.js** (TypeScript, App Router)
- **Python / Django**
- **React + Node** (Vite)
- **Plain Node/TS** (no framework)

The tool appends "Other" itself, which covers both a stack that isn't
listed and not having decided yet. Say so in the question text — something
like "or pick Other for anything else, including 'not sure yet'" — so the
undecided path is visible rather than something they have to guess at.

If the answer is Other and names a real stack, take it: skip the scaffold
in Step 4 (you don't have a verified command for it) but still ask for its
version in Step 3 and fill `CLAUDE.md`'s Conventions with it.

If the answer is Other and amounts to "not sure yet", skip Steps 3–4
entirely — go straight to Step 5, and note in the final summary that
`/bootstrap` can be re-run once a stack is picked.

## Step 3 — versions (real numbers, looked up now)

Before asking, resolve real current version numbers for whatever Step 2
picked:

- **Node.js** (needed for Next.js, Vite, and Plain Node/TS): run
  `curl -s https://nodejs.org/dist/index.json`. The first array entry is
  the current release; the first entry with `"lts"` not equal to `false`
  is the current LTS. This is Node's own release index — authoritative,
  no guessing.
- **Django**: `WebFetch` on `https://www.djangoproject.com/download/`,
  asking specifically for the current LTS version and the latest stable
  release — that page states both explicitly.
- **Python**: don't look anything up — run `python3 --version` and use
  whatever's actually installed locally (see the runtime boundary below).
- **Next.js / React**: no lookup needed here — `create-next-app@latest`
  resolves this itself via npm. You'll read back the real installed
  version from `package.json` after scaffolding in Step 4.

Then ask one `AskUserQuestion`, built from those real numbers:

- **Next.js**: state the real Next.js/React versions `create-next-app@latest`
  will install (informational — pinning an old major isn't usually wanted
  for a new project). The actual choice: Node runtime — "Node `<real LTS
  version>` LTS (recommended)" vs. "Node `<real current version>`
  Current" vs. Other.
- **Django**: "Django `<real LTS version>` LTS — longer support
  (recommended)" vs. "Django `<real latest version>` latest — newest
  features" vs. Other. Mention the locally available Python version
  (`python3 --version`) as context, not a choice.
- **React + Node (Vite)**: same Node LTS-vs-Current pattern as Next.js.
  React version follows the Vite template's latest unless they pick
  Other to name a specific version.
- **Plain Node/TS**: Node LTS vs. Current, same pattern.

## Step 4 — scaffold (if applicable)

Ask a single yes/no question: "Want me to set it up now with
`<command showing the real resolved versions>`?" If yes, run it.

**Runtime boundary — do not cross this:** bootstrap records the *target*
runtime version (`.nvmrc`, `package.json`'s `engines.node`) but never
installs or switches the actual Node/Python interpreter binary — that's
the developer's own environment (nvm, pyenv, etc.), out of scope here. If
the chosen version isn't what's actually present on the machine, say so
plainly in the final summary rather than pretending it was installed.
Always verify what actually landed after scaffolding — `node --version`,
`.venv/bin/python --version`, `pip show django`, the generated
`package.json` — and use those *verified* numbers everywhere downstream
(Step 7's CLAUDE.md Conventions, the final summary), not the numbers that
were merely requested.

**Scaffolding procedure** (applies to any tool that refuses to run in a
non-empty directory — the skeleton's own files already occupy the repo
root):

1. `mkdir .bootstrap-tmp && cd .bootstrap-tmp`, run the scaffold command
   targeting `.` there.
2. Move everything from `.bootstrap-tmp/` into the repo root, except:
   - `README.md` — discard the scaffold's copy; this skill writes the
     real one in Step 7.
   - `.gitignore` — append the scaffold's entries onto the repo's
     existing `.gitignore` (adds framework-specific ignores like
     `.next/`) instead of overwriting it.
3. `cd ..` and remove `.bootstrap-tmp/`.

Per-stack commands, using the version chosen in Step 3:

- **Next.js**:
  `npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --yes`
  — run via the temp-dir procedure above. After moving files up, write
  `.nvmrc` with the chosen Node version and add `"engines": {"node":
  ">=<chosen>"}` to `package.json`.
- **Python/Django**:
  `python3 -m venv .venv && .venv/bin/pip install --upgrade pip && .venv/bin/pip install "django==<chosen version>.*" && .venv/bin/django-admin startproject <slug> . && .venv/bin/pip freeze > requirements.txt`
  — `<slug>` is the project name, lowercased with underscores; `<chosen
  version>` is whichever of the two real Django numbers from Step 3 was
  picked (or the Other value). Django's `startproject` doesn't generate a
  conflicting README, so run this directly at the repo root (skip the
  temp-dir procedure).
- **React + Node (Vite)**:
  `npm create vite@latest . -- --template react-ts` then `npm install` —
  via the temp-dir procedure above. If Other named a specific React
  version, follow with `npm install react@<x> react-dom@<x>
  @types/react@<x> @types/react-dom@<x>`. Write `.nvmrc`/`engines.node`
  as with Next.js.
- **Plain Node/TS**:
  `npm init -y && npm install --save-dev typescript @types/node && npx tsc --init`
  — doesn't generate a conflicting README, safe to run directly at the
  repo root. Write `.nvmrc`/`engines.node`.

## Step 5 — commands

Derive `CLAUDE.md`'s Commands section automatically where possible instead
of asking again:

- If `package.json` exists: read its `scripts` — map `dev`/`build` →
  Build, `test` → Test, `lint` → Lint. Note if there's no `format` script.
- If `manage.py` exists (Django): Build = n/a (interpreted), Test =
  `.venv/bin/python manage.py test`, dev server = `.venv/bin/python
  manage.py runserver`.

`CLAUDE.md` has one Test command, not a unit/integration split. If the
project genuinely has two, name the one that must pass before a PR and
mention the other in the same line — the verifier and Stage 4 need a single
unambiguous command to run.

Only ask the user directly for a command if it genuinely can't be inferred
(no manifest present, or stack setup was skipped) — one question for
whatever's missing, not the whole set.

## Step 6 — architecture

If a stack was scaffolded, pre-fill the Architecture section from that
framework's standard layout (e.g. Next.js App Router: `src/app/` routes,
`src/components/`, `public/`). Ask a single question to confirm or adjust
it, rather than asking from scratch.

## Step 7 — deploy and protected paths (optional)

One combined question: "Any production deploy command yet, or
protected/generated paths? Fine to skip and fill in later."

## Step 8 — write everything

Edit:
- **`CLAUDE.md`** — Commands, Conventions (including `Language/runtime`
  and `Framework`, using the *verified actual* versions from Step 4, not
  just what was requested), Architecture. Leave "Things Claude gets wrong
  here" empty. **Remove the `## Setup` section entirely** — it's a
  one-time trigger and `.claude/.bootstrapped` (written below) makes it
  moot from here on. Leave `## The loop` exactly as it is — its `<slug>` is
  a variable that gets filled in per piece of work, not a setup placeholder.
- **`README.md`** — replace the title and opening framing with the real
  project name/purpose. Leave the stage-map table and process notes as-is.
- **`REVIEW.md`** — fill "Excluded paths" with the stack's known
  generated/build dirs (Next.js → `.next/`, `node_modules/`; Django →
  `.venv/`, `__pycache__/`, `staticfiles/`). Leave the placeholder and say
  so in the summary if you can't confidently infer something.
- **`.claude/hooks/production-gate.sh`** — update the deploy-command match
  if one was given in Step 7; otherwise leave as-is.
- **`.claude/hooks/post-edit-reminder.sh`** — fill in the real format
  command (e.g. `npx prettier --write .`, `.venv/bin/black .`) if one
  exists.
- **`.claude/hooks/protected-paths.sh`** — fill `PROTECTED_PATTERNS` if
  named in Step 7; otherwise leave it empty (a valid, intentional state).

## What NOT to touch

Deliberately left for real use, not initial setup — don't fabricate
content for these to seem thorough:

- the `brief/` and `plans/` **templates** themselves — Step 10 copies
  `brief/TEMPLATE.md` for the first piece of work, but the templates stay
  exactly as they are
- `CLAUDE.md`'s "Things Claude gets wrong here" — it fills from real
  mistakes, and a fabricated entry there is actively misleading

## Step 9 — write the marker, and open the setup PR

1. Write `.claude/.bootstrapped` with the captured project name, stack,
   verified versions, and today's date (plain text — a marker
   `session-start-check.sh` and `CLAUDE.md`'s Setup section look for, not
   a config file other tooling reads).
2. Report a short summary *before* committing, so they can object while
   it's cheap: what was scaffolded/installed (with the verified actual
   versions), what was filled in, and what's still deferred (any
   placeholder you couldn't infer).
3. **Put the setup on a branch and open a PR.** The default branch is
   PR-only — `default-branch-guard.sh` blocks a direct push, and setup is
   not an exception to the rule it exists to enforce.

   ```
   git checkout -b bootstrap-setup
   git add -A && git commit -m "Bootstrap <project>: <stack>"
   git push -u origin bootstrap-setup
   gh pr create --fill
   ```

   If the scaffold pulled in dependencies, check `.gitignore` covers them
   (`node_modules/`, `.venv/`) before staging — the repo's existing
   ignores plus whatever the scaffold appended should already handle it.

   No `gh`, or it isn't authenticated? Push the branch anyway and give them
   the compare URL to open the PR in a browser
   (`https://github.com/<owner>/<repo>/compare/bootstrap-setup?expand=1`).
   No remote at all? Commit on the branch, say the push is deferred, and
   move on — a local-only repo is a fine place to start.

4. **Stop and wait for the merge.** Tell them plainly: merge that PR
   (`gh pr merge --squash --delete-branch` works from here), then say so,
   and you'll start their first piece of work.

   This isn't ceremony. Two things depend on setup being *on the default
   branch* before any feature branch forks off it:
   - `.claude/.bootstrapped` has to be tracked and reachable from the
     default branch. `git worktree add` checks out tracked files only, so
     otherwise every parallel worktree looks unconfigured and re-runs
     bootstrap.
   - Step 10 branches immediately. Fork before the merge and the first
     feature PR carries the entire scaffold in its diff.

   It also means the first thing they ever do in the repo is exercise the
   PR gate the whole skeleton is built around.

5. Once they confirm the merge: `git checkout <default-branch> && git pull`,
   verify `.claude/.bootstrapped` is present and tracked
   (`git ls-files --error-unmatch .claude/.bootstrapped`), then go to Step 10.

**On a re-run** (`/bootstrap` after a stack change): same branch-and-PR
shape, but name the branch for what changed (e.g. `bootstrap-rerun-django`),
and skip Step 10 — they're already in the loop and this is a config change
like any other.

## Step 10 — hand off into the loop

Runs once the setup PR is merged and the default branch is pulled. Setup was
not the finish line; it was the thing that had to happen before Stage 1 —
so don't end the session there, walk them into the loop.

**First**, show the loop in one screen (adjust nothing; this is the same
map `CLAUDE.md` and the `sdlc` skill carry):

```
1. Brief  brief/<slug>.md         problem, done-looks-like, out of scope
2. Plan   plans/<slug>.plan.md    committed BEFORE any code
3. Build  code + tests            implement the work order, commit it
4. Ship   verify → review → PR    checked with fresh eyes, then you merge
```

Say the three things that make it make sense: one kebab-case slug names the
branch and every artifact on it; each stage ends by committing its artifact,
and that commit is what starts the next stage; and the default branch only
ever moves by merged PR — the setup PR they just merged was the first
example. Add the one thing that is easy to miss: **there is nothing to
approve.** No `status:` flags, no sign-off lines — an artifact exists or it
doesn't, and that's the whole state. Mention that `/sdlc` re-prints this and
reports where any branch stands, and that the session start message will tell
them the same thing unprompted.

**Then** ask one question, per the one-question-at-a-time rule: *what's the
first thing you want to build?*

From their answer:

1. Propose a slug derived from it and confirm it.
2. `git checkout -b <slug>` from the freshly pulled default branch (so the
   merged setup is underneath it), then copy `brief/TEMPLATE.md` to
   `brief/<slug>.md`.
3. Interview them through the template's sections — Problem, What done looks
   like, Approach, Out of scope, Open questions — one question per message.
   Write what they actually said; leave a section thin, or delete it,
   rather than inventing requirements to fill it. Set the slug and today's
   date in the frontmatter.
4. Commit it.

**Then stop.** Tell them the brief is committed and Stage 2 (Plan) is what
comes next — in a fresh session, in plan mode, against that file. Don't write
the plan now, however obvious it looks: plan mode with a clean context is the
point, not a formality.

If they'd rather not start anything yet, that's fine — point at `/sdlc` for
whenever they do, and end there.
