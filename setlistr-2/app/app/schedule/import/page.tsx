'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { useWorkspaceRole } from '@/components/layout/WorkspaceRole'
import { PageFrame } from '@/components/ui/PageFrame'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { ImportFlow } from '@/components/scheduling/import/ImportFlow'

// Import shows from a spreadsheet (docs/spreadsheet-import-plan.md). Same
// frame, workspace and role handling as Schedule; write roles only (the
// routes and import_shows() refuse everyone else too).
export default function ImportShowsPage() {
  const router = useRouter()
  const { actingAs, resolved } = useActingAs()
  const { canWrite, roleKnown } = useWorkspaceRole()
  const [me, setMe] = useState<{ id: string; name: string | null; artistName: string | null } | null>(null)

  useEffect(() => {
    if (!resolved) return
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('artist_name, full_name').eq('id', user.id).single()
      setMe({ id: user.id, name: profile?.full_name || profile?.artist_name || null, artistName: profile?.artist_name || profile?.full_name || null })
    })
  }, [resolved, router])

  if (!resolved || !me || !roleKnown) {
    return <PageFrame><div aria-busy="true" style={{ paddingTop: 8 }}><Skeleton h={34} w={220} mt={20} /><Skeleton h={18} w={160} mt={12} /><Skeleton h={52} mt={28} r={14} /></div></PageFrame>
  }
  const artistId = actingAs?.artist_id || me.id
  const artistName = actingAs?.artist_name || me.artistName || 'this artist'
  return (
    <PageFrame>
      <div style={{ paddingTop: 8 }}>
        {canWrite
          ? <ImportFlow key={artistId} artistId={artistId} artistName={artistName} isOwner={!actingAs} actorName={me.name || 'you'} />
          : <div style={{ maxWidth: 560 }}><PageHeader title="Import shows" backHref="/app/schedule" />
              <p style={{ fontSize: 15, color: 'var(--sl-text-2)', margin: 0, lineHeight: 1.5 }}>Only {artistName} and teammates who can edit can import shows. You can see everything in Schedule.</p></div>}
      </div>
    </PageFrame>
  )
}
