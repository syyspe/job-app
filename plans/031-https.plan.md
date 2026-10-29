---
brief: brief/031-https.md
branch: 031-https
date: 2026-10-29
---

# Opt-in HTTPS for the production server — Plan

Context: the app is reachable from the iPhone over the LAN, but only over plain
HTTP, so the password and session cookie cross the Wi-Fi unencrypted. Setting
`TLS_CERT` and `TLS_KEY` (a mkcert-signed cert) makes `npm start` serve HTTPS
on the same port. With neither set, nothing changes.

Decisions made in planning:
- Env var names: `TLS_CERT` / `TLS_KEY`, both PEM file paths.
- Where the cert lives: outside the repo, at `/projects/tests/job-app-certs/`,
  next to `job-app.db` and `job-app-uploads`. Nothing to gitignore.
- An **empty** value counts as unset. `dev:server` and `test:e2e:prod` blank
  both vars, so a TLS-enabled `.env` can't switch them to HTTPS.
  (Node's `--env-file` doesn't override a var that's already set, even to
  `""`. Checked on Node 24.20.0.)
- Tests: the config parsing (including real file reads from a temp dir) and the
  cookie flag. The live HTTPS handshake is checked by hand (see Tests), because
  an automated check would need a committed private key or a call out to
  openssl.

## Affected files

- `server/lib/config.ts`: new `parseTls(certPath, keyPath)`, which returns
  `{ cert: Buffer; key: Buffer } | undefined`.
- `server/lib/config.test.ts`: tests for `parseTls`.
- `server/routes/auth.ts`: `createAuthRouter(db, secureCookies)`. The cookie
  options get `secure: secureCookies` on both `res.cookie` and
  `res.clearCookie`, so the clear still matches the cookie it clears.
- `server/routes/auth.test.ts`: a cookie test for `secureCookies: true`, plus
  an assertion that the default has no `Secure`.
- `server/app.ts`: `CreateAppOptions` gains `secureCookies?: boolean`
  (default `false`), passed to `createAuthRouter`.
- `server/index.ts`: reads the TLS vars, then picks `https.createServer` or
  `app.listen`. Logs `tls` on `api listening`.
- `package.json`: `dev:server` becomes
  `TLS_CERT= TLS_KEY= node --watch --env-file-if-exists=.env server/index.ts`.
- `playwright.prod.config.ts`: `TLS_CERT: ''` and `TLS_KEY: ''` in the
  `webServer.env`.
- `.env.example`: adds the two vars, commented out.
- `README.md`: "Running the server" (optional vars, plus a new "HTTPS"
  subsection), "Development" (dev stays HTTP), and "Claude Desktop (MCP)" (what
  changes under HTTPS).

## Work order

1. **`parseTls` in `server/lib/config.ts`**, test-first in `config.test.ts`:
   - Both values `undefined` or `''` → `undefined`.
   - Exactly one set → throws
     `TLS_CERT and TLS_KEY must be set together, or both left unset`.
   - Both set → `readFileSync` each file. A failed read throws
     `TLS_CERT could not be read: <path> (<err.code>)` (or `TLS_KEY ...`),
     with the original error as `cause`. Use a small `readTlsFile(name, path)`
     helper so `parseTls` stays flat.
   - Success → `{ cert, key }`. The PEM content is not checked here:
     `https.createServer` checks it in step 3.
2. **Secure cookie.** In `auth.ts`, turn `COOKIE_OPTIONS` into
   `cookieOptions(secure)`, or spread `secure` into it at router creation.
   Thread `secureCookies` from `createApp`'s options. Add the tests in
   `auth.test.ts`: a second app built with `{ secureCookies: true }` gives a
   login `Set-Cookie` that contains `Secure`, and the default app's doesn't.
3. **`server/index.ts`.**
   `const tls = readOrExit(() => parseTls(process.env.TLS_CERT, process.env.TLS_KEY))`
   goes beside the other `readOrExit` calls. Then
   `createApp(..., { staticDir, pageSize, logger, secureCookies: tls !== undefined })`.
   - With TLS:
     `const server = readOrExit(() => createServer(tls, app))` (from
     `node:https`), so a readable but invalid PEM is also one stderr line and
     exit 2. Then `server.listen(port, onListening)`.
   - Without TLS: `app.listen(port, onListening)`, as today.
   - `onListening` logs `api listening` with the existing fields plus
     `tls: boolean`.
   - Keep every function under the `simple-code` limits. Branch once on
     `tls`, with no new abstraction around it.
4. **Keep dev and e2e on HTTP.** Blank the two vars in the `dev:server`
   script and in `playwright.prod.config.ts`'s env, with a one-line comment in
   the config saying why. `playwright.config.ts` needs nothing, because it runs
   `node server/index.ts` without `--env-file`.
5. **`.env.example`**: under `LOG_LEVEL`, add
   `# Both set → npm start serves HTTPS on PORT; see the README's "HTTPS".`
   followed by `# TLS_CERT=/path/to/job-app.pem` and
   `# TLS_KEY=/path/to/job-app-key.pem`.
6. **README.**
   - "Running the server": add `TLS_CERT`/`TLS_KEY` to the optional vars.
   - New `### HTTPS` subsection: `mkdir -p /projects/tests/job-app-certs && cd` there, then
     `mkcert -cert-file job-app.pem -key-file job-app-key.pem localhost 127.0.0.1 192.168.100.9`
     (this signs with the existing CA at `mkcert -CAROOT`). Point `.env` at
     both files. Keep the key outside version control, which is why it
     lives outside the repo. After that, `npm start` serves
     `https://192.168.100.9:3001`, and the cookie is `Secure`. Setting only one
     var, or an unreadable file, stops startup.
   - "Development": `npm run dev:server` always serves plain HTTP, whatever
     `.env` says.
   - "Claude Desktop (MCP)": under HTTPS, set
     `JOBAPP_API_URL=https://localhost:3001` and add `NODE_EXTRA_CA_CERTS` to
     the `env` block, pointing at `$(mkcert -CAROOT)/rootCA.pem`. Point out
     that `dev:server` stays HTTP, so the URL follows whichever process is
     running.
7. Run `npm test`, `npm run lint` and `npm run build`. Then run both e2e suites
   after the port check. Then do the manual HTTPS check below.

## Tests

- New (`config.test.ts`):
  - unset/empty → `undefined`;
  - only `TLS_CERT` set, and only `TLS_KEY` set → the "set together" error;
  - a nonexistent cert path, and a nonexistent key path → each error names its var and the path;
  - two readable temp files → their contents come back as `cert`/`key`.
- New (`auth.test.ts`): with `secureCookies: true`, the login `Set-Cookie`
  contains `Secure`.
- Updated (`auth.test.ts`): the existing httpOnly test also asserts there's no
  `Secure` by default.
- Failure cases, all at startup in `server/index.ts`. Each one prints one
  stderr line and exits 2, with no stack:
  - one var set without the other;
  - an unreadable or missing file (the message names the var, the path and the
    errno code);
  - a readable file that isn't valid PEM, or a cert and key that don't match
    (this is the OpenSSL message from `createServer`, via `readOrExit`).
  - Request-time behaviour is unchanged, so the error and logging contracts
    stay as they are.
- Manual check (in the build session):
  - generate the certs with the README's own commands. This also checks the
    docs.
  - run
    `TLS_CERT=/projects/tests/job-app-certs/job-app.pem TLS_KEY=/projects/tests/job-app-certs/job-app-key.pem npm start`.
    Vars set inline take precedence over `.env`, so `.env` stays untouched.
  - then
    `curl --cacert "$(mkcert -CAROOT)/rootCA.pem" -i https://localhost:3001/api/login -d '{}' -H 'Content-Type: application/json'`.
    Expect a 401 JSON answer over TLS, with no certificate error.
  - `TLS_CERT=/projects/tests/job-app-certs/job-app.pem npm start` → the
    exit-2 line.
- Verification command: `npm test` (the gate), plus `npm run test:e2e` and
  `npm run test:e2e:prod`, after
  `ss -ltnp | grep -E '5173|3001|3002'` shows the ports free.

---

**Next stage:** run `/sdlc`.
