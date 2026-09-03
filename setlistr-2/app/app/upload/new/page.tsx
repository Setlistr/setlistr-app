'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { normalizeSongKey } from '@/lib/reconciliation/normalize'
import { Camera, Upload, Check } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

// ─── Standalone Upload Performance ─────────────────────────────────────────
// Deliberately does not import or mount anything from app/app/live/[id] —
// no MediaRecorder, no getUserMedia, no startListening/stopListening, no
// live-capture intervals or health logic. This page's only recognition
// dependency is /api/upload-identify.
//
// The venue map preview below is a deliberately trimmed duplicate of
// app/app/show/new/page.tsx's inline VenueMap component (same Mapbox GL +
// dark-style + gold-pin pattern) rather than an import — VenueMap isn't an
// exported/shared component, and extracting it would mean editing that
// page's already-complex, working venue form. No new mapping architecture
// here, just the same approach, duplicated. It geocodes the typed venue
// NAME for a visual preview only — it does not read device location, and
// resolved coordinates are never persisted (matching show/new's own
// distinction between its live geocode preview and the separately-sourced,
// persisted venue coordinates).
//
// Setlist photo/file assist reuses the existing /api/parse-setlist route
// exactly as show/new already calls it — same FormData shape, same image
// compression. Parsed song names are kept in local state (parsedSetlistSongs)
// for a deliberately deferred future accuracy pass — never sent to
// /api/upload-identify's previous_songs, never merged into performance_songs
// or a planned-setlist match, never used as recognition input in this pass.
//
// Recent-venue suggestions read performances_visible — the same
// delegate-safe view every other page (show/new, live/[id], review/[id])
// already reads for exactly this purpose. No new API, no RLS change.

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

const UPLOAD_CHUNK_SECONDS      = 14
const UPLOAD_CHUNK_STEP_SECONDS = 20

const MAX_SETLIST_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_SETLIST_MIME_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif',
  'application/pdf', 'text/plain',
]

// Sensible live-performance defaults — 24h values match the existing
// start_time column's expected format exactly.
const START_TIME_OPTIONS = [
  { label: '7:00 PM', value: '19:00' },
  { label: '7:30 PM', value: '19:30' },
  { label: '8:00 PM', value: '20:00' },
  { label: '8:30 PM', value: '20:30' },
]

// Five labels for the artist's mental model, mapped onto only the two
// shows.show_type values already proven safe elsewhere in this app
// (show/new/page.tsx only ever writes 'single' or 'writers_round' — no
// CHECK constraint could be verified from this environment, so anything
// beyond those two known-good values would be a guess against an unverified
// DB constraint). Selection state is tracked by label, not by value, since
// four labels intentionally share the same underlying value.
const SHOW_TYPE_OPTIONS: { label: string; value: 'single' | 'writers_round' }[] = [
  { label: 'Headline', value: 'single' },
  { label: 'Support', value: 'single' },
  { label: 'Festival', value: 'single' },
  { label: "Writer's Round", value: 'writers_round' },
  { label: 'Other', value: 'single' },
]

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function isSameSong(a: { title: string }, b: { title: string }): boolean {
  return normalizeSongKey(a.title) === normalizeSongKey(b.title)
}

function sliceToMonoWav(audioBuffer: AudioBuffer, startSec: number, durSec: number): Blob {
  const sampleRate  = audioBuffer.sampleRate
  const startSample = Math.floor(startSec * sampleRate)
  const endSample   = Math.min(audioBuffer.length, Math.floor((startSec + durSec) * sampleRate))
  const len         = Math.max(0, endSample - startSample)
  const channels    = audioBuffer.numberOfChannels
  const mono = new Float32Array(len)
  for (let c = 0; c < channels; c++) {
    const chData = audioBuffer.getChannelData(c)
    for (let i = 0; i < len; i++) mono[i] += chData[startSample + i] / channels
  }
  const buffer = new ArrayBuffer(44 + len * 2)
  const view   = new DataView(buffer)
  const writeStr = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  writeStr(36, 'data'); view.setUint32(40, len * 2, true)
  let offset = 44
  for (let i = 0; i < len; i++) {
    const sample = Math.max(-1, Math.min(1, mono[i]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    offset += 2
  }
  return new Blob([view], { type: 'audio/wav' })
}

// ── Preview/dev-only aggregate scan timing ──────────────────────────────────
// Summarizes the _debug_timings the server attaches to each /api/upload-
// identify response (app/api/upload-identify/route.ts's respondWithTiming).
// Pure/stateless — takes raw per-chunk samples, returns one aggregate object.
// Never throws on a missing stage: every stage is filtered to only the
// samples where it was actually present as a finite number before summing/
// averaging, since not every response path carries every stage (e.g. a
// quota-exceeded response never reaches acr_call or musicbrainz_enrich).
const UPLOAD_SCAN_TIMING_STAGE_KEYS = [
  'parse_request', 'auth', 'authorize', 'quota', 'forensic_pre', 'acr_call',
  'planned_setlist_lookup', 'artist_catalogue_lookup', 'fallback_catalogue_lookup',
  'detection_stats_lookup', 'detection_event_write', 'musicbrainz_enrich', 'total',
] as const

function percentileOf(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length))
  return sortedAsc[idx]
}

function buildUploadScanTimingAggregate(input: {
  totalScanWallMs: number
  recordingDurationSeconds: number
  totalChunks: number
  successfulRequests: number
  failedRequests: number
  songsFound: number
  samples: Record<string, number>[]
}) {
  const totals = input.samples
    .map(s => s.total)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b)
  const totalsSum = totals.reduce((a, b) => a + b, 0)

  const requestTotal = {
    average: totals.length ? Math.round(totalsSum / totals.length) : 0,
    median: percentileOf(totals, 0.5),
    p90: percentileOf(totals, 0.9),
    p95: percentileOf(totals, 0.95),
    slowest: totals.length ? totals[totals.length - 1] : 0,
  }

  const stages: Record<string, { sum: number; average: number; count: number }> = {}
  for (const key of UPLOAD_SCAN_TIMING_STAGE_KEYS) {
    const values = input.samples
      .map(s => s[key])
      .filter((n): n is number => typeof n === 'number')
    const sum = values.reduce((a, b) => a + b, 0)
    stages[key] = { sum, average: values.length ? Math.round(sum / values.length) : 0, count: values.length }
  }

  return {
    totalScanWallMs: input.totalScanWallMs,
    recordingDurationSeconds: input.recordingDurationSeconds,
    totalChunks: input.totalChunks,
    successfulRequests: input.successfulRequests,
    failedRequests: input.failedRequests,
    songsFound: input.songsFound,
    requestTotal,
    stages,
  }
}

// Same compression approach as show/new/page.tsx's compressImage — kept
// duplicated for the same reason as the map component above.
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

type DetectedSong = {
  title: string; artist: string | null; isrc: string | null; composer: string | null
  publisher: string | null; source: string; inclusion_reason: string | null
  threshold: number | null; score: number | null
}
type ParsedSetlistSong = { title: string; artist?: string }

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '9px 13px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
    background: active ? C.goldDim : 'rgba(255,255,255,0.02)',
    border: `1px solid ${active ? C.borderGold : C.border}`,
    color: active ? C.gold : C.secondary,
  }
}

// ─── Trimmed venue map preview ─────────────────────────────────────────────
// Visual confirmation only — geocodes the typed venue name for a preview
// pin, never reads device location, never persists coordinates.
function VenueMapPreview({ venueName }: { venueName: string }) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const marker = useRef<mapboxgl.Marker | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const attemptRef = useRef(0)

  useEffect(() => {
    const query = venueName.trim()
    const attempt = ++attemptRef.current
    if (!mapboxgl.accessToken || query.length < 2) { setCoords(null); setFailed(false); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query, limit: '1', types: 'poi', language: 'en',
          access_token: mapboxgl.accessToken as string,
        })
        const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`)
        const data = await res.json()
        if (attempt !== attemptRef.current) return
        const top = data.features?.[0]
        const c = top?.properties?.coordinates
        if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') { setFailed(true); return }
        setCoords({ lat: c.latitude, lng: c.longitude })
        setFailed(false)
      } catch {
        if (attempt === attemptRef.current) setFailed(true)
      }
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [venueName])

  useEffect(() => {
    if (!coords || !mapContainer.current) return
    if (!map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current, style: 'mapbox://styles/mapbox/dark-v11',
        center: [coords.lng, coords.lat], zoom: 13, attributionControl: false, scrollZoom: false,
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
      <div style={{ marginTop: 10, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, padding: '12px 14px' }}>
        <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>We couldn't confirm this location. Your show will still be saved.</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10, height: 130, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export default function UploadNewPerformancePage() {
  const router = useRouter()
  const { actingAsArtistId } = useActingAs()

  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const [performanceId, setPerformanceId] = useState<string | null>(null)
  const [creatingDraft, setCreatingDraft] = useState(false)

  const [scanning, setScanning] = useState(false)
  const [scanDone, setScanDone] = useState(false)
  const [scanProgress, setScanProgress] = useState(0) // 0..1
  const [scanError, setScanError] = useState('')
  const [detectedSongs, setDetectedSongs] = useState<DetectedSong[]>([])
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [chunksScanned, setChunksScanned] = useState(0)

  const [venueName, setVenueName] = useState('')
  const [showDate, setShowDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [otherStartTimeActive, setOtherStartTimeActive] = useState(false)
  const [showType, setShowType] = useState<'single' | 'writers_round'>('single')
  const [showTypeLabel, setShowTypeLabel] = useState<string | null>(null)
  const [recentVenues, setRecentVenues] = useState<string[]>([])

  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState('')

  const [setlistUploading, setSetlistUploading] = useState(false)
  const [setlistError, setSetlistError] = useState('')
  const [setlistPhotoUrl, setSetlistPhotoUrl] = useState<string | null>(null)
  // Used as recognition CONTEXT (a prior, not truth) — sent per chunk to
  // /api/upload-identify. See handling in beginScan and the route's own
  // header comment for the exact philosophy: this can only strengthen a
  // detection ACR already found on its own; it never substitutes for audio
  // evidence and is never written directly to performance_songs.
  const [parsedSetlistSongs, setParsedSetlistSongs] = useState<ParsedSetlistSong[]>([])

  const detectedSongsRef = useRef<DetectedSong[]>([])
  // Mirrors parsedSetlistSongs for reads inside beginScan — beginScan is a
  // useCallback with an empty dependency array, so a direct state reference
  // would go stale: the setlist can finish parsing before a recording is
  // even chosen (i.e., before beginScan's closure is created), same
  // staleness hazard detectedSongsRef/confirmedSongsRef already solve
  // elsewhere in this codebase.
  const parsedSetlistSongsRef = useRef<ParsedSetlistSong[]>([])
  // Preview/dev-only aggregate timing collection (speed-pass instrumentation).
  // Populated every chunk in beginScan, summarized once at scan end. Self-
  // gates on the server's own `_debug_timings` field (only present when
  // VERCEL_ENV !== 'production' on app/api/upload-identify/route.ts) — in
  // production every sample's `timings` stays null, so the summary is never
  // built, logged, or written to sessionStorage. Never rendered in the UI.
  const scanTimingRef = useRef<Array<{ ok: boolean; timings: Record<string, number> | null }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const setlistInputRef = useRef<HTMLInputElement>(null)
  // Synchronous re-entry guard for goToReview — `finalizing` state is async
  // (won't disable the button until the next render), so a fast double-click
  // can invoke goToReview twice before that happens. This ref is checked and
  // set in the same synchronous tick, before any await.
  const finalizingRef = useRef(false)

  useEffect(() => { parsedSetlistSongsRef.current = parsedSetlistSongs }, [parsedSetlistSongs])

  // ── Recent venues — reuses performances_visible exactly as show/new does
  // for its own venue memory. Read-only, no new API, no RLS change. ────────
  useEffect(() => {
    let cancelled = false
    async function loadRecentVenues() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const targetUserId = actingAsArtistId || user.id
        const { data } = await supabase
          .from('performances_visible')
          .select('venue_name, started_at')
          .eq('user_id', targetUserId)
          .not('venue_name', 'is', null)
          .order('started_at', { ascending: false })
          .limit(20)
        if (cancelled || !data) return
        const seen = new Set<string>()
        const names: string[] = []
        for (const row of data) {
          const name = (row.venue_name || '').trim()
          if (!name || name === '.') continue
          const key = name.toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          names.push(name)
          if (names.length >= 3) break
        }
        setRecentVenues(names)
      } catch { /* non-blocking */ }
    }
    loadRecentVenues()
    return () => { cancelled = true }
  }, [actingAsArtistId])

  const beginScan = useCallback(async (file: File, perfId: string) => {
    setScanning(true)
    setScanProgress(0)
    const supabase = createClient()
    scanTimingRef.current = []
    const scanWallStart = Date.now()
    try {
      const arrayBuffer = await file.arrayBuffer()
      const AudioCtx    = window.AudioContext || (window as any).webkitAudioContext
      const ctx         = new AudioCtx()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      ctx.close()

      const duration    = audioBuffer.duration
      setRecordingDuration(duration)
      const total = Math.max(1, Math.floor((duration - UPLOAD_CHUNK_SECONDS) / UPLOAD_CHUNK_STEP_SECONDS) + 1)
      setTotalChunks(total)

      for (let i = 0; i < total; i++) {
        const startSec = i * UPLOAD_CHUNK_STEP_SECONDS
        const wav = sliceToMonoWav(audioBuffer, startSec, UPLOAD_CHUNK_SECONDS)

        const form = new FormData()
        form.append('audio', wav, 'sample.wav')
        form.append('performance_id', perfId)
        form.append('previous_songs', JSON.stringify(detectedSongsRef.current.map(s => s.title)))
        // Compact recognition context from the already-parsed setlist photo/
        // file, if one was provided — never re-runs /api/parse-setlist, never
        // sends image bytes. Omitted entirely when there's no setlist, so the
        // no-setlist path is byte-for-byte the same request it always was.
        if (parsedSetlistSongsRef.current.length > 0) {
          form.append('uploaded_setlist', JSON.stringify(
            parsedSetlistSongsRef.current.map(s => ({ title: s.title, artist: s.artist || '' }))
          ))
        }

        let data: any = null
        let chunkOk = false
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          try {
            const res = await fetch('/api/upload-identify', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: form,
            })
            data = await res.json()
            chunkOk = true
          } catch { /* skip a failed chunk, keep going */ }
        }

        // Preview/dev-only aggregate timing collection — see scanTimingRef
        // above. Purely additive; does not affect chunkOk/data or anything
        // read below.
        scanTimingRef.current.push({
          ok: chunkOk,
          timings: (chunkOk && data && data._debug_timings) ? data._debug_timings : null,
        })

        if (data?.detected && data.confidence_level === 'auto' && data.title) {
          const already = detectedSongsRef.current.some(s => isSameSong(s, { title: data.title }))
          if (!already) {
            const song: DetectedSong = {
              title: data.title,
              artist: data.artist || null,
              isrc: data.isrc || null,
              composer: data.composer || null,
              publisher: data.publisher || null,
              source: data.source || 'recognized',
              inclusion_reason: data.inclusion_reason || null,
              threshold: data.threshold ?? null,
              score: data.score ?? null,
            }
            detectedSongsRef.current = [...detectedSongsRef.current, song]
            setDetectedSongs(detectedSongsRef.current)
          }
        }

        setChunksScanned(i + 1)
        setScanProgress((i + 1) / total)
      }

      // ── Preview/dev-only aggregate scan timing ────────────────────────────
      // Skips entirely (no console.log, no sessionStorage write) whenever no
      // chunk carried _debug_timings — i.e. in production, where the server
      // never includes that field on the response. Not surfaced in the UI.
      const timedSamples = scanTimingRef.current.filter(s => s.timings)
      if (timedSamples.length > 0) {
        const aggregate = buildUploadScanTimingAggregate({
          totalScanWallMs: Date.now() - scanWallStart,
          recordingDurationSeconds: duration,
          totalChunks: total,
          successfulRequests: scanTimingRef.current.filter(s => s.ok).length,
          failedRequests: scanTimingRef.current.filter(s => !s.ok).length,
          songsFound: detectedSongsRef.current.length,
          samples: timedSamples.map(s => s.timings as Record<string, number>),
        })
        console.log('[UploadScanTiming]', aggregate)
        try {
          sessionStorage.setItem('setlistr_upload_scan_timing', JSON.stringify(aggregate))
        } catch { /* sessionStorage unavailable/full — non-critical */ }
      }
    } catch (err) {
      console.error('[UploadNew] scan failed:', err)
      setScanError('Could not read that audio file.')
    } finally {
      setScanning(false)
      setScanDone(true)
    }
  }, [])

  const handleFileSelected = useCallback(async (file: File) => {
    setRecordingFile(file)
    setScanError('')
    setCreatingDraft(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const targetUserId = actingAsArtistId || user.id

      const res = await fetch('/api/upload-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start upload')

      setPerformanceId(data.performance_id)
      setCreatingDraft(false)
      beginScan(file, data.performance_id)
    } catch (err: any) {
      setCreatingDraft(false)
      setScanError(err.message || 'Could not start upload')
    }
  }, [actingAsArtistId, beginScan])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFileSelected(f)
  }

  // ── Optional setlist assist — reuses /api/parse-setlist exactly as
  // show/new/page.tsx already does. Parsed song names are preserved in
  // parsedSetlistSongs for a future accuracy pass; not used for recognition
  // here. Only the returned setlist photo URL is persisted, via the existing
  // performances.setlist_photo_url column. ──────────────────────────────────
  async function handleSetlistFile(file: File) {
    setSetlistError('')
    if (file.size > MAX_SETLIST_FILE_SIZE) { setSetlistError('File is too large. Maximum size is 10MB.'); return }
    const fileName = (file.name || '').toLowerCase()
    const isHEIC = fileName.endsWith('.heic') || fileName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif'
    const isAllowed = ALLOWED_SETLIST_MIME_TYPES.includes(file.type) || isHEIC
    if (!isAllowed) { setSetlistError('Unsupported file type. Please upload a JPG, PNG, PDF, or TXT file.'); return }
    setSetlistUploading(true)
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
      setParsedSetlistSongs(Array.isArray(data.songs) ? data.songs : [])
      if (data.setlistPhotoUrl) setSetlistPhotoUrl(data.setlistPhotoUrl)
    } catch (err: any) {
      setSetlistError(err.message || "Couldn't read that one. Try a clearer photo.")
    } finally {
      setSetlistUploading(false)
    }
  }
  function handleSetlistInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleSetlistFile(f)
  }

  const detailsValid = venueName.trim().length > 0 && showDate.length > 0
  const readyForReview = scanDone && detailsValid && !finalizing
  const startTimeIsCustom = otherStartTimeActive || (startTime !== '' && !START_TIME_OPTIONS.some(o => o.value === startTime))

  async function goToReview() {
    if (finalizingRef.current) return
    if (!performanceId || !detailsValid) return
    finalizingRef.current = true
    setFinalizing(true)
    setFinalizeError('')
    try {
      const res = await fetch('/api/upload-performance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          performance_id: performanceId,
          venue_name: venueName.trim(),
          performance_date: new Date(showDate).toISOString(),
          start_time: startTime || null,
          show_type: showType,
          songs: detectedSongsRef.current,
          setlist_photo_url: setlistPhotoUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save show details')
      router.push(`/app/review/${performanceId}`)
    } catch (err: any) {
      finalizingRef.current = false
      setFinalizing(false)
      setFinalizeError(err.message || 'Could not save show details')
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px 80px', position: 'relative', overflowX: 'hidden' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Upload a Performance</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Setlistr will confirm what actually happened from the recording.</p>
          </div>
        </div>

        {/* ── Have the setlist? — shown first, optional, no forced skip ──── */}
        {!recordingFile && !setlistPhotoUrl && (
          <div style={{ marginBottom: 16, padding: '18px 20px', borderRadius: 16, border: `1px dashed rgba(255,255,255,0.12)`, background: 'rgba(255,255,255,0.015)' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>Have the setlist?</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>Optional — helps Setlistr verify your performance more accurately.</p>
            <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" style={{ display: 'none' }} onChange={handleSetlistInputChange} />
            <input ref={setlistInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" style={{ display: 'none' }} onChange={handleSetlistInputChange} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => cameraInputRef.current?.click()} disabled={setlistUploading}
                style={{ flex: 1, padding: '11px 8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 10, cursor: setlistUploading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: setlistUploading ? 0.5 : 1 }}>
                <Camera size={15} color={C.secondary} />
                <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary }}>Take Photo</span>
              </button>
              <button onClick={() => setlistInputRef.current?.click()} disabled={setlistUploading}
                style={{ flex: 1, padding: '11px 8px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 10, cursor: setlistUploading ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, opacity: setlistUploading ? 0.5 : 1 }}>
                <Upload size={15} color={C.secondary} />
                <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary }}>Upload Setlist</span>
              </button>
            </div>
            {setlistUploading && <p style={{ fontSize: 11, color: C.muted, margin: '10px 0 0', textAlign: 'center' }}>Reading setlist…</p>}
            {setlistError && <p style={{ fontSize: 12, color: C.red, margin: '10px 0 0' }}>{setlistError}</p>}
          </div>
        )}
        {setlistPhotoUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: C.greenDim, border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10 }}>
            <Check size={13} color={C.green} />
            <span style={{ fontSize: 12, color: C.text }}>
              Setlist attached{parsedSetlistSongs.length ? ` — ${parsedSetlistSongs.length} song${parsedSetlistSongs.length === 1 ? '' : 's'} referenced` : ''}
            </span>
          </div>
        )}

        {/* ── Add your recording ──────────────────────────────────────────── */}
        {!recordingFile && (
          <div style={{ padding: '20px', marginBottom: 12, borderRadius: 16, border: `1px solid ${C.border}` }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Add Your Recording</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px' }}>We'll analyze what was actually played.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.aac,.mov"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%', padding: '18px', background: 'rgba(255,255,255,0.02)', border: `2px dashed rgba(255,255,255,0.12)`, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.secondary, fontSize: 14, fontWeight: 600 }}>
              Choose Recording
            </button>
          </div>
        )}

        {scanError && (
          <div style={{ padding: '12px 14px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{scanError}</p>
          </div>
        )}

        {/* ── Building Your Setlist — the emotional centerpiece ───────────── */}
        {recordingFile && (creatingDraft || scanning || scanDone) && (
          <div style={{ position: 'relative', padding: '30px 22px', marginBottom: 20, borderRadius: 20, background: 'linear-gradient(180deg, #17140f 0%, #0e0c09 100%)', border: `1px solid ${C.borderGold}`, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -70, left: '50%', transform: 'translateX(-50%)', width: 320, height: 220, background: 'radial-gradient(ellipse at center, rgba(201,168,76,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.gold, margin: '0 0 6px', textAlign: 'center' }}>
                {creatingDraft ? 'Starting…'
                  : scanning ? 'Building Your Setlist'
                  : detectedSongs.length > 0 ? `${detectedSongs.length} Song${detectedSongs.length === 1 ? '' : 's'} Found`
                  : 'Scan Complete'}
              </p>
              {scanDone && detectedSongs.length > 0 && (
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 4px' }}>Identified from your recording</p>
              )}
              {(scanning || scanDone) && recordingDuration > 0 && (
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 20px', fontFamily: '"DM Mono", monospace' }}>
                  {fmtClock(recordingDuration)} recording
                  {totalChunks > 0 ? ` · ${chunksScanned}/${totalChunks} segments` : ''}
                  {scanning ? ` · ${Math.round(scanProgress * 100)}%` : ''}
                </p>
              )}

              {creatingDraft && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(201,168,76,0.25)', borderTopColor: C.gold, animation: 'spin 0.8s linear infinite' }} />
                </div>
              )}

              {(scanning || scanDone) && (
                <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 22 }}>
                  <div style={{ height: '100%', width: `${Math.round(scanProgress * 100)}%`, background: `linear-gradient(90deg, ${C.gold}, #e8c76a)`, borderRadius: 2, transition: 'width 0.4s ease' }} />
                </div>
              )}

              {detectedSongs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: scanning ? 16 : 4 }}>
                  {detectedSongs.map((s, i) => (
                    <div key={s.title + i} style={{ display: 'flex', alignItems: 'center', gap: 10, animation: 'songIn 0.4s ease both' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Check size={10} color={C.green} strokeWidth={3} />
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: '-0.005em' }}>{s.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {scanning && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                  <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Listening for the next song…</span>
                </div>
              )}

              {scanDone && detectedSongs.length === 0 && !scanError && (
                <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', margin: 0 }}>No songs identified yet — you can still continue once show details are complete.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Complete the Record ─────────────────────────────────────────── */}
        {performanceId && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, margin: '0 0 14px' }}>Complete the Record</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Venue <span style={{ color: C.red }}>*</span></label>
                {recentVenues.length > 0 && venueName.trim().length === 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>Recent</span>
                    {recentVenues.map(name => (
                      <button key={name} type="button" onClick={() => setVenueName(name)} style={chipStyle(false)}>{name}</button>
                    ))}
                  </div>
                )}
                <input type="text" value={venueName} onChange={e => setVenueName(e.target.value)} placeholder="Where did you play?"
                  spellCheck={false} autoCorrect="off" autoCapitalize="words"
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${venueName.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
                {venueName.trim().length >= 2 && <VenueMapPreview venueName={venueName} />}
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Date <span style={{ color: C.red }}>*</span></label>
                <input type="date" value={showDate} onChange={e => setShowDate(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Start Time <span style={{ color: C.muted, textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {START_TIME_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => { setStartTime(opt.value); setOtherStartTimeActive(false) }}
                      style={chipStyle(startTime === opt.value && !otherStartTimeActive)}>{opt.label}</button>
                  ))}
                  <button type="button" onClick={() => setOtherStartTimeActive(true)} style={chipStyle(startTimeIsCustom)}>Other</button>
                </div>
                {startTimeIsCustom && (
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark' }} />
                )}
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Show Type <span style={{ color: C.muted, textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SHOW_TYPE_OPTIONS.map(opt => (
                    <button key={opt.label} type="button"
                      onClick={() => { setShowTypeLabel(opt.label); setShowType(opt.value) }}
                      style={chipStyle(showTypeLabel === opt.label)}>{opt.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {finalizeError && (
          <div style={{ padding: '12px 14px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{finalizeError}</p>
          </div>
        )}

        {performanceId && !scanDone && detailsValid && (
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px', textAlign: 'center' }}>Show details saved — Setlistr is still listening…</p>
        )}

        {performanceId && (
          <button
            onClick={goToReview}
            disabled={!readyForReview}
            style={{ width: '100%', padding: '17px', background: readyForReview ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: readyForReview ? 'pointer' : 'not-allowed', opacity: finalizing ? 0.7 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {finalizing
              ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving…</>
              : !scanDone ? 'Waiting for analysis…'
              : !detailsValid ? 'Complete show details'
              : 'Continue to Review →'}
          </button>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes spin      { to { transform: rotate(360deg) } }
        @keyframes songIn    { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pulse-dot { 0%,100% { opacity: 1; transform: scale(1) } 50% { opacity: .4; transform: scale(.8) } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
      `}</style>
    </div>
  )
}
