---
slug: 031-https
date: 2026-10-29
---

# Opt-in HTTPS for the production server

## Problem

The app is now reachable from the iPhone over the LAN
(`http://192.168.100.9:3001`, after a Hyper-V firewall rule), but only over
plain HTTP, so the login password and the session cookie cross the Wi-Fi
unencrypted. This machine already has a mkcert root CA that the workout app
uses for HTTPS, so the job app can get a trusted certificate cheaply.

## What done looks like

1. When `.env` names both a certificate and a key file, `npm start` serves
   HTTPS on the same port (3001 by default). When it names neither, the
   server serves plain HTTP exactly as it does today.
2. Setting only one of the two, or naming a file that can't be read, is a
   configuration error: one stderr line and exit 2, like the other config
   errors.
3. Under HTTPS the session cookie also gets `Secure`. Under HTTP its
   attributes stay unchanged.
4. `.env.example` lists the two new variables, commented out.
5. The README covers generating a job-app certificate from the existing
   mkcert CA (`mkcert localhost 127.0.0.1 192.168.100.9`), where to keep it
   (outside version control), and how to point `.env` at it.
6. The README's "Claude Desktop (MCP)" section says what to change when the
   API is on HTTPS: `JOBAPP_API_URL=https://localhost:3001` and
   `NODE_EXTRA_CA_CERTS` pointing at mkcert's `rootCA.pem`.
7. `npm test` passes. `npm run test:e2e` and `npm run test:e2e:prod` still
   pass over plain HTTP.

## Approach

`server/index.ts` reads the two env vars. If both are set, it creates the
server with Node's built-in `node:https` and the cert/key; otherwise it uses
`app.listen` as today. No new dependency. `createApp` is told whether TLS is
on, so `server/routes/auth.ts` can add `secure: true` to its cookie options.

The certificate is a new one for the job app, signed by the same mkcert CA.
The iPhone already trusts that CA for the workout app. Reusing the workout
app's cert files was rejected because it couples the two projects.

## Out of scope

- HTTPS for the Vite dev server (`npm run dev`, 5173) and its `/api` proxy:
  dev and e2e stay plain HTTP on localhost.
- Code changes in `mcp/`: switching it to HTTPS is configuration only, and
  documented.
- Redirecting HTTP to HTTPS, or serving both on separate ports.
- Installing the mkcert root CA on the phone (already done for the workout
  app).

## Open questions

- The env var names (e.g. `TLS_CERT`/`TLS_KEY`).
- Whether the certificate goes in a git-ignored `certs/` in the repo or
  outside it entirely.
- Whether any automated test exercises the HTTPS path, or only the
  config parsing and the cookie flag.

---

**Next stage:** run `/sdlc`.
