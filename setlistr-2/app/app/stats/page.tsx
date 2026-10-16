'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Music2, MapPin, Shield } from 'lucide-react'
import MySongsTab from '@/components/MySongsTab'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'
import { useActingAs } from '@/components/ActingAsProvider'
import { showDate } from '@/lib/record-summary'
import { ESTIMATE_DISCLAIMER, ESTIMATE_UNIT, formatEstimate } from '@/lib/estimate-copy'
import { PageFrame } from '@/components/ui/PageFrame'
import { PageHeader } from '@/components/ui/PageHeader'
import { ViewSwitcher } from '@/components/ui/ViewSwitcher'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/ui/LoadError'

const CARD = {
  background: 'var(--sl-card-bg)',
  boxShadow: 'var(--sl-card-inset)',
}

const C = {
  bg: 'var(--sl-bg)', card: 'var(--sl-surface)', cardHover: 'var(--sl-surface-2)',
  border: 'color-mix(in srgb, var(--sl-text) 7%, transparent)', borderGold: 'color-mix(in srgb, var(--sl-accent) 25%, transparent)',
  text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)',
  gold: 'var(--sl-accent)', goldDim: 'color-mix(in srgb, var(--sl-accent) 10%, transparent)', green: 'var(--sl-ok)',
}

type Song        = { title: string; artist: string; performance_id: string }
type Performance = {
  id: string; venue_name: string; venue_id: string | null; city: string; country: string;
  started_at: string; ended_at: string | null; set_duration_minutes: number;
  submission_status: string | null; show_type?: string; venue_capacity?: number | null
}
type UserSong    = { id: string; song_title: string; canonical_artist: string; confirmed_count: number; last_confirmed_at: string }
type SongDebut   = { title: string; artist: string | null; first_performed_at: string }

// Debut dates arrive as a date or a timestamp; showDate() reads either as
// the show's calendar day (the shipped formatter split only "YYYY-MM-DD"
// and printed "Invalid Date" for timestamps).
function formatDebutDate(d: string): string {
  const date = showDate({ performance_date: d })
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function isCanadian(country?: string | null, city?: string | null) {
  if (['CA', 'Canada', 'ca'].includes(country || '')) return true
  const lowerCity = (city || '').toLowerCase()
  return ['toronto', 'vancouver', 'montreal', 'calgary', 'edmonton', 'ottawa', 'winnipeg'].some(c => lowerCity.includes(c))
}

type CareerData = { performances: Performance[]; allSongs: Song[]; userSongs: UserSong[]; songDebuts: SongDebut[]; debutsFailed: boolean }
const NO_DATA: CareerData = { performances: [], allSongs: [], userSongs: [], songDebuts: [], debutsFailed: false }

export default function StatsPage() {
  const router = useRouter()
  const { actingAsArtistId, resolved } = useActingAs()
  const [tab, setTab]                   = useState<'stats' | 'songs'>('stats')
  const [userId, setUserId]             = useState<string | null>(null)
  const [showTopSongs, setShowTopSongs]   = useState(false)
  const [showTopVenues, setShowTopVenues] = useState(false)
  const [showDebuts, setShowDebuts]       = useState(false)
  const [markerOverlay, setMarkerOverlay] = useState<string>('')
  const [usePlainMap, setUsePlainMap]     = useState(false)

  // Loading standard (docs/ui-standard.md → Loading): results are tagged
  // with the workspace they were loaded for and shown only while it is
  // still the active one — switching artists never shows the previous
  // artist's record, and a late response for an old workspace is dropped.
  const workspaceKey = actingAsArtistId || 'own'
  const [loaded, setLoaded] = useState<{ key: string; status: 'ok'; data: CareerData } | { key: string; status: 'error' } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const current = loaded && loaded.key === workspaceKey ? loaded : null
  const ready = current?.status === 'ok'
  const failed = current?.status === 'error'
  const { performances, allSongs, userSongs, songDebuts, debutsFailed } = current?.status === 'ok' ? current.data : NO_DATA

  useEffect(() => {
    if (!resolved) return
    const supabase = createClient()
    const key = actingAsArtistId || 'own'
    let cancelled = false
    setShowTopSongs(false); setShowTopVenues(false); setShowDebuts(false)
    async function load(): Promise<CareerData | null> {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return null }
      const targetUserId = actingAsArtistId || user.id
      if (!cancelled) setUserId(targetUserId)

      let perfList: Performance[] = []
      let uSongs: UserSong[] = []
      let debuts: SongDebut[] = []
      let debutsFailed = false

      if (actingAsArtistId) {
        const [ctxRes, debutRes] = await Promise.all([
          fetch(`/api/team/context-data?artist_id=${actingAsArtistId}`),
          fetch(`/api/song-debuts?userId=${actingAsArtistId}`),
        ])
        const ctxData = await ctxRes.json().catch(() => ({}))
        if (!ctxRes.ok || ctxData.error) throw new Error(ctxData.error || `context-data ${ctxRes.status}`)
        perfList = (ctxData.performances || []).filter((p: any) =>
          ['completed', 'complete', 'exported', 'review'].includes(p.status)
        ).map((p: any) => ({
          id: p.id, venue_name: p.venue_name, venue_id: p.venue_id || null,
          city: p.city, country: p.country,
          started_at: p.started_at, ended_at: p.ended_at || null,
          set_duration_minutes: p.set_duration_minutes,
          submission_status: p.submission_status || null,
          show_type: p.show_type || 'single',
          venue_capacity: p.venue_capacity || null,
        }))
        const debutData = await debutRes.json().catch(() => ({ error: 'unreadable' }))
        if (!debutRes.ok || debutData.error) debutsFailed = true; else debuts = debutData.debuts || []
      } else {
        const [perfsResult, uSongsResult, debutRes] = await Promise.all([
          supabase.from('performances_visible')
            .select('id, venue_name, venue_id, city, country, started_at, ended_at, set_duration_minutes, submission_status, shows(show_type), venues(capacity)')
            .eq('user_id', user.id)
            .in('status', ['completed', 'complete', 'exported', 'review'])
            .order('started_at', { ascending: false }),
          supabase.from('user_songs')
            .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at')
            .eq('user_id', user.id)
            .order('confirmed_count', { ascending: false }),
          fetch('/api/song-debuts'),
        ])
        if (perfsResult.error) throw perfsResult.error
        if (uSongsResult.error) throw uSongsResult.error
        perfList = (perfsResult.data || []).map((p: any) => ({
          id: p.id, venue_name: p.venue_name, venue_id: p.venue_id || null,
          city: p.city, country: p.country,
          started_at: p.started_at, ended_at: p.ended_at || null,
          set_duration_minutes: p.set_duration_minutes,
          submission_status: p.submission_status || null,
          show_type: (p.shows as any)?.show_type || 'single',
          venue_capacity: (p.venues as any)?.capacity || null,
        }))
        uSongs = uSongsResult.data || []
        const debutData = await debutRes.json().catch(() => ({ error: 'unreadable' }))
        if (!debutRes.ok || debutData.error) debutsFailed = true; else debuts = debutData.debuts || []
      }

      let songs: Song[] = []
      if (perfList.length > 0) {
        const { data, error } = await supabase.from('performance_songs_visible')
          .select('title, artist, position, performance_id').in('performance_id', perfList.map(p => p.id))
        if (error) throw error
        songs = (data || []) as Song[]
      }
      return { performances: perfList, allSongs: songs, userSongs: uSongs, songDebuts: debuts, debutsFailed }
    }
    load()
      .then(data => { if (!cancelled && data) setLoaded({ key, status: 'ok', data }) })
      .catch(err => { console.error('[Career] load failed:', err); if (!cancelled) setLoaded({ key, status: 'error' }) })
    return () => { cancelled = true }
  }, [resolved, actingAsArtistId, reloadToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Page-level retry returns to the skeleton; a section retry refreshes in
  // place (the loaded record stays on screen until the new one replaces it).
  function retryPage() { setLoaded(null); setReloadToken(t => t + 1) }
  function retrySection() { setReloadToken(t => t + 1) }

  // ── Map: the existing Mapbox static image, framed to the pins ─────────────
  // Geocoding (unchanged: top 6 cities, cached per city set) settles before
  // the image is requested, so the map draws once, already framed, instead
  // of drawing a fixed view and then re-framing when the pins arrive.
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const [geoSettled, setGeoSettled] = useState(false)
  const [mapImg, setMapImg] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    setMarkerOverlay(''); setGeoSettled(false)
    if (!mapboxToken || performances.length === 0) { setGeoSettled(true); return }
    let cancelled = false

    const cityCount: Record<string, { city: string; country: string; count: number }> = {}
    performances.forEach(p => {
      if (!p.city) return
      const key = `${p.city}__${p.country || ''}`
      if (!cityCount[key]) cityCount[key] = { city: p.city, country: p.country, count: 0 }
      cityCount[key].count++
    })
    const topCities = Object.values(cityCount).sort((a, b) => b.count - a.count).slice(0, 6)
    if (topCities.length === 0) { setGeoSettled(true); return }

    const cacheKey = `setlistr_mapmarkers_${topCities.map(c => `${c.city}__${c.country}`).sort().join('|')}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const isClean = !cached.includes('NaN') && !cached.includes('null') && !cached.includes('undefined') && cached.startsWith('pin-s+')
        if (isClean) { setMarkerOverlay(cached); setGeoSettled(true); return }
        try { localStorage.removeItem(cacheKey) } catch {}
      }
    } catch {}

    ;(async () => {
      const markers: string[] = []
      for (const { city, country } of topCities) {
        try {
          const query = [city, country].filter(Boolean).join(', ')
          const res  = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place&limit=1&access_token=${mapboxToken}`
          )
          const data = await res.json()
          if (data.features?.[0]) {
            const [lng, lat] = data.features[0].center
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              markers.push(`pin-s+c9a84c(${lng.toFixed(4)},${lat.toFixed(4)})`) // map imagery: Mapbox pin colour (hex only)
            }
          }
        } catch {} // drop this pin, continue
      }
      if (cancelled) return
      if (markers.length > 0) {
        const overlay = markers.join(',')
        setMarkerOverlay(overlay)
        try { localStorage.setItem(cacheKey, overlay) } catch {}
      }
      setGeoSettled(true)
    })()
    return () => { cancelled = true }
  }, [performances]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset fallback flag whenever markerOverlay changes so we retry the marker URL
  useEffect(() => { setUsePlainMap(false) }, [markerOverlay])

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalShows  = performances.length
  const totalSongs  = allSongs.length
  const totalCities = new Set(performances.map(p => p.city).filter(Boolean)).size

  const lastShow = performances.length > 0 ? performances[0] : null
  const daysSinceLastShow = lastShow
    ? Math.floor((Date.now() - new Date(lastShow.started_at).getTime()) / 86400000)
    : null

  const dormantSongs = userSongs.filter(s => {
    if (!s.last_confirmed_at || s.confirmed_count === 0) return false
    const days = Math.floor((Date.now() - new Date(s.last_confirmed_at).getTime()) / 86400000)
    return days > 45
  }).length

  // A: Per-show royalty estimate matching dashboard formula
  const songCountMap: Record<string, number> = {}
  allSongs.forEach(s => {
    if (s.performance_id) songCountMap[s.performance_id] = (songCountMap[s.performance_id] || 0) + 1
  })
  let estimatedLifetimeRoyalty = 0
  performances.forEach(p => {
    const songCount = songCountMap[p.id] || 0
    if (songCount === 0) return
    const est = estimateRoyalties({
      songCount,
      venueCapacityBand: capacityToBand(p.venue_capacity ?? undefined),
      showType: (p.show_type as any) || 'single',
      territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
    })
    estimatedLifetimeRoyalty += est.expected
  })
  estimatedLifetimeRoyalty = Math.round(estimatedLifetimeRoyalty)

  // B.2: Real hours from ended_at - started_at (0 < d < 8h)
  const showsWithRealDuration = performances.filter(p => {
    if (!p.ended_at) return false
    const diff = new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()
    const mins = diff / 60000
    return mins > 0 && mins < 480
  })
  const realTotalMinutes = showsWithRealDuration.reduce((sum, p) => {
    return sum + (new Date(p.ended_at!).getTime() - new Date(p.started_at).getTime()) / 60000
  }, 0)
  const realTotalHours = Math.round(realTotalMinutes / 60 * 10) / 10
  const N = showsWithRealDuration.length
  const showHours = totalShows > 0 && N >= Math.ceil(totalShows * 0.3)

  const firstShow = performances.length > 0 ? performances[performances.length - 1] : null
  const firstShowLabel = firstShow
    ? new Date(firstShow.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  const topCountry = (() => {
    const cc: Record<string, number> = {}
    performances.forEach(p => { if (p.country) cc[p.country] = (cc[p.country] || 0) + 1 })
    return Object.entries(cc).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  })()
  const [mapLon, mapLat, mapZoom] =
    topCountry === 'CA' || topCountry === 'Canada' ? [-96, 57, 3] :
    topCountry === 'GB' || topCountry === 'United Kingdom' ? [-2, 54, 5] :
    topCountry === 'AU' || topCountry === 'Australia' ? [134, -26, 3] :
    [-98, 38, 3]
  const plainMapUrl = mapboxToken
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${mapLon},${mapLat},${mapZoom}/600x340@2x?attribution=false&access_token=${mapboxToken}`
    : ''
  const isValidOverlay = markerOverlay.length > 0
    && !markerOverlay.includes('NaN')
    && !markerOverlay.includes('null')
    && !markerOverlay.includes('undefined')
  // Same Static Images API and dark-v11 style; `auto` fits the view to the
  // pins (padding leaves room for the caption) instead of a fixed centre.
  const markerMapUrl = (isValidOverlay && mapboxToken)
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${markerOverlay}/auto/600x340@2x?padding=56,64,110,64&attribution=false&access_token=${mapboxToken}`
    : ''
  const activeMapUrl = !geoSettled ? '' : (isValidOverlay && !usePlainMap && markerMapUrl) ? markerMapUrl : plainMapUrl
  useEffect(() => { setMapImg(activeMapUrl ? 'loading' : (geoSettled ? 'failed' : 'loading')) }, [activeMapUrl, geoSettled])

  // Song analysis
  const songCounts: Record<string, { title: string; artist: string; count: number; positions: number[] }> = {}
  allSongs.forEach((s: any) => {
    const key = s.title.toLowerCase()
    if (!songCounts[key]) songCounts[key] = { title: s.title, artist: s.artist, count: 0, positions: [] }
    songCounts[key].count++
    if (s.position && s.position > 0) songCounts[key].positions.push(s.position)
  })
  const topSongs = Object.values(songCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(s => ({
      ...s,
      avgPosition: s.positions.length >= 3
        ? Math.round(s.positions.reduce((a, b) => a + b, 0) / s.positions.length)
        : null,
    }))
  // Honest ties: when several songs share the top count, none of them is
  // presented as "the" signature song.
  const tiedTop = topSongs.length > 0 ? Object.values(songCounts).filter(s => s.count === topSongs[0].count) : []

  const venueCounts: Record<string, { name: string; city: string; count: number; id: string | null }> = {}
  performances.forEach(p => {
    const v = p.venue_name?.trim()
    if (!v || !v.includes(' ')) return
    const key = v.toLowerCase()
    if (!venueCounts[key]) venueCounts[key] = { name: v, city: p.city, count: 0, id: p.venue_id || null }
    venueCounts[key].count++
  })
  const topVenues = Object.values(venueCounts).sort((a, b) => b.count - a.count).slice(0, 5)

  const monthCounts: Record<string, number> = {}
  performances.forEach(p => {
    if (!p.started_at) return
    const key = new Date(p.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    monthCounts[key] = (monthCounts[key] ?? 0) + 1
  })
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i))
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  })
  const maxMonthCount = Math.max(...last6Months.map(m => monthCounts[m] ?? 0), 1)
  const totalUniqueSongs = userSongs.length

  const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: 0 }
  const SECTION_HEAD: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6 }
  const SECTION_TITLE: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }
  const HAIR = '1px solid color-mix(in srgb, var(--sl-text) 8%, transparent)'
  const moreBtn: React.CSSProperties = { minHeight: 44, background: 'none', border: 'none', padding: '0 0 0 8px', color: 'var(--sl-gold-text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
  const listRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', columnGap: 12, alignItems: 'center', padding: '11px 0', borderBottom: HAIR }
  const rank: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--sl-gold-text)', textAlign: 'right', fontFamily: '"DM Mono", monospace' }
  const SONGS_SHOWN = 5, VENUES_SHOWN = 3, DEBUTS_SHOWN = 3

  // Skeleton: the same columns and blocks as the finished Overview, so
  // nothing moves when the record arrives.
  const skeleton = (
    <div className="cr-grid" aria-busy="true">
      <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>Loading your career</span>
      <div className="cr-col cr-col-a">
        <div className="cr-map" style={{ aspectRatio: '600 / 340' }}><Skeleton h="100%" r={18} /></div>
        <div className="cr-sig"><Skeleton h={168} r={18} /></div>
        <div className="cr-songs"><Skeleton w="45%" h={18} r={6} />{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={46} mt={12} r={8} />)}</div>
      </div>
      <div className="cr-col cr-col-b">
        <div className="cr-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{[0, 1, 2, 3].map(i => <div key={i}><Skeleton w="55%" h={30} r={6} /><Skeleton w="70%" h={12} mt={8} r={4} /></div>)}</div>
        <div className="cr-est"><Skeleton h={128} r={16} /></div>
        <div className="cr-recent"><Skeleton h={86} r={10} /></div>
        <div className="cr-month"><Skeleton w="45%" h={18} r={6} /><Skeleton h={110} mt={14} r={8} /></div>
        <div className="cr-venues"><Skeleton w="35%" h={18} r={6} />{[0, 1, 2].map(i => <Skeleton key={i} h={46} mt={12} r={8} />)}</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <PageFrame>
        <PageHeader title="Career" />
        <div style={{ marginBottom: 20 }}>
          <ViewSwitcher label="Career views" active={tab} onSelect={k => setTab(k as 'stats' | 'songs')}
            options={[{ key: 'stats', label: 'Overview' }, { key: 'songs', label: 'My Songs', count: ready && totalUniqueSongs > 0 ? totalUniqueSongs : null }]} />
        </div>

        {tab === 'stats' && (
          !ready && !failed ? skeleton
          : failed ? <LoadError message={actingAsArtistId ? 'This artist’s career didn’t load.' : 'Your career didn’t load.'} onRetry={retryPage} />
          : totalShows === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Music2 size={36} style={{ color: C.muted, opacity: 0.2, marginBottom: 16 }} />
              <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>Your stats, venues, and map build automatically as you play.</p>
            </div>
          ) : (
            <div className="cr-grid">
              <div className="cr-col cr-col-a">
                {/* Career Map — the existing Mapbox static image and tap-through.
                   Its space is reserved from the first frame; the scrim is fixed
                   dark in both appearances because the map imagery is dark in both. */}
                <button className="cr-map" onClick={() => router.push('/app/career-map')} aria-label={`${totalCities} cities, ${totalShows} shows. View your map`}
                  style={{ width: '100%', aspectRatio: '600 / 340', position: 'relative', overflow: 'hidden', borderRadius: 18, cursor: 'pointer', border: '1px solid color-mix(in srgb, var(--sl-text) 8%, transparent)', padding: 0, display: 'block', background: '#141210' /* map imagery: fixed */ }}>
                  {mapImg !== 'ready' && mapImg !== 'failed' && <Skeleton h="100%" r={0} onDark style={{ position: 'absolute', inset: 0 }} />}
                  {activeMapUrl && mapImg !== 'failed' && (
                    <img src={activeMapUrl} alt="" aria-hidden="true"
                      onLoad={() => setMapImg('ready')}
                      onError={() => { if (activeMapUrl === markerMapUrl && !usePlainMap) setUsePlainMap(true); else setMapImg('failed') }}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: mapImg === 'ready' ? 1 : 0 }} />
                  )}
                  {mapImg === 'failed' && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 56 }}>
                      <MapPin size={30} style={{ color: '#c9a84c', opacity: 0.5 }} /* map imagery: fixed */ />
                      <span style={{ fontSize: 12.5, color: '#b9ae96' /* map imagery: fixed */ }}>Map preview unavailable</span>
                    </div>
                  )}
                  {/* The bottom 24px stays light so the map's Mapbox logo (drawn in
                     the image) and the attribution (drawn below, inside the card's
                     padding so the rounded corner can't clip it) stay legible. The
                     caption sits above that strip. */}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,9,8,0.15) 0px, rgba(10,9,8,0.15) 22px, rgba(10,9,8,0.86) 34px, rgba(10,9,8,0.5) 42%, rgba(10,9,8,0) 64%)' /* map imagery: fixed */ }} />
                  {activeMapUrl && mapImg === 'ready' && (
                    <span style={{ position: 'absolute', right: 12, bottom: 6, fontSize: 10.5, color: 'rgba(243,238,228,0.78)', textShadow: '0 0 3px rgba(10,9,8,0.9)', pointerEvents: 'none' }} /* map imagery: fixed */>© Mapbox © OpenStreetMap</span>
                  )}
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 18px 34px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, textAlign: 'left', flexWrap: 'wrap' }}>
                    <div>
                      <p style={{ fontSize: 34, fontWeight: 800, color: '#f3eee4', margin: 0, letterSpacing: '-0.02em', lineHeight: 1 }} /* map imagery: fixed */>{totalCities} {totalCities === 1 ? 'City' : 'Cities'}</p>
                      <p style={{ fontSize: 14, color: '#d9cfb7', margin: '5px 0 0' }} /* map imagery: fixed */>{totalShows} {totalShows === 1 ? 'show' : 'shows'}</p>
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#e3c66f', whiteSpace: 'nowrap', background: 'rgba(10,9,8,0.55)', border: '1px solid rgba(227,198,111,0.35)', borderRadius: 999, padding: '7px 12px' }} /* map imagery: fixed */>View your map →</span>
                  </div>
                </button>

                {/* Signature song — most played, counted from setlists; ties are said as ties. */}
                {topSongs.length > 0 && (
                  <div className="cr-sig" style={{ background: 'color-mix(in srgb, var(--sl-accent) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-accent) 25%, transparent)', borderRadius: 18, padding: '20px 20px 18px' }}>
                    <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--sl-gold-text)', margin: '0 0 10px' }}>{tiedTop.length > 1 ? 'Most played live · tied' : 'Most played live'}</p>
                    {tiedTop.length > 1 ? (
                      <>
                        <p style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 14px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                          {tiedTop.slice(0, 3).map(s => s.title).join(', ')}{tiedTop.length > 3 ? ` and ${tiedTop.length - 3} more` : ''}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--sl-gold-text)', letterSpacing: '-0.02em', fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{topSongs[0].count}×</span>
                          <span style={{ fontSize: 13.5, color: C.secondary, lineHeight: 1.4 }}>each, tied for most played.<br />Counted from your setlists.</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{topSongs[0].title}</p>
                        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 14px' }}>{topSongs[0].artist}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--sl-gold-text)', letterSpacing: '-0.02em', fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{topSongs[0].count}×</span>
                          <span style={{ fontSize: 13.5, color: C.secondary, lineHeight: 1.4 }}>times played live. Your signature song.<br />Counted from your setlists.</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Most played songs — top five on the page, the rest in place */}
                {topSongs.length > 0 && (
                  <div className="cr-songs">
                    <div style={SECTION_HEAD}>
                      <h2 style={SECTION_TITLE}>Most played songs</h2>
                      {topSongs.length > SONGS_SHOWN && <button style={moreBtn} aria-expanded={showTopSongs} onClick={() => setShowTopSongs(v => !v)}>{showTopSongs ? 'Show fewer' : `Show all ${topSongs.length}`}</button>}
                    </div>
                    {(showTopSongs ? topSongs : topSongs.slice(0, SONGS_SHOWN)).map((song, i) => (
                      <div key={song.title} style={listRow}>
                        <span style={rank}>{i + 1}</span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 15.5, color: C.text, margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{song.title}</p>
                          <p style={{ fontSize: 13, color: C.muted, margin: '1px 0 0' }}>{[song.artist, song.avgPosition ? `usually #${song.avgPosition}` : null].filter(Boolean).join(' · ')}</p>
                          <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'color-mix(in srgb, var(--sl-text) 6%, transparent)' }}>
                            <div style={{ height: '100%', borderRadius: 2, width: `${(song.count / topSongs[0].count) * 100}%`, background: i === 0 ? C.gold : 'color-mix(in srgb, var(--sl-accent) 45%, transparent)' }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace' }}>{song.count}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="cr-col cr-col-b">
                {/* Career statistics — the same four figures, flat */}
                <div className="cr-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: HAIR }}>
                  {[
                    { label: 'Shows played', value: String(totalShows), note: null as string | null },
                    { label: 'Song performances', value: String(totalSongs), note: null },
                    { label: 'Cities', value: String(totalCities), note: null },
                    showHours
                      ? { label: 'Hours on stage', value: String(realTotalHours), note: `from ${N} timed shows` }
                      : firstShowLabel ? { label: 'First show', value: firstShowLabel, note: null } : { label: 'Hours on stage', value: '—', note: null },
                  ].map((s, i) => (
                    <div key={s.label} style={{ padding: '14px 4px 14px 0', borderBottom: HAIR, borderRight: i % 2 === 0 ? HAIR : 'none', paddingLeft: i % 2 === 1 ? 16 : 0 }}>
                      <p style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                      <p style={{ fontSize: 13.5, color: C.secondary, margin: '4px 0 0' }}>{s.label}</p>
                      {s.note && <p style={{ fontSize: 12, color: C.muted, margin: '1px 0 0' }}>{s.note}</p>}
                    </div>
                  ))}
                </div>

                {/* Lifetime royalty estimate — same calculation and place, standard estimate wording */}
                {estimatedLifetimeRoyalty > 0 && (
                  <div className="cr-est" style={{ background: 'color-mix(in srgb, var(--sl-accent) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-accent) 14%, transparent)', borderRadius: 16, padding: '16px 18px' }}>
                    <p style={LABEL}>Estimated lifetime royalties</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                      <p style={{ fontSize: 38, fontWeight: 800, color: 'var(--sl-gold-text)', margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>{formatEstimate(estimatedLifetimeRoyalty)}</p>
                      <span style={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>{ESTIMATE_UNIT}</span>
                    </div>
                    <p style={{ fontSize: 14, color: C.secondary, margin: '8px 0 0', lineHeight: 1.5 }}>Based on {totalSongs} song appearances across {totalShows} shows</p>
                    <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>{ESTIMATE_DISCLAIMER}</p>
                  </div>
                )}

                {/* Last show + dormant songs */}
                <div className="cr-recent">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: HAIR, borderBottom: HAIR }}>
                    <div style={{ padding: '14px 0', borderRight: HAIR }}>
                      <p style={LABEL}>Last show</p>
                      <p style={{ fontSize: 26, fontWeight: 800, color: daysSinceLastShow !== null && daysSinceLastShow > 14 ? 'var(--sl-gold-text)' : C.text, margin: '6px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                        {daysSinceLastShow === null ? '—' : daysSinceLastShow === 0 ? 'Today' : `${daysSinceLastShow}d`}
                      </p>
                      {daysSinceLastShow !== null && <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0' }}>{daysSinceLastShow === 0 ? 'just performed' : daysSinceLastShow === 1 ? 'yesterday' : 'since last show'}</p>}
                    </div>
                    <div style={{ padding: '14px 0 14px 16px' }}>
                      <p style={LABEL}>Dormant songs</p>
                      <p style={{ fontSize: 26, fontWeight: 800, color: dormantSongs > 0 ? 'var(--sl-gold-text)' : C.text, margin: '6px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{dormantSongs}</p>
                      <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0' }}>{dormantSongs === 0 ? 'all active' : 'not played in 45d+'}</p>
                    </div>
                  </div>
                  {dormantSongs > 0 && (
                    <button onClick={() => setTab('songs')} style={{ width: '100%', minHeight: 44, textAlign: 'left', background: 'none', border: 'none', padding: '8px 0 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: C.secondary, lineHeight: 1.5 }}>
                      {dormantSongs} song{dormantSongs !== 1 ? 's' : ''} in your catalog {dormantSongs !== 1 ? "haven't" : "hasn't"} been played live in 45+ days <span style={{ color: 'var(--sl-gold-text)', fontWeight: 700 }}>→</span>
                    </button>
                  )}
                </div>

                {/* Shows per month — the same six months */}
                <div className="cr-month">
                  <div style={SECTION_HEAD}><h2 style={SECTION_TITLE}>Shows per month</h2></div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, marginBottom: 4 }}>
                    {last6Months.map(month => { const count = monthCounts[month] ?? 0; return <div key={month} style={{ flex: 1, textAlign: 'center' }}><span style={{ fontSize: 13, fontWeight: 600, color: count > 0 ? C.text : C.muted }}>{count || ''}</span></div> })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 76, borderBottom: HAIR }}>
                    {last6Months.map(month => { const count = monthCounts[month] ?? 0; const height = count === 0 ? 3 : Math.max(8, (count / maxMonthCount) * 76); return <div key={month} style={{ flex: 1, borderRadius: '4px 4px 0 0', height: `${height}px`, background: count > 0 ? C.gold : 'color-mix(in srgb, var(--sl-text) 6%, transparent)' }} /> })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    {last6Months.map(month => <span key={month} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{month.split(' ')[0]}</span>)}
                  </div>
                </div>

                {/* Top venues — top three on the page; each row opens the venue page */}
                {topVenues.length > 0 && (
                  <div className="cr-venues">
                    <div style={SECTION_HEAD}>
                      <h2 style={SECTION_TITLE}>Top venues</h2>
                      {topVenues.length > VENUES_SHOWN && <button style={moreBtn} aria-expanded={showTopVenues} onClick={() => setShowTopVenues(v => !v)}>{showTopVenues ? 'Show fewer' : `Show all ${topVenues.length}`}</button>}
                    </div>
                    {(showTopVenues ? topVenues : topVenues.slice(0, VENUES_SHOWN)).map((venue, i) => {
                      const inner = (<>
                        <span style={rank}>{i + 1}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 15.5, color: C.text, fontWeight: 600, overflowWrap: 'anywhere' }}>{venue.name}</span>
                          {venue.city && <span style={{ display: 'block', fontSize: 13, color: C.muted, marginTop: 1 }}>{venue.city}</span>}
                        </span>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: C.secondary, whiteSpace: 'nowrap' }}>{venue.count} {venue.count === 1 ? 'show' : 'shows'}{venue.id ? ' →' : ''}</span>
                      </>)
                      return venue.id
                        ? <button key={venue.name} onClick={() => router.push(`/app/venue/${venue.id}`)} style={{ ...listRow, width: '100%', minHeight: 56, background: 'none', borderLeft: 'none', borderRight: 'none', borderTop: 'none', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>{inner}</button>
                        : <div key={venue.name} style={listRow}>{inner}</div>
                    })}
                  </div>
                )}

                {/* Song debuts — the first three on the page (existing order); a failed
                   lookup says so here without taking the rest of the page down */}
                {debutsFailed ? (
                  <div className="cr-debuts">
                    <div style={SECTION_HEAD}><h2 style={SECTION_TITLE}>Song debuts</h2></div>
                    <LoadError compact message="Song debuts didn’t load." onRetry={retrySection} />
                  </div>
                ) : songDebuts.length > 0 && (
                  <div className="cr-debuts">
                    <div style={SECTION_HEAD}>
                      <h2 style={SECTION_TITLE}>Song debuts</h2>
                      {songDebuts.length > DEBUTS_SHOWN && <button style={moreBtn} aria-expanded={showDebuts} onClick={() => setShowDebuts(v => !v)}>{showDebuts ? 'Show fewer' : `Show all ${songDebuts.length}`}</button>}
                    </div>
                    {(showDebuts ? songDebuts : songDebuts.slice(0, DEBUTS_SHOWN)).map((debut, i) => (
                      <div key={`${debut.title}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: HAIR }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 15.5, color: C.text, margin: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>{debut.title}</p>
                          {debut.artist && <p style={{ fontSize: 13, color: C.muted, margin: '1px 0 0' }}>{debut.artist}</p>}
                        </div>
                        <span style={{ fontSize: 12.5, color: C.secondary, whiteSpace: 'nowrap', fontFamily: '"DM Mono", monospace' }}>{formatDebutDate(debut.first_performed_at)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Performance Proof File */}
                <button className="cr-proof" onClick={() => router.push('/app/proof')}
                  style={{ width: '100%', minHeight: 64, padding: '14px 18px', background: CARD.background, border: '1px solid color-mix(in srgb, var(--sl-text) 6%, transparent)', borderRadius: 16, boxShadow: CARD.boxShadow, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Shield size={18} style={{ color: C.gold, flexShrink: 0 }} />
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: C.text, marginBottom: 2 }}>Performance Proof File</span>
                      <span style={{ display: 'block', fontSize: 13, color: C.muted }}>Your verified career record.</span>
                    </span>
                  </span>
                  <span style={{ fontSize: 18, color: C.muted }}>→</span>
                </button>
              </div>
            </div>
          )
        )}

        {/* ── My Songs tab ── */}
        {/* My Songs keeps its reading width for now (adoption: later batch). */}
        {tab === 'songs' && (userId ? <div style={{ maxWidth: 560 }}><MySongsTab userId={userId} /></div> : <div aria-busy="true">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={52} mt={i ? 12 : 0} r={10} />)}</div>)}
      </PageFrame>

      <style>{`
        input::placeholder { color: var(--sl-text-3); }
        /* Career's own column split inside the shared frame: one stacked
           column on phones (map, statistics, estimate, recent, monthly,
           signature song, songs, venues, debuts, Proof File), and from 900px
           a wide map column beside a statistics column. */
        .cr-grid { display: flex; flex-direction: column; gap: 22px; position: relative; }
        .cr-col { display: contents; }
        .cr-map { order: 1; } .cr-stats { order: 2; } .cr-est { order: 3; } .cr-recent { order: 4; } .cr-month { order: 5; }
        .cr-sig { order: 6; } .cr-songs { order: 7; } .cr-venues { order: 8; } .cr-debuts { order: 9; } .cr-proof { order: 10; }
        @container sl-frame (min-width: 900px) {
          .cr-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 400px); column-gap: 48px; align-items: start; }
          .cr-col { display: flex; flex-direction: column; gap: 26px; }
        }
      `}</style>
    </div>
  )
}
