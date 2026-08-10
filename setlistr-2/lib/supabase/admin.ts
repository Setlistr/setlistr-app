import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Server-side only — service role key bypasses RLS. Never import this from
// a 'use client' component or expose it to the browser bundle.
let cachedClient: SupabaseClient | null = null

export function createAdminSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('createAdminSupabaseClient: NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!serviceRoleKey) {
    throw new Error('createAdminSupabaseClient: SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return cachedClient
}
