import { useCallback, useEffect, useId, useState } from 'react'
import { RUN_KIND_LABELS, RUN_OUTCOME_LABELS, runOutcome, runSpend } from '../lib/agentRuns.ts'
import { listAgentRuns, startAgentRun } from '../lib/api.ts'
import { useApiAction } from '../lib/apiAction.ts'
import { formatTimestamp } from '../lib/dates.ts'
import type { AgentRun, AgentRunKind, AgentRuns } from '../types.ts'

const POLL_MS = 3000

interface AgentRunPanelProps {
  onUnauthorized: () => void
  onRunFinished: () => void
}

function useAgentRuns({ onUnauthorized, onRunFinished }: AgentRunPanelProps) {
  const [runs, setRuns] = useState<AgentRuns>({ current: null, recent: [] })
  // Counts finished polls, so a failed one still schedules the next.
  const [polls, setPolls] = useState(0)
  const run = useApiAction(onUnauthorized)

  const reload = useCallback(async () => setRuns(await listAgentRuns()), [])

  useEffect(() => {
    void run(reload)
  }, [run, reload])

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

  const start = (kind: AgentRunKind) =>
    run(async () => {
      const started = await startAgentRun(kind)
      setRuns((previous) => ({ ...previous, current: started }))
    })

  return { runs, start }
}

function CurrentRun({ run }: { run: AgentRun }) {
  return (
    <div className="run-item" data-outcome="running">
      <p className="run-item-head">
        Running: {RUN_KIND_LABELS[run.kind]}, started {formatTimestamp(run.startedAt)}
      </p>
      <pre className="run-output" role="log" aria-label="Current run output">
        {run.output}
      </pre>
    </div>
  )
}

function RecentRun({ run, open }: { run: AgentRun; open: boolean }) {
  const outcome = runOutcome(run)
  const spend = runSpend(run.output)
  return (
    <li className="run-item" data-outcome={outcome}>
      <p className="run-item-head">
        <span className="run-kind">{RUN_KIND_LABELS[run.kind]}</span>
        <span className="run-time">{formatTimestamp(run.startedAt)}</span>
        <span className="run-outcome">{RUN_OUTCOME_LABELS[outcome]}</span>
        {spend && <span className="run-spend">{`API $${spend.run} run, $${spend.month} month`}</span>}
      </p>
      <details open={open}>
        <summary>Output</summary>
        <pre className="run-output">{run.output}</pre>
      </details>
    </li>
  )
}

export function AgentRunPanel(props: AgentRunPanelProps) {
  const { runs, start } = useAgentRuns(props)
  const headingId = useId()
  const running = runs.current !== null

  return (
    <section className="run-panel" aria-labelledby={headingId}>
      <div className="run-panel-head">
        <h3 id={headingId}>Runs</h3>
        <div className="run-panel-actions">
          <button type="button" className="button" disabled={running} onClick={() => start('run')}>
            Run now
          </button>
          <button type="button" className="button" disabled={running} onClick={() => start('collect')}>
            Check mail
          </button>
        </div>
      </div>
      {runs.current && <CurrentRun run={runs.current} />}
      {!running && runs.recent.length === 0 && <p className="run-empty">No runs yet. Check mail to start one.</p>}
      <ul className="run-list" aria-label="Recent runs">
        {runs.recent.map((run, index) => (
          <RecentRun key={run.id} run={run} open={index === 0} />
        ))}
      </ul>
    </section>
  )
}
