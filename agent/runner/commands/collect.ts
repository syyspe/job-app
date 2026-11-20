// npm run agent:collect — reads new job alert emails, ingests their ads,
// screens titles, then fetches the ad pages of the automatic sources.
import { setTimeout as sleep } from 'node:timers/promises'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, stateDir } from '../../lib/paths.ts'
import { formatCollectReport, runCollect } from '../lib/collectRun.ts'
import type { CollectReport } from '../lib/collectRun.ts'
import { loadJobAppEnv, loadMailEnv } from '../lib/env.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { openMailbox } from '../lib/mailbox.ts'
import { createPoliteHttp } from '../lib/politeHttp.ts'
import { loadRunnerConfig, loadSourcesConfig } from '../lib/runnerConfig.ts'
import { CONNECTORS } from '../lib/sources/index.ts'
import type { SourceConnector } from '../lib/sources/types.ts'
import { createRunnerState, localDate } from '../lib/state.ts'

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
  const mailbox = await openMailbox(mail)
  let report: CollectReport
  try {
    report = await runCollect({ mailbox, jobApp, connectors: CONNECTORS, sources, titleRules: config.titleRules.reject, state, today, httpFor })
  } finally {
    await mailbox.close()
  }
  for (const line of formatCollectReport(report, CONNECTORS)) console.log(line)
})
