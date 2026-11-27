import { AdRow } from './AdRow.tsx'
import type { AdActions } from './AdRow.tsx'
import type { DraftStatus } from '../lib/adStates.ts'
import type { AdSummary } from '../types.ts'

interface AdListProps {
  ads: AdSummary[]
  groupLabel: string
  actions: AdActions
  draftStatus: (ad: AdSummary) => DraftStatus
  /** The ad a summary link opened, marked as the current row. */
  currentId?: number
}

export function AdList({ ads, groupLabel, actions, draftStatus, currentId }: AdListProps) {
  if (ads.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">No ads in {groupLabel}</p>
        <p>Choose another state to see its ads.</p>
      </div>
    )
  }

  return (
    <ul className="ad-list">
      {ads.map((ad) => (
        <AdRow
          key={ad.id}
          ad={ad}
          actions={actions}
          draft={draftStatus(ad)}
          current={ad.id === currentId}
        />
      ))}
    </ul>
  )
}
