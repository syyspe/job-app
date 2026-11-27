import { useId, useState } from 'react'
import { RUN_KIND_LABELS, RUN_OUTCOME_LABELS, runOutcome, runSpend } from '../lib/agentRuns.ts'
import { formatTimestamp } from '../lib/dates.ts'
import { paginate } from '../lib/paging.ts'
import type { AgentRun, AgentRuns } from '../types.ts'
import { Pagination } from './Pagination.tsx'

interface AgentRunPanelProps {
  runs: AgentRuns
  onStart: (kind: 'run' | 'collect') => void
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

function RecentRun({ run }: { run: AgentRun }) {
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
      <details open>
        <summary>Output</summary>
        <pre className="run-output">{run.output}</pre>
      </details>
    </li>
  )
}

// Unmounted while a run is current, so the page starts back at the newest run
// once that run finishes.
function RecentRuns({ runs }: { runs: AgentRun[] }) {
  const [page, setPage] = useState(1)
  if (runs.length === 0) return <p className="run-empty">No runs yet. Check mail to start one.</p>

  const shown = paginate(runs, page, 1)
  return (
    <>
      <ul className="run-list" aria-label="Recent runs">
        {shown.items.map((run) => (
          <RecentRun key={run.id} run={run} />
        ))}
      </ul>
      <Pagination label="Run pages" unit="Run" page={shown.page} pageCount={shown.pageCount} onChange={setPage} />
    </>
  )
}

export function AgentRunPanel({ runs, onStart }: AgentRunPanelProps) {
  const headingId = useId()
  const running = runs.current !== null

  return (
    <section className="run-panel" aria-labelledby={headingId}>
      <div className="run-panel-head">
        <h3 id={headingId}>Runs</h3>
        <div className="run-panel-actions">
          <button type="button" className="button" disabled={running} onClick={() => onStart('run')}>
            Run now
          </button>
          <button type="button" className="button" disabled={running} onClick={() => onStart('collect')}>
            Check mail
          </button>
        </div>
      </div>
      {runs.current ? <CurrentRun run={runs.current} /> : <RecentRuns runs={runs.recent} />}
    </section>
  )
}
