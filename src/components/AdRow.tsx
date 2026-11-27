import { useEffect, useRef, useState } from 'react'
import { AdHandoverForm } from './AdHandoverForm.tsx'
import { canDismiss, canHandOver } from '../lib/adStates.ts'
import { formatDay } from '../lib/dates.ts'
import { sourceLabel } from '../lib/sources.ts'
import type { AdHandoverInput, AdPrescreen, AdSummary } from '../types.ts'

type Mode = 'idle' | 'handover' | 'dismiss'

function displayTitle(ad: AdSummary): string {
  return ad.title || `${sourceLabel(ad.source)} ad · ${formatDay(ad.firstSeenAt)}`
}

export interface AdActions {
  /** Resolves to whether the ad was handed over, so a failure can keep the form. */
  onHandOver: (id: number, input: AdHandoverInput) => Promise<boolean>
  /** Marks the ad for the next daily run to fetch. */
  onFetch: (id: number) => void
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
      {ad.fetchRequestedAt && ' · Fetch requested'}
    </p>
  )
}

/** Only a waiting ad from a source the runner can fetch for the user. */
function canFetch(ad: AdSummary): boolean {
  return ad.state === 'awaiting_handover' && ad.sourceMode === 'handover'
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
  onFetch: () => void
  onModeChange: (mode: Mode) => void
}

function FetchButton({ ad, onFetch }: Pick<AdButtonsProps, 'ad' | 'onFetch'>) {
  if (ad.fetchRequestedAt) {
    return <span className="ad-fetch-requested">Fetch requested — the next run fetches it</span>
  }
  return (
    <button type="button" className="button button-primary" onClick={onFetch}>
      Fetch
    </button>
  )
}

function AdButtons({ ad, onRetry, onFetch, onModeChange }: AdButtonsProps) {
  const fetchable = canFetch(ad)
  return (
    <div className="ad-actions">
      {fetchable && <FetchButton ad={ad} onFetch={onFetch} />}
      {canHandOver(ad.state) && (
        <button
          type="button"
          className={fetchable ? 'button' : 'button button-primary'}
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

function AdDetails({ ad }: { ad: AdSummary }) {
  return (
    <>
      <span className="ad-title">{displayTitle(ad)}</span>
      <AdFacts ad={ad} />
      <AdPrescreenLine ad={ad} />
      {ad.evaluation && <p className="ad-fit">{ad.evaluation.fitSummary}</p>}
      {ad.state === 'failed' && ad.lastError && (
        <p className="ad-error">Failed with {ad.lastError}</p>
      )}
    </>
  )
}

export function AdRow({ ad, actions, current = false }: AdRowProps) {
  const [mode, setMode] = useState<Mode>('idle')
  const ref = useScrolledIntoView(current)

  async function handleHandOver(input: AdHandoverInput) {
    const handedOver = await actions.onHandOver(ad.id, input)
    if (handedOver) setMode('idle')
  }

  return (
    <li ref={ref} className="ad-item" data-state={ad.state} aria-current={current || undefined}>
      <AdDetails ad={ad} />
      {mode === 'idle' && (
        <AdButtons
          ad={ad}
          onRetry={() => actions.onRetry(ad)}
          onFetch={() => actions.onFetch(ad.id)}
          onModeChange={setMode}
        />
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
