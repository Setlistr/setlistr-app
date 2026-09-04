'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { normalizeSongKey } from '@/lib/reconciliation/normalize'
import { logProductEvent, awaitWithTimeout } from '@/lib/telemetry'
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

// ─── Parallel-recognition / ordered-reconciliation architecture ──────────────
// Recognition (the ACR call) is stateless per chunk and safe to run with
// bounded concurrency. Reconciliation (detection_events, the inclusion
// cascade) is stateful across chunks and must stay strictly sequential — see
// app/api/upload-reconcile/route.ts's own header comment for why. Final step
// of the 2 → 4 → 6 → 8 test ladder (concurrency 6 measured ~1m07.5s total,
// ~12.5s time-to-first-song, ~23.4s time-to-first-3-songs at the same
// 34:11/102-chunk baseline).
const UPLOAD_RECOGNITION_CONCURRENCY = 8

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

// ── Preview/dev-only aggregate timing — parallel recognition / ordered
// reconciliation architecture ────────────────────────────────────────────
// Replaces the old per-chunk _debug_timings aggregate that summarized
// /api/upload-identify's fused-request response shape — that endpoint is no
// longer called from this page (still intact on disk as the known-good
// comparison path; see app/api/upload-identify/route.ts). The new
// /api/upload-recognize and /api/upload-reconcile routes deliberately don't
// carry their own Server-Timing/_debug_timings machinery, since everything
// this aggregate needs (per-request recognition latency, phase wall times,
// counts) is already directly observable client-side from the scheduler
// itself. Pure/stateless — takes raw samples, returns one aggregate object.
function percentileOf(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length))
  return sortedAsc[idx]
}

function buildUploadParallelTimingAggregate(input: {
  recognitionWallMs: number
  chunkCount: number
  concurrency: number
  recognitionSamples: Array<{ ok: boolean; ms: number }>
  reconciliationWallMsTotal: number
  reconciliationBatchCount: number
  resultsProcessed: number
  songsAdded: number
  totalWallMs: number
  timeToFirstSongMs: number | null
  timeToFirst3SongsMs: number | null
}) {
  const okTimes = input.recognitionSamples.filter(s => s.ok).map(s => s.ms).sort((a, b) => a - b)
  const okSum = okTimes.reduce((a, b) => a + b, 0)

  return {
    recognition: {
      wallMs: input.recognitionWallMs,
      chunkCount: input.chunkCount,
      concurrency: input.concurrency,
      successfulRequests: input.recognitionSamples.filter(s => s.ok).length,
      failedRequests: input.recognitionSamples.filter(s => !s.ok).length,
      requestTime: {
        average: okTimes.length ? Math.round(okSum / okTimes.length) : 0,
        median: percentileOf(okTimes, 0.5),
        p90: percentileOf(okTimes, 0.9),
        p95: percentileOf(okTimes, 0.95),
      },
    },
    reconciliation: {
      // Cumulative across every progressive batch, not one final call.
      wallMsTotal: input.reconciliationWallMsTotal,
      batchCount: input.reconciliationBatchCount,
      resultsProcessed: input.resultsProcessed,
      songsAdded: input.songsAdded,
    },
    // The product metric this pass exists for: how long before the artist
    // sees ANY evidence the scan is working, not just when it finishes.
    timeToFirstSongMs: input.timeToFirstSongMs,
    timeToFirst3SongsMs: input.timeToFirst3SongsMs,
    totalWallMs: input.totalWallMs,
    songsFound: input.songsAdded,
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
  // True only once every chunk has been recognized AND every contiguous
  // result has been reconciled with no unresolved failure — the gate for
  // allowing Continue to Review. scanDone can be true while this is still
  // false (e.g. stuck on a reconciliation failure awaiting retry).
  const [allReconciled, setAllReconciled] = useState(false)
  const [scanProgress, setScanProgress] = useState(0) // 0..1
  const [scanError, setScanError] = useState('')
  const [reconcileFailed, setReconcileFailed] = useState(false)
  const [detectedSongs, setDetectedSongs] = useState<DetectedSong[]>([])
  const [recordingDuration, setRecordingDuration] = useState(0)

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
  // Used as recognition CONTEXT (a prior, not truth) — sent once with the
  // ordered batch to /api/upload-reconcile (not per chunk — recognition
  // itself never sees it, see that route's own header comment for the exact
  // philosophy): this can only strengthen a detection ACR already found on
  // its own; it never substitutes for audio
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
  // Mirrors performanceId for the same staleness reason — tryAdvanceReconciliation
  // and retryReconciliation are stable useCallbacks (empty deps) so they can
  // be safely referenced from anywhere without re-creating them per render.
  const performanceIdRef = useRef<string | null>(null)
  useEffect(() => { performanceIdRef.current = performanceId }, [performanceId])
  // Telemetry-only — mirrors show_id/the effective owner id, populated once
  // /api/upload-performance's POST returns, for capture_started/capture_ended
  // logging inside beginScan/finalizeIfDone (both stable, empty-dep
  // useCallbacks, so they read refs rather than state for the same
  // staleness reason as performanceIdRef above).
  const showIdRef = useRef<string | null>(null)
  const targetUserIdRef = useRef<string | null>(null)
  // Guards capture_ended against re-firing if finalizeIfDone is invoked
  // again after already completing once — reset per-scan in beginScan.
  const captureEndedLoggedRef = useRef(false)

  // ── Progressive ordered reconciliation state ──────────────────────────────
  // Recognition (concurrency = 2) fills rawBufferRef out of order as chunks
  // complete; tryAdvanceReconciliation reconciles the longest contiguous
  // completed-but-not-yet-reconciled prefix as soon as it exists, so songs
  // can surface well before the whole scan finishes. See tryAdvanceReconciliation
  // below for the exact ordering guarantee — this block only holds the state
  // it operates on.
  const rawBufferRef          = useRef<any[]>([])       // sparse, indexed by chunk_index
  const attemptedRef          = useRef<boolean[]>([])    // true once chunk_index i is known to be permanently settled (succeeded, failed, or skipped for quota) — lets a gap be told apart from "still in flight"
  const lastReconciledIndexRef = useRef(-1)              // highest chunk_index successfully reconciled so far
  const totalChunksRef        = useRef(0)
  const reconcilingRef        = useRef(false)            // true while an /api/upload-reconcile call is actually in flight — structural guarantee, never two at once
  const reconcileHaltedRef    = useRef(false)            // true after a batch fails; blocks new batches until retryReconciliation clears it
  const quotaExceededRef      = useRef(false)            // true once ACR quota is hit; blocks new recognition scheduling only
  const recognitionFinishedRef = useRef(false)           // true once every recognition worker has stopped (success, or quota-triggered early stop)
  const timingEmittedRef      = useRef(false)            // guards against emitting [UploadParallelTiming] more than once per scan
  // Serializes every call into tryAdvanceReconciliation into a single chain —
  // recognizeChunk fires triggerAdvance() without awaiting it (so recognition
  // never blocks on reconciliation), but beginScan/retryReconciliation await
  // this ref directly to know when the whole chain has settled. Belt-and-
  // suspenders alongside reconcilingRef, not a replacement for it.
  const advanceChainRef       = useRef<Promise<void>>(Promise.resolve())

  // Preview/dev-only aggregate timing collection. Gated on hostname rather
  // than a server-supplied flag (see emitTimingAggregate) since /api/upload-
  // recognize and /api/upload-reconcile don't carry their own _debug_timings
  // field — never rendered in the UI either way.
  const parallelTimingRef        = useRef<Array<{ ok: boolean; ms: number }>>([]) // one entry per recognition request
  const reconciliationBatchTimesRef = useRef<number[]>([]) // one entry per progressive reconciliation batch
  const firstSongAtRef           = useRef<number | null>(null)
  const first3SongsAtRef         = useRef<number | null>(null)
  const recognitionStartRef      = useRef(0)
  const recognitionWallMsRef     = useRef(0)
  const scanWallStartRef         = useRef(0)
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

  const emitTimingAggregate = useCallback(() => {
    if (timingEmittedRef.current) return
    timingEmittedRef.current = true
    const isPreviewOrDev = typeof window !== 'undefined' && window.location.hostname !== 'setlistr.ai'
    if (!isPreviewOrDev) return
    const reconciliationWallMsTotal = reconciliationBatchTimesRef.current.reduce((a, b) => a + b, 0)
    const resultsProcessed = rawBufferRef.current.filter(x => x !== undefined).length
    const aggregate = buildUploadParallelTimingAggregate({
      recognitionWallMs: recognitionWallMsRef.current,
      chunkCount: totalChunksRef.current,
      concurrency: UPLOAD_RECOGNITION_CONCURRENCY,
      recognitionSamples: parallelTimingRef.current,
      reconciliationWallMsTotal,
      reconciliationBatchCount: reconciliationBatchTimesRef.current.length,
      resultsProcessed,
      songsAdded: detectedSongsRef.current.length,
      totalWallMs: Date.now() - scanWallStartRef.current,
      timeToFirstSongMs: firstSongAtRef.current,
      timeToFirst3SongsMs: first3SongsAtRef.current,
    })
    console.log('[UploadParallelTiming]', aggregate)
    try {
      sessionStorage.setItem('setlistr_upload_parallel_timing', JSON.stringify(aggregate))
    } catch { /* sessionStorage unavailable/full — non-critical */ }
  }, [])

  // Only actually finalizes (stops the spinner state, unlocks Continue,
  // emits timing) once recognition has fully stopped AND every contiguous
  // result has been reconciled AND nothing is currently stuck on a failure.
  // Safe to call any time — a no-op otherwise. Can be invoked more than
  // once after the done-condition is already true (called defensively from
  // multiple points in the reconciliation-progress chain), so
  // captureEndedLoggedRef guards the telemetry specifically against
  // re-firing on a later redundant call within the same scan — reset at
  // the top of beginScan for a fresh scan.
  const finalizeIfDone = useCallback(async () => {
    const total = totalChunksRef.current
    if (
      recognitionFinishedRef.current &&
      !reconcileHaltedRef.current &&
      lastReconciledIndexRef.current >= total - 1
    ) {
      emitTimingAggregate()
      setScanning(false)
      setScanDone(true)
      setAllReconciled(true)
      setScanProgress(1)
      if (!captureEndedLoggedRef.current) {
        captureEndedLoggedRef.current = true
        await awaitWithTimeout(logProductEvent(createClient(), {
          event_name: 'capture_ended', user_id: targetUserIdRef.current, performance_id: performanceIdRef.current,
          show_id: showIdRef.current, flow_source: 'upload',
          actor_type: actingAsArtistId ? 'delegate' : 'owner',
          song_count_current: detectedSongsRef.current.length,
          song_count_planned: parsedSetlistSongsRef.current.length,
        }))
      }
    }
  }, [emitTimingAggregate])

  // ── Progressive, strictly-ordered reconciliation ──────────────────────────
  // Finds the longest contiguous chunk_index prefix (starting right after
  // lastReconciledIndexRef) that's ready — either a real raw result arrived,
  // or that index is a KNOWN-permanent gap (attemptedRef[i] true with no raw
  // result: the chunk failed, or was never scheduled because quota stopped
  // recognition). An index that's simply still in flight is neither, so the
  // scan stops there and waits — chunk N+1 is never reconciled before chunk
  // N when N's outcome is still unknown. Never runs concurrently with itself
  // (reconcilingRef), and every call is serialized through the same promise
  // chain (see triggerAdvance) so there is never more than one
  // /api/upload-reconcile request in flight for this scan at a time.
  const tryAdvanceReconciliation = useCallback(async (): Promise<void> => {
    if (reconcilingRef.current || reconcileHaltedRef.current) return
    const total = totalChunksRef.current
    const start = lastReconciledIndexRef.current + 1
    if (start >= total) return

    let end = start - 1
    for (let i = start; i < total; i++) {
      if (rawBufferRef.current[i] !== undefined) { end = i; continue }
      if (attemptedRef.current[i]) { continue } // permanent gap — skip, keep scanning
      break // genuinely still pending — stop here, do not reconcile past it
    }
    if (end < start) return // nothing new yet

    reconcilingRef.current = true
    const perfId = performanceIdRef.current
    const batch: any[] = []
    for (let i = start; i <= end; i++) {
      if (rawBufferRef.current[i] !== undefined) batch.push(rawBufferRef.current[i])
    }

    const batchStart = Date.now()
    let ok = false
    try {
      if (batch.length === 0) {
        // The whole available range was permanent gaps — nothing to send,
        // trivially "successful".
        ok = true
      } else if (perfId) {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const accessToken = session?.access_token || null
        if (accessToken) {
          const res = await fetch('/api/upload-reconcile', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              performance_id: perfId,
              // Sent with every batch — cheap (small JSON, no audio) and
              // keeps each batch self-contained; recognition itself never
              // sees this field either way.
              uploaded_setlist: parsedSetlistSongsRef.current.length > 0
                ? parsedSetlistSongsRef.current.map(s => ({ title: s.title, artist: s.artist || '' }))
                : undefined,
              results: batch,
            }),
          })
          const data = await res.json()
          if (res.ok && Array.isArray(data.songs)) {
            ok = true
            if (data.songs.length > 0) {
              // Merge (never replace), dedupe defensively against the same
              // normalized title appearing twice, preserve arrival order —
              // batches are always processed in increasing chunk_index
              // order, so a simple append is already chronologically correct.
              const existingKeys = new Set(detectedSongsRef.current.map(s => normalizeSongKey(s.title)))
              const fresh = (data.songs as DetectedSong[]).filter(s => {
                const key = normalizeSongKey(s.title)
                if (!key || existingKeys.has(key)) return false
                existingKeys.add(key)
                return true
              })
              if (fresh.length > 0) {
                detectedSongsRef.current = [...detectedSongsRef.current, ...fresh]
                setDetectedSongs(detectedSongsRef.current)
                const elapsed = Date.now() - scanWallStartRef.current
                if (firstSongAtRef.current === null) firstSongAtRef.current = elapsed
                if (first3SongsAtRef.current === null && detectedSongsRef.current.length >= 3) {
                  first3SongsAtRef.current = elapsed
                }
              }
            }
          } else {
            setScanError(data.error || 'Could not confirm your setlist. You can try again.')
          }
        } else {
          setScanError('Could not confirm your setlist. You can try again.')
        }
      }
    } catch {
      setScanError('Could not confirm your setlist. You can try again.')
    }

    reconciliationBatchTimesRef.current.push(Date.now() - batchStart)
    reconcilingRef.current = false

    if (ok) {
      lastReconciledIndexRef.current = end
      setReconcileFailed(false)
      // More may already be available (recognition kept running while this
      // batch was in flight, or a gap-skip just unlocked a further stretch)
      // — check again immediately rather than waiting for the next
      // recognizeChunk completion to notice.
      await tryAdvanceReconciliation()
    } else {
      reconcileHaltedRef.current = true
      setReconcileFailed(true)
    }
  }, [])

  const triggerAdvance = useCallback((): Promise<void> => {
    advanceChainRef.current = advanceChainRef.current.then(() => tryAdvanceReconciliation()).catch(() => {})
    return advanceChainRef.current
  }, [tryAdvanceReconciliation])

  const beginScan = useCallback(async (file: File, perfId: string) => {
    setScanning(true)
    captureEndedLoggedRef.current = false
    logProductEvent(createClient(), {
      event_name: 'capture_started', user_id: targetUserIdRef.current, performance_id: perfId,
      show_id: showIdRef.current, flow_source: 'upload',
      actor_type: actingAsArtistId ? 'delegate' : 'owner',
      song_count_planned: parsedSetlistSongsRef.current.length,
    })
    setScanDone(false)
    setAllReconciled(false)
    setScanProgress(0)
    setReconcileFailed(false)
    setScanError('')

    rawBufferRef.current = []
    attemptedRef.current = []
    lastReconciledIndexRef.current = -1
    reconcilingRef.current = false
    reconcileHaltedRef.current = false
    quotaExceededRef.current = false
    recognitionFinishedRef.current = false
    timingEmittedRef.current = false
    advanceChainRef.current = Promise.resolve()
    parallelTimingRef.current = []
    reconciliationBatchTimesRef.current = []
    firstSongAtRef.current = null
    first3SongsAtRef.current = null
    detectedSongsRef.current = []
    setDetectedSongs([])
    scanWallStartRef.current = Date.now()

    const supabase = createClient()
    try {
      const arrayBuffer = await file.arrayBuffer()
      const AudioCtx    = window.AudioContext || (window as any).webkitAudioContext
      const ctx         = new AudioCtx()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      ctx.close()

      const duration    = audioBuffer.duration
      setRecordingDuration(duration)
      const total = Math.max(1, Math.floor((duration - UPLOAD_CHUNK_SECONDS) / UPLOAD_CHUNK_STEP_SECONDS) + 1)
      totalChunksRef.current = total
      recognitionStartRef.current = Date.now()

      // ── Bounded-concurrency parallel raw recognition ──────────────────────
      // Recognition responses NEVER touch detectedSongs/detectedSongsRef
      // directly — only tryAdvanceReconciliation (via a real server
      // decision) is allowed to add a song to the visible setlist. A failed
      // chunk simply never contributes a rawBufferRef entry (a permanent
      // gap once attemptedRef[i] is set), indices are never renumbered.
      const recognizeChunk = async (i: number) => {
        const startSec = i * UPLOAD_CHUNK_STEP_SECONDS
        const wav = sliceToMonoWav(audioBuffer, startSec, UPLOAD_CHUNK_SECONDS)

        const form = new FormData()
        form.append('audio', wav, 'sample.wav')
        form.append('performance_id', perfId)
        form.append('chunk_index', String(i))

        const reqStart = Date.now()
        let ok = false
        // Fresh session per call (not hoisted) — matches the prior
        // sequential route's per-request session fetch, so a token refresh
        // mid-scan is handled the same way it always was.
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          try {
            const res = await fetch('/api/upload-recognize', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: form,
            })
            const data = await res.json()
            ok = true
            if (data?.quota_exceeded) {
              quotaExceededRef.current = true
              setScanError(data.message || 'Song detection limit reached for today.')
            } else if (data && !data.error) {
              rawBufferRef.current[i] = data
            }
          } catch { /* chunk failed — recorded as a permanent gap below, keep going */ }
        }
        attemptedRef.current[i] = true
        parallelTimingRef.current.push({ ok, ms: Date.now() - reqStart })

        const recognizedCount = attemptedRef.current.filter(Boolean).length
        setScanProgress(p => Math.max(p, Math.min(0.95, recognizedCount / total)))

        // Fire-and-forget on purpose — recognition never waits on
        // reconciliation. triggerAdvance's own chain (and reconcilingRef
        // inside tryAdvanceReconciliation) guarantee this never runs two
        // reconciliation batches concurrently regardless of how many
        // recognizeChunk calls trigger it back-to-back.
        triggerAdvance()
      }

      // Bounded-concurrency worker pool — a fixed number of workers each
      // pull the next index off a shared cursor until none remain, or until
      // quota is hit. Smallest correct implementation of "N in flight at a
      // time" without a new dependency. Once quota is hit, no NEW work is
      // scheduled, but any recognizeChunk() already in flight is allowed to
      // finish (not aborted) — matches the prior turn's chosen behavior.
      let cursor = 0
      const worker = async () => {
        while (true) {
          if (quotaExceededRef.current) return
          const i = cursor
          if (i >= total) return
          cursor++
          await recognizeChunk(i)
        }
      }
      const workerCount = Math.min(UPLOAD_RECOGNITION_CONCURRENCY, total)
      await Promise.all(Array.from({ length: workerCount }, () => worker()))

      recognitionWallMsRef.current = Date.now() - recognitionStartRef.current
      recognitionFinishedRef.current = true

      // If quota stopped us early, every index from here on was never even
      // attempted — proactively close them out as permanent gaps now (we
      // already know for certain none of them will ever arrive) rather than
      // leaving tryAdvanceReconciliation waiting on them forever.
      for (let i = cursor; i < total; i++) {
        if (!attemptedRef.current[i]) attemptedRef.current[i] = true
      }

      // Final flush of whatever's left, then either finalize or — if the
      // last batch failed — leave scanning/scanDone in the "stuck, retry"
      // state the UI's reconcileFailed banner covers.
      await triggerAdvance()
      if (reconcileHaltedRef.current) {
        setScanning(false)
        setScanDone(true)
      } else {
        finalizeIfDone()
      }
    } catch (err) {
      console.error('[UploadNew] scan failed:', err)
      setScanError('Could not read that audio file.')
      setScanning(false)
      setScanDone(true)
    }
  }, [triggerAdvance, finalizeIfDone])

  // Manual retry after a failed progressive /api/upload-reconcile batch —
  // resumes from the first unreconciled chunk using raw results already
  // sitting in rawBufferRef, never re-runs ACR recognition. Previously
  // reconciled/confirmed songs are untouched (lastReconciledIndexRef and
  // detectedSongsRef are never rolled back on failure). No persistent
  // crash/reload recovery in this pass — in-memory only.
  const retryReconciliation = useCallback(async () => {
    if (!performanceIdRef.current) return
    reconcileHaltedRef.current = false
    setScanError('')
    setReconcileFailed(false)
    await triggerAdvance()
    if (reconcileHaltedRef.current) {
      // Failed again — stay in the same stuck-awaiting-retry state.
      return
    }
    finalizeIfDone()
  }, [triggerAdvance, finalizeIfDone])

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
      showIdRef.current = data.show_id || null
      targetUserIdRef.current = targetUserId
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
  // Gated on allReconciled, not just scanDone — scanDone can be true while
  // the scan is stuck awaiting a reconciliation retry (unreconciled raw
  // results still exist in that case), and review must never start then.
  const readyForReview = allReconciled && detailsValid && !finalizing
  const startTimeIsCustom = otherStartTimeActive || (startTime !== '' && !START_TIME_OPTIONS.some(o => o.value === startTime))

  async function goToReview() {
    if (finalizingRef.current) return
    if (!performanceId || !detailsValid || !allReconciled) return
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
      router.push(`/app/review/${performanceId}?source=upload`)
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

        {scanError && !reconcileFailed && (
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
              {/* No chunk/segment counts anywhere in this card — only a
                  plain-language description, a live song count, and a
                  percentage. Recognition and reconciliation now overlap
                  continuously rather than running as two discrete phases,
                  so there's a single constant label rather than one that
                  switches mid-scan — songs from progressive reconciliation
                  are what make this feel alive instead of stalled. */}
              {scanning && (
                <>
                  <p style={{ fontSize: 12, color: C.secondary, fontWeight: 600, textAlign: 'center', margin: '0 0 4px' }}>
                    Analyzing your recording…
                  </p>
                  {detectedSongs.length > 0 && (
                    <p style={{ fontSize: 12, color: C.gold, fontWeight: 700, textAlign: 'center', margin: '0 0 14px' }}>
                      {detectedSongs.length} song{detectedSongs.length === 1 ? '' : 's'} found
                    </p>
                  )}
                </>
              )}
              {scanDone && detectedSongs.length > 0 && (
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 4px' }}>Identified from your recording</p>
              )}
              {(scanning || scanDone) && recordingDuration > 0 && (
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 20px', fontFamily: '"DM Mono", monospace' }}>
                  {fmtClock(recordingDuration)} recording
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
                  <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Listening for songs…</span>
                </div>
              )}

              {scanDone && detectedSongs.length === 0 && !scanError && (
                <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', margin: 0 }}>No songs identified yet — you can still continue once show details are complete.</p>
              )}

              {/* Reconciliation-only retry — reuses the raw recognition
                  results already held in memory, never re-scans the audio. */}
              {reconcileFailed && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 12, color: C.red }}>{scanError || 'Could not confirm your setlist.'}</span>
                  <button
                    onClick={retryReconciliation}
                    style={{ background: 'none', border: `1px solid ${C.red}`, borderRadius: 8, padding: '6px 10px', color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                    Retry
                  </button>
                </div>
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

        {performanceId && !allReconciled && detailsValid && (
          <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px', textAlign: 'center' }}>Show details saved — Setlistr is still listening…</p>
        )}

        {performanceId && (
          <button
            onClick={goToReview}
            disabled={!readyForReview}
            style={{ width: '100%', padding: '17px', background: readyForReview ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: readyForReview ? 'pointer' : 'not-allowed', opacity: finalizing ? 0.7 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {finalizing
              ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving…</>
              : !allReconciled ? 'Waiting for analysis…'
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
