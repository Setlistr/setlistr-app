'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Calendar, ChevronDown, Users, X } from 'lucide-react'
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

const ACTING_AS_KEY = 'setlistr_acting_as'

type Performance = {
  id: string; venue_name: string; artist_name: string
  city: string; country: string; status: string
  submission_status: string | null; started_at: string
  created_at: string; ended_at?: string
  show_type?: string; venue_capacity?: number | null
  captured_by_name?: string | null
  data_source?: string | null
  performance_date?: string | null
}

type BitEvent = {
  id: string; datetime: string; venueName: string
  venueCity: string; venueRegion: string; venueCountry: string; url: string
}

type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }
type ActingAs      = { artist_id: string; artist_name: string } | null

function useCountUp(target: number, duration: number = 1400, delay: number = 0): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (target === 0) { setCount(0); return }
    let startTime: number | null = null
    let animFrame: number
    const delayTimer = setTimeout(() => {
      function step(timestamp: number) {
        if (!startTime) startTime = timestamp
        const progress = Math.min((timestamp - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setCount(Math.floor(eased * target))
        if (progress < 1) animFrame = requestAnimationFrame(step)
        else setCount(target)
      }
      animFrame = requestAnimationFrame(step)
    }, delay)
    return () => { clearTimeout(delayTimer); cancelAnimationFrame(animFrame) }
  }, [target, duration, delay])
  return count
}

function getDisplayStatus(p: Performance): { label: string; color: string; bg: string } {
  if (p.data_source === 'setlistfm_imported') return { label: 'Imported', color: C.muted, bg: 'rgba(255,255,255,0.04)' }
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
function parseLocalDate(d: string): Date {
  // For date-only or UTC-midnight timestamps, extract Y-M-D and construct in local time
  const datePart = d.split('T')[0].split(' ')[0]
  const [y, m, day] = datePart.split('-').map(Number)
  if (y && m && day) return new Date(y, m - 1, day)
  return new Date(d)
}
function isCanadian(country?: string | null, city?: string | null) {
  return ['CA','Canada','ca'].includes(country || '') ||
    ['toronto','vancouver','montreal','calgary','edmonton','ottawa','winnipeg'].some(c => (city || '').toLowerCase().includes(c)) ||
    (country || '').toLowerCase().includes('canada')
}

export default function DashboardPage() {
  const router = useRouter()

  const [performances, setPerformances]         = useState<Performance[]>([])
  const [loading, setLoading]                   = useState(true)
  const [livePerf, setLivePerf]                 = useState<Performance | null>(null)
  const [morningAfterPerf, setMorningAfterPerf] = useState<Performance | null>(null)
  const [totalSongs, setTotalSongs]             = useState(0)
  const [userId, setUserId]                     = useState<string | null>(null)
  const [ownArtistName, setOwnArtistName]       = useState<string | null>(null)
  const [ownAvatarUrl, setOwnAvatarUrl]         = useState<string | null>(null)
  const [artistName, setArtistName]             = useState<string | null>(null)
  const [showEstimates, setShowEstimates]       = useState<ShowEstimateInput[]>([])
  const [submittedEstimates, setSubmittedEstimates] = useState<ShowEstimateInput[]>([])
  const [songCountMap, setSongCountMap]         = useState<Record<string, number>>({})
  const [lookupName, setLookupName]             = useState<string | null>(null)
  const [upcomingShows, setUpcomingShows]       = useState<BitEvent[]>([])
  const [todayShow, setTodayShow]               = useState<BitEvent | null>(null)
  const [managedArtists, setManagedArtists]     = useState<ManagedArtist[]>([])
  const [actingAs, setActingAs]                 = useState<ActingAs>(null)
  const [switcherOpen, setSwitcherOpen]         = useState(false)
  const [careerTotalShows, setCareerTotalShows] = useState<number>(0)
  const [careerStartYear, setCareerStartYear]   = useState<number>(0)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('bandsintown_artist_name, artist_name, full_name, avatar_url')
          .eq('id', user.id).single()

        if (!profile?.artist_name?.trim()) { router.replace('/app/onboarding'); return }

        const name = profile?.artist_name || profile?.full_name || null
        setOwnArtistName(name)
        setOwnAvatarUrl(profile?.avatar_url ?? null)
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
    const [{ data }, { data: profileCareer }] = await Promise.all([
      supabase
        .from('performances')
        .select(`id, venue_name, artist_name, city, country, status, submission_status, started_at, ended_at, created_at, captured_by_name, data_source, performance_date, shows ( show_type ), venues ( capacity )`)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('career_total_shows, career_start_year')
        .eq('id', (await supabase.auth.getUser()).data.user?.id || '')
        .single()
    ])
    if (profileCareer?.career_total_shows) setCareerTotalShows(profileCareer.career_total_shows)
    if (profileCareer?.career_start_year) setCareerStartYear(profileCareer.career_start_year)
    if (data) processPerformances(data)
  }

  async function loadDelegateContext(artistId: string, artistDisplayName: string) {
    const res  = await fetch(`/api/team/context-data?artist_id=${artistId}`)
    const data = await res.json()
    if (data.error) return
    setArtistName(data.artist_name)
    if (data.bandsintown_artist_name) setLookupName(data.bandsintown_artist_name)
    if (data.career_total_shows) setCareerTotalShows(data.career_total_shows)
    if (data.career_start_year) setCareerStartYear(data.career_start_year)
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
      captured_by_name: p.captured_by_name || null,
      data_source: p.data_source || 'captured',
      performance_date: p.performance_date || null,
    }))
    setPerformances(perfs)

    // Only captured shows feed operational flows
    const capturedPerfs = perfs.filter(p => p.data_source !== 'setlistfm_imported')

    const live = capturedPerfs.find(p =>
      (p.status === 'live' || p.status === 'pending') &&
      minutesSince(p.started_at || p.created_at) < 360
    )
    setLivePerf(live || null)

    const morningAfter = capturedPerfs.find(p => {
      const hoursAgo = hoursSince(p.ended_at || p.started_at)
      return hoursAgo > 0 && hoursAgo <= 18 &&
        p.status !== 'live' && p.status !== 'pending' &&
        p.submission_status !== 'submitted'
    })
    setMorningAfterPerf(morningAfter || null)

    const buildEstimates = (countMap: Record<string, number>) => {
      const unclaimed: ShowEstimateInput[] = capturedPerfs
        .filter(p => p.status !== 'live' && p.status !== 'pending' && p.submission_status !== 'submitted')
        .map(p => ({
          performanceId: p.id, status: p.status,
          songCount: countMap[p.id] || 0,
          venueCapacityBand: capacityToBand(p.venue_capacity),
          showType: (p.show_type as any) || 'single',
          territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
        })).filter(e => e.songCount > 0)

      const submitted: ShowEstimateInput[] = capturedPerfs
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
        .in('performance_id', capturedPerfs.map(p => p.id))
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

  // ── DERIVED CAREER DATA ──
  const aggregate          = aggregateUnclaimedEarnings(showEstimates)
  const submittedAggregate = aggregateUnclaimedEarnings(submittedEstimates)
  const lifetimeTotal      = aggregate.totalExpected + submittedAggregate.totalExpected

  const capturedPerfs    = performances.filter(p => p.data_source !== 'setlistfm_imported')
  const importedPerfs    = performances.filter(p => p.data_source === 'setlistfm_imported')
  const totalCareerShows = performances.filter(p =>
    p.data_source !== 'setlistfm_imported' &&
    ['complete', 'completed', 'review', 'submitted', 'exported'].includes(p.status)
  ).length
  const animatedCareerShows = useCountUp(totalCareerShows, 1400, 200)
  const animatedRoyalties   = useCountUp(lifetimeTotal, 1600, 400)
  const capturedCount    = capturedPerfs.filter(p => p.status !== 'live' && p.status !== 'pending').length
  const submittedCount   = capturedPerfs.filter(p => p.submission_status === 'submitted').length
  const recentPerfs      = capturedPerfs.slice(0, 5)

  const uniqueCities = Array.from(new Set(
    performances.map(p => p.city).filter(Boolean)
  ))

  // Annual trajectory
  const currentYear = new Date().getFullYear()
  const lastYear = currentYear - 1
  const dayOfYear = Math.floor((Date.now() - new Date(currentYear, 0, 0).getTime()) / 86400000)
  const daysInYear = 365

  const capturedPerfsThisYear = performances.filter(p =>
    p.data_source !== 'setlistfm_imported' &&
    new Date(p.started_at).getFullYear() === currentYear
  ).length

  const capturedPerfsLastYear = performances.filter(p =>
    p.data_source !== 'setlistfm_imported' &&
    new Date(p.started_at).getFullYear() === lastYear
  ).length

  const paceThisYear = dayOfYear > 0 ? Math.round((capturedPerfsThisYear / dayOfYear) * daysInYear) : 0
  const paceLastYear = capturedPerfsLastYear

  const trajectoryPct = paceLastYear > 0
    ? Math.round(((paceThisYear - paceLastYear) / paceLastYear) * 100)
    : null

  const trajectoryLabel = (() => {
    if (capturedPerfsThisYear === 0) return null
    if (paceLastYear === 0) return `On pace for ${paceThisYear} shows this year.`
    if (trajectoryPct === null) return null
    const ahead = trajectoryPct > 0
    const pct = Math.abs(trajectoryPct)
    if (pct < 5) return `On pace to match last year.`
    return `${pct}% ${ahead ? 'ahead of' : 'behind'} last year's pace.`
  })()

  // ── ROAD MEMORY — deterministic daily rotation, no state needed ──
  const completedPerfs = capturedPerfs.filter(p => p.status !== 'live' && p.status !== 'pending')
  const roadMemoryOptions: string[] = (() => {
    if (completedPerfs.length === 0) return []
    const opts: string[] = []

    // P1: one year ago this week (350–380 days)
    const oneYearPerf = completedPerfs.find(p => {
      const days = Math.floor((Date.now() - new Date(p.started_at || p.created_at).getTime()) / 86400000)
      return days >= 350 && days <= 380 && !!p.venue_name
    })
    if (oneYearPerf) {
      opts.push(`One year ago this week: ${oneYearPerf.venue_name}${oneYearPerf.city ? `, ${oneYearPerf.city}` : ''}`)
    }

    // P2: most-played venue ≥ 5 shows, only when capturedCount ≥ 10
    if (capturedCount >= 10) {
      const vMap: Record<string, { name: string; count: number }> = {}
      completedPerfs.forEach(p => {
        if (!p.venue_name?.trim()) return
        const key = p.venue_name.toLowerCase().trim()
        if (!vMap[key]) vMap[key] = { name: p.venue_name, count: 0 }
        vMap[key].count++
      })
      const topV = Object.values(vMap).sort((a, b) => b.count - a.count)[0]
      if (topV && topV.count >= 5) {
        opts.push(`${topV.name} — you've played it ${topV.count} times, your most-played room`)
      }
    }

    // P3: milestone framing (only when capturedCount ≥ 25)
    if (capturedCount >= 25) {
      const lastMilestone = Math.floor(capturedCount / 25) * 25
      const nextMilestone = lastMilestone + 25
      const showsAway     = nextMilestone - capturedCount
      // completedPerfs is descending; show #lastMilestone is at index (capturedCount - lastMilestone)
      const msPerf = completedPerfs[capturedCount - lastMilestone]
      if (msPerf) {
        const monthsAgo  = Math.round((Date.now() - new Date(msPerf.started_at || msPerf.created_at).getTime()) / (30 * 86400000))
        const monthsLabel = monthsAgo <= 1 ? 'last month' : `${monthsAgo} months ago`
        opts.push(`Show #${lastMilestone} was ${monthsLabel}. #${nextMilestone} is ${showsAway} show${showsAway !== 1 ? 's' : ''} away.`)
      }
    }

    // P4: first show on record (always available)
    const firstPerf = completedPerfs[completedPerfs.length - 1]
    if (firstPerf?.venue_name) {
      const d = parseLocalDate(firstPerf.started_at || firstPerf.created_at)
      opts.push(`First show on record: ${firstPerf.venue_name}, ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`)
    }

    return opts
  })()
  const roadMemory = roadMemoryOptions.length > 0
    ? roadMemoryOptions[dayOfYear % roadMemoryOptions.length]
    : null

  const careerStartDate = performances.length > 0
    ? performances.reduce((earliest, p) => {
        const d = p.performance_date || p.started_at || p.created_at
        return d < earliest ? d : earliest
      }, performances[0].performance_date || performances[0].started_at || performances[0].created_at)
    : null

  const careerYears = careerStartYear > 0
    ? new Date().getFullYear() - careerStartYear
    : careerStartDate
    ? Math.max(1, new Date().getFullYear() - new Date(careerStartDate).getFullYear())
    : 0

  function navigateToPerformance(p: Performance) {
    if (p.data_source === 'setlistfm_imported') return
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

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* ── NAV ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 24px' }}>
          <div style={{ position: 'relative' }}>
            {managedArtists.length > 0 ? (
              <button onClick={() => setSwitcherOpen(v => !v)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
                  {actingAs ? actingAs.artist_name : artistName || 'Setlistr'}
                </span>
                <ChevronDown size={14} color={C.muted} style={{ transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', flexShrink: 0 }} />
              </button>
            ) : (
              <span style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
                {actingAs ? actingAs.artist_name : artistName || 'Setlistr'}
              </span>
            )}
            {switcherOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 260, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', animation: 'fadeUp 0.15s ease' }}>
                <button onClick={switchToOwn}
                  style={{ width: '100%', padding: '12px 16px', background: !actingAs ? 'rgba(201,168,76,0.06)' : 'transparent', border: 'none', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {ownAvatarUrl
                      ? <img src={ownAvatarUrl} alt={ownArtistName || 'Y'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 11, fontWeight: 800, color: C.secondary }}>{(ownArtistName || 'Y').charAt(0).toUpperCase()}</span>
                    }
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
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {artist.avatar_url
                        ? <img src={artist.avatar_url} alt={artist.artist_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 11, fontWeight: 800, color: C.gold }}>{artist.artist_name.charAt(0).toUpperCase()}</span>
                      }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

        {switcherOpen && <div onClick={() => setSwitcherOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

        {/* ── CAREER LEDGER ── */}
        {totalCareerShows > 0 && (
          <div style={{ marginBottom: 32, animation: 'fadeUp 0.3s ease' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, margin: '0 0 16px' }}>Your career</p>

            {/* Big career number */}
            <p style={{ fontSize: 72, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.04em', lineHeight: 0.9, transition: 'all 0.1s ease' }}>
              {animatedCareerShows.toLocaleString()}
            </p>
            <p style={{ fontSize: 15, color: C.muted, margin: '8px 0 0', fontWeight: 400 }}>
              shows on record
              {capturedCount > 0 && importedPerfs.length > 0 && (
                <span style={{ color: C.gold, marginLeft: 8, fontSize: 13 }}>
                  · {capturedCount} captured
                </span>
              )}
            </p>

            {/* Career stat pills */}
            {(uniqueCities.length > 0 || careerYears > 0) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {uniqueCities.length > 0 && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace' }}>{uniqueCities.length}</span>
                    <span style={{ fontSize: 12, color: C.muted }}>cities</span>
                  </div>
                )}
                {careerYears > 0 && (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace' }}>{careerYears}</span>
                    <span style={{ fontSize: 12, color: C.muted }}>{careerYears === 1 ? 'year' : 'years'} performing</span>
                  </div>
                )}
                {submittedCount > 0 && (
                  <div style={{ background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={10} color={C.green} strokeWidth={2.5} />
                    <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{submittedCount} filed</span>
                  </div>
                )}
              </div>
            )}
            {trajectoryLabel && (
              <p style={{
                fontSize: 13, color: trajectoryPct !== null && trajectoryPct > 0 ? '#4ade80' : trajectoryPct !== null && trajectoryPct < -4 ? '#f87171' : '#8a7a68',
                margin: '4px 0 0', letterSpacing: '0.01em',
                opacity: 0, animation: 'fadeUp 0.5s 0.8s ease forwards',
              }}>
                {trajectoryPct !== null && trajectoryPct > 4 ? '↑ ' : trajectoryPct !== null && trajectoryPct < -4 ? '↓ ' : ''}{trajectoryLabel}
              </p>
            )}

            {/* Royalty line */}
            {lifetimeTotal > 0 && (
              <p style={{ fontSize: 22, fontWeight: 700, color: C.gold, margin: '16px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                ~${animatedRoyalties.toLocaleString()}
                <span style={{ fontSize: 14, fontWeight: 400, color: C.muted, marginLeft: 8, fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: 0 }}>documented</span>
              </p>
            )}

            {/* Submitted progress bar */}
            {submittedCount > 0 && lifetimeTotal > 0 && (
              <div style={{ marginTop: 12, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', maxWidth: 200 }}>
                <div style={{ height: '100%', borderRadius: 1, background: C.gold, width: `${Math.min(100, Math.round((submittedAggregate.totalExpected / lifetimeTotal) * 100))}%`, transition: 'width 0.8s ease' }} />
              </div>
            )}
          </div>
        )}

        {/* Empty career state */}
        {totalCareerShows === 0 && !loading && (
          <div style={{ marginBottom: 32, animation: 'fadeUp 0.3s ease' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>Your career</p>
            <div style={{ padding: '32px 0' }}>
              <p style={{ fontSize: 16, color: C.secondary, margin: '0 0 6px', fontWeight: 500 }}>The stage is quiet for now.</p>
              <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Your record starts with your first show.</p>
            </div>
          </div>
        )}

        {/* ── INSIGHT LINE ── */}
        {capturedCount >= 3 && recentPerfs.length > 0 && (() => {
          const lastPerf = recentPerfs[0]
          const daysSince = Math.floor((Date.now() - new Date(lastPerf.started_at || lastPerf.created_at).getTime()) / 86400000)
          const insightLine = daysSince === 0
            ? `You played tonight. The record is up to date.`
            : daysSince === 1
            ? `Last night at ${lastPerf.venue_name}. Still fresh.`
            : daysSince < 7
            ? `${daysSince} days since ${lastPerf.venue_name}.`
            : daysSince < 30
            ? `${daysSince} days since your last show. The stage is waiting.`
            : `${daysSince} days since your last show. When's the next one?`
          return (
            <div style={{ marginBottom: 24, animation: 'fadeUp 0.35s ease', borderLeft: '2px solid rgba(201,168,76,0.3)', paddingLeft: 16 }}>
              <p style={{ fontSize: 15, color: C.secondary, margin: 0, lineHeight: 1.5, fontWeight: 400, fontStyle: 'italic' }}>{insightLine}</p>
            </div>
          )
        })()}

        {/* ── ROAD MEMORY ── */}
        {roadMemory && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px', marginBottom: 24 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>FROM THE ROAD</p>
            <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.5 }}>{roadMemory}</p>
          </div>
        )}

        {/* ── MORNING-AFTER NUDGE ── */}
        {morningAfterPerf && !livePerf && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.3s ease' }}>
            <button onClick={() => navigateToPerformance(morningAfterPerf)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px 18px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, margin: '0 0 2px' }}>
                  {actingAs ? `${actingAs.artist_name}'s Last Show` : "Last Night's Show"}
                </p>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{morningAfterPerf.venue_name} — review & claim →</p>
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
                  {actingAs ? `${actingAs.artist_name} Plays Tonight` : "Tonight."}
                </p>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{todayShow.venueName} · {formatShowTime(todayShow.datetime)}</p>
              </div>
              <span style={{ fontSize: 12, color: C.green, fontWeight: 700, flexShrink: 0 }}>Let's go →</span>
            </button>
          </div>
        )}

        {/* ── RESUME LIVE SESSION ── */}
        {livePerf && (() => {
          const minsSinceStart     = minutesSince(livePerf.started_at || livePerf.created_at)
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

        {/* ── UNCLAIMED EARNINGS ── */}
        {aggregate.unclaimedCount > 0 && (
          <div style={{ borderLeft: '3px solid #c9a84c', background: 'rgba(201,168,76,0.06)', borderRadius: 14, padding: '16px 18px', marginBottom: 32, animation: 'fadeUp 0.36s ease' }}>
            <p style={{ fontSize: 34, fontWeight: 700, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>~${aggregate.unclaimedExpected.toLocaleString()}</p>
            <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 16px' }}>{aggregate.unclaimedCount} nights not yet filed</p>
            <button onClick={() => router.push('/app/history')}
              style={{ background: C.gold, border: 'none', borderRadius: 20, padding: '8px 18px', color: '#0a0908', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em' }}>
              File them →
            </button>
          </div>
        )}

        {/* ── UPCOMING SHOWS ── */}
        {upcomingShows.length > 0 && (
          <div style={{ marginBottom: 16, animation: 'fadeUp 0.38s ease' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={10} />Coming up
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

        {/* ── RECENT CAPTURED SHOWS ── */}
        <div style={{ animation: 'fadeUp 0.42s ease', paddingBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.muted, margin: 0, letterSpacing: '0.04em' }}>
              Recent shows
              {importedPerfs.length > 0 && capturedCount === 0 && (
                <span style={{ color: C.muted, fontWeight: 400, marginLeft: 6 }}>· history imported</span>
              )}
            </p>
            {capturedPerfs.length > 5 && (
              <button onClick={() => router.push('/app/history')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>All →</button>
            )}
          </div>

          {recentPerfs.length === 0 && importedPerfs.length > 0 ? (
            // Has imported history but no captured shows yet
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: C.gold, margin: '0 0 4px', fontFamily: '"DM Mono", monospace' }}>{careerTotalShows > 0 ? careerTotalShows.toLocaleString() : importedPerfs.length}</p>
              <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 4px', fontWeight: 500 }}>shows in your history</p>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 20px', lineHeight: 1.5 }}>
                Your first captured show starts the verified record.<br />Everything before tonight is history. Make tonight count.
              </p>
              <button onClick={() => router.push('/app/show/new')}
                style={{ background: C.gold, border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 800, color: '#0a0908', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Capture Tonight →
              </button>
            </div>
          ) : recentPerfs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 16, color: C.secondary, margin: '0 0 6px', fontWeight: 500 }}>The stage is quiet for now.</p>
              <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Your record starts with your first show.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recentPerfs.map((perf, idx) => {
                const displayStatus = getDisplayStatus(perf)
                const dateStr = perf.started_at || perf.created_at
                const songCount = songCountMap[perf.id] || 0
                const isFinished = perf.status !== 'live' && perf.status !== 'pending'
                const isImported = perf.data_source === 'setlistfm_imported'
                const perfEst = isFinished && songCount > 0 && !isImported
                  ? estimateRoyalties({ songCount, venueCapacityBand: capacityToBand(perf.venue_capacity), showType: (perf.show_type as any) || 'single', territory: isCanadian(perf.country, perf.city) ? 'CA' : 'US' })
                  : null
                return (
                  <button key={perf.id}
                    onClick={() => navigateToPerformance(perf)}
                    disabled={isImported}
                    style={{ background: 'transparent', border: 'none', borderTop: idx === 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '14px 0', cursor: isImported ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 16, WebkitTapHighlightColor: 'transparent', opacity: isImported ? 0.6 : 1 }}
                    onMouseEnter={e => { if (!isImported) (e.currentTarget as HTMLElement).style.opacity = '0.7' }}
                    onMouseLeave={e => { if (!isImported) (e.currentTarget as HTMLElement).style.opacity = '1' }}>
                    <div style={{ minWidth: 36, flexShrink: 0, textAlign: 'center' }}>
                      <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{parseLocalDate(dateStr).getDate()}</p>
                      <p style={{ fontSize: 10, color: C.muted, margin: '1px 0 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short' })}</p>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perf.venue_name}</p>
                      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{perf.city ? `${perf.city}` : ''}{songCount > 0 ? ` · ${songCount} songs` : ''}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: displayStatus.color, opacity: 0.8 }}>{displayStatus.label}</span>
                      {perfEst && perfEst.expected > 0 && <span style={{ fontSize: 12, color: C.muted, fontFamily: '"DM Mono", monospace' }}>~${perfEst.expected}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

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
