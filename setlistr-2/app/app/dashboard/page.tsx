'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, Mic, Check, Calendar, ChevronDown, Users, X, Home } from 'lucide-react'
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

const ACTING_AS_KEY  = 'setlistr_acting_as'
const PWA_DISMISSED  = 'setlistr_pwa_dismissed'

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

type ManagedArtist = { artist_id: string; artist_name: string; role: string }
type ActingAs      = { artist_id: string; artist_name: string } | null

function getDisplayStatus(p: Performance): { label: string; color: string; bg: string } {
  if (p.submission_status === 'submitted') return { label: 'Submitted', color: C.green, bg: C.greenDim }
  const map: Record<string, { label: string; color: string; bg: string }> = {
    live:      { label: 'Live',         color: C.red,   bg: C.redDim  },
    pending:   { label: 'Live',         color: C.red,   bg: C.redDim  },
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

function minutesSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 60000) }
function hoursSince(d: string)   { return (Date.now() - new Date(d).getTime()) / 3600000 }

function isToday(d: string) {
  const a = new Date(d), b = new Date()
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isTomorrow(d: string) {
  const a = new Date(d), b = new Date(); b.setDate(b.getDate() + 1)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function formatShowTime(d: string) { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function formatShowDate(d: string) { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
function isCanadian(country?: string | null, city?: string | null) {
  return ['CA','Canada','ca'].includes(country || '') ||
    ['toronto','vancouver','montreal','calgary','edmonton','ottawa','winnipeg'].some(c => (city || '').toLowerCase().includes(c)) ||
    (country || '').toLowerCase().includes('canada')
}

export default function DashboardPage() {
  const router = useRouter()

  const [performances, setPerformances]       = useState<Performance[]>([])
  const [loading, setLoading]                 = useState(true)
  const [livePerf, setLivePerf]               = useState<Performance | null>(null)
  const [morningAfterPerf, setMorningAfterPerf] = useState<Performance | null>(null)
  const [totalSongs, setTotalSongs]           = useState(0)
  const [userId, setUserId]                   = useState<string | null>(null)
  const [ownArtistName, setOwnArtistName]     = useState<string | null>(null)
  const [artistName, setArtistName]           = useState<string | null>(null)
  const [showEstimates, setShowEstimates]     = useState<ShowEstimateInput[]>([])
  const [submittedEstimates, setSubmittedEstimates] = useState<ShowEstimateInput[]>([])
  const [songCountMap, setSongCountMap]       = useState<Record<string, number>>({})
  const [lookupName, setLookupName]           = useState<string | null>(null)
  const [upcomingShows, setUpcomingShows]     = useState<BitEvent[]>([])
  const [todayShow, setTodayShow]             = useState<BitEvent | null>(null)

  // Delegation
  const [managedArtists, setManagedArtists]   = useState<ManagedArtist[]>([])
  const [actingAs, setActingAs]               = useState<ActingAs>(null)
  const [switcherOpen, setSwitcherOpen]       = useState(false)

  // PWA prompt
  const [showPWAPrompt, setShowPWAPrompt]     = useState(false)
  const [isIOS, setIsIOS]                     = useState(false)

  // ── PWA detection ─────────────────────────────────────────────────────────
  useEffect(() => {
    const dismissed   = localStorage.getItem(PWA_DISMISSED)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const android = /android/i.test(navigator.userAgent)
    const isMobile = ios || android
    if (!dismissed && !isStandalone && isMobile) {
      setIsIOS(ios)
      // Delay slightly so it doesn't flash on load
      setTimeout(() => setShowPWAPrompt(true), 3000)
    }
  }, [])

  function dismissPWA() {
    localStorage.setItem(PWA_DISMISSED, '1')
    setShowPWAPrompt(false)
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('bandsintown_artist_name, artist_name, full_name')
          .eq('id', user.id).single()

        if (!profile?.artist_name?.trim()) { router.replace('/app/onboarding'); return }

        const name = profile?.artist_name || profile?.full_name || null
        setOwnArtistName(name)
        if (profile?.bandsintown_artist_name) setLookupName(profile.bandsintown_artist_name)

        const managedRes  = await fetch('/api/team/managed-artists')
        const managedData = await managedRes.json()
        const managed: ManagedArtist[] = managedData.managed || []
        setManagedArtists(managed)

        const savedActingAs = localStorage.getItem(ACTING_AS_KEY)
        if (savedActingAs && managed.length > 0) {
          try {
            const parsed = JSON.parse(savedActingAs)
            const stillManages = managed.find(m => m.artist_id === parsed.artist_id)
            if (stillManages) {
              setActingAs(parsed)
              await loadDelegateContext(parsed.artist_id, parsed.artist_name)
              setLoading(false); return
            } else { localStorage.removeItem(ACTING_AS_KEY) }
          } catch { localStorage.removeItem(ACTING_AS_KEY) }
        }
        setArtistName(name)
      }

      await loadOwnPerformances(supabase)
      setLoading(false)
    }
    load()
  }, [])

  async function loadOwnPerformances(supabase: any) {
    const { data } = await supabase
      .from('performances')
      .select(`id, venue_name, artist_name, city, country, status, submission_status, started_at, ended_at, created_at, shows ( show_type ), venues ( capacity )`)
      .order('created_at', { ascending: false })
    if (data) processPerformances(data)
  }

  async function loadDelegateContext(artistId: string, artistDisplayName: string) {
    const res  = await fetch(`/api/team/context-data?artist_id=${artistId}`)
    const data = await res.json()
    if (data.error) return
    setArtistName(data.artist_name)
    if (data.bandsintown_artist_name) setLookupName(data.bandsintown_artist_name)
    processPerformances(data.performances, data.songCountMap)
  }

  function processPerformances(rawPerfs: any[], existingSongCountMap?: Record<string, number>) {
    const perfs: Performance[] = rawPerfs.map((p: any) => ({
      id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
      city: p.city, country: p.country, status: p.status,
      submission_status: p.submission_status || null,
      started_at: p.started_at, ended_at: p.ended_at || null, created_at: p.created_at,
      show_type: p.shows?.show_type || p.show_type || 'single',
      venue_capacity: p.venues?.capacity || p.venue_capacity || null,
    }))
    setPerformances(perfs)

    const live = perfs.find(p => (p.status === 'live' || p.status === 'pending') && minutesSince(p.started_at || p.created_at) < 360)
    setLivePerf(live || null)

    const morningAfter = perfs.find(p => {
      const hoursAgo = hoursSince(p.ended_at || p.started_at)
      return hoursAgo > 0 && hoursAgo <= 18 && p.status !== 'live' && p.status !== 'pending' && p.submission_status !== 'submitted'
    })
    setMorningAfterPerf(morningAfter || null)

    const buildEstimates = (countMap: Record<string, number>) => {
      // Unclaimed (not submitted, has songs)
      const unclaimed: ShowEstimateInput[] = perfs
        .filter(p => p.status !== 'live' && p.status !== 'pending' && p.submission_status !== 'submitted')
        .map(p => ({
          performanceId: p.id, status: p.status,
          songCount: countMap[p.id] || 0,
          venueCapacityBand: capacityToBand(p.venue_capacity),
          showType: (p.show_type as any) || 'single',
          territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
        })).filter(e => e.songCount > 0)

      // Submitted (for lifetime total)
      const submitted: ShowEstimateInput[] = perfs
        .filter(p => p.submission_status === 'submitted')
        .map(p => ({
          performanceId: p.id, status: 'complete',
          songCount: countMap[p.id] || 0,
          venueCapacityBand: capacityToBand(p.venue_capacity),
          showType: (p.show_type as any) || 'single',
          territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
        })).filter(e => e.songCount > 0)

      setShowEstimates(unclaimed)
      setSubmittedEstimates(submitted)
      setSongCountMap(countMap)
      setTotalSongs(Object.values(countMap).reduce((a, b) => a + b, 0))
    }

    if (existingSongCountMap) {
      buildEstimates(existingSongCountMap)
    } else {
      const supabase = createClient()
      supabase.from('performance_songs').select('performance_id')
        .in('performance_id', perfs.map(p => p.id))
        .then(({ data: songData }) => {
          const countMap: Record<string, number> = {}
          songData?.forEach((s: any) => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })
          buildEstimates(countMap)
        })
    }
  }

  async function switchToArtist(artist: ManagedArtist) {
    setSwitcherOpen(false); setLoading(true)
    setLookupName(null); setUpcomingShows([]); setTodayShow(null)
    const ctx = { artist_id: artist.artist_id, artist_name: artist.artist_name }
    setActingAs(ctx)
    localStorage.setItem(ACTING_AS_KEY, JSON.stringify(ctx))
    await loadDelegateContext(artist.artist_id, artist.artist_name)
    setLoading(false)
  }

  async function switchToOwn() {
    setSwitcherOpen(false); setLoading(true)
    setActingAs(null); localStorage.removeItem(ACTING_AS_KEY)
    setLookupName(null); setUpcomingShows([]); setTodayShow(null)
    setArtistName(ownArtistName)
    const supabase = createClient()
    const { data: profile } = await supabase.from('profiles').select('bandsintown_artist_name').eq('id', userId!).single()
    if (profile?.bandsintown_artist_name) setLookupName(profile.bandsintown_artist_name)
    await loadOwnPerformances(supabase)
    setLoading(false)
  }

  useEffect(() => {
    if (!lookupName) return
    async function fetchUpcoming() {
      try {
        let events: BitEvent[] = []
        const bitRes  = await fetch(`/api/bandsintown/upcoming?artist=${encodeURIComponent(lookupName!)}`)
        const bitData = await bitRes.json()
        events = bitData.events || []
        if (events.length === 0) {
          const tmRes  = await fetch(`/api/ticketmaster/upcoming?artist=${encodeURIComponent(lookupName!)}`)
          const tmData = await tmRes.json()
          events = tmData.events || []
        }
        setUpcomingShows(events.filter(e => new Date(e.datetime) > new Date()).slice(0, 3))
        setTodayShow(events.find(e => isToday(e.datetime)) || null)
      } catch {}
    }
    fetchUpcoming()
  }, [lookupName])

  // ── Derived values ────────────────────────────────────────────────────────
  const aggregate        = aggregateUnclaimedEarnings(showEstimates)
  const submittedAggregate = aggregateUnclaimedEarnings(submittedEstimates)
  const lifetimeTotal    = aggregate.totalExpected + submittedAggregate.totalExpected
  const totalShows       = performances.filter(p => p.status !== 'live' && p.status !== 'pending').length
  const submittedCount   = performances.filter(p => p.submission_status === 'submitted').length
  const recentPerfs      = performances.slice(0, 5)

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
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {actingAs ? `Loading ${actingAs.artist_name}...` : 'Loading'}
        </span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      {/* ── PWA PROMPT ── */}
      {showPWAPrompt && (
        <div style={{ position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 100, animation: 'fadeUp 0.4s ease' }}>
          <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Home size={16} color={C.gold} strokeWidth={2} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: '0 0 3px' }}>Add Setlistr to your home screen</p>
                <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                  {isIOS
                    ? 'Tap the share button below, then "Add to Home Screen" for instant access.'
                    : 'Tap your browser menu → "Add to Home Screen" for instant access.'}
                </p>
              </div>
              <button onClick={dismissPWA} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* ── NAV ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 24px' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Setlistr</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {submittedCount > 0 && (
              <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={10} strokeWidth={2.5} />{submittedCount}
              </span>
            )}
            <button onClick={() => router.push('/app/settings')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Settings</button>
            <button onClick={() => router.push('/app/history')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>History →</button>
          </div>
        </div>

        {/* ── ACTING-AS BANNER ── */}
        {actingAs && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.3s ease' }}>
            <div style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={13} color={C.gold} strokeWidth={2} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>Managing: {actingAs.artist_name}</span>
              </div>
              <button onClick={switchToOwn} style={{ background: 'none', border: `1px solid ${C.borderGold}`, borderRadius: 8, padding: '4px 10px', color: C.secondary, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                <X size={10} /> Exit
              </button>
            </div>
          </div>
        )}

        {/* ── ACCOUNT SWITCHER ── */}
        {managedArtists.length > 0 && (
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <button onClick={() => setSwitcherOpen(v => !v)}
              style={{ width: '100%', background: C.card, border: `1px solid ${actingAs ? C.borderGold : C.border}`, borderRadius: 12, padding: '10px 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: actingAs ? C.goldDim : 'rgba(255,255,255,0.04)', border: `1px solid ${actingAs ? C.borderGold : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: actingAs ? C.gold : C.secondary }}>
                    {(actingAs ? actingAs.artist_name : ownArtistName || 'Y')?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>{actingAs ? actingAs.artist_name : ownArtistName || 'Your Account'}</p>
                  <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{actingAs ? 'Managing · tap to switch' : 'Your account · tap to switch'}</p>
                </div>
              </div>
              <ChevronDown size={14} color={C.muted} style={{ transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }} />
            </button>

            {switcherOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'fadeUp 0.15s ease' }}>
                <button onClick={switchToOwn}
                  style={{ width: '100%', padding: '12px 16px', background: !actingAs ? 'rgba(201,168,76,0.06)' : 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.secondary }}>{(ownArtistName || 'Y').charAt(0).toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{ownArtistName || 'Your Account'}</p>
                    <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>Your account</p>
                  </div>
                  {!actingAs && <Check size={12} color={C.gold} strokeWidth={2.5} />}
                </button>
                {managedArtists.map(artist => (
                  <button key={artist.artist_id} onClick={() => switchToArtist(artist)}
                    style={{ width: '100%', padding: '12px 16px', background: actingAs?.artist_id === artist.artist_id ? C.goldDim : 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.gold }}>{artist.artist_name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{artist.artist_name}</p>
                      <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>Managing · {artist.role}</p>
                    </div>
                    {actingAs?.artist_id === artist.artist_id && <Check size={12} color={C.gold} strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {switcherOpen && <div onClick={() => setSwitcherOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

        {/* ── MORNING-AFTER NUDGE ── */}
        {morningAfterPerf && !livePerf && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.3s ease' }}>
            <button onClick={() => navigateToPerformance(morningAfterPerf)}
              style={{ width: '100%', background: 'rgba(201,168,76,0.07)', border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '14px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>🌅</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, margin: '0 0 2px' }}>
                  {actingAs ? `${actingAs.artist_name}'s Last Show` : "Last Night's Show"}
                </p>
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
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, margin: '0 0 2px' }}>
                  {actingAs ? `${actingAs.artist_name} Plays Tonight` : "You're Playing Tonight"}
                </p>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{todayShow.venueName} · {formatShowTime(todayShow.datetime)}</p>
              </div>
              <span style={{ fontSize: 12, color: C.green, fontWeight: 700, flexShrink: 0 }}>Start →</span>
            </button>
          </div>
        )}

        {/* ── RESUME LIVE SESSION ── */}
        {livePerf && (() => {
          const minsSinceStart    = minutesSince(livePerf.started_at || livePerf.created_at)
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
            {artistName && (
              <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px', fontWeight: 500 }}>
                {totalShows > 0
                  ? `${totalShows} show${totalShows !== 1 ? 's' : ''} on record${submittedCount > 0 ? ` · ${submittedCount} submitted` : ''}`
                  : 'Ready for the first show.'}
              </p>
            )}
            <button onClick={() => router.push('/app/show/new')}
              style={{ width: '100%', background: `linear-gradient(135deg, #c9a84c 0%, #a8872d 100%)`, border: 'none', borderRadius: 20, padding: '28px 24px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 20, position: 'relative', overflow: 'hidden', WebkitTapHighlightColor: 'transparent' }}>
              <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '60%', height: '180%', background: 'radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(10,9,8,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#0a0908', opacity: 0.85 }} />
                </div>
                <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', border: '1.5px solid rgba(10,9,8,0.2)', animation: 'orb-pulse 2s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '1px solid rgba(10,9,8,0.1)', animation: 'orb-pulse 2s ease-in-out 0.4s infinite' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: '#0a0908', margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>Load Your Set</p>
                <p style={{ fontSize: 13, color: 'rgba(10,9,8,0.6)', margin: 0, fontWeight: 500 }}>
                  {actingAs ? `Capturing for ${actingAs.artist_name}` : 'Start live capture · Setlistr listens'}
                </p>
              </div>
              <div style={{ fontSize: 20, color: 'rgba(10,9,8,0.4)', flexShrink: 0, position: 'relative', zIndex: 1 }}>→</div>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
              <button onClick={() => router.push('/app/show/new?mode=upload')}
                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0' }}>
                📷 Upload a paper setlist instead
              </button>
            </div>
          </div>
        )}

        {/* ── LIFETIME ROYALTY COUNTER ── */}
        {lifetimeTotal > 0 && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.34s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>
                {actingAs ? `${actingAs.artist_name}'s` : 'Your'} Live Performance Value
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 32, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
                    ~${lifetimeTotal.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0' }}>documented across {totalShows} show{totalShows !== 1 ? 's' : ''}</p>
                </div>
                {submittedCount > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.green, margin: 0, fontFamily: '"DM Mono", monospace' }}>
                      ~${submittedAggregate.totalExpected.toLocaleString()}
                    </p>
                    <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0' }}>filed with PRO</p>
                  </div>
                )}
              </div>
              {/* Progress bar: filed vs total */}
              {submittedCount > 0 && lifetimeTotal > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: C.green, width: `${Math.min(100, Math.round((submittedAggregate.totalExpected / lifetimeTotal) * 100))}%`, transition: 'width 0.8s ease' }} />
                  </div>
                  <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>
                    {Math.round((submittedAggregate.totalExpected / lifetimeTotal) * 100)}% filed · {100 - Math.round((submittedAggregate.totalExpected / lifetimeTotal) * 100)}% unclaimed
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── UNCLAIMED EARNINGS ── */}
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
                const dateLabel = isEventToday ? 'Tonight' : isEventTomorrow ? 'Tomorrow' : formatShowDate(event.datetime)
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
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Load the first set to get started.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentPerfs.map(perf => {
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

        {/* ── STATS ── */}
        {totalShows > 0 && (
          <div style={{ paddingBottom: 48, animation: 'fadeUp 0.5s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <TrendingUp size={10} />
                  {actingAs ? `${actingAs.artist_name}'s Numbers` : 'Your Numbers'}
                </p>
                {!actingAs && userId && (
                  <button onClick={() => router.push(`/app/artist/${userId}`)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Full profile →
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'Shows',     value: totalShows,     color: C.gold },
                  { label: 'Songs',     value: totalSongs,     color: C.gold },
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
                  <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 2px' }}>Unclaimed royalty range</p>
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
