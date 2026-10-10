import { createClient } from '@supabase/supabase-js'

// Server-only (service role) — deliberately separate from lib/waitlist.ts,
// which stays client-safe (imported by the 'use client' WaitlistForm).
// Mixing a service-role helper into that file risked confusion about
// which parts are safe where, even though no secret would actually reach
// the browser bundle (the env var simply isn't defined there).
export async function waitlistRequestExists(email: string): Promise<boolean> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return false
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data } = await service
    .from('waitlist')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  return !!data
}
