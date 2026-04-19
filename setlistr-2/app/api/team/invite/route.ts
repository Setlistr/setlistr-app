import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'

export async function POST(req: NextRequest) {
  try {
    const { artist_id, delegate_email, role = 'manager' } = await req.json()

    if (!artist_id || !delegate_email) {
      return NextResponse.json({ error: 'artist_id and delegate_email required' }, { status: 400 })
    }

    // Get artist profile for the invite message
    const { data: artist } = await supabase
      .from('profiles')
      .select('artist_name, full_name')
      .eq('id', artist_id)
      .single()

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
    }

    // Check if delegate already has a Setlistr account
    const { data: delegateUser } = await supabase
      .from('profiles')
      .select('id, artist_name, full_name')
      .eq('email', delegate_email.toLowerCase().trim())
      .maybeSingle()

    // Check for existing delegation
    if (delegateUser) {
      const { data: existing } = await supabase
        .from('artist_delegates')
        .select('id, accepted_at, invite_token')
        .eq('artist_id', artist_id)
        .eq('delegate_id', delegateUser.id)
        .maybeSingle()

      if (existing?.accepted_at) {
        return NextResponse.json({ error: 'This person already has access to your account' }, { status: 409 })
      }

      if (existing) {
        // Re-send existing invite
        return NextResponse.json({
          success: true,
          delegate_found: true,
          delegate_name: delegateUser.artist_name || delegateUser.full_name,
          invite_url: `${BASE_URL}/app/accept-invite?token=${existing.invite_token}`,
          already_exists: true,
        })
      }
    }

    // Create the delegate record
    // If delegate has account: link by user id
    // If not: still create record with email so they can claim it on signup
    const insertData: any = {
      artist_id,
      role,
      invited_by: artist_id,
      // Use a placeholder delegate_id if user doesn't exist yet
      // We'll resolve on acceptance
      delegate_id: delegateUser?.id || artist_id, // temporary — overwritten on acceptance
    }

    // If no account yet, store the email for matching on acceptance
    if (!delegateUser) {
      insertData.delegate_id = artist_id // placeholder to satisfy FK — will be updated on accept
    }

    const { data: delegate, error } = await supabase
      .from('artist_delegates')
      .insert(delegateUser ? {
        artist_id,
        delegate_id: delegateUser.id,
        role,
        invited_by: artist_id,
      } : {
        artist_id,
        delegate_id: artist_id, // placeholder FK — accept flow updates this
        role,
        invited_by: artist_id,
      })
      .select('id, invite_token')
      .single()

    if (error || !delegate) {
      console.error('Delegate insert error:', error)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    const inviteUrl = `${BASE_URL}/app/accept-invite?token=${delegate.invite_token}`
    const artistDisplayName = artist.artist_name || artist.full_name || 'An artist'

    return NextResponse.json({
      success: true,
      delegate_found: !!delegateUser,
      delegate_name: delegateUser?.artist_name || delegateUser?.full_name || null,
      invite_url: inviteUrl,
      invite_token: delegate.invite_token,
      // Pre-written message the artist can send
      invite_message: delegateUser
        ? `Hi — I've added you as a team member on my Setlistr account. Click here to accept access: ${inviteUrl}`
        : `Hi — I'm inviting you to manage my Setlistr account. Click here to set up access: ${inviteUrl}\n\nSetlistr tracks live performance royalties. It takes 5 minutes to set up.`,
    })
  } catch (err) {
    console.error('Team invite error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
