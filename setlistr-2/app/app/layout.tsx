import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import type { Profile } from '@/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

const { data: profile } = await supabase
  .from('profiles')
  .upsert({
    id: user.id,
    email: user.email!,
    role: 'artist',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: true })
  .select()
  .single()

  const resolvedProfile: Profile = profile ?? {
    id: user.id,
    email: user.email!,
    full_name: null,
    role: 'artist',
    avatar_url: null,
    created_at: new Date().toISOString(),
  }

  return <AppShell profile={resolvedProfile}>{children}</AppShell>
}
