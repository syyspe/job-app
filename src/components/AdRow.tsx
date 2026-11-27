import { useEffect, useRef, useState } from 'react'
import { adGroup, canDismiss, setAsideBy } from '../lib/adStates.ts'
import type { AdGroup, DraftStatus } from '../lib/adStates.ts'
import { formatDay } from '../lib/dates.ts'
import { sourceLabel } from '../lib/sources.ts'
import type { AdPrescreen, AdSummary } from '../types.ts'

type Mode = 'idle' | 'dismiss'

function displayTitle(ad: AdSummary): string {
  return ad.title || `${sourceLabel(ad.source)} ad · ${formatDay(ad.firstSeenAt)}`
}

export interface AdActions {
  onRetry: (ad: AdSummary) => void
  /** Starts a draft run for a suitable ad. */
  onDraft: (id: number) => void
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

const VERDICT_LABELS: Record<AdPrescreen['verdict'], string> = {
  promising: 'Promising',
  not_promising: 'Not promising',
}

/** Kept after the ad moves on, so the verdict can be judged against the click. */
function AdPrescreenLine({ ad }: { ad: AdSummary }) {
  if (!ad.prescreen) return null
  const { verdict, reason } = ad.prescreen
  return (
    <p className="ad-prescreen">
      Pre-screen: {VERDICT_LABELS[verdict]}
      {reason && ` — ${reason}`}
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
  group: AdGroup | null
  draft: DraftStatus
  onRetry: () => void
  onDraft: () => void
  onModeChange: (mode: Mode) => void
}

function AdButtons({ ad, group, draft, onRetry, onDraft, onModeChange }: AdButtonsProps) {
  return (
    <div className="ad-actions">
      {ad.state === 'failed' && (
        <button type="button" className="button button-primary" onClick={onRetry}>
          Retry
        </button>
      )}
      {draft !== 'none' && (
        <button type="button" className="button button-primary" disabled={draft === 'busy'} onClick={onDraft}>
          Draft
        </button>
      )}
      {canDismiss(group) && (
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
  /** Whether the Draft button shows, and whether a run is holding it back. */
  draft: DraftStatus
  /** The ad a summary link opened: marked, and scrolled into view. */
  current?: boolean
}

function useScrolledIntoView(current: boolean) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'center' })
  }, [current])
  return ref
}

/** A set-aside ad says which step dropped it; any other keeps its verdicts. */
function AdVerdicts({ ad }: { ad: AdSummary }) {
  const droppedBy = setAsideBy(ad)
  if (droppedBy) return <p className="ad-prescreen">{droppedBy}</p>
  return (
    <>
      <AdPrescreenLine ad={ad} />
      {ad.evaluation && <p className="ad-fit">{ad.evaluation.fitSummary}</p>}
    </>
  )
}

function AdDetails({ ad }: { ad: AdSummary }) {
  return (
    <>
      <span className="ad-title">{displayTitle(ad)}</span>
      <AdFacts ad={ad} />
      <AdVerdicts ad={ad} />
      {ad.state === 'failed' && ad.lastError && (
        <p className="ad-error">Failed with {ad.lastError}</p>
      )}
    </>
  )
}

export function AdRow({ ad, actions, draft, current = false }: AdRowProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const ref = useScrolledIntoView(current)
  const group = adGroup(ad)

  return (
    <li ref={ref} className="ad-item" data-group={group ?? undefined} aria-current={current || undefined}>
      <AdDetails ad={ad} />
      {draft === 'running' && <p className="ad-drafting">Drafting…</p>}
      {mode === 'idle' && draft !== 'running' && (
        <AdButtons
          ad={ad}
          group={group}
          draft={draft}
          onRetry={() => actions.onRetry(ad)}
          onDraft={() => actions.onDraft(ad.id)}
          onModeChange={setMode}
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
