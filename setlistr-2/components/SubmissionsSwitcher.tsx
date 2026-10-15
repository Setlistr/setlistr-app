'use client'
import { ViewSwitcher } from '@/components/ui/ViewSwitcher'

export type SubmissionsView = 'file' | 'history'

// Filing Queue / Full History: two sibling pages, switched with the shared
// segmented ViewSwitcher (docs/ui-standard.md → View switcher). Same two
// words in the same place on both pages; counts fill in when they load
// (undefined renders nothing, so the control never waits). History's
// status filters are a separate pattern (filter chips) further down.
export function SubmissionsSwitcher({ active, filingQueueCount, fullHistoryCount }: {
  active: SubmissionsView
  filingQueueCount?: number
  fullHistoryCount?: number
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <ViewSwitcher
        label="Submissions views"
        active={active}
        options={[
          { key: 'file', label: 'Filing Queue', count: filingQueueCount, href: '/app/file' },
          { key: 'history', label: 'Full History', count: fullHistoryCount, href: '/app/history' },
        ]}
      />
    </div>
  )
}
