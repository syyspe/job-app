import { useId } from 'react'
import { RUN_KIND_LABELS, RUN_OUTCOME_LABELS, runOutcome, runSpend } from '../lib/agentRuns.ts'
import { formatTimestamp } from '../lib/dates.ts'
import type { AgentRun, AgentRuns } from '../types.ts'

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
