import type { Status } from '../types.ts'

export const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
}
