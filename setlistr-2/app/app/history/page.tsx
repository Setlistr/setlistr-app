'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, ChevronLeft, Music2, DollarSign } from 'lucide-react'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'

const CARD = {
  background: 'linear-gradient(180deg, #171512 0%, #121009 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.1)',
}

type Performance = {
  id:                string
  venue_name:        string
  artist_name:       string
  city:              string
  country:           string
  status:            string
  submission_status: string | null
  started_at:        string
  created_at:        string
  venue_capacity?:   number | null
  show_type?:        string | null
  song_count?:       number
  captured_by_name?: string | null
  venue_id?:         string | null
  photo_url?:        string | null
}

function getDisplayStatus(p: Performance): { label: string; color: string } {
  if (p.submission_status === 'submitted') return { label: 'Submitted',    color: C.green }
  switch (p.status) {
    case 'live':
    case 'pending':    return { label: 'Live',         color: C.red }
    case 'review':     return { label: 'Needs Review', color: C.gold }
    case 'complete':
    case 'completed':  return { label: 'Ready to Claim', color: C.gold }
    case 'exported':   return { label: 'Exported',     color: C.green }
    default:           return { label: 'Needs Review', color: C.gold }
  }
}

function isRealVenue(name: string | null): boolean {
  if (!name) return false
  const t = name.trim()
  return t !== '' && t !== '.' && t !== '..'
}

function getTerritory(country?: string, city?: string): string {
  const s = ((country || '') + ' ' + (city || '')).toLowerCase()
  if (s.includes('canada') || s.includes('ontario') || s.includes('british columbia')
    || s.includes('alberta') || s.includes('quebec') || s.includes('toronto')
    || s.includes('vancouver') || s.includes('montreal') || s.trim() === 'ca') return 'CA'
  return 'US'
}

export default function HistoryPage() {
  const router = useRouter()
  const [performances, setPerformances] = useState<Performance[]>([])
  const [filtered, setFiltered]         = useState<Performance[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [showFilters, setShowFilters]   = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data, error } = await supabase
        .from('performances')
        .select('id, venue_name, venue_id, artist_name, city, country, status, submission_status, started_at, created_at, captured_by_name, photo_url, shows(show_type), venues(capacity)')
        .eq('user_id', user.id)
        .not('status', 'in', '("live","pending")')
        .order('started_at', { ascending: false })

      if (error) console.error('History error:', error)

      if (data) {
        const perfIds = data.map((p: any) => p.id)
        const { data: songData } = await supabase
          .from('performance_songs_visible')
          .select('performance_id')
          .in('performance_id', perfIds)

        const countMap: Record<string, number> = {}
        songData?.forEach((s: any) => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })

        const clean: Performance[] = data
          .filter((p: any) => isRealVenue(p.venue_name))
          .map((p: any) => ({
            id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
            city: p.city, country: p.country, status: p.status,
            submission_status: p.submission_status || null,
            started_at: p.started_at, created_at: p.created_at,
            venue_capacity: p.venues?.capacity || null,
            show_type: p.shows?.show_type || 'single',
            song_count: countMap[p.id] || 0,
            captured_by_name: p.captured_by_name || null,
            venue_id: p.venue_id || null,
            photo_url: p.photo_url || null,
          }))

        setPerformances(clean)
        setFiltered(clean)
      }
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    let result = [...performances]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.venue_name?.toLowerCase().includes(q) ||
        p.artist_name?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter(p => {
        if (statusFilter === 'submitted') return p.submission_status === 'submitted'
        if (statusFilter === 'review')    return p.status === 'review' && p.submission_status !== 'submitted'
        if (statusFilter === 'complete')  return (p.status === 'complete' || p.status === 'completed' || p.status === 'exported') && p.submission_status !== 'submitted'
        return true
      })
    }
    if (dateFrom) result = result.filter(p => (p.started_at || p.created_at) >= dateFrom)
    if (dateTo)   result = result.filter(p => (p.started_at || p.created_at) <= dateTo + 'T23:59:59')
    setFiltered(result)
  }, [search, dateFrom, dateTo, statusFilter, performances])

  function clearFilters() { setSearch(''); setDateFrom(''); setDateTo(''); setStatusFilter('all') }

  function navigateTo(p: Performance) {
    if (p.submission_status === 'submitted') router.push(`/app/submit/${p.id}`)
    else if (p.status === 'live' || p.status === 'pending') router.push(`/app/live/${p.id}`)
    else router.push(`/app/review/${p.id}`)
  }

  const hasFilters = search || dateFrom || dateTo || statusFilter !== 'all'

  const counts = {
    all:       performances.length,
    review:    performances.filter(p => p.status === 'review' && p.submission_status !== 'submitted').length,
    complete:  performances.filter(p => ['complete','completed','exported'].includes(p.status) && p.submission_status !== 'submitted').length,
    submitted: performances.filter(p => p.submission_status === 'submitted').length,
  }

  // Unclaimed shows with songs
  const unclaimedShows = performances.filter(p =>
    p.submission_status !== 'submitted' &&
    (p.status === 'complete' || p.status === 'completed' || p.status === 'review') &&
    (p.song_count || 0) > 0
  )

  const totalUnclaimed = unclaimedShows.reduce((sum, p) => {
    const est = estimateRoyalties({
      songCount: p.song_count || 0,
      venueCapacityBand: capacityToBand(p.venue_capacity),
      showType: (p.show_type as any) || 'single',
      territory: getTerritory(p.country, p.city),
    })
    return sum + est.expected
  }, 0)

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>Loading</span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 24px' }}>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.secondary, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', flex: 1 }}>
            Your Record
          </h1>
          <div style={{ fontSize: 13, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '5px 10px' }}>
            {performances.length} shows
          </div>
        </div>

        {/* ── Unclaimed earnings banner ── */}
        {unclaimedShows.length > 0 && (
          <div style={{ marginBottom: 16, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DollarSign size={18} color={C.gold} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: '0 0 2px' }}>
                ~${totalUnclaimed.toLocaleString()} unclaimed
              </p>
              <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>
                {unclaimedShows.length} show{unclaimedShows.length !== 1 ? 's' : ''} ready to submit to your PRO
              </p>
              <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>Estimate only, not guaranteed — actual payouts vary by PRO.</p>
            </div>
            <button
              onClick={() => setStatusFilter('complete')}
              style={{ flexShrink: 0, padding: '10px 16px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'opacity 0.15s ease' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
              File them →
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search venue, artist, or city..."
              style={{ width: '100%', background: C.card, border: `1px solid ${search ? C.borderGold : C.border}`, borderRadius: 12, padding: '13px 16px 13px 44px', color: C.text, fontSize: 16, fontFamily: 'inherit', transition: 'border-color 0.15s ease', boxSizing: 'border-box' as const }} />
          </div>

          {/* Status tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' as const }}>
            {([
              { key: 'all',       label: 'All',             color: C.muted,  count: counts.all },
              { key: 'review',    label: 'Needs Review',    color: C.gold,   count: counts.review },
              { key: 'complete',  label: 'Ready to Claim',  color: C.gold,   count: counts.complete },
              { key: 'submitted', label: 'Submitted',       color: C.green,  count: counts.submitted },
            ] as const).map(tab => {
              const active = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 20, border: `1px solid ${active ? tab.color + '60' : C.border}`, background: active ? tab.color + '15' : 'transparent', color: active ? tab.color : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s ease', letterSpacing: '0.04em' }}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ fontSize: 12, background: active ? tab.color + '25' : 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 5px', color: active ? tab.color : C.muted }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setShowFilters(!showFilters)}
              style={{ background: showFilters ? C.goldDim : 'transparent', border: `1px solid ${showFilters ? C.borderGold : C.border}`, borderRadius: 8, padding: '7px 12px', color: showFilters ? C.gold : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: 'inherit' }}>
              Date Range {showFilters ? '▲' : '▼'}
            </button>
            {hasFilters && <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Clear ×</button>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {showFilters && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {[{ label: 'From', value: dateFrom, set: setDateFrom }, { label: 'To', value: dateTo, set: setDateTo }].map(({ label, value, set }) => (
                <div key={label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 700 }}>{label}</label>
                  <input type="date" value={value} onChange={e => set(e.target.value)}
                    style={{ width: '100%', background: C.input, border: `1px solid ${value ? C.borderGold : C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark' as const, boxSizing: 'border-box' as const }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ paddingBottom: 48 }}>
          {filtered.length === 0 ? (
            <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '52px 20px', textAlign: 'center', boxShadow: CARD.boxShadow }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Music2 size={20} color={C.gold} />
              </div>
              <p style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
                {hasFilters ? 'No shows match your filters' : 'Your record starts tonight.'}
              </p>
              <p style={{ fontSize: 15, color: C.muted, margin: '0 0 18px' }}>
                {hasFilters ? 'Try adjusting your search or filters' : 'Every show you capture lands here — reviewed, filed, and building your record.'}
              </p>
              {!hasFilters && (
                <button onClick={() => router.push('/app/show/new')}
                  style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '13px 24px', color: C.gold, fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: 'inherit', transition: 'opacity 0.15s ease' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
                  Start First Show →
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((perf) => {
                const displayStatus  = getDisplayStatus(perf)
                const dateStr        = perf.started_at || perf.created_at
                const date           = new Date(dateStr)
                const isClaimable    = perf.submission_status !== 'submitted' && (perf.status === 'complete' || perf.status === 'completed') && (perf.song_count || 0) > 0
                const est            = isClaimable ? estimateRoyalties({
                  songCount: perf.song_count || 0,
                  venueCapacityBand: capacityToBand(perf.venue_capacity),
                  showType: (perf.show_type as any) || 'single',
                  territory: getTerritory(perf.country, perf.city),
                }) : null

                return (
                  <button key={perf.id} onClick={() => navigateTo(perf)}
                    style={{ background: CARD.background, border: `1px solid ${isClaimable ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 16, padding: '16px 18px', minHeight: 88, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', width: '100%', transition: 'background 0.12s ease, border-color 0.12s ease', boxShadow: CARD.boxShadow }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = C.cardHover }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = CARD.background }}>

                    {/* Photo thumbnail */}
                    {perf.photo_url && (
                      <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#171512' }}>
                        <img
                          src={perf.photo_url}
                          alt=""
                          aria-hidden="true"
                          onLoad={e => { (e.target as HTMLImageElement).style.opacity = '1' }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0, transition: 'opacity 0.2s ease' }}
                        />
                      </div>
                    )}

                    {/* Date */}
                    <div style={{ minWidth: 36, textAlign: 'center', flexShrink: 0 }}>
                      <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{date.getDate()}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{date.toLocaleDateString('en-US', { month: 'short' })}</p>
                    </div>

                    <div style={{ width: 1, height: 40, background: C.border, flexShrink: 0 }} />

                    {/* Venue + city · songs */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '0 0 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {perf.venue_name}
                      </p>
                      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                        {[perf.city, (perf.song_count || 0) > 0 ? `${perf.song_count} songs` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>

                    {/* Status + arrow */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: displayStatus.color === C.green ? C.gold : 'transparent', border: displayStatus.color === C.green ? 'none' : `1.5px solid ${C.gold}` }} />
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: displayStatus.color }}>{displayStatus.label}</span>
                        <span style={{ fontSize: 14, color: C.muted }}>→</span>
                      </div>
                      {est && est.expected > 0 && (
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>
                          ~${est.expected}
                        </span>
                      )}
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
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </div>
  )
}
