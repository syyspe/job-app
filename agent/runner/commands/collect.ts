// npm run agent:collect — reads new job alert emails, ingests their ads,
// screens titles, then fetches the ad pages of the automatic sources.
import { setTimeout as sleep } from 'node:timers/promises'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, stateDir } from '../../lib/paths.ts'
import { formatCollectReport, runCollect } from '../lib/collectRun.ts'
import type { CollectReport, CollectRunOptions } from '../lib/collectRun.ts'
import { loadJobAppEnv, loadMailEnv } from '../lib/env.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { acquireRunLock } from '../lib/lock.ts'
import { openMailbox } from '../lib/mailbox.ts'
import type { MailConfig } from '../lib/mailbox.ts'
import { createPoliteHttp } from '../lib/politeHttp.ts'
import { loadRunnerConfig, loadSourcesConfig } from '../lib/runnerConfig.ts'
import { CONNECTORS } from '../lib/sources/index.ts'
import type { SourceConnector } from '../lib/sources/types.ts'
import { createRunnerState, localDate } from '../lib/state.ts'

async function collectMail(mail: MailConfig, options: Omit<CollectRunOptions, 'mailbox'>): Promise<CollectReport> {
  const mailbox = await openMailbox(mail)
  try {
    return await runCollect({ mailbox, ...options })
  } finally {
    await mailbox.close()
  }
}

await runCommand(async () => {
  const path = configPath(process.env)
  const sources = loadSourcesConfig(path, CONNECTORS)
  const config = loadRunnerConfig(path)
  const env = envPath(process.env)
  const mail = { ...loadMailEnv(env), envPath: env }
  const jobApp = createJobAppClient({ ...loadJobAppEnv(env), envPath: env })
  const state = createRunnerState(stateDir(process.env))
  const today = localDate(new Date())
  const counters = state.counters(today)
  const httpFor = (connector: SourceConnector) => {
    const { dailyOpenCap, minDelayMs } = sources[connector.id]
    const hosts = connector.fetchHosts ?? []
    return createPoliteHttp({ sourceId: connector.id, hosts, dailyOpenCap, minDelayMs, counters, fetch, now: Date.now, sleep })
  }
  const release = acquireRunLock(stateDir(process.env))
  let report: CollectReport
  try {
    report = await collectMail(mail, { jobApp, connectors: CONNECTORS, sources, titleRules: config.titleRules.reject, state, today, httpFor })
  } finally {
    release()
  }
  for (const line of formatCollectReport(report, CONNECTORS)) console.log(line)
})
