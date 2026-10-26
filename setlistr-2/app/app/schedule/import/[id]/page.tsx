'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { useWorkspaceRole } from '@/components/layout/WorkspaceRole'
import { PageFrame } from '@/components/ui/PageFrame'
import { Skeleton } from '@/components/ui/Skeleton'
import { ImportResult } from '@/components/scheduling/import/ImportResult'

// One import's result and Undo (docs/spreadsheet-import-plan.md).
export default function ImportResultPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { actingAs, resolved } = useActingAs()
  const { canWrite, roleKnown } = useWorkspaceRole()
  const [name, setName] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!resolved) return
    if (actingAs) { setName(actingAs.artist_name); return }
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/auth/login'); return }
      const { data: profile } = await supabase.from('profiles').select('artist_name, full_name').eq('id', user.id).single()
      setName(profile?.artist_name || profile?.full_name || null)
    })
  }, [resolved, actingAs, router])
  if (!resolved || name === undefined || !roleKnown) return <PageFrame><div aria-busy="true" style={{ paddingTop: 8 }}><Skeleton h={34} w={180} mt={20} /><Skeleton h={64} mt={24} /></div></PageFrame>
  return <PageFrame><div style={{ paddingTop: 8 }}><ImportResult key={params.id} id={params.id} artistName={name || 'This artist'} canWrite={canWrite} /></div></PageFrame>
}
