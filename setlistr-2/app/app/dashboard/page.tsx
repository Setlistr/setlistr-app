'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Mic, AlertCircle, Check, Calendar } from 'lucide-react'
import {
  estimateRoyalties, aggregateUnclaimedEarnings,
  capacityToBand, type ShowEstimateInput,
} from '@/lib/royalty-estimate'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.1)',
}

type Performance = {
  id: string; venue_name: string; artist_name: string
  city: string; country: string; status: string
  submission_status: string | null; started_at: string
  created_at: string; ended_at?: string
  show_type?: string; venue_capacity?: number | null
}

type BitEvent = {
  id: string; datetime: string; venueName: string
  venueCity: string; venueRegion: string; venueCountry: string; url: string
}

function getDisplayStatus(p: Performance): { label: string; color: string; bg: string } {
  if (p.submission_status === 'submitted') return { label: 'Submitted', color: C.green, bg: C.greenDim }
  const map: Record<string, { label: string; color: string; bg: string }> = {
    live:      { label: 'Live',         color: C.red,   bg: C.redDim },
    pending:   { label: 'Live',         color: C.red,   bg: C.redDim },
    review:    { label: 'Needs Review', color: C.blue,  bg: C.blueDim },
    complete:  { label: 'Completed',    color: C.green, bg: C.greenDim },
    completed: { label: 'Completed',    color: C.green, bg: C.greenDim },
    exported:  { label: 'Exported',     color: C.green, bg: C.greenDim },
  }
  return map[p.status] || { label: 'Needs Review', color: C.blue, bg: C.blueDim }
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function minutesSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

function hoursSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
}

function formatShowTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatShowDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isCanadian(country?: string | null, city?: string | null): boolean {
  return ['CA','Canada','ca'].includes(country || '') ||
    ['toronto','vancouver','montreal','calgary','edmonton','ottawa','winnipeg'].some(c =>
      (city || '').toLowerCase().includes(c)) ||
    (country || '').toLowerCase().includes('canada')
}

export default function DashboardPage() {
  const router = useRouter()
  const [performances, setPerformances]   = useState<Performance[]>([])
  const [loading, setLoading]             = useState(true)
  const [livePerf, setLivePerf]           = useState<Performance | null>(null)
  const [morningAfterPerf, setMorningAfterPerf] = useState<Performance | null>(null)
  const [totalSongs, setTotalSongs]       = useState(0)
  const [needsReview, setNeedsReview]     = useState(0)
  const [userId, setUserId]               = useState<string | null>(null)
  const [artistName, setArtistName]       = useState<string | null>(null)
  const [showEstimates, setShowEstimates] = useState<ShowEstimateInput[]>([])
  const [songCountMap, setSongCountMap]   = useState<Record<string, number>>({})
  const [lookupName, setLookupName]       = useState<string | null>(null)
  const [upcomingShows, setUpcomingShows] = useState<BitEvent[]>([])
  const [todayShow, setTodayShow]         = useState<BitEvent | null>(null)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('bandsintown_artist_name, artist_name, full_name')
          .eq('id', user.id)
          .single()
        if (profile?.bandsintown_artist_name) setLookupName(profile.bandsintown_artist_name)
        setArtistName(profile?.artist_name || profile?.full_name || null)
      }

      const { data, error } = await supabase
        .from('performances')
        .select(`id, venue_name, artist_name, city, country, status, submission_status, started_at, ended_at, created_at, shows ( show_type ), venues ( capacity )`)
        .order('created_at', { ascending: false })
      if (error) console.error('Dashboard error:', error)
      if (data) {
        const perfs: Performance[] = data.map((p: any) => ({
          id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
          city: p.city, country: p.country, status: p.status,
          submission_status: p.submission_status || null,
          started_at: p.started_at, ended_at: p.ended_at || null,
          created_at: p.created_at,
          show_type: p.shows?.show_type || 'single', venue_capacity: p.venues?.capacity || null,
        }))
        setPerformances(perfs)
        setNeedsReview(perfs.filter(p =>
          (p.status === 'review' || p.status === 'complete' || p.status === 'completed') &&
          p.submission_status !== 'submitted'
        ).length)

        const live = perfs.find(p =>
          (p.status === 'live' || p.status === 'pending') &&
          minutesSince(p.started_at || p.created_at) < 360
        )
        setLivePerf(live || null)

        const morningAfter = perfs.find(p => {
          const endedAt = p.ended_at || p.started_at
          const hoursAgo = hoursSince(endedAt)
          return hoursAgo > 0 && hoursAgo <= 18 &&
            p.status !== 'live' && p.status !== 'pending' &&
            p.submission_status !== 'submitted'
        })
        setMorningAfterPerf(morningAfter || null)

        const { data: songData } = await supabase
          .from('performance_songs')
          .select('performance_id')
          .in('performance_id', perfs.map(p => p.id))
        const countMap: Record<string, number> = {}
        songData?.forEach((s: any) => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })
        setSongCountMap(countMap)
        setTotalSongs(Object.values(countMap).reduce((a, b) => a + b, 0))

        const estimates: ShowEstimateInput[] = perfs
          .filter(p => p.status !== 'live' && p.status !== 'pending' && p.submission_status !== 'submitted')
          .map(p => ({
            performanceId: p.id, status: p.status,
            songCount: countMap[p.id] || 0,
            venueCapacityBand: capacityToBand(p.venue_capacity),
            showType: (p.show_type as any) || 'single',
            territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
          }))
          .filter(e => e.songCount > 0)
        setShowEstimates(estimates)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!lookupName) return
    async function fetchUpcoming() {
      try {
        let events: BitEvent[] = []
        const bitRes = await fetch(`/api/bandsintown/upcoming?artist=${encodeURIComponent(lookupName!)}`)
        const bitData = await bitRes.json()
        events = bitData.events || []
        if (events.length === 0) {
          const tmRes = await fetch(`/api/ticketmaster/upcoming?artist=${encodeURIComponent(lookupName!)}`)
          const tmData = await tmRes.json()
          events = tmData.events || []
        }
        const upcoming = events.filter(e => new Date(e.datetime) > new Date()).slice(0, 3)
        setUpcomingShows(upcoming)
        setTodayShow(events.find(e => isToday(e.datetime)) || null)
      } catch {}
    }
    fetchUpcoming()
  }, [lookupName])

  const aggregate      = aggregateUnclaimedEarnings(showEstimates)
  const totalShows     = performances.filter(p => p.status !== 'live' && p.status !== 'pending').length
  const submittedCount = performances.filter(p => p.submission_status === 'submitted').length
  const recentPerfs    = performances.slice(0, 5)

  function navigateToPerformance(p: Performance) {
    if (p.status === 'live' || p.status === 'pending') router.push(`/app/live/${p.id}`)
    else if (p.submission_status === 'submitted') router.push(`/app/submit/${p.id}`)
    else router.push(`/app/review/${p.id}`)
  }

  function startShowFromBIT(event: BitEvent) {
    const params = new URLSearchParams({ venue: event.venueName, city: event.venueCity, country: event.venueCountry })
    router.push(`/app/show/new?${params.toString()}`)
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      {/* Ambient gold glow */}
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* ── NAV ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 24px' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Setlistr</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {submittedCount > 0 && (
              <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={10} strokeWidth={2.5} />{submittedCount}
              </span>
            )}
            <button onClick={() => router.push('/app/settings')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Settings</button>
            <button onClick={() => router.push('/app/history')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>History →</button>
          </div>
        </div>

        {/* ── MORNING-AFTER NUDGE ── */}
        {morningAfterPerf && !livePerf && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.3s ease' }}>
            <button onClick={() => navigateToPerformance(morningAfterPerf)}
              style={{ width: '100%', background: 'rgba(201,168,76,0.07)', border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '14px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🌅</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, margin: '0 0 2px' }}>Last Night's Show</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{morningAfterPerf.venue_name} — review & claim →</p>
              </div>
            </button>
          </div>
        )}

        {/* ── TODAY'S SHOW ── */}
        {todayShow && !livePerf && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.32s ease' }}>
            <button onClick={() => startShowFromBIT(todayShow)}
              style={{ width: '100%', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 14, padding: '14px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <span style={{ fontSize: 20 }}>🎸</span>
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '1.5px solid rgba(74,222,128,0.3)', animation: 'orb-pulse 2s ease-in-out infinite' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, margin: '0 0 2px' }}>You're Playing Tonight</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{todayShow.venueName} · {formatShowTime(todayShow.datetime)}</p>
              </div>
              <span style={{ fontSize: 12, color: C.green, fontWeight: 700, flexShrink: 0 }}>Start →</span>
            </button>
          </div>
        )}

        {/* ── RESUME LIVE SESSION ── */}
        {livePerf && (() => {
          const minsSinceStart = minutesSince(livePerf.started_at || livePerf.created_at)
          const mightBeInterrupted = minsSinceStart > 5
          return (
            <div style={{ marginBottom: 24, animation: 'fadeUp 0.3s ease' }}>
              {mightBeInterrupted && (
                <div style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '12px 12px 0 0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, animation: 'pulse-dot 1.4s ease-in-out infinite', flexShrink: 0 }} />
                  <p style={{ fontSize: 12, color: C.red, margin: 0, fontWeight: 600 }}>Show in progress — capture may have been interrupted</p>
                </div>
              )}
              <button onClick={() => navigateToPerformance(livePerf)}
                style={{ width: '100%', background: C.card, border: `2px solid ${C.borderGold}`, borderRadius: mightBeInterrupted ? '0 0 14px 14px' : 14, padding: '18px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.gold, animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: '0 0 3px' }}>{mightBeInterrupted ? 'Resume Capture' : 'Show Active'}</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 2px', letterSpacing: '-0.01em' }}>{livePerf.venue_name}</p>
                  <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>{livePerf.artist_name}{livePerf.city ? ` · ${livePerf.city}` : ''} · {minsSinceStart} min ago</p>
                </div>
                <div style={{ background: C.gold, borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#0a0908', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                  {mightBeInterrupted ? 'Resume →' : 'Continue →'}
                </div>
              </button>
            </div>
          )
        })()}

        {/* ── HERO — LOAD YOUR SET ── */}
        {!livePerf && (
          <div style={{ marginBottom: 24, animation: 'fadeUp 0.3s ease' }}>

            {/* Artist identity line */}
            {artistName && (
              <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px', fontWeight: 500 }}>
                {totalShows > 0
                  ? `${totalShows} show${totalShows !== 1 ? 's' : ''} on record${submittedCount > 0 ? ` · ${submittedCount} submitted` : ''}`
                  : 'Ready for your first show.'}
              </p>
            )}

            {/* The orb button */}
            <button
              onClick={() => router.push('/app/show/new')}
              style={{
                width: '100%',
                background: `linear-gradient(135deg, #c9a84c 0%, #a8872d 100%)`,
                border: 'none',
                borderRadius: 20,
                padding: '28px 24px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                position: 'relative',
                overflow: 'hidden',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Background glow */}
              <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '60%', height: '180%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

              {/* Orb */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(10,9,8,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#0a0908', opacity: 0.85 }} />
                </div>
                {/* Pulse rings */}
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '1.5px solid rgba(10,9,8,0.2)', animation: 'orb-pulse 2s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1px solid rgba(10,9,8,0.1)', animation: 'orb-pulse 2s ease-in-out 0.4s infinite' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#0a0908', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Load Your Set</p>
                <p style={{ fontSize: 13, color: 'rgba(10,9,8,0.6)', margin: 0, fontWeight: 500 }}>Start live capture · Setlistr listens</p>
              </div>

              <div style={{ fontSize: 20, color: 'rgba(10,9,8,0.4)', flexShrink: 0, position: 'relative', zIndex: 1 }}>→</div>
            </button>

            {/* Photo setlist — demoted to text link */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
              <button
                onClick={() => router.push('/app/show/new?mode=upload')}
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0' }}>
                📷 Upload a paper setlist instead
              </button>
            </div>
          </div>
        )}

        {/* ── UNCLAIMED EARNINGS — financial tension ── */}
        {aggregate.unclaimedCount > 0 && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.36s ease' }}>
            <button onClick={() => router.push('/app/history')}
              style={{ width: '100%', background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.13)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.08)'}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>~${aggregate.unclaimedExpected.toLocaleString()} unclaimed</p>
                <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>{aggregate.unclaimedCount} show{aggregate.unclaimedCount !== 1 ? 's' : ''} not yet submitted · {totalSongs} songs tracked</p>
              </div>
              <span style={{ fontSize: 13, color: C.gold, flexShrink: 0, fontWeight: 700 }}>Claim →</span>
            </button>
          </div>
        )}

        {/* ── UPCOMING SHOWS ── */}
        {upcomingShows.length > 0 && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.38s ease' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={10} />Upcoming
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {upcomingShows.map(event => {
                const isEventToday    = isToday(event.datetime)
                const isEventTomorrow = isTomorrow(event.datetime)
                const dateLabel       = isEventToday ? 'Tonight' : isEventTomorrow ? 'Tomorrow' : formatShowDate(event.datetime)
                return (
                  <button key={event.id} onClick={() => startShowFromBIT(event)}
                    style={{ background: C.card, border: `1px solid ${isEventToday ? C.borderGold : C.border}`, borderRadius: 12, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, transition: 'background 0.15s ease' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.card}>
                    <div style={{ minWidth: 52, flexShrink: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: isEventToday ? C.gold : C.secondary, margin: 0 }}>{dateLabel}</p>
                      <p style={{ fontSize: 10, color: C.muted, margin: '1px 0 0' }}>{formatShowTime(event.datetime)}</p>
                    </div>
                    <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: isEventToday ? C.gold : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.venueName}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{event.venueCity}{event.venueRegion ? `, ${event.venueRegion}` : ''}</p>
                    </div>
                    <span style={{ fontSize: 11, color: C.gold, flexShrink: 0, fontWeight: 600 }}>→</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── RECENT SHOWS ── */}
        <div style={{ animation: 'fadeUp 0.42s ease', paddingBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>Recent Shows</p>
            {performances.length > 5 && (
              <button onClick={() => router.push('/app/history')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>All →</button>
            )}
          </div>

          {recentPerfs.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '36px 20px', textAlign: 'center' }}>
              <Mic size={24} color={C.muted} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 4px', fontWeight: 600 }}>No shows yet.</p>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Load your first set to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentPerfs.map((perf, i) => {
                const displayStatus = getDisplayStatus(perf)
                const dateStr       = perf.started_at || perf.created_at
                const songCount     = songCountMap[perf.id] || 0
                const isFinished    = perf.status !== 'live' && perf.status !== 'pending'
                const perfEst       = isFinished && songCount > 0
                  ? estimateRoyalties({ songCount, venueCapacityBand: capacityToBand(perf.venue_capacity), showType: (perf.show_type as any) || 'single', territory: isCanadian(perf.country, perf.city) ? 'CA' : 'US' })
                  : null
                return (
                  <button key={perf.id} onClick={() => navigateToPerformance(perf)}
                    style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = C.cardHover; el.style.borderColor = 'rgba(255,255,255,0.12)' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = C.card; el.style.borderColor = C.border }}>
                    <div style={{ minWidth: 32, textAlign: 'center', flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{new Date(dateStr).getDate()}</p>
                      <p style={{ fontSize: 9, color: C.muted, margin: '1px 0 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{new Date(dateStr).toLocaleDateString('en-US', { month: 'short' })}</p>
                    </div>
                    <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perf.venue_name}</p>
                      <p style={{ fontSize: 11, color: C.secondary, margin: 0 }}>{perf.city ? `${perf.city} · ` : ''}{songCount > 0 ? `${songCount} songs` : timeAgo(perf.created_at)}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: displayStatus.color, background: displayStatus.bg, border: `1px solid ${displayStatus.color}40`, borderRadius: 20, padding: '2px 7px' }}>{displayStatus.label}</span>
                      {perfEst && perfEst.expected > 0 && (
                        <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace' }}>~${perfEst.expected}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── STATS — condensed, below the fold ── */}
        {totalShows > 0 && (
          <div style={{ paddingBottom: 48, animation: 'fadeUp 0.5s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={10} />Your Numbers
                </p>
                {userId && (
                  <button onClick={() => router.push(`/app/artist/${userId}`)}
                    style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Full profile →
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Shows', value: totalShows, color: C.gold },
                  { label: 'Songs', value: totalSongs, color: C.gold },
                  { label: 'Submitted', value: submittedCount, color: submittedCount > 0 ? C.green : C.muted },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <p style={{ fontSize: 18, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace' }}>{stat.value}</p>
                    <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
                  </div>
                ))}
              </div>
              {showEstimates.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 2px' }}>
                    Estimated royalty range
                  </p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                    ${aggregate.totalLow.toLocaleString()} – ${aggregate.totalHigh.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, margin: '3px 0 0' }}>expected ~${aggregate.totalExpected.toLocaleString()}</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
        @keyframes breathe   { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        @keyframes orb-pulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(1.4);opacity:0} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
