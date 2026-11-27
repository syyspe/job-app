import { useCallback, useEffect, useState } from 'react'
import { AdList } from './AdList.tsx'
import type { AdActions } from './AdRow.tsx'
import { AgentRunPanel } from './AgentRunPanel.tsx'
import { AD_GROUP_LABELS, AD_GROUPS, adGroup, canDraft, retryTarget } from '../lib/adStates.ts'
import type { AdGroup, DraftStatus } from '../lib/adStates.ts'
import { listAds, transitionAd } from '../lib/api.ts'
import { useApiAction } from '../lib/apiAction.ts'
import { useAgentRuns } from '../lib/useAgentRuns.ts'
import type { AdSummary, AgentRun } from '../types.ts'

type AdChanges = Omit<AdActions, 'onDraft'>

interface UseAds {
  ads: AdSummary[]
  actions: AdChanges
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
  selected: AdGroup
  onSelect: (group: AdGroup) => void
}

function AdStateFilter({ ads, selected, onSelect }: AdStateFilterProps) {
  return (
    <div className="ad-filter" role="group" aria-label="Filter ads by state">
      {AD_GROUPS.map((group) => (
        <button
          key={group}
          type="button"
          className="button"
          aria-pressed={group === selected}
          onClick={() => onSelect(group)}
        >
          {AD_GROUP_LABELS[group]}{' '}
          <span className="ad-filter-count">
            {ads.filter((ad) => adGroup(ad) === group).length}
          </span>
        </button>
      ))}
    </div>
  )
}

interface AdsViewProps {
  onUnauthorized: () => void
  canRunAgent: boolean
  /** The ad a summary link opened; its group is selected once the ads load. */
  focusAdId?: number
}

/** Draft runs need agent access, and one run at a time. */
function draftStatusOf(ad: AdSummary, canRunAgent: boolean, current: AgentRun | null): DraftStatus {
  if (!canRunAgent || !canDraft(ad.state)) return 'none'
  if (!current) return 'ready'
  return current.kind === 'draft' && current.adId === ad.id ? 'running' : 'busy'
}

function useSelectedState(ads: AdSummary[], focusAdId: number | undefined) {
  const [selected, setSelected] = useState<AdGroup>('kept')
  const [focused, setFocused] = useState(false)
  const focusAd = focused ? undefined : ads.find((ad) => ad.id === focusAdId)
  // Set during render, React's pattern for state that follows loaded data.
  // An ad in no group (still in progress, or closed) leaves the default.
  if (focusAd) {
    setFocused(true)
    setSelected(adGroup(focusAd) ?? selected)
  }
  return [selected, setSelected] as const
}

export function AdsView({ onUnauthorized, canRunAgent, focusAdId }: AdsViewProps) {
  const { ads, actions, refresh } = useAds(onUnauthorized)
  const { runs, start } = useAgentRuns({ enabled: canRunAgent, onUnauthorized, onRunFinished: refresh })
  const [selected, setSelected] = useSelectedState(ads, focusAdId)
  const onDraft = (id: number) => void start({ kind: 'draft', adId: id })

  return (
    <div className="ads-view">
      <h2>Ad inbox</h2>
      {canRunAgent && <AgentRunPanel runs={runs} onStart={(kind) => void start({ kind })} />}
      <AdStateFilter ads={ads} selected={selected} onSelect={setSelected} />
      <AdList
        ads={ads.filter((ad) => adGroup(ad) === selected)}
        groupLabel={AD_GROUP_LABELS[selected]}
        actions={{ ...actions, onDraft }}
        draftStatus={(ad) => draftStatusOf(ad, canRunAgent, runs.current)}
        currentId={focusAdId}
      />
    </div>
  )
}
