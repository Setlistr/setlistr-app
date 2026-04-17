'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Calendar, ArrowRight, Music4, RefreshCw, Check, MapPin, Search, X, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { CameraCapture } from '@/components/CameraCapture'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif',
  'application/pdf', 'text/plain',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024

type Venue = { id: string; name: string; city: string; country: string }
type PastPerformance = { id: string; venue_name: string; artist_name: string; started_at: string; song_count: number }
type VenueMemory = { lastDate: string; songCount: number; showCount: number; songs?: { title: string; artist: string }[] }
type PlannedSong = { title: string; artist: string; position: number }

export default function NewShowPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

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

  const [setlistOpen, setSetlistOpen]   = useState(false)
  const [plannedSongs, setPlannedSongs] = useState<PlannedSong[]>([])
  const [uploadMode, setUploadMode]     = useState<'chips' | 'upload'>('chips')
  const [recentSongs, setRecentSongs]   = useState<{ title: string; artist: string }[]>([])
  const [quickSearch, setQuickSearch]   = useState('')
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState('')
  const [showCamera, setShowCamera]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const effectiveName = venueQuery.trim() || 'Show'
  const isValid = venueQuery.trim().length > 0

  // ── Auto-open upload mode when arriving via ?mode=upload ──
  useEffect(() => {
    if (searchParams.get('mode') === 'upload') {
      setSetlistOpen(true)
      setUploadMode('upload')
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('artist_name, full_name').eq('id', user.id).single()
        .then(({ data }) => {
          const n = data?.artist_name || data?.full_name || ''
          if (n) setArtistName(prev => prev === '' ? n : prev)
        })
    })
  }, [])

  useEffect(() => {
    if (!setlistOpen) return
    fetch('/api/recent-songs?limit=20')
      .then(r => r.json())
      .then(data => setRecentSongs(data?.songs || []))
      .catch(() => {})
  }, [setlistOpen])

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
      const { data: perfs } = await supabase.from('performances').select('id, started_at')
        .eq('venue_id', selectedVenueId).eq('user_id', user.id)
        .in('status', ['review', 'complete', 'completed', 'exported'])
        .order('started_at', { ascending: false }).limit(10)
      if (!perfs || perfs.length === 0) return
      const { data: songs } = await supabase.from('performance_songs')
        .select('performance_id, title, artist')
        .in('performance_id', perfs.map(p => p.id))
      const countMap: Record<string, number> = {}
      const songMap: Record<string, { title: string; artist: string }[]> = {}
      songs?.forEach(s => {
        countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1
        if (!songMap[s.performance_id]) songMap[s.performance_id] = []
        songMap[s.performance_id].push({ title: s.title, artist: s.artist || '' })
      })
      setVenueMemory({
        lastDate: perfs[0].started_at,
        songCount: countMap[perfs[0].id] || 0,
        showCount: perfs.length,
        songs: songMap[perfs[0].id] || [],
      })
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
    fetchVenueMemory(v.id)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function addPlannedSong(title: string, artist: string = '') {
    if (!title.trim()) return
    if (plannedSongs.some(s => s.title.toLowerCase() === title.toLowerCase())) return
    setPlannedSongs(prev => [...prev, { title: title.trim(), artist: artist.trim(), position: prev.length }])
  }

  function removePlannedSong(index: number) {
    setPlannedSongs(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i })))
  }

  function loadFromVenueMemory() {
    if (!venueMemory?.songs?.length) return
    setPlannedSongs(venueMemory.songs.map((s, i) => ({ ...s, position: i })))
    setSetlistOpen(true)
  }

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const MAX = 1600
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX }
          else { width = Math.round(width * MAX / height); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url)
          if (blob) resolve(new File([blob], 'setlist.jpg', { type: 'image/jpeg' }))
          else resolve(file)
        }, 'image/jpeg', 0.85)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }

  async function handleFileUpload(file: File) {
    setUploadError('')
    if (file.size > MAX_FILE_SIZE) { setUploadError('File is too large. Maximum size is 10MB.'); return }
    const fileName = (file.name || '').toLowerCase()
    const isHEIC = fileName.endsWith('.heic') || fileName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif'
    const isAllowed = ALLOWED_MIME_TYPES.includes(file.type) || isHEIC
    if (!isAllowed) { setUploadError('Unsupported file type. Please upload a JPG, PNG, PDF, or TXT file.'); return }
    setUploading(true)
    try {
      let uploadFile = file
      if (file.type.startsWith('image/') || isHEIC) {
        uploadFile = await compressImage(file)
      }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (user?.id) formData.append('userId', user.id)
      const res = await fetch('/api/parse-setlist', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      const existing = new Set(plannedSongs.map(s => s.title.toLowerCase()))
      const newSongs = (data.songs as PlannedSong[]).filter(s => !existing.has(s.title.toLowerCase()))
      setPlannedSongs(prev => [...prev, ...newSongs.map((s, i) => ({ ...s, position: prev.length + i }))])
      setUploadMode('chips')
    } catch (err: any) {
      setUploadError(err.message || 'Could not read the setlist. Try a clearer photo.')
    } finally {
      setUploading(false)
    }
  }

  const filteredRecent = recentSongs
    .filter(s => !quickSearch.trim() || s.title.toLowerCase().includes(quickSearch.toLowerCase()))
    .filter(s => !plannedSongs.some(p => p.title.toLowerCase() === s.title.toLowerCase()))

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

  async function savePlannedSetlist(performanceId: string, userId: string, resolvedVenueId: string | null) {
    if (plannedSongs.length === 0) return
    const supabase = createClient()
    const { data: ps } = await supabase.from('planned_setlists').insert({
      user_id: userId, performance_id: performanceId,
      venue_id: resolvedVenueId, venue_name: venueQuery.trim(),
      date: new Date().toISOString().split('T')[0],
    }).select().single()
    if (!ps) return
    await supabase.from('planned_setlist_songs').insert(
      plannedSongs.map((s, i) => ({ planned_setlist_id: ps.id, title: s.title, artist: s.artist, position: i }))
    )
    await supabase.from('performance_songs').insert(
      plannedSongs.map((s, i) => ({
        performance_id: performanceId, title: s.title, artist: s.artist,
        position: i, was_planned: true, source: 'planned',
      }))
    )
  }

  async function handleSubmit() {
    if (!isValid || loading) return
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated: ' + userError?.message)
      let resolvedVenueId = venueId
      if (!resolvedVenueId && venueQuery.trim()) {
        const capacityMap: Record<string, number> = { small: 150, medium: 500, large: 2000, festival: 10000 }
        const { data: nv, error: venueError } = await supabase.from('venues').insert({
          name: venueQuery.trim(), city: venueCity.trim() || null,
          country: venueCountry.trim() || null,
          capacity: venueCapacity ? capacityMap[venueCapacity] : null
        }).select().single()
        if (venueError) throw new Error('Venue insert failed: ' + venueError.message)
        if (nv) resolvedVenueId = nv.id
      }
      const scheduledIso = showSchedule && scheduledAt ? new Date(scheduledAt).toISOString() : null
      const { data: show, error: showError } = await supabase.from('shows').insert({
        name: effectiveName, show_type: showType, scheduled_at: scheduledIso,
        started_at: new Date().toISOString(), status: 'live', created_by: user.id,
      }).select().single()
      if (showError) throw new Error('Show insert failed: ' + showError.message)
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || venueQuery.trim(),
        venue_name: venueQuery.trim(), venue_id: resolvedVenueId || null,
        city: venueCity.trim() || null, country: venueCountry.trim() || null,
        status: 'live', set_duration_minutes: 60, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), user_id: user.id,
      }).select().single()
      if (perfError) throw new Error('Performance insert failed: ' + perfError.message)
      if (plannedSongs.length > 0) await savePlannedSetlist(performance.id, user.id, resolvedVenueId)
      router.push(`/app/live/${performance.id}`)
    } catch (err: any) {
      alert('DEBUG: ' + err?.message)
      setError(err?.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleClone() {
    if (!selectedPast || !isValid || cloning) return
    setCloning(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')
      let resolvedVenueId = venueId
      if (!resolvedVenueId && venueQuery.trim()) {
        const capacityMap: Record<string, number> = { small: 150, medium: 500, large: 2000, festival: 10000 }
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
        started_at: new Date().toISOString(), status: 'completed', created_by: user.id
      }).select().single()
      if (showError) throw new Error('Show insert failed: ' + showError.message)
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || venueQuery.trim(),
        venue_name: venueQuery.trim(), venue_id: resolvedVenueId || null,
        city: venueCity.trim() || null, country: venueCountry.trim() || null,
        status: 'review', set_duration_minutes: 60, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
        user_id: user.id
      }).select().single()
      if (perfError) throw new Error('Performance insert failed: ' + perfError.message)
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

        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 24px', letterSpacing: '-0.025em' }}>Where tonight?</h1>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16 }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }} ref={dropdownRef}>
            <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={10} />Venue
            </label>
            <div style={{ position: 'relative' }}>
              <input type="text" value={venueQuery}
                onChange={e => handleVenueInput(e.target.value)}
                onFocus={() => { if (venueResults.length > 0) setShowDropdown(true) }}
                placeholder="Search or type venue name..."
                style={{ background: C.input, border: `1px solid ${venueSelected ? C.borderGold : venueQuery.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 40px 12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, outline: 'none' }} />
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                {venueSearching
                  ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                  : venueSelected ? <span style={{ fontSize: 13, color: C.gold }}>✓</span>
                  : <Search size={13} color={C.muted} />}
              </div>
            </div>

            {venueMemory && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 8 }}>
                <p style={{ fontSize: 12, color: C.gold, margin: 0, lineHeight: 1.4 }}>
                  Last time: <strong>{venueMemory.songCount} songs</strong> on {formatDate(venueMemory.lastDate)}
                </p>
                {venueMemory.songs && venueMemory.songs.length > 0 && (
                  <button onClick={loadFromVenueMemory}
                    style={{ fontSize: 11, fontWeight: 700, color: C.gold, background: 'rgba(201,168,76,0.15)', border: `1px solid ${C.borderGold}`, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    Load Set →
                  </button>
                )}
              </div>
            )}

            {showDropdown && venueResults.length > 0 && (
              <div onMouseDown={e => e.preventDefault()}
                style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1816', border: `1px solid ${C.borderGold}`, borderRadius: 10, marginTop: 4, zIndex: 50, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
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

            {venueQuery.trim().length >= 2 && !venueSelected && !venueSearching && !showDropdown && (
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

          <button type="button" onClick={() => setShowType(showType === 'single' ? 'writers_round' : 'single')}
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

        {/* ── LOAD YOUR SET ── */}
        <div style={{ background: C.card, border: `1px solid ${setlistOpen ? C.borderGold : C.border}`, borderRadius: 16, marginBottom: 16, overflow: 'hidden', transition: 'border-color 0.2s ease' }}>
          <button onClick={() => setSetlistOpen(v => !v)}
            style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: setlistOpen ? C.goldDim : 'rgba(255,255,255,0.04)', border: `1px solid ${setlistOpen ? C.borderGold : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Music4 size={13} color={setlistOpen ? C.gold : C.muted} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: setlistOpen ? C.gold : C.text, margin: 0 }}>Load Your Set</p>
                <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>
                  {plannedSongs.length > 0 ? `${plannedSongs.length} songs loaded · auto-confirms during capture` : 'Optional · speeds up post-show review'}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {plannedSongs.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '2px 8px' }}>{plannedSongs.length}</span>
              )}
              {setlistOpen ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
            </div>
          </button>

          {setlistOpen && (
            <div style={{ padding: '0 16px 20px', borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', gap: 6, margin: '14px 0' }}>
                {([
                  { key: 'chips', label: '⚡ Quick Add' },
                  { key: 'upload', label: '📸 Upload Setlist' },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => { setUploadMode(tab.key); setUploadError('') }}
                    style={{ flex: 1, padding: '9px 12px', background: uploadMode === tab.key ? C.goldDim : 'transparent', border: `1px solid ${uploadMode === tab.key ? C.borderGold : C.border}`, borderRadius: 10, color: uploadMode === tab.key ? C.gold : C.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Quick Add */}
              {uploadMode === 'chips' && (
                <div>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                    <input value={quickSearch} onChange={e => setQuickSearch(e.target.value)} placeholder="Search your songs..."
                      style={{ width: '100%', background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px 9px 30px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
                  </div>
                  {filteredRecent.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 12 }}>
                      {filteredRecent.slice(0, 20).map((song, i) => (
                        <button key={i} onClick={() => addPlannedSong(song.title, song.artist)}
                          style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, color: C.secondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.goldDim; (e.currentTarget as HTMLElement).style.borderColor = C.borderGold; (e.currentTarget as HTMLElement).style.color = C.gold }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.secondary }}>
                          <Plus size={10} />{song.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredRecent.length === 0 && quickSearch && (
                    <div style={{ marginBottom: 12 }}>
                      <button onClick={() => { addPlannedSong(quickSearch); setQuickSearch('') }}
                        style={{ padding: '8px 14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, color: C.gold, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add "{quickSearch}"
                      </button>
                    </div>
                  )}
                  {recentSongs.length === 0 && !quickSearch && (
                    <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px', fontStyle: 'italic' }}>No recent songs yet — type a song name above or use Upload Setlist</p>
                  )}
                </div>
              )}

              {/* Upload */}
              {uploadMode === 'upload' && (
                <div style={{ marginBottom: 12 }}>
                  <input ref={fileInputRef} type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }} />

                  <div style={{ display: 'flex', gap: 8, marginBottom: uploading ? 8 : 0 }}>
                    <button onClick={() => { setUploadError(''); setShowCamera(true) }} disabled={uploading}
                      style={{ flex: 1, padding: '18px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: uploading ? 0.5 : 1 }}>
                      <span style={{ fontSize: 24 }}>📷</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.secondary }}>Take Photo</span>
                      <span style={{ fontSize: 10, color: C.muted, textAlign: 'center' as const }}>Point at paper setlist</span>
                    </button>
                    <button onClick={() => { setUploadError(''); fileInputRef.current?.click() }} disabled={uploading}
                      style={{ flex: 1, padding: '18px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: uploading ? 0.5 : 1 }}>
                      <span style={{ fontSize: 24 }}>📁</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.secondary }}>Choose File</span>
                      <span style={{ fontSize: 10, color: C.muted, textAlign: 'center' as const }}>JPG, PNG, PDF, or TXT</span>
                    </button>
                  </div>

                  {uploading && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                      <span style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>Reading your setlist...</span>
                    </div>
                  )}

                  {uploadError && (
                    <div style={{ marginTop: 8, padding: '10px 12px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8 }}>
                      <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{uploadError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Loaded songs */}
              {plannedSongs.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: '4px 0 8px' }}>
                    Loaded · {plannedSongs.length} songs
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {plannedSongs.map((song, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                        <span style={{ fontSize: 11, color: C.muted, minWidth: 18, fontFamily: '"DM Mono", monospace', fontWeight: 700 }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                          {song.artist && <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{song.artist}</p>}
                        </div>
                        <button onClick={() => removePlannedSong(i)}
                          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, padding: '10px 12px', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8 }}>
                    <p style={{ fontSize: 12, color: C.green, margin: 0, lineHeight: 1.4 }}>
                      ✓ Songs will auto-confirm during detection · Review shows planned vs played
                    </p>
                  </div>
                </div>
              )}
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
              : <>{plannedSongs.length > 0 ? `Start · ${plannedSongs.length} songs loaded` : 'Start Capture'} <ArrowRight size={15} strokeWidth={2.5} /></>}
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

      {showCamera && (
        <CameraCapture
          onCapture={handleFileUpload}
          onClose={() => setShowCamera(false)}
        />
      )}

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
