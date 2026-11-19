#!/usr/bin/env node
// Stands in for the claude CLI as `claudeBin`. It records argv, env, cwd and
// stdin as JSON in the file FAKE_CLAUDE_LOG names, then acts as
// FAKE_CLAUDE_MODE says: ok (default), is_error, exit1, hang, garbage or split.
// FAKE_CLAUDE_OUTPUT is the structured output an `ok` run returns.
import { readdirSync, writeFileSync } from 'node:fs'

if (process.argv[2] === '--version') {
  console.log('9.9.9 (Claude Code)')
  process.exit(0)
}

let stdin = ''
for await (const chunk of process.stdin) stdin += String(chunk)
const record = { argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), cwdEntries: readdirSync('.'), stdin, pid: process.pid }
writeFileSync(process.env.FAKE_CLAUDE_LOG ?? '/dev/null', JSON.stringify(record))

const mode = process.env.FAKE_CLAUDE_MODE ?? 'ok'
const output = JSON.parse(process.env.FAKE_CLAUDE_OUTPUT ?? '{}') as unknown
if (mode === 'hang') setInterval(() => {}, 1000)
if (mode === 'exit1') process.exit(1)
if (mode === 'garbage') console.log('not json')
if (mode === 'is_error') console.log(JSON.stringify({ type: 'result', is_error: true, result: 'failed' }))
if (mode === 'ok') console.log(JSON.stringify({ type: 'result', is_error: false, structured_output: output }))
if (mode === 'split') {
  // The envelope in two writes that cut a multibyte character in half.
  const bytes = Buffer.from(`${JSON.stringify({ type: 'result', is_error: false, structured_output: output })}\n`)
  const cut = bytes.indexOf(0xc3) + 1
  process.stdout.write(bytes.subarray(0, cut))
  await new Promise((resolve) => setTimeout(resolve, 100))
  process.stdout.write(bytes.subarray(cut))
}
