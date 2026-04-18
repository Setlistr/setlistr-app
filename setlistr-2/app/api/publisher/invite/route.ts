import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'

export async function POST(req: NextRequest) {
  try {
    const { publisher_id, publisher_name, artist_name, artist_email } = await req.json()

    if (!publisher_id || !artist_name) {
      return NextResponse.json({ error: 'publisher_id and artist_name required' }, { status: 400 })
    }

    // Check for existing invite to avoid duplicates
    const { data: existing } = await supabase
      .from('publisher_roster_invites')
      .select('id, invite_token')
      .eq('publisher_id', publisher_id)
      .ilike('artist_name', artist_name)
      .maybeSingle()

    let inviteToken: string
    let inviteId: string

    if (existing) {
      inviteToken = existing.invite_token
      inviteId    = existing.id
    } else {
      const { data: inserted, error } = await supabase
        .from('publisher_roster_invites')
        .insert({ publisher_id, artist_name, artist_email: artist_email || null })
        .select('id, invite_token')
        .single()

      if (error || !inserted) {
        console.error('Invite insert error:', error)
        return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
      }

      inviteToken = inserted.invite_token
      inviteId    = inserted.id
    }

    const inviteUrl = `${BASE_URL}/join?ref=${inviteToken}`

    // Publisher-branded invite email
    const emailSubject = `${publisher_name || 'Your publisher'} is tracking your royalties on Setlistr`

    const emailBody = `Hi ${artist_name},

${publisher_name || 'Your publisher'} is now using Setlistr to track live performance royalties across their roster.

They'd like to invite you to join — it takes about 5 minutes to set up, and it ensures your live shows are properly documented and submitted to your PRO so you get paid.

Most artists miss out on royalties simply because they don't submit their setlists after a show. Setlistr makes that automatic.

Join here: ${inviteUrl}

Questions? Reply to this email or reach us at support@setlistr.ai

— The Setlistr Team`

    return NextResponse.json({
      success: true,
      invite_id: inviteId,
      invite_token: inviteToken,
      invite_url: inviteUrl,
      email_subject: emailSubject,
      email_body: emailBody,
    })
  } catch (err: any) {
    console.error('Invite route error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
