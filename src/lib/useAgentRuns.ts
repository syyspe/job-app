import { useCallback, useEffect, useState } from 'react'
import { listAgentRuns, startAgentRun } from './api.ts'
import { useApiAction } from './apiAction.ts'
import type { AgentRuns, RunRequest } from '../types.ts'

const POLL_MS = 3000

interface UseAgentRunsOptions {
  /** Without agent access nothing is fetched or polled. */
  enabled: boolean
  onUnauthorized: () => void
  onRunFinished: () => void
}

export interface UseAgentRuns {
  runs: AgentRuns
  start: (request: RunRequest) => Promise<void>
}

export function useAgentRuns({ enabled, onUnauthorized, onRunFinished }: UseAgentRunsOptions): UseAgentRuns {
  const [runs, setRuns] = useState<AgentRuns>({ current: null, recent: [] })
  // Counts finished polls, so a failed one still schedules the next.
  const [polls, setPolls] = useState(0)
  const run = useApiAction(onUnauthorized)

  const reload = useCallback(async () => setRuns(await listAgentRuns()), [])

  useEffect(() => {
    if (enabled) void run(reload)
  }, [enabled, run, reload])

  // Polled only while a run is current, so a poll that finds none saw it finish.
  useEffect(() => {
    if (!runs.current) return
    const timer = setTimeout(async () => {
      await run(async () => {
        const next = await listAgentRuns()
        setRuns(next)
        if (!next.current) onRunFinished()
      })
      setPolls((count) => count + 1)
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [runs, polls, run, onRunFinished])

  const start = (request: RunRequest) =>
    run(async () => {
      const started = await startAgentRun(request)
      setRuns((previous) => ({ ...previous, current: started }))
    })

  return { runs, start }
}
