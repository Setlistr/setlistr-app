import React from 'react'
import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

async function getFonts() {
  return []
}

const W = 1080
const H = 1920
const GOLD = '#c9a84c'
const GOLD_DIM = 'rgba(201,168,76,0.12)'
const GOLD_BORDER = 'rgba(201,168,76,0.3)'
const BG = '#0a0908'
const CARD = '#0f0d0b'
const TEXT = '#f0ece3'
const MUTED = '#8a7a68'
const RED = '#f87171'

function SetlistrLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: GOLD_DIM, border: `1.5px solid ${GOLD_BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: GOLD, display: 'flex' }} />
      </div>
      <span style={{ fontSize: 18, fontWeight: 700, color: GOLD, letterSpacing: '0.18em', fontFamily: 'DMSans', textTransform: 'uppercase' }}>
        SETLISTR.
      </span>
    </div>
  )
}

// ── CARD: TONIGHT'S RUN ──────────────────────────────────────────────────────
function TonightsRunCard({ artistName, venueName, city, date, songCount, minutes, showNumber }: {
  artistName: string; venueName: string; city: string; date: string
  songCount: number; minutes: number; showNumber: number
}) {
  return (
    <div style={{
      width: W, height: H, background: BG,
      display: 'flex', flexDirection: 'column',
      padding: '80px 80px 80px',
      position: 'relative', fontFamily: 'DMSans',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at 50% 30%, rgba(201,168,76,0.08) 0%, transparent 65%)',
        display: 'flex',
      }} />

      {/* Top label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80, position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: 'DMSans' }}>
          TONIGHT'S RUN
        </span>
        <SetlistrLogo />
      </div>

      {/* Hero */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 200, fontWeight: 400, color: TEXT, fontFamily: 'BebasNeue', lineHeight: 0.85, marginBottom: 40, letterSpacing: '0.02em' }}>
          ANOTHER<br />ONE.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 80 }}>
          <span style={{ fontSize: 32, color: GOLD, fontFamily: 'DMSans', fontWeight: 400 }}>{date}</span>
          <span style={{ fontSize: 36, color: TEXT, fontFamily: 'DMSans', fontWeight: 700 }}>{venueName}</span>
          <span style={{ fontSize: 28, color: MUTED, fontFamily: 'DMSans', fontWeight: 400 }}>{city}</span>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 48, borderTop: `1px solid rgba(255,255,255,0.08)`, paddingTop: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 72, fontFamily: 'BebasNeue', color: TEXT, lineHeight: 1 }}>{songCount}</span>
            <span style={{ fontSize: 20, color: MUTED, fontFamily: 'DMSans', letterSpacing: '0.1em', textTransform: 'uppercase' }}>SONGS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 72, fontFamily: 'BebasNeue', color: TEXT, lineHeight: 1 }}>{minutes}</span>
            <span style={{ fontSize: 20, color: MUTED, fontFamily: 'DMSans', letterSpacing: '0.1em', textTransform: 'uppercase' }}>MINUTES</span>
          </div>
          {showNumber > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 72, fontFamily: 'BebasNeue', color: GOLD, lineHeight: 1 }}>#{showNumber}</span>
              <span style={{ fontSize: 20, color: MUTED, fontFamily: 'DMSans', letterSpacing: '0.1em', textTransform: 'uppercase' }}>SHOW</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom line */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, display: 'flex' }} />
    </div>
  )
}

// ── CARD: ROYALTY MOMENT ─────────────────────────────────────────────────────
function RoyaltyMomentCard({ amount, artistName, venueName, date }: {
  amount: number; artistName: string; venueName: string; date: string
}) {
  return (
    <div style={{
      width: W, height: H, background: BG,
      display: 'flex', flexDirection: 'column',
      padding: '80px 80px',
      position: 'relative', fontFamily: 'DMSans',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at 50% 60%, rgba(201,168,76,0.06) 0%, transparent 70%)',
        display: 'flex',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80, position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          ROYALTY MOMENT
        </span>
        <SetlistrLogo />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 220, fontWeight: 400, color: GOLD, fontFamily: 'BebasNeue', lineHeight: 0.85, marginBottom: 32 }}>
          +${amount}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 80 }}>
          <span style={{ fontSize: 40, fontWeight: 700, color: TEXT, fontFamily: 'DMSans', lineHeight: 1.2 }}>
            ESTIMATED ROYALTIES<br />ADDED TONIGHT.
          </span>
          <span style={{ fontSize: 28, color: GOLD, fontFamily: 'DMSans', fontStyle: 'italic' }}>
            Because you tracked your shows.
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid rgba(255,255,255,0.08)`, paddingTop: 48 }}>
          <span style={{ fontSize: 28, color: TEXT, fontFamily: 'DMSans', fontWeight: 700 }}>{venueName}</span>
          <span style={{ fontSize: 24, color: MUTED, fontFamily: 'DMSans' }}>{date}</span>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, display: 'flex' }} />
    </div>
  )
}

// ── CARD: MILESTONE ──────────────────────────────────────────────────────────
const MILESTONE_LINES: Record<number, string> = {
  1: 'The first of many.',
  10: 'Still getting started.',
  25: 'Quarter Century Club.',
  50: 'Now we\'re talking.',
  100: 'The Run Continues.',
  250: 'Two fifty and counting.',
  500: 'Half a thousand nights.',
}

function MilestoneCard({ showNumber, artistName }: { showNumber: number; artistName: string }) {
  const tagline = MILESTONE_LINES[showNumber] || `${showNumber} shows. Keep going.`
  return (
    <div style={{
      width: W, height: H, background: BG,
      display: 'flex', flexDirection: 'column',
      padding: '80px 80px',
      position: 'relative', fontFamily: 'DMSans',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(201,168,76,0.1) 0%, transparent 60%)',
        display: 'flex',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80, position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          MILESTONE
        </span>
        <SetlistrLogo />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', alignItems: 'center', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Gold ring */}
        <div style={{
          width: 480, height: 480, borderRadius: '50%',
          border: `3px solid ${GOLD_BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 60, position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 12,
            borderRadius: '50%',
            border: `1px solid rgba(201,168,76,0.15)`,
            display: 'flex',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 240, fontFamily: 'BebasNeue', color: TEXT, lineHeight: 0.85 }}>{showNumber}</span>
            <span style={{ fontSize: 48, fontFamily: 'BebasNeue', color: MUTED, letterSpacing: '0.1em' }}>SHOWS</span>
          </div>
        </div>

        <span style={{ fontSize: 52, fontFamily: 'BebasNeue', color: GOLD, letterSpacing: '0.04em' }}>
          {tagline.toUpperCase()}
        </span>
        <span style={{ fontSize: 28, color: MUTED, fontFamily: 'DMSans', marginTop: 16 }}>{artistName}</span>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, display: 'flex' }} />
    </div>
  )
}

// ── CARD: NEW CITY ───────────────────────────────────────────────────────────
function NewCityCard({ city, region, artistName, date, timesPlayed }: {
  city: string; region: string; artistName: string; date: string; timesPlayed: number
}) {
  const isFirstTime = timesPlayed === 1
  return (
    <div style={{
      width: W, height: H, background: BG,
      display: 'flex', flexDirection: 'column',
      padding: '80px 80px',
      position: 'relative', fontFamily: 'DMSans',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at 30% 50%, rgba(201,168,76,0.07) 0%, transparent 60%)',
        display: 'flex',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80, position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          {isFirstTime ? 'NEW CITY' : 'BACK IN TOWN'}
        </span>
        <SetlistrLogo />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 180, fontWeight: 400, color: TEXT, fontFamily: 'BebasNeue', lineHeight: 0.85, marginBottom: 24 }}>
          {city.toUpperCase()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {region && (
            <span style={{ fontSize: 40, color: GOLD, fontFamily: 'BebasNeue', letterSpacing: '0.06em' }}>
              {region.toUpperCase()}
            </span>
          )}
          <span style={{ fontSize: 32, color: TEXT, fontFamily: 'DMSans', fontWeight: 700 }}>
            {isFirstTime ? 'PLAYED HERE FOR THE FIRST TIME.' : `PLAYED HERE ${timesPlayed} TIMES.`}
          </span>
          <span style={{ fontSize: 26, color: MUTED, fontFamily: 'DMSans' }}>{date} · {artistName}</span>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, display: 'flex' }} />
    </div>
  )
}

// ── CARD: THE RUN ────────────────────────────────────────────────────────────
function TheRunCard({ showCount, cityCount, miles, artistName, latestCity }: {
  showCount: number; cityCount: number; miles: number; artistName: string; latestCity: string
}) {
  return (
    <div style={{
      width: W, height: H, background: BG,
      display: 'flex', flexDirection: 'column',
      padding: '80px 80px',
      position: 'relative', fontFamily: 'DMSans',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at 50% 20%, rgba(201,168,76,0.08) 0%, transparent 60%)',
        display: 'flex',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80, position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          THE RUN UPDATE
        </span>
        <SetlistrLogo />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: 180, fontWeight: 400, color: TEXT, fontFamily: 'BebasNeue', lineHeight: 0.85, marginBottom: 60 }}>
          THE RUN
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginBottom: 60 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <span style={{ fontSize: 96, fontFamily: 'BebasNeue', color: TEXT, lineHeight: 1 }}>{showCount}</span>
            <span style={{ fontSize: 32, color: MUTED, fontFamily: 'DMSans', letterSpacing: '0.08em', textTransform: 'uppercase' }}>SHOWS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
            <span style={{ fontSize: 96, fontFamily: 'BebasNeue', color: TEXT, lineHeight: 1 }}>{cityCount}</span>
            <span style={{ fontSize: 32, color: MUTED, fontFamily: 'DMSans', letterSpacing: '0.08em', textTransform: 'uppercase' }}>CITIES</span>
          </div>
          {miles > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
              <span style={{ fontSize: 96, fontFamily: 'BebasNeue', color: TEXT, lineHeight: 1 }}>{miles.toLocaleString()}</span>
              <span style={{ fontSize: 32, color: MUTED, fontFamily: 'DMSans', letterSpacing: '0.08em', textTransform: 'uppercase' }}>MILES</span>
            </div>
          )}
        </div>

        <span style={{ fontSize: 28, color: GOLD, fontFamily: 'DMSans', fontStyle: 'italic' }}>
          +1 show added tonight.
        </span>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`, display: 'flex' }} />
    </div>
  )
}

// ── MAIN ROUTE ───────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type         = searchParams.get('type') || 'tonights_run'
  const perfId       = searchParams.get('perf_id') || ''

  try {
    console.log('Card route started, type:', type, 'perf_id:', perfId)
    const fonts = await getFonts()
    console.log('Fonts loaded successfully')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Fetch performance data
    const { data: perf } = await supabase
      .from('performances')
      .select('*, venues(capacity)')
      .eq('id', perfId)
      .single()

    console.log('Perf fetched:', perf?.id, 'error if null:', !perf)

    const { data: songs } = await supabase
      .from('performance_songs')
      .select('title, position')
      .eq('performance_id', perfId)
      .order('position', { ascending: true })

    const { data: profile } = await supabase
      .from('profiles')
      .select('artist_name, career_total_shows')
      .eq('id', perf?.user_id || '')
      .single()

    console.log('Profile fetched:', profile?.artist_name)

    const artistName  = profile?.artist_name || perf?.artist_name || 'Artist'
    const venueName   = perf?.venue_name || ''
    const city        = perf?.city || ''
    const country     = perf?.country || ''
    const songCount   = songs?.length || 0
    const showNumber  = profile?.career_total_shows || 0

    const showDate = perf?.started_at
      ? new Date(perf.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : ''

    const minutes = perf?.started_at && perf?.ended_at
      ? Math.round((new Date(perf.ended_at).getTime() - new Date(perf.started_at).getTime()) / 60000)
      : perf?.set_duration_minutes || 60

    // Royalty estimate
    const royaltyAmount = Math.round(songCount * 10 * 3.5)

    // City visit count
    const { count: cityVisits } = await supabase
      .from('performances')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', perf?.user_id || '')
      .eq('city', city)
      .eq('status', 'completed')

    // All cities for city count and miles
    const { data: allPerfs } = await supabase
      .from('performances')
      .select('city, country')
      .eq('user_id', perf?.user_id || '')
      .eq('status', 'completed')

    const uniqueCities = new Set(allPerfs?.map(p => p.city).filter(Boolean)).size

    let card: React.ReactElement

    if (type === 'milestone' && showNumber > 0) {
      const MILESTONES = [1, 10, 25, 50, 100, 250, 500]
      const milestone = MILESTONES.find(m => m === showNumber) || showNumber
      card = <MilestoneCard showNumber={milestone} artistName={artistName} />
    } else if (type === 'royalty_moment') {
      card = <RoyaltyMomentCard amount={royaltyAmount} artistName={artistName} venueName={venueName} date={showDate} />
    } else if (type === 'new_city') {
      const region = country === 'United States' || country === 'US' ? '' : country
      card = <NewCityCard city={city} region={region} artistName={artistName} date={showDate} timesPlayed={cityVisits || 1} />
    } else if (type === 'the_run') {
      card = <TheRunCard showCount={showNumber} cityCount={uniqueCities} miles={0} artistName={artistName} latestCity={city} />
    } else {
      // Default: Tonight's Run
      card = <TonightsRunCard artistName={artistName} venueName={venueName} city={city} date={showDate} songCount={songCount} minutes={minutes} showNumber={showNumber} />
    }

    return new ImageResponse(card, {
      width: W,
      height: H,
      fonts,
    })
  } catch (err: any) {
    const message = err?.message || String(err)
    console.error('Card render error:', message)
    return new Response(JSON.stringify({ error: message, stack: err?.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
