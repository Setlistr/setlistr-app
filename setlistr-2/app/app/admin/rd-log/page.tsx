import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import RdLogView from './RdLogView'

const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
]

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function RdLogPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    redirect('/app/dashboard')
  }

  const adminSupabase = getServiceSupabase()
  const { data: entries } = await adminSupabase
    .from('rd_log')
    .select('*')
    .order('entry_date', { ascending: false })

  return <RdLogView initialEntries={entries ?? []} />
}
