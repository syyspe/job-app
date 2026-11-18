import { useState } from 'react'
import { AdHandoverForm } from './AdHandoverForm.tsx'
import { canDismiss, canHandOver } from '../lib/adStates.ts'
import type { AdHandoverInput, AdSummary } from '../types.ts'

type Mode = 'idle' | 'handover' | 'dismiss'

export interface AdActions {
  onHandOver: (id: number, input: AdHandoverInput) => void
  onRetry: (ad: AdSummary) => void
  onDismiss: (id: number) => void
}

function AdFacts({ ad }: { ad: AdSummary }) {
  return (
    <p className="ad-facts">
      {ad.company && <span>{ad.company}</span>}
      <span>{ad.source}</span>
      {ad.location && <span>{ad.location}</span>}
      {ad.deadline && <span>Deadline {ad.deadline}</span>}
      <a href={ad.url} target="_blank" rel="noreferrer">
        Open ad
      </a>
    </p>
  )
}

interface DismissConfirmProps {
  onConfirm: () => void
  onCancel: () => void
}

function DismissConfirm({ onConfirm, onCancel }: DismissConfirmProps) {
  return (
    <div className="ad-confirm">
      <span>Dismiss this ad?</span>
      <button type="button" className="button button-danger" onClick={onConfirm}>
        Confirm dismiss
      </button>
      <button type="button" className="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

interface AdButtonsProps {
  ad: AdSummary
  onRetry: () => void
  onModeChange: (mode: Mode) => void
}

function AdButtons({ ad, onRetry, onModeChange }: AdButtonsProps) {
  return (
    <div className="ad-actions">
      {canHandOver(ad.state) && (
        <button
          type="button"
          className="button button-primary"
          onClick={() => onModeChange('handover')}
        >
          Hand over
        </button>
      )}
      {ad.state === 'failed' && (
        <button type="button" className="button button-primary" onClick={onRetry}>
          Retry
        </button>
      )}
      {canDismiss(ad.state) && (
        <button type="button" className="button" onClick={() => onModeChange('dismiss')}>
          Dismiss
        </button>
      )}
    </div>
  )
}

interface AdRowProps {
  ad: AdSummary
  actions: AdActions
}

export function AdRow({ ad, actions }: AdRowProps) {
  const [mode, setMode] = useState<Mode>('idle')

  function handleHandOver(input: AdHandoverInput) {
    actions.onHandOver(ad.id, input)
    setMode('idle')
  }

  return (
    <li className="ad-item" data-state={ad.state}>
      <span className="ad-title">{ad.title || 'Untitled ad'}</span>
      <AdFacts ad={ad} />
      {ad.evaluation && <p className="ad-fit">{ad.evaluation.fitSummary}</p>}
      {ad.state === 'failed' && ad.lastError && (
        <p className="ad-error">Failed with {ad.lastError}</p>
      )}
      {mode === 'idle' && (
        <AdButtons ad={ad} onRetry={() => actions.onRetry(ad)} onModeChange={setMode} />
      )}
      {mode === 'handover' && (
        <AdHandoverForm
          title={ad.title}
          company={ad.company}
          onSubmit={handleHandOver}
          onCancel={() => setMode('idle')}
        />
      )}
      {mode === 'dismiss' && (
        <DismissConfirm
          onConfirm={() => actions.onDismiss(ad.id)}
          onCancel={() => setMode('idle')}
        />
      )}
    </li>
  )
}
