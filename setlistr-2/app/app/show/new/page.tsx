'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buzzLong } from '@/lib/haptics'
import { useActingAs } from '@/components/ActingAsProvider'
import { Calendar, ArrowRight, ArrowLeft, RefreshCw, Check, MapPin, Search, X, Plus, ChevronDown, ChevronUp, Camera, Upload, ListMusic } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const CARD = {
  background: 'linear-gradient(180deg, #171512 0%, #121009 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}

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
type SetlistOffer = { songs: { title: string; artist: string }[]; venueName: string; date: string }

// Setlist mode:
// null   → show the two-path choice buttons
// 'photo' → camera/file upload area is expanded
// 'quick' → manual chip/search add is expanded
type SetlistMode = null | 'photo' | 'quick'

// Common PRO territories, matched against the free-text `country` value on a
// venue record. Used only to narrow the Mapbox `country` filter — if a venue's
// country doesn't match one of these (or is blank, e.g. a free-typed venue),
// the geocode request simply omits the filter rather than guessing.
const VENUE_COUNTRY_CODES: Record<string, string> = {
  'united states': 'us', 'usa': 'us', 'us': 'us',
  'canada': 'ca',
  'united kingdom': 'gb', 'uk': 'gb',
  'australia': 'au',
}

// ── Small dark venue-location preview, reusing the Career Map's Mapbox GL setup.
// Best-effort only: renders nothing if there's no token, no query, or geocoding fails.
function VenueMap({ venueName, city, country, onCoordsResolved }: { venueName: string; city: string; country: string; onCoordsResolved?: (coords: { lat: number; lng: number }) => void }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const marker = useRef<mapboxgl.Marker | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  // Dedup guard so re-renders with the same resolved feature don't re-fire
  // onCoordsResolved — only emit when the "lat,lng" pair actually changes.
  const lastEmittedRef = useRef<string | null>(null)
  // Generation counter: incremented every time this effect runs (i.e. every
  // time venueName/city/country changes), not just when the debounce timer
  // eventually fires. Incrementing here — immediately, not after the 500ms
  // wait — means any older fetch already in flight is invalidated the
  // instant new input arrives, even if that older fetch happens to resolve
  // quickly (faster than the new request's own debounce). If it only
  // incremented inside the timeout callback, a fast stale response could
  // still land and briefly apply before the newer request finishes.
  const attemptRef = useRef(0)

  useEffect(() => {
    // Search broadly on name alone — appending city to q over-narrows Search
    // Box's results (unlike the classic geocoder), sometimes to near-zero.
    // city is still used, just later: as the post-response validation filter
    // below, not as part of the search text itself.
    const query = venueName.trim()
    const attempt = ++attemptRef.current
    if (!mapboxgl.accessToken || query.length < 2) { setCoords(null); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      // Reset per attempt, not per component lifetime — otherwise re-geocoding
      // a venue whose coordinates were already emitted once (e.g. switching
      // away and back to it) would compare against a stale key and silently
      // skip the emit, even though the parent's venueCoords has since been
      // cleared to null by selectVenue/handleVenueInput.
      lastEmittedRef.current = null
      try {
        const params = new URLSearchParams({
          q: query,
          limit: '5',
          types: 'poi',
          language: 'en',
          access_token: mapboxgl.accessToken as string,
        })
        const countryCode = VENUE_COUNTRY_CODES[country.trim().toLowerCase()]
        if (countryCode) params.set('country', countryCode)
        const requestUrl = `https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`
        if (process.env.NODE_ENV !== 'production') console.debug('[VenueMap] geocode request:', requestUrl.replace(/access_token=[^&]+/, 'access_token=***'))
        const res = await fetch(requestUrl)
        const data = await res.json()
        // A newer attempt has started since this fetch was kicked off (e.g.
        // the user picked a suggestion while this request was in flight) —
        // discard this result rather than let it overwrite the current one.
        if (attempt !== attemptRef.current) return
        const features: any[] = data.features || []
        let chosen: any = null
        if (!city) {
          // Nothing to validate against — accept Mapbox's top result, as before.
          chosen = features[0] || null
        } else {
          // Search Box's context is an object keyed by level ("place",
          // "region", "country", ...) — not an array of {id, text} entries
          // like the classic geocoder — and each present level is itself an
          // object with a `name` field. We take the FIRST candidate, in
          // Mapbox's own returned order, whose place-level context agrees
          // with the venue's known city — first match, not best/closest
          // match, for the same reason as before: once a candidate is
          // confirmed to be in the right city, Mapbox's own relevance
          // ranking is still the best signal available, and the city check
          // exists only to exclude wrong-city results, not to re-rank
          // correct ones. No separate POI-vs-address tie-break is needed
          // here — types=poi already restricts every candidate to POIs, so
          // there's nothing lower-priority left to prefer against.
          chosen = features.find(f => {
            const placeName = f.properties?.context?.place?.name
            return typeof placeName === 'string' && placeName.trim().toLowerCase() === city.trim().toLowerCase()
          }) || null
        }

        if (!chosen) {
          setFailed(true)
        } else {
          const c = chosen.properties?.coordinates
          if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') {
            setFailed(true)
          } else {
            const next = { lat: c.latitude, lng: c.longitude }
            setCoords(next)
            setFailed(false)
            const key = `${next.lat},${next.lng}`
            if (onCoordsResolved && lastEmittedRef.current !== key) {
              lastEmittedRef.current = key
              onCoordsResolved(next)
            }
          }
        }
      } catch {
        if (attempt !== attemptRef.current) return
        setFailed(true)
      }
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [venueName, city, country])

  useEffect(() => {
    if (!coords || !mapContainer.current) return
    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [coords.lng, coords.lat],
        zoom: 13,
        attributionControl: false,
        scrollZoom: false,
      })
      map.current.on('load', () => { map.current?.setPaintProperty('background', 'background-color', '#0a0908') })
    } else {
      map.current.flyTo({ center: [coords.lng, coords.lat], zoom: 13 })
    }
    const el = document.createElement('div')
    el.style.cssText = `width:16px;height:16px;border-radius:50%;background:#c9a84c;border:2px solid rgba(201,168,76,0.4);box-shadow:0 0 20px rgba(201,168,76,0.5);`
    marker.current?.remove()
    marker.current = new mapboxgl.Marker(el).setLngLat([coords.lng, coords.lat]).addTo(map.current)
  }, [coords])

  useEffect(() => () => { map.current?.remove(); map.current = null }, [])

  if (!mapboxgl.accessToken || (!coords && !failed)) return null

  if (failed) {
    return (
      <div style={{ marginTop: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, padding: '14px 16px' }}>
        <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 2px' }}>We couldn't confirm this location</p>
        <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Your show will still be captured.</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, height: 140, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export default function NewShowPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { actingAs: providerActingAs, actingAsArtistId } = useActingAs()

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
  const [venueCoords, setVenueCoords]       = useState<{ lat: number; lng: number } | null>(null)
  const [isPrefilled, setIsPrefilled]       = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const [showReuse, setShowReuse]       = useState(searchParams.get('reuse') === 'true')
  const [pastPerfs, setPastPerfs]       = useState<PastPerformance[]>([])
  const [pastLoading, setPastLoading]   = useState(false)
  const [selectedPast, setSelectedPast] = useState<PastPerformance | null>(null)
  const [cloning, setCloning]           = useState(false)

  const [setlistMode, setSetlistMode]   = useState<SetlistMode>(null)
  const [plannedSongs, setPlannedSongs] = useState<PlannedSong[]>([])
  const [recentSongs, setRecentSongs]   = useState<{ title: string; artist: string }[]>([])
  const [quickSearch, setQuickSearch]   = useState('')
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState('')

  const [showMoreOptions, setShowMoreOptions] = useState(false)

  const [setlistOffer, setSetlistOffer]                 = useState<SetlistOffer | null>(null)
  const [setlistOfferDismissed, setSetlistOfferDismissed] = useState(false)
  const [setlistPhotoUrl, setSetlistPhotoUrl]           = useState<string | null>(null)

  // ── New: step flow + skip confirmation (presentation only — no capture/setlist logic here) ──
  const [step, setStep] = useState<1 | 2>(1)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)

  // Camera: capture="environment" opens native camera on iOS + Android
  const cameraInputRef = useRef<HTMLInputElement>(null)
  // Gallery/file: no capture attribute — opens file picker
  const fileInputRef   = useRef<HTMLInputElement>(null)

  const effectiveName = venueQuery.trim() || 'Show'
  // Any venue that isn't an existing selected row (venueId set via
  // selectVenue) requires a city before it can be used — covers freehand
  // entry generally, not just the explicit "+ Add ... as new venue" button,
  // since a genuinely new venue with no near-matches never shows that
  // button at all and was previously able to submit with no city.
  const isValid = venueQuery.trim().length > 0 && (venueId !== null || venueCity.trim().length > 0)

  // ── Auto-open upload mode when arriving via ?mode=upload ──
  useEffect(() => {
    if (searchParams.get('mode') === 'upload') {
      setSetlistMode('photo')
    }
  }, [])

  // ── Pre-fill artist name from profile ──
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

  // ── Pre-fill last used venue on mount (45-day recency window) ──
  useEffect(() => {
    const supabase = createClient()
    async function loadLastVenue() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: lastPerf } = await supabase
        .from('performances')
        .select('id, venue_id, venue_name, city, country, started_at')
        .eq('user_id', user.id)
        .in('status', ['review', 'complete', 'completed', 'exported'])
        .not('venue_name', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()
      if (!lastPerf?.venue_name || lastPerf.venue_name.trim() === '.') return
      // Always load last setlist as a dismissible offer (no time gate)
      const { data: lastSongs } = await supabase
        .from('performance_songs_visible')
        .select('title, artist')
        .eq('performance_id', lastPerf.id)
        .order('position', { ascending: true })
      if (lastSongs && lastSongs.length > 0) {
        setSetlistOffer({
          songs: lastSongs.map(s => ({ title: s.title, artist: s.artist || '' })),
          venueName: lastPerf.venue_name,
          date: lastPerf.started_at,
        })
      }
      const daysSince = (Date.now() - new Date(lastPerf.started_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince > 45) return
      setVenueQuery(lastPerf.venue_name)
      setVenueId(lastPerf.venue_id || null)
      setVenueCity(lastPerf.city || '')
      setVenueCountry(lastPerf.country || '')
      setVenueSelected(true)
      setIsPrefilled(true)
      if (lastPerf.venue_id) {
        const memory = await fetchVenueMemory(lastPerf.venue_id)
        if (memory?.songs?.length) {
          setPlannedSongs(memory.songs.map((s, i) => ({ ...s, position: i })))
        }
      }
    }
    loadLastVenue()
  }, [])

  // ── Load recent songs when quick-add mode opens ──
  useEffect(() => {
    if (setlistMode !== 'quick') return
    fetch('/api/recent-songs?limit=20')
      .then(r => r.json())
      .then(data => setRecentSongs(data?.songs || []))
      .catch(() => {})
  }, [setlistMode])

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

  async function fetchVenueMemory(selectedVenueId: string): Promise<VenueMemory | null> {
    setVenueMemory(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data: perfs } = await supabase.from('performances').select('id, started_at')
        .eq('venue_id', selectedVenueId).eq('user_id', user.id)
        .in('status', ['review', 'complete', 'completed', 'exported'])
        .order('started_at', { ascending: false }).limit(10)
      if (!perfs || perfs.length === 0) return null
      const { data: songs } = await supabase.from('performance_songs_visible')
        .select('performance_id, title, artist')
        .in('performance_id', perfs.map(p => p.id))
      const countMap: Record<string, number> = {}
      const songMap: Record<string, { title: string; artist: string }[]> = {}
      songs?.forEach(s => {
        countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1
        if (!songMap[s.performance_id]) songMap[s.performance_id] = []
        songMap[s.performance_id].push({ title: s.title, artist: s.artist || '' })
      })
      const memory: VenueMemory = {
        lastDate: perfs[0].started_at,
        songCount: countMap[perfs[0].id] || 0,
        showCount: perfs.length,
        songs: songMap[perfs[0].id] || [],
      }
      setVenueMemory(memory)
      return memory
    } catch { return null }
  }

  function clearPrefill() {
    setVenueQuery('')
    setVenueId(null)
    setVenueSelected(false)
    setVenueMemory(null)
    setVenueCapacity('')
    setVenueCity('')
    setVenueCountry('')
    setVenueCoords(null)
    setIsPrefilled(false)
    setPlannedSongs([])
    setVenueResults([])
    setShowDropdown(false)
  }

  function handleVenueInput(val: string) {
    setVenueQuery(val); setVenueId(null); setVenueSelected(false); setVenueMemory(null); setVenueCapacity('')
    setVenueCity(''); setVenueCountry('')
    setVenueCoords(null)
    if (isPrefilled) { setIsPrefilled(false); setPlannedSongs([]) }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchVenues(val), 280)
  }

  function selectVenue(v: Venue) {
    setVenueQuery(v.name); setVenueId(v.id)
    setVenueCity(v.city || ''); setVenueCountry(v.country || '')
    setVenueSelected(true); setShowDropdown(false); setVenueResults([])
    setVenueCoords(null)
    setIsPrefilled(false)
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
  }

  function songWord(n: number) { return n === 1 ? 'song' : 'songs' }

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
      if (file.type.startsWith('image/') || isHEIC) uploadFile = await compressImage(file)
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
      // First page's evidence photo wins; subsequent pages do not overwrite
      if (data.setlistPhotoUrl) setSetlistPhotoUrl(prev => prev ?? data.setlistPhotoUrl)
    } catch (err: any) {
      setUploadError(err.message || "Couldn't read that one. Try a clearer photo.")
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFileUpload(f)
    e.target.value = ''
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
      const { data: songs } = await supabase.from('performance_songs_visible').select('performance_id')
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
        inclusion_reason: 'planned setlist - not detected', confusion_matrix_result: 'TBD',
      }))
    )
  }

  async function handleSubmit() {
    if (!isValid || loading) return
    buzzLong()
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated: ' + userError?.message)
      // Resolved once, at the top, so both the shows and performances
      // inserts below use the same target — the shows insert used to
      // happen before this value was even read.
      const actingAsCtx = providerActingAs
      const targetUserId = actingAsArtistId || user.id
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
        started_at: new Date().toISOString(), status: 'live', created_by: targetUserId,
      }).select().single()
      if (showError) throw new Error('Show insert failed: ' + showError.message)
      const { data: selfProfile } = await supabase.from('profiles').select('artist_name, full_name').eq('id', user.id).single()
      const selfName = selfProfile?.artist_name || selfProfile?.full_name || null
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || venueQuery.trim(),
        venue_name: venueQuery.trim(), venue_id: resolvedVenueId || null,
        city: venueCity.trim() || null, country: venueCountry.trim() || null,
        status: 'live', set_duration_minutes: null, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), user_id: targetUserId,
        captured_by: actingAsCtx ? user.id : null,
        captured_by_name: actingAsCtx ? selfName : null,
        setlist_photo_url: setlistPhotoUrl || null,
        latitude: venueCoords?.lat ?? null,
        longitude: venueCoords?.lng ?? null,
      }).select().single()
      if (perfError) throw new Error('Performance insert failed: ' + perfError.message)
      if (plannedSongs.length > 0) await savePlannedSetlist(performance.id, targetUserId, resolvedVenueId)
      router.push(`/app/live/${performance.id}?autostart=1`)
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
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Not authenticated')
      const actingAsCtx2 = providerActingAs
      const targetUserId2 = actingAsArtistId || user.id
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
        started_at: new Date().toISOString(), status: 'completed', created_by: targetUserId2
      }).select().single()
      if (showError) throw new Error('Show insert failed: ' + showError.message)
      const { data: selfProfile2 } = await supabase.from('profiles').select('artist_name, full_name').eq('id', user.id).single()
      const selfName2 = selfProfile2?.artist_name || selfProfile2?.full_name || null
      const { data: performance, error: perfError } = await supabase.from('performances').insert({
        show_id: show.id, performance_date: scheduledIso || new Date().toISOString(),
        artist_name: artistName.trim() || venueQuery.trim(),
        venue_name: venueQuery.trim(), venue_id: resolvedVenueId || null,
        city: venueCity.trim() || null, country: venueCountry.trim() || null,
        status: 'review', set_duration_minutes: null, auto_close_buffer_minutes: 5,
        started_at: new Date().toISOString(), ended_at: new Date().toISOString(),
        user_id: targetUserId2,
        captured_by: actingAsCtx2 ? user.id : null,
        captured_by_name: actingAsCtx2 ? selfName2 : null,
        latitude: venueCoords?.lat ?? null,
        longitude: venueCoords?.lng ?? null,
      }).select().single()
      if (perfError) throw new Error('Performance insert failed: ' + perfError.message)
      const { data: sourceSongs } = await supabase.from('performance_songs_visible')
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

  // ── Step navigation (presentation only) ──
  function goNext() {
    if (!isValid) return
    setStep(2)
  }

  function goBack() {
    setStep(1)
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" style={{ display: 'none' }} onChange={handleFileChange} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

        {/* ── PROGRESS DOTS ── */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              width: i === step ? 20 : 6, height: 6, borderRadius: 3,
              background: i <= step ? C.gold : 'rgba(255,255,255,0.15)',
              transition: 'all 0.25s ease',
            }} />
          ))}
        </div>

        {/* ══════════════════════════════════════════
            STEP 1 — VENUE
        ══════════════════════════════════════════ */}
        {step === 1 && (
          <div key="step1" style={{ animation: 'fadeUp 0.3s ease' }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em' }}>Where tonight?</h1>

            {/* ── VENUE CARD ── */}
            <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16, boxShadow: CARD.boxShadow }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }} ref={dropdownRef}>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MapPin size={10} />Venue
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={venueQuery}
                    onChange={e => handleVenueInput(e.target.value)}
                    onFocus={() => { if (venueResults.length > 0) setShowDropdown(true) }}
                    placeholder="Venue or room name..."
                    spellCheck={false} autoCorrect="off" autoCapitalize="words"
                    style={{ background: C.input, border: `1px solid ${venueSelected ? C.borderGold : venueQuery.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '14px 40px 14px 16px', color: C.text, fontSize: 16, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, outline: 'none' }}
                  />
                  <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                    {venueSearching
                      ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite', pointerEvents: 'none' as const }} />
                      : isPrefilled
                      ? <button
                          onClick={clearPrefill}
                          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: C.secondary, cursor: 'pointer', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'inherit', fontSize: 15, lineHeight: '1' }}
                        >×</button>
                      : venueSelected
                      ? <span style={{ fontSize: 13, color: C.gold, pointerEvents: 'none' as const }}>✓</span>
                      : <span style={{ pointerEvents: 'none' as const, display: 'flex' }}><Search size={13} color={C.muted} /></span>
                    }
                  </div>
                </div>

                {venueMemory && !isPrefilled && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 8 }}>
                    <p style={{ fontSize: 14, color: C.gold, margin: 0, lineHeight: 1.4 }}>
                      Last time here: <strong>{venueMemory.songCount} {songWord(venueMemory.songCount)}</strong> on {formatDate(venueMemory.lastDate)}
                    </p>
                    {venueMemory.songs && venueMemory.songs.length > 0 && plannedSongs.length === 0 && (
                      <button onClick={loadFromVenueMemory}
                        style={{ fontSize: 13, fontWeight: 700, color: C.gold, background: 'rgba(201,168,76,0.15)', border: `1px solid ${C.borderGold}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const }}>
                        Load that set →
                      </button>
                    )}
                  </div>
                )}

                {showDropdown && venueResults.length > 0 && (
                  <div onMouseDown={e => e.preventDefault()}
                    style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1816', border: `1px solid ${C.borderGold}`, borderRadius: 10, marginTop: 4, zIndex: 50, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    {venueResults.map((v, i) => (
                      <button key={v.id} onMouseDown={() => selectVenue(v)}
                        style={{ width: '100%', padding: '11px 14px', background: 'transparent', border: 'none', borderBottom: i < venueResults.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', textAlign: 'left' as const, display: 'flex', flexDirection: 'column', gap: 2, fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHover}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v.name}</span>
                        {(v.city || v.country) && <span style={{ fontSize: 11, color: C.muted }}>{[v.city, v.country].filter(Boolean).join(', ')}</span>}
                      </button>
                    ))}
                    <button onMouseDown={() => { setVenueSelected(false); setShowDropdown(false) }}
                      style={{ width: '100%', padding: '10px 14px', background: C.goldDim, border: 'none', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit' }}>
                      <span style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>+ Add "{venueQuery}" as new venue</span>
                    </button>
                  </div>
                )}

                {showDropdown && venueResults.length === 0 && venueQuery.trim().length >= 2 && !venueSearching && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1816', border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 4, zIndex: 50, padding: '12px 14px' }}>
                    <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>New venue — we'll remember it.</p>
                  </div>
                )}

                {/* No existing venue row selected (venueId null) — covers both the
                    explicit "+ Add as new venue" path and a genuinely new venue
                    name with no near-matches, which never shows that button at
                    all. Gated on !showDropdown like the Room size block below it,
                    so it appears once the dropdown/search has settled rather than
                    overlapping it. */}
                {venueId === null && venueQuery.trim().length >= 2 && !venueSelected && !venueSearching && !showDropdown && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                      <MapPin size={10} />City
                    </label>
                    <input
                      type="text"
                      value={venueCity}
                      onChange={e => setVenueCity(e.target.value)}
                      placeholder="City..."
                      spellCheck={false} autoCorrect="off" autoCapitalize="words"
                      style={{ background: C.input, border: `1px solid ${venueCity.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '14px 16px', color: C.text, fontSize: 16, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, outline: 'none' }}
                    />
                  </div>
                )}

                {venueQuery.trim().length >= 2 && !venueSelected && !venueSearching && !showDropdown && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 6px' }}>Room size</p>
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

                {/* Reuses the Career Map's Mapbox GL setup, styled dark — best-effort preview only */}
                {(venueQuery.trim().length >= 2) && <VenueMap venueName={venueQuery} city={venueCity} country={venueCountry} onCoordsResolved={setVenueCoords} />}
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
              </div>
            )}

            <button onClick={goNext} disabled={!isValid}
              style={{ width: '100%', padding: '18px', background: isValid ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: isValid ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              Next <ArrowRight size={15} strokeWidth={2.5} />
            </button>

            {/* ── MORE OPTIONS ── */}
            <button
              onClick={() => setShowMoreOptions(v => !v)}
              style={{ background: 'none', border: 'none', color: showMoreOptions ? C.gold : C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '12px', width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {showMoreOptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showMoreOptions ? 'fewer options' : '+ more options'}
            </button>

            {showMoreOptions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 12px' }}>
                <button
                  type="button"
                  onClick={() => setShowType(showType === 'single' ? 'writers_round' : 'single')}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: showType === 'writers_round' ? C.goldDim : 'transparent', border: `1px solid ${showType === 'writers_round' ? C.borderGold : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                  <span style={{ fontSize: 14, color: showType === 'writers_round' ? C.gold : C.muted }}>{showType === 'writers_round' ? '✓' : '○'}</span>
                  <div style={{ textAlign: 'left' as const }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: showType === 'writers_round' ? C.gold : C.secondary, margin: 0 }}>Writer's Round</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>Multiple writers on the bill</p>
                  </div>
                </button>

                <button
                  onClick={() => setShowSchedule(v => !v)}
                  style={{ background: 'none', border: 'none', color: showSchedule ? C.gold : C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '2px 0', textAlign: 'center' as const, width: '100%' }}>
                  {showSchedule ? '× Cancel scheduling' : '+ Schedule ahead'}
                </button>

                {showSchedule && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Calendar size={10} />Scheduled Time
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      style={{ background: C.input, border: `1px solid ${scheduledAt ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', width: '100%', colorScheme: 'dark' as const, outline: 'none' }}
                    />
                  </div>
                )}

                <button
                  onClick={() => router.push('/app/show/upload')}
                  style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '2px 0', textAlign: 'center' as const, width: '100%' }}>
                  or upload a recording instead →
                </button>
              </div>
            )}

            <button
              onClick={() => router.push('/app/dashboard')}
              style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '4px', width: '100%', textAlign: 'center' as const, marginTop: 4 }}>
              ← Back to Dashboard
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════
            STEP 2 — LOAD YOUR SET
        ══════════════════════════════════════════ */}
        {step === 2 && (
          <div key="step2" style={{ animation: 'fadeUp 0.3s ease' }}>
            <button onClick={goBack}
              style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <ArrowLeft size={12} />{venueQuery.trim()}
            </button>

            <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.025em' }}>Load your set</h1>
            <p style={{ fontSize: 14, color: C.muted, margin: '0 0 20px' }}>
              {plannedSongs.length > 0
                ? `✓ ${plannedSongs.length} ${songWord(plannedSongs.length)} ready — we'll listen for these first.`
                : 'A photo helps us catch every song.'}
            </p>

            {/* ── LAST SETLIST OFFER ── */}
            {setlistOffer && !setlistOfferDismissed && !isPrefilled && plannedSongs.length === 0 && (
              <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 12, boxShadow: CARD.boxShadow, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: C.muted, margin: '0 0 2px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Use your last setlist?</p>
                  <p style={{ fontSize: 13, color: C.secondary, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {setlistOffer.songs.length} {songWord(setlistOffer.songs.length)} · {setlistOffer.venueName} · {formatDate(setlistOffer.date)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPlannedSongs(setlistOffer.songs.map((s, i) => ({ ...s, position: i })))
                    setSetlistOfferDismissed(true)
                  }}
                  style={{ fontSize: 12, fontWeight: 700, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                  Load →
                </button>
                <button
                  onClick={() => setSetlistOfferDismissed(true)}
                  style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <X size={13} />
                </button>
              </div>
            )}

            {/* ── SETLIST CARD ── */}
            <div style={{ background: CARD.background, border: `1px solid ${plannedSongs.length > 0 ? C.borderGold : C.border}`, borderRadius: 16, marginBottom: 16, overflow: 'hidden', transition: 'border-color 0.2s ease', boxShadow: CARD.boxShadow }}>

              {/* 1. Photo setlist — hero action */}
              <div style={{ padding: '16px 16px 0' }}>
                <button
                  onClick={() => {
                    setUploadError('')
                    setSetlistMode('photo')
                    setTimeout(() => cameraInputRef.current?.click(), 50)
                  }}
                  disabled={uploading}
                  style={{ width: '100%', padding: '22px 16px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 14, cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: uploading ? 0.6 : 1, WebkitTapHighlightColor: 'transparent' }}>
                  <Camera size={26} color={C.gold} strokeWidth={1.75} />
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.gold }}>Photo setlist</span>
                  <span style={{ fontSize: 12, color: C.muted, textAlign: 'center' as const }}>
                    {plannedSongs.length > 0 ? `Add another page · ${plannedSongs.length} loaded` : 'Scan paper or screen'}
                  </span>
                </button>

                {/* 2. Helper line */}
                <p style={{ fontSize: 11.5, color: C.muted, textAlign: 'center' as const, margin: '10px 0 0', lineHeight: 1.5 }}>
                  New songs land pre-ordered for one-tap review after the show
                </p>
              </div>

              <div style={{ padding: '14px 16px 0', display: 'flex', gap: 8 }}>
                {/* 3. Upload a setlist */}
                <button
                  onClick={() => { setUploadError(''); fileInputRef.current?.click() }}
                  disabled={uploading}
                  style={{ flex: 1, padding: '14px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: uploading ? 0.5 : 1, WebkitTapHighlightColor: 'transparent' }}>
                  <Upload size={16} color={C.secondary} strokeWidth={1.75} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.secondary }}>Upload a setlist</span>
                  <span style={{ fontSize: 10, color: C.muted }}>PDF or from library</span>
                </button>

                {/* 4. Pick from your catalog */}
                <button
                  onClick={() => setSetlistMode(setlistMode === 'quick' ? null : 'quick')}
                  style={{ flex: 1, padding: '14px 10px', background: setlistMode === 'quick' ? C.goldDim : 'rgba(255,255,255,0.02)', border: `1px solid ${setlistMode === 'quick' ? C.borderGold : C.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, WebkitTapHighlightColor: 'transparent' }}>
                  <ListMusic size={16} color={setlistMode === 'quick' ? C.gold : C.secondary} strokeWidth={1.75} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: setlistMode === 'quick' ? C.gold : C.secondary }}>Pick from catalog</span>
                  <span style={{ fontSize: 10, color: C.muted }}>Your songs</span>
                </button>
              </div>

              {uploading && (
                <div style={{ margin: '12px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                  <span style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>Reading your setlist...</span>
                </div>
              )}

              {uploadError && (
                <div style={{ margin: '10px 16px 0', padding: '10px 12px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8 }}>
                  <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{uploadError}</p>
                </div>
              )}

              {setlistMode === 'quick' && (
                <div style={{ padding: '14px 16px 16px', marginTop: 4, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ paddingTop: 14 }}>
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                      <input
                        value={quickSearch}
                        onChange={e => setQuickSearch(e.target.value)}
                        placeholder="Search your songs..."
                        autoFocus spellCheck={false} autoCorrect="off" autoCapitalize="words"
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
                      <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px', fontStyle: 'italic' }}>
                        Type a song name to add it
                      </p>
                    )}
                  </div>
                </div>
              )}

              {plannedSongs.length > 0 && (
                <div style={{ padding: '14px 16px 16px', borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: C.muted, margin: '0 0 8px' }}>
                    Tonight's set · {plannedSongs.length} {songWord(plannedSongs.length)}
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
                    <p style={{ fontSize: 14, color: C.green, margin: 0, lineHeight: 1.4 }}>
                      ✓ We'll listen for these. Review what was played vs planned after the show.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
              </div>
            )}

            {/* ── START / SKIP — hidden while the past-setlist reuse picker is open ── */}
            {!showReuse && (
              <>
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 8px' }}>By starting, you confirm you have the right to record this performance. Ambient audio may briefly include others nearby.</p>

                {plannedSongs.length > 0 ? (
                  <button onClick={handleSubmit} disabled={!isValid || loading}
                    style={{ width: '100%', padding: '18px', background: isValid ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: isValid && !loading ? 'pointer' : 'not-allowed', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                    {loading
                      ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Starting...</>
                      : <>Start <ArrowRight size={15} strokeWidth={2.5} /></>}
                  </button>
                ) : (
                  <button onClick={() => setShowSkipConfirm(true)} disabled={!isValid || loading}
                    style={{ width: '100%', padding: '15px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 14, color: C.secondary, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: isValid ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                    Skip for now
                  </button>
                )}
              </>
            )}

            {/* ── REUSE SETLIST ── */}
            <button onClick={() => { setShowReuse(v => !v); setSelectedPast(null) }}
              style={{ width: '100%', padding: '11px 16px', background: showReuse ? C.goldDim : 'transparent', border: `1px solid ${showReuse ? C.borderGold : C.border}`, borderRadius: 10, color: showReuse ? C.gold : C.muted, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: showReuse ? 0 : 10 }}>
              <RefreshCw size={12} />{showReuse ? 'Cancel' : 'Use a past setlist'}
            </button>

            {showReuse && (
              <div style={{ marginTop: 10 }}>
                {pastLoading ? (
                  <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: CARD.boxShadow, padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.border}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                  </div>
                ) : pastPerfs.length === 0 ? (
                  <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: CARD.boxShadow, padding: '20px', textAlign: 'center' as const }}>
                    <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No past shows with songs yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 4px' }}>Pick a night to repeat</p>
                    {pastPerfs.map(perf => {
                      const isSelected = selectedPast?.id === perf.id
                      return (
                        <button key={perf.id} onClick={() => setSelectedPast(isSelected ? null : perf)}
                          style={{ background: isSelected ? C.goldDim : C.card, border: `1px solid ${isSelected ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12 }}
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
                            {perf.song_count} {songWord(perf.song_count)}
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
                        : <><RefreshCw size={14} />Use this set →</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SKIP CONFIRMATION SHEET ── */}
      {showSkipConfirm && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}
          onClick={() => setShowSkipConfirm(false)}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 440, background: CARD.background, borderRadius: '20px 20px 0 0', border: `1px solid ${C.border}`, borderBottom: 'none', padding: '24px 20px 36px', display: 'flex', flexDirection: 'column', gap: 16, animation: 'sheetUp 0.22s ease', boxShadow: CARD.boxShadow }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 10px' }}>Start without a setlist?</p>
              <p style={{ fontSize: 13.5, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                Totally fine — we'll capture the show either way. A setlist just means any unreleased songs get pre-ordered in your post-show review for quick one-tap confirmation. You can add one anytime.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSkipConfirm(false)}
                style={{ flex: 1, padding: '14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.secondary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Add setlist
              </button>
              <button
                onClick={() => { setShowSkipConfirm(false); handleSubmit() }}
                disabled={!isValid || loading}
                style={{ flex: 1, padding: '14px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: isValid && !loading ? 'pointer' : 'not-allowed', opacity: loading ? 0.7 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {loading
                  ? <><div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Starting...</>
                  : 'Skip anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        .mapboxgl-ctrl-bottom-left, .mapboxgl-ctrl-bottom-right, .mapboxgl-ctrl-top-right { display: none !important; }
        .mapboxgl-canvas { border-radius: 12px !important; }
      `}</style>
    </div>
  )
}
