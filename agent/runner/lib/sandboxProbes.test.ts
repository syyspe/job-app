// @vitest-environment node
import { expect, test } from 'vitest'
import { judgeBenignRun } from './sandboxProbes.ts'

const CWD = '/tmp/job-agent-step-x'

function benignRun(agents: string[]) {
  const init = {
    type: 'system',
    subtype: 'init',
    cwd: CWD,
    tools: ['StructuredOutput', 'mcp__profile__search_profile'],
    mcp_servers: [{ name: 'profile', status: 'connected' }],
    slash_commands: [],
    skills: [],
    plugins: [{ name: 'core', path: 'builtin' }],
    agents,
    output_style: 'default',
  }
  const result = { type: 'result', is_error: false, structured_output: { summary: 'A backend role.' } }
  const stdout = [init, result].map((event) => JSON.stringify(event)).join('\n')
  return { kind: 'exited' as const, code: 0, stdout, cwd: CWD }
}

function customisationsProbe(agents: string[]) {
  return judgeBenignRun(benignRun(agents), 'CANARY').find((probe) => probe.property === 'no customisations loaded')
}

test('the built-in agent types, web-fetch included, count as no customisations', () => {
  const builtins = ['claude', 'Explore', 'general-purpose', 'Plan', 'statusline-setup', 'web-fetch']

  expect(customisationsProbe(builtins)).toEqual({ property: 'no customisations loaded', ok: true, detail: '' })
})

test('any other agent type fails the probe and is named', () => {
  expect(customisationsProbe(['claude', 'verifier'])).toEqual({
    property: 'no customisations loaded',
    ok: false,
    detail: 'loaded: verifier',
  })
})
