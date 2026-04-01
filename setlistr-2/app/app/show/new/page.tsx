'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, ArrowRight, Music4, RefreshCw, Check, MapPin, Search } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', red: '#dc2626',
  green: '#4ade80',
}

type Venue = { id: string; name: string; city: string; country: string }
type PastPerformance = { id: string; venue_name: string; artist_name: string; started_at: string; song_count: number }
type VenueMemory = { lastDate: string; songCount: number; showCount: number }

export default function NewShowPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [name, setName]                 = useState('')
  const [artistName, setArtistName]     = useState('')
  const [showType, setShowType]         = useState<'single' | 'writers_round'>('single')
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledAt, setScheduledAt]   = useState(new Date().toISOString().slice(0, 16))
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  const [venueQuery, setVenueQuery]         = useState('')
  const [venueId, setVenueId]               = useState<string | null>(null)
  const [venueCity, setVenueCity]           = useState('')
  const [venueCountry, setVenueCountry]     = useState('')
  const [venueSelected, setVenueSelected]   = useState(false)
  const [venueResults, setVenueResults]     = useState<Venue[]>([])
  const [venueSearching, setVenueSearching] = useState(false)
  const [showDropdown, setShowDropdown]     = useState(false)
  const [venueMemory, setVenueMemory]       = useState<VenueMemory | null>(null)
  const [venueCapacity, setVenueCapacity]   = useState<string>('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const [showReuse, setShowReuse]       = useState(searchParams.get('reuse') === 'true')
  const [pastPerfs, setPastPerfs]       = useState<PastPerformance[]>([])
  const [pastLoading, setPastLoading]   = useState(false)
  const [selectedPast, setSelectedPast] = useState<PastPerformance | null>(null)
  const [cloning, setCloning]           = useState(false)

  const effectiveName = name.trim() || venueQuery.trim() || 'Show'
  const isValid = venueQuery.trim().length > 0 || name.trim().length > 0

  // Pre-fill artist name from profile — only sets if field is still empty
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles')
        .select('artist_name, full_name')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          const n = data?.artist_name || data?.full_name || ''
          if (n) setArtistName(prev => prev === '' ? n : prev)
        })
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const searchVenues = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setVenueResults([]); setShowDropdown(false); return }
    setVenueSearching(true)
    const supabase = createClient()
    const { data } = await supabase.from('venues').select('id, name, city, country').ilike('name', `%${query}%`).limit(6)
    setVenueResults(data || [])
    setShowDropdown(true)
    setVenueSearching(false)
  }, [])

  async function fetchVenueMemory(selectedVenueId: string) {
    setVenueMemory(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: perfs } = await supabase
        .from('performances').select('id, started_at')
        .eq('venue_id', selectedVenueId).eq('user_id', user.id)
        .in('status', ['review', 'complete', 'completed', 'exported'])
        .order('started_at', { ascending: false }).limit(10)
      if (!perfs || perfs.length === 0) return
      const { data: songs } = await supabase.from('performance_songs').select('performance_id')
        .in('performance_id', perfs.map(p => p.id))
      const countMap: Record<string, number> = {}
      songs?.forEach(s => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })
      setVenueMemory({ lastDate: perfs[0].started_at, songCount: countMap[perfs[0].id] || 0, showCount: perfs.length })
    } catch { /* non-blocking */ }
  }

  function handleVenueInput(val: string) {
    setVenueQuery(val); setVenueId(null); setVenueSelected(false); setVenueMemory(null); setVenueCapacity('')
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchVenues(val), 280)
  }

  function selectVenue(v: Venue) {
    setVenueQuery(v.name); setVenueId(v.id)
    setVenueCity(v.city || ''); setVenueCountry(v.country || '')
    setVenueSelected(true); setShowDropdown(false); setVenueResults([])
    if (!name.trim()) setName(v.name)
    fetchVenueMemory(v.id)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  useEffect(() => {
    if (!showReuse || pastPerfs.length > 0) return
    setPastLoading(true)
    const supabase = createClient()
    async function loadPast() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setPastLoading(false); return }
      const { data: perfs } = await supabase.from('performances')
        .select('id, venue_name, artist_name, started_at')
        .eq('user_id', user.id).in('status', ['review', 'complete', 'completed', 'exported'])
        .order('started_at', { ascending: false }).limit(20)
      if (!perfs) { setPastLoading(false); return }
      const { data: songs } = await supabase.from('performance_songs').select('performance_id')
        .in('performance_id', perfs.map(p => p.id))
      const countMap: Record<string, number> = {}
      songs?.forEach(s => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })
      setPastPerfs(perfs.map(p => ({
        id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
        started_at: p.started_at, song_count: countMap[p.id] || 0
      })).filter(p => p.song_count > 0 && p.venue_name && p.venue_name.trim() !== '.'))
      setPastLoading(false)
    }
    loadPast()
  }, [showReuse])

  async function handleSubmit() {
    if (!isValid || loading) return
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      let resolvedVenueId = venueId
      if (!resolvedVenueId && venueQuery.trim()) {
        const capacityMap: Record<string,number> = { small: 150, medium: 500, large: 2000, festival: 10000 }
        const { data: nv } = await supabase.from('venues').insert({
          name: venueQuery.trim(), city: venueCity.trim() || null,
          country: venueCountry.trim() || null,
          capacity: venueCapacity ? capacityMap[venueCapacity] : null
        }).select().single()
        if (nv) resolvedVenueId = nv.id
      }
      const scheduledIso = showSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null
      const { data: show, error: showError } = await supabase.from('shows').insert({
        name: effectiveName, show_type: showType, scheduled_at: scheduledIso,
        started_at: new Date().toISOString(), status: 'live', created_by: user?.id || null
      }).select().single()
      if (showError) throw showError
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || name.trim(),
        venue_name: venueQuery.trim() || name.trim(), venue_id: resolvedVenueId || null,
        city: venueCity.trim() || '', country: venueCountry.trim() || '',
        status: 'live', set_duration_minutes: 60, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), user_id: user?.id || null
      }).select().single()
      if (perfError) throw perfError
      router.push(`/app/live/${performance.id}`)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleClone() {
    if (!selectedPast || !isValid || cloning) return
    setCloning(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      let resolvedVenueId = venueId
      if (!resolvedVenueId && venueQuery.trim()) {
        const capacityMap: Record<string,number> = { small: 150, medium: 500, large: 2000, festival: 10000 }
        const { data: nv } = await supabase.from('venues').insert({
          name: venueQuery.trim(), city: venueCity.trim() || null,
          country: venueCountry.trim() || null,
          capacity: venueCapacity ? capacityMap[venueCapacity] : null
        }).select().single()
        if (nv) resolvedVenueId = nv.id
      }
      const scheduledIso = showSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null
      const { data: show, error: showError } = await supabase.from('shows').insert({
        name: effectiveName, show_type: showType, scheduled_at: scheduledIso,
        started_at: new Date().toISOString(), status: 'completed', created_by: user?.id || null
      }).select().single()
      if (showError) throw showError
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || name.trim(),
        venue_name: venueQuery.trim() || name.trim(), venue_id: resolvedVenueId || null,
        city: venueCity.trim() || '', country: venueCountry.trim() || '',
        status: 'review', set_duration_minutes: 60, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
        user_id: user?.id || null
      }).select().single()
      if (perfError) throw perfError
      const { data: sourceSongs } = await supabase.from('performance_songs')
        .select('title, artist, position').eq('performance_id', selectedPast.id)
        .order('position', { ascending: true })
      if (sourceSongs && sourceSongs.length > 0) {
        await supabase.from('performance_songs').insert(
          sourceSongs.map((s, i) => ({ performance_id: performance.id, title: s.title, artist: s.artist, position: s.position || i + 1 }))
        )
      }
      router.push(`/app/review/${performance.id}`)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
      setCloning(false)
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1, animation: 'fadeUp 0.4s ease' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music4 size={16} color={C.gold} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>New Show</p>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.025em' }}>Where are you playing?</h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 28px' }}>Type your venue and tap Start. That's it.</p>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 16 }}>

          {/* Artist name — plain input, pre-filled from profile */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted }}>Your Artist Name</label>
            <input
              type="text"
              value={artistName}
              onChange={e => setArtistName(e.target.value)}
              placeholder="Your artist name"
              style={{ background: C.input, border: `1px solid ${artistName.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', width: '100%', outline: 'none', transition: 'border-color 0.15s ease' }}
            />
          </div>

          {/* Venue */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }} ref={dropdownRef}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={10} />Venue
            </label>
            <div style={{ position: 'relative' }}>
              <input type="text" value={venueQuery}
                onChange={e => handleVenueInput(e.target.value)}
                onFocus={() => { if (venueResults.length > 0) setShowDropdown(true) }}
                placeholder="Search or type venue name..."
                style={{ background: C.input, border: `1px solid ${venueSelected ? C.borderGold : venueQuery.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 40px 12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, outline: 'none' }}
              />
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                {venueSearching
                  ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                  : venueSelected ? <span style={{ fontSize: 13, color: C.gold }}>✓</span>
                  : <Search size={13} color={C.muted} />}
              </div>
            </div>

            {venueMemory && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 8 }}>
                <p style={{ fontSize: 12, color: C.gold, margin: 0, lineHeight: 1.4 }}>
                  Last time here: <strong>{venueMemory.songCount} {venueMemory.songCount === 1 ? 'song' : 'songs'}</strong> on {formatDate(venueMemory.lastDate)}
                  {venueMemory.showCount > 1 && <span style={{ color: C.secondary, fontWeight: 400 }}> · {venueMemory.showCount} shows total</span>}
                </p>
              </div>
            )}

            {showDropdown && venueResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1816', border: `1px solid ${C.borderGold}`, borderRadius: 10, marginTop: 4, zIndex: 50, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                {venueResults.map((v, i) => (
                  <button key={v.id} onMouseDown={() => selectVenue(v)}
                    style={{ width: '100%', padding: '11px 14px', background: 'transparent', border: 'none', borderBottom: i < venueResults.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v.name}</span>
                    {(v.city || v.country) && <span style={{ fontSize: 11, color: C.muted }}>{[v.city, v.country].filter(Boolean).join(', ')}</span>}
                  </button>
                ))}
                <button onMouseDown={() => { setVenueSelected(false); setShowDropdown(false) }}
                  style={{ width: '100%', padding: '10px 14px', background: C.goldDim, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>+ Add "{venueQuery}" as new venue</span>
                </button>
              </div>
            )}

            {showDropdown && venueResults.length === 0 && venueQuery.trim().length >= 2 && !venueSearching && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1816', border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 4, zIndex: 50, padding: '12px 14px' }}>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>No venues found — will be saved as new.</p>
              </div>
            )}

            {venueQuery.trim().length >= 2 && !venueSelected && !venueSearching && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 6px' }}>Venue size <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }}>(helps estimate royalties)</span></p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([
                    { key: 'small', label: 'Small', sub: '<300' },
                    { key: 'medium', label: 'Medium', sub: '300–2k' },
                    { key: 'large', label: 'Large', sub: '2k–10k' },
                    { key: 'festival', label: 'Festival', sub: '10k+' },
                  ] as const).map(opt => (
                    <button key={opt.key} type="button"
                      onClick={() => setVenueCapacity(venueCapacity === opt.key ? '' : opt.key)}
                      style={{ flex: 1, padding: '8px 4px', background: venueCapacity === opt.key ? C.goldDim : 'transparent', border: `1px solid ${venueCapacity === opt.key ? C.borderGold : C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: venueCapacity === opt.key ? C.gold : C.secondary }}>{opt.label}</span>
                      <span style={{ fontSize: 9, color: C.muted }}>{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Writer's Round toggle */}
          <button type="button"
            onClick={() => setShowType(showType === 'single' ? 'writers_round' : 'single')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: showType === 'writers_round' ? C.goldDim : 'transparent', border: `1px solid ${showType === 'writers_round' ? C.borderGold : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
            <span style={{ fontSize: 14, color: showType === 'writers_round' ? C.gold : C.muted }}>{showType === 'writers_round' ? '✓' : '○'}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: showType === 'writers_round' ? C.gold : C.secondary, margin: 0 }}>Writer's Round</p>
              <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>Multiple songwriters sharing the stage</p>
            </div>
          </button>

          {showSchedule && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={10} />Scheduled Time
              </label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                style={{ background: C.input, border: `1px solid ${scheduledAt ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', width: '100%', colorScheme: 'dark' as const, outline: 'none' }} />
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          </div>
        )}

        {!showReuse && (
          <button onClick={handleSubmit} disabled={!isValid || loading}
            style={{ width: '100%', padding: '15px', background: isValid ? C.gold : C.muted, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: isValid && !loading ? 'pointer' : 'not-allowed', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            {loading
              ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Starting...</>
              : <>Start Listening <ArrowRight size={15} strokeWidth={2.5} /></>}
          </button>
        )}

        <button onClick={() => { setShowReuse(v => !v); setSelectedPast(null) }}
          style={{ width: '100%', padding: '11px 16px', background: showReuse ? C.goldDim : 'transparent', border: `1px solid ${showReuse ? C.borderGold : C.border}`, borderRadius: 10, color: showReuse ? C.gold : C.muted, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: showReuse ? 0 : 10 }}>
          <RefreshCw size={12} />{showReuse ? 'Cancel' : 'Reuse a Previous Setlist'}
        </button>

        {showReuse && (
          <div style={{ marginTop: 10 }}>
            {pastLoading ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
              </div>
            ) : pastPerfs.length === 0 ? (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No past performances with songs yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 4px' }}>Select a set to reuse</p>
                {pastPerfs.map(perf => {
                  const isSelected = selectedPast?.id === perf.id
                  return (
                    <button key={perf.id} onClick={() => setSelectedPast(isSelected ? null : perf)}
                      style={{ background: isSelected ? C.goldDim : C.card, border: `1px solid ${isSelected ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12 }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.cardHover }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.card }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: isSelected ? C.gold : 'transparent', border: `1px solid ${isSelected ? C.gold : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <Check size={11} color="#0a0908" strokeWidth={3} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: isSelected ? C.gold : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perf.venue_name}</p>
                        <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>{perf.artist_name} · {formatDate(perf.started_at)}</p>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? C.gold : C.muted, flexShrink: 0 }}>
                        {perf.song_count} {perf.song_count === 1 ? 'song' : 'songs'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {selectedPast && (
              <div style={{ marginTop: 12 }}>
                <button onClick={handleClone} disabled={!isValid || cloning}
                  style={{ width: '100%', padding: '15px', background: isValid ? C.gold : C.muted, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: isValid && !cloning ? 'pointer' : 'not-allowed', opacity: cloning ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  {cloning
                    ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Cloning...</>
                    : <><RefreshCw size={14} />Clone {selectedPast.song_count} {selectedPast.song_count === 1 ? 'Song' : 'Songs'} → Review</>}
                </button>
              </div>
            )}
          </div>
        )}

        <button onClick={() => setShowSchedule(v => !v)}
          style={{ background: 'none', border: 'none', color: showSchedule ? C.gold : C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '12px', width: '100%', marginTop: 4 }}>
          {showSchedule ? '× Cancel scheduling' : '+ Schedule for later'}
        </button>

        <button onClick={() => router.push('/app/dashboard')}
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '4px', width: '100%' }}>
          ← Back to Dashboard
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </div>
  )
}
