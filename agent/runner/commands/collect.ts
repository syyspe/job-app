// npm run agent:collect — reads new job alert emails, ingests their ads,
// screens titles, then fetches the ad pages of the automatic sources.
import { setTimeout as sleep } from 'node:timers/promises'
import { runCommand } from '../../lib/cliError.ts'
import { configPath, envPath, stateDir } from '../../lib/paths.ts'
import { runCollect } from '../lib/collectRun.ts'
import type { CollectReport, SourceReport } from '../lib/collectRun.ts'
import { loadJobAppEnv, loadMailEnv } from '../lib/env.ts'
import { createJobAppClient } from '../lib/jobApp.ts'
import { openMailbox } from '../lib/mailbox.ts'
import { createPoliteHttp } from '../lib/politeHttp.ts'
import { loadRunnerConfig, loadSourcesConfig } from '../lib/runnerConfig.ts'
import { CONNECTORS } from '../lib/sources/index.ts'
import type { SourceConnector } from '../lib/sources/types.ts'
import { createRunnerState, localDate } from '../lib/state.ts'

function sourceLine(id: string, report: SourceReport): string {
  const { messages, newAds, existingAds, emptyAlerts, fetched } = report
  const collected = `${id}: ${messages} messages, ${newAds} new ads, ${existingAds} existing, ${emptyAlerts} empty alerts`
  if (CONNECTORS.find((connector) => connector.id === id)?.mode === 'handover') return collected
  const { ready, duplicate, gone, retrying, failed, blocked } = fetched
  return `${collected}; fetched ${ready} ready, ${duplicate} duplicate, ${gone} gone, ${retrying} retrying, ${failed} failed, ${blocked} blocked`
}

function printReport({ sources, screened, leftNew }: CollectReport): void {
  for (const [id, report] of Object.entries(sources)) console.log(sourceLine(id, report))
  const { titleRejected, awaitingHandover } = screened
  console.log(`screened: ${titleRejected} title_rejected, ${awaitingHandover} awaiting_handover`)
  console.log(`left new: ${leftNew} ads`)
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
  const mailbox = await openMailbox(mail)
  let report: CollectReport
  try {
    report = await runCollect({ mailbox, jobApp, connectors: CONNECTORS, sources, titleRules: config.titleRules.reject, state, today, httpFor })
  } finally {
    await mailbox.close()
  }
  printReport(report)
})
