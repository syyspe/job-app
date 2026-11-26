import { useCallback, useEffect, useState } from 'react'
import { AdList } from './AdList.tsx'
import type { AdActions } from './AdRow.tsx'
import { AgentRunPanel } from './AgentRunPanel.tsx'
import { AD_STATE_LABELS, AD_STATE_ORDER, retryTarget } from '../lib/adStates.ts'
import { handoverAd, listAds, requestFetch, transitionAd } from '../lib/api.ts'
import { useApiAction } from '../lib/apiAction.ts'
import type { AdState, AdSummary } from '../types.ts'

interface UseAds {
  ads: AdSummary[]
  actions: AdActions
  refresh: () => void
}

function useAds(onUnauthorized: () => void): UseAds {
  const [ads, setAds] = useState<AdSummary[]>([])
  const run = useApiAction(onUnauthorized)

  const reload = useCallback(async () => setAds(await listAds()), [])
  // Stable, so the run panel's poll timer isn't restarted on every render.
  const refresh = useCallback(() => void run(reload), [run, reload])

  useEffect(refresh, [refresh])

  async function change(call: () => Promise<unknown>, message: string): Promise<boolean> {
    let succeeded = false
    await run(async () => {
      await call()
      succeeded = true
      await reload()
    }, message)
    return succeeded
  }

  return {
    ads,
    refresh,
    actions: {
      onHandOver: (id, input) => change(() => handoverAd(id, input), 'Ad handed over'),
      onFetch: (id) => change(() => requestFetch(id), 'Fetch requested'),
      onRetry: (ad) =>
        change(
          () => transitionAd(ad.id, retryTarget(ad.sourceMode)),
          'Ad sent back for another try',
        ),
      onDismiss: (id) => change(() => transitionAd(id, 'dismissed'), 'Ad dismissed'),
    },
  }
}

interface AdStateFilterProps {
  ads: AdSummary[]
  selected: AdState
  onSelect: (state: AdState) => void
}

function AdStateFilter({ ads, selected, onSelect }: AdStateFilterProps) {
  return (
    <div className="ad-filter" role="group" aria-label="Filter ads by state">
      {AD_STATE_ORDER.map((state) => (
        <button
          key={state}
          type="button"
          className="button"
          aria-pressed={state === selected}
          onClick={() => onSelect(state)}
        >
          {AD_STATE_LABELS[state]}{' '}
          <span className="ad-filter-count">
            {ads.filter((ad) => ad.state === state).length}
          </span>
        </button>
      ))}
    </div>
  )
}

interface AdsViewProps {
  onUnauthorized: () => void
  canRunAgent: boolean
}

export function AdsView({ onUnauthorized, canRunAgent }: AdsViewProps) {
  const { ads, actions, refresh } = useAds(onUnauthorized)
  const [selected, setSelected] = useState<AdState>('awaiting_handover')

  return (
    <div className="ads-view">
      <h2>Ad inbox</h2>
      {canRunAgent && <AgentRunPanel onUnauthorized={onUnauthorized} onRunFinished={refresh} />}
      <AdStateFilter ads={ads} selected={selected} onSelect={setSelected} />
      <AdList
        ads={ads.filter((ad) => ad.state === selected)}
        stateLabel={AD_STATE_LABELS[selected]}
        actions={actions}
      />
    </div>
  )
}
