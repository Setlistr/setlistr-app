'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Calendar, ArrowRight, Music4, Music2, RefreshCw, Check, MapPin, Search, User } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', red: '#dc2626',
  green: '#4ade80',
}

type Venue = {
  id: string
  name: string
  city: string
  country: string
}

type PastPerformance = {
  id: string
  venue_name: string
  artist_name: string
  started_at: string
  song_count: number
}

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

  // Venue autocomplete
  const [venueQuery, setVenueQuery]         = useState('')
  const [venueId, setVenueId]               = useState<string | null>(null)
  const [venueCity, setVenueCity]           = useState('')
  const [venueCountry, setVenueCountry]     = useState('')
  const [venueSelected, setVenueSelected]   = useState(false)
  const [venueResults, setVenueResults]     = useState<Venue[]>([])
  const [venueSearching, setVenueSearching] = useState(false)
  const [showDropdown, setShowDropdown]     = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  // Reuse setlist
  const [showReuse, setShowReuse]       = useState(searchParams.get('reuse') === 'true')
  const [pastPerfs, setPastPerfs]       = useState<PastPerformance[]>([])
  const [pastLoading, setPastLoading]   = useState(false)
  const [selectedPast, setSelectedPast] = useState<PastPerformance | null>(null)
  const [cloning, setCloning]           = useState(false)

  const isValid = name.trim().length > 0

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

  function handleVenueInput(val: string) {
    setVenueQuery(val); setVenueId(null); setVenueSelected(false)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchVenues(val), 280)
  }

  function selectVenue(v: Venue) {
    setVenueQuery(v.name); setVenueId(v.id)
    setVenueCity(v.city || ''); setVenueCountry(v.country || '')
    setVenueSelected(true); setShowDropdown(false); setVenueResults([])
    if (!name.trim()) setName(v.name)
  }

  useEffect(() => {
    if (!showReuse || pastPerfs.length > 0) return
    setPastLoading(true)
    const supabase = createClient()
    async function loadPast() {
      // FIX 1: scope to current user only — don't show other artists' shows
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setPastLoading(false); return }

      const { data: perfs } = await supabase
        .from('performances')
        .select('id, venue_name, artist_name, started_at')
        .eq('user_id', user.id)
        .in('status', ['review', 'complete', 'completed', 'exported'])
        .order('started_at', { ascending: false })
        .limit(20)

      if (!perfs) { setPastLoading(false); return }

      const { data: songs } = await supabase
        .from('performance_songs')
        .select('performance_id')
        .in('performance_id', perfs.map(p => p.id))

      const countMap: Record<string, number> = {}
      songs?.forEach(s => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })

      setPastPerfs(
        perfs
          .map(p => ({
            id: p.id,
            venue_name: p.venue_name,
            artist_name: p.artist_name,
            started_at: p.started_at,
            song_count: countMap[p.id] || 0,
          }))
          // FIX 2: filter out placeholder "." venue and shows with no songs
          .filter(p => p.song_count > 0 && p.venue_name && p.venue_name.trim() !== '.')
      )
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
        const { data: nv } = await supabase.from('venues').insert({ name: venueQuery.trim(), city: venueCity.trim() || null, country: venueCountry.trim() || null }).select().single()
        if (nv) resolvedVenueId = nv.id
      }
      const scheduledIso = showSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null
      const { data: show, error: showError } = await supabase.from('shows').insert({
        name: name.trim(), show_type: showType, scheduled_at: scheduledIso,
        started_at: new Date().toISOString(), status: 'live', created_by: user?.id || null,
      }).select().single()
      if (showError) throw showError
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || name.trim(),
        venue_name: venueQuery.trim() || name.trim(),
        venue_id: resolvedVenueId || null,
        city: venueCity.trim() || '', country: venueCountry.trim() || '',
        status: 'live', set_duration_minutes: 60, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), user_id: user?.id || null,
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
        const { data: nv } = await supabase.from('venues').insert({ name: venueQuery.trim(), city: venueCity.trim() || null, country: venueCountry.trim() || null }).select().single()
        if (nv) resolvedVenueId = nv.id
      }
      const scheduledIso = showSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null
      const { data: show, error: showError } = await supabase.from('shows').insert({
        name: name.trim(), show_type: showType, scheduled_at: scheduledIso,
        started_at: new Date().toISOString(), status: 'completed', created_by: user?.id || null,
      }).select().single()
      if (showError) throw showError
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || name.trim(),
        venue_name: venueQuery.trim() || name.trim(),
        venue_id: resolvedVenueId || null,
        city: venueCity.trim() || '', country: venueCountry.trim() || '',
        status: 'review', set_duration_minutes: 60, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
        user_id: user?.id || null,
      }).select().single()
      if (perfError) throw perfError
      const { data: sourceSongs, error: songsError } = await supabase
        .from('performance_songs').select('title, artist, position')
        .eq('performance_id', selectedPast.id).order('position', { ascending: true })
      if (songsError) throw songsError
      if (sourceSongs && sourceSongs.length > 0) {
        const { error: insertError } = await supabase.from('performance_songs').insert(
          sourceSongs.map((s, i) => ({ performance_id: performance.id, title: s.title, artist: s.artist, position: s.position || i + 1 }))
        )
        if (insertError) throw insertError
      }
      router.push(`/app/review/${performance.id}`)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
      setCloning(false)
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1, animation: 'fadeUp 0.4s ease' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music4 size={16} color={C.gold} />
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Setlistr</p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>New Show</p>
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.025em' }}>Set up your show</h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 28px' }}>Fill in the details below to begin live capture.</p>

        {/* Form card */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px', display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 16 }}>

          {/* Show Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Building2 size={10} />Show Name<span style={{ color: C.gold }}>*</span>
            </label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Ryman, Bluebird Cafe..." onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ background: C.input, border: `1px solid ${name.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', width: '100%', transition: 'border-color 0.15s ease' }} />
          </div>

          {/* Artist Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <User size={10} />Artist Name
            </label>
            <input type="text" value={artistName} onChange={e => setArtistName(e.target.value)} placeholder="e.g. Your artist name"
              style={{ background: C.input, border: `1px solid ${artistName.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', width: '100%', transition: 'border-color 0.15s ease' }} />
          </div>

          {/* Venue autocomplete */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }} ref={dropdownRef}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={10} />Venue
            </label>
            <div style={{ position: 'relative' }}>
              <input type="text" value={venueQuery} onChange={e => handleVenueInput(e.target.value)} onFocus={() => { if (venueResults.length > 0) setShowDropdown(true) }} placeholder="Search or type venue name..."
                style={{ background: C.input, border: `1px solid ${venueSelected ? C.borderGold : venueQuery.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 40px 12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', transition: 'border-color 0.15s ease' }} />
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                {venueSearching
                  ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                  : venueSelected
                    ? <span style={{ fontSize: 13, color: C.gold }}>✓</span>
                    : <Search size={13} color={C.muted} />
                }
              </div>
            </div>

            {showDropdown && venueResults.length > 0 ? (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1816', border: `1px solid ${C.borderGold}`, borderRadius: 10, marginTop: 4, zIndex: 50, overflow: 'hidden', animation: 'fadeIn 0.15s ease', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                {venueResults.map((v, i) => (
                  <button key={v.id} onMouseDown={() => selectVenue(v)}
                    style={{ width: '100%', padding: '11px 14px', background: 'transparent', border: 'none', borderBottom: i < venueResults.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'inherit' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v.name}</span>
                    {(v.city || v.country) ? <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={9} />{[v.city, v.country].filter(Boolean).join(', ')}</span> : null}
                  </button>
                ))}
                <button onMouseDown={() => { setVenueSelected(false); setShowDropdown(false) }}
                  style={{ width: '100%', padding: '10px 14px', background: C.goldDim, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>+ Add "{venueQuery}" as new venue</span>
                </button>
              </div>
            ) : null}

            {showDropdown && venueResults.length === 0 && venueQuery.trim().length >= 2 && !venueSearching ? (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1816', border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 4, zIndex: 50, padding: '12px 14px', animation: 'fadeIn 0.15s ease' }}>
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>No venues found — will be saved as new.</p>
              </div>
            ) : null}
          </div>

          {/* Show Type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Music2 size={10} />Show Type
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['single', 'writers_round'] as const).map(type => (
                <button key={type} onClick={() => setShowType(type)} type="button"
                  style={{ flex: 1, padding: '10px', background: showType === type ? C.goldDim : 'transparent', border: `1px solid ${showType === type ? C.borderGold : C.border}`, borderRadius: 10, color: showType === type ? C.gold : C.secondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                  {type === 'single' ? 'Single Artist' : "Writer's Round"}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          {showSchedule ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'slideUp 0.2s ease' }}>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={10} />Scheduled Time
              </label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                style={{ background: C.input, border: `1px solid ${scheduledAt ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', width: '100%', colorScheme: 'dark' }} />
            </div>
          ) : null}
        </div>

        {error ? (
          <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, animation: 'fadeIn 0.2s ease' }}>
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          </div>
        ) : null}

        {!showReuse ? (
          <button onClick={handleSubmit} disabled={!isValid || loading}
            style={{ width: '100%', padding: '15px', background: isValid ? C.gold : C.muted, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isValid && !loading ? 'pointer' : 'not-allowed', opacity: loading ? 0.7 : 1, transition: 'background 0.2s ease, opacity 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            {loading
              ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Starting...</>
              : <>Start Now<ArrowRight size={15} strokeWidth={2.5} /></>
            }
          </button>
        ) : null}

        <button onClick={() => { setShowReuse(v => !v); setSelectedPast(null) }}
          style={{ width: '100%', padding: '11px 16px', background: showReuse ? C.goldDim : 'transparent', border: `1px solid ${showReuse ? C.borderGold : C.border}`, borderRadius: 10, color: showReuse ? C.gold : C.muted, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: showReuse ? 0 : 10 }}>
          <RefreshCw size={12} />{showReuse ? 'Cancel' : 'Reuse a Previous Setlist'}
        </button>

        {showReuse ? (
          <div style={{ animation: 'slideUp 0.2s ease', marginTop: 10 }}>
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
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Select a set to reuse</p>
                {pastPerfs.map(perf => {
                  const isSelected = selectedPast?.id === perf.id
                  return (
                    <button key={perf.id} onClick={() => setSelectedPast(isSelected ? null : perf)}
                      style={{ background: isSelected ? C.goldDim : C.card, border: `1px solid ${isSelected ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12 }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.cardHover }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.card }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: isSelected ? C.gold : 'transparent', border: `1px solid ${isSelected ? C.gold : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
                        {isSelected ? <Check size={11} color="#0a0908" strokeWidth={3} /> : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: isSelected ? C.gold : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perf.venue_name}</p>
                        <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>{perf.artist_name} · {formatDate(perf.started_at)}</p>
                      </div>
                      {/* FIX 3: correct grammar for song count */}
                      <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? C.gold : C.muted, flexShrink: 0 }}>
                        {perf.song_count} {perf.song_count === 1 ? 'song' : 'songs'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {selectedPast ? (
              <div style={{ marginTop: 12, animation: 'slideUp 0.15s ease' }}>
                <button onClick={handleClone} disabled={!isValid || cloning}
                  style={{ width: '100%', padding: '15px', background: isValid ? C.gold : C.muted, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isValid && !cloning ? 'pointer' : 'not-allowed', opacity: cloning ? 0.7 : 1, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  {cloning
                    ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Cloning Setlist...</>
                    : <><RefreshCw size={14} />Clone {selectedPast.song_count} {selectedPast.song_count === 1 ? 'Song' : 'Songs'} → Review</>
                  }
                </button>
                {!isValid ? <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '8px 0 0' }}>Enter a show name above first</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <button onClick={() => setShowSchedule(v => !v)}
          style={{ background: 'none', border: 'none', color: showSchedule ? C.gold : C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '12px', width: '100%', marginTop: 4, transition: 'color 0.15s ease' }}>
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
