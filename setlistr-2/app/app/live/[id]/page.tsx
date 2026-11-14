'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buzzLong } from '@/lib/haptics'
import { useActingAs } from '@/components/ActingAsProvider'
import { Check, X, RefreshCw } from 'lucide-react'
import type { Performance } from '@/types'
import { evaluateGeolocation, toCoords } from '@/lib/geolocation'
import { ACR_LIMIT_MESSAGE } from '@/lib/acr-limits'
import { normalizeSongKey } from '@/lib/reconciliation/normalize'
import { logProductEvent, awaitWithTimeout } from '@/lib/telemetry'
import { finalizeLiveCapture, type FinalSongRow } from '@/lib/live-finalize'
import { LOOK_BACK_MS } from '@/lib/tonightShows'
import { startedText } from '@/components/scheduling/TonightShows'

const C = {
  bg: 'var(--sl-bg)', card: 'var(--sl-surface)', border: 'color-mix(in srgb, var(--sl-text) 7%, transparent)',
  input: 'var(--sl-input-bg)', text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)',
  gold: 'var(--sl-accent)', goldDim: 'color-mix(in srgb, var(--sl-accent) 15%, transparent)', red: 'var(--sl-danger)',
  amber: 'var(--sl-warn)', amberDim: 'color-mix(in srgb, var(--sl-warn) 12%, transparent)',
  green: 'var(--sl-ok)', greenDim: 'color-mix(in srgb, var(--sl-ok) 8%, transparent)',
}

const HEARTBEAT_SLOW_MS  = 3 * 60 * 1000
const HEARTBEAT_STALL_MS = 5 * 60 * 1000
const AUTO_CLOSE_SILENCE_MS = 60 * 60 * 1000
const HARD_CEILING_MS = 4 * 60 * 60 * 1000
const SILENCE_WARNING_MS = 45 * 60 * 1000

// Session health: how long we tolerate hearing nothing back from ACR before
// telling the artist capture has broken. Healthy responses land ~20s apart (the
// 20s recordAndDetect interval + 14s recording), so 45s absorbs one slow or
// skipped cycle without a false alarm while still catching a real death fast.
const CAPTURE_HEALTH_WINDOW_MS = 45 * 1000

// A failed in-progress save is retried on its own after this long (and as
// soon as the device reports it's back online).
const SAVE_RETRY_MS = 15 * 1000
// Consecutive recognition requests that never reached the server before the
// artist is told the connection is the problem (one blip isn't worth a word).
const NETWORK_FAILS_BEFORE_NOTICE = 2
// End waits this long for song checks of audio recorded before End (sent
// already, or the last partial sample) so their answers make the final list.
// A check still unanswered after that is left out of the setlist; its result
// is kept in the recognition log (/api/identify writes detection_events,
// never the setlist), so it can't change the finished show.
const END_CHECK_WAIT_MS = 20 * 1000

// A recognised song that arrived while End was running, applied to the final
// list by End itself (not through on-screen state) so it can't be missed.
type EndResult = {
  title: string; artist: string; source: DetectedSong['source']; setlist_item_id?: string
  isrc?: string; composer?: string; publisher?: string
  inclusion_reason?: string | null; threshold?: number | null; score?: number | null
}

// Why the microphone isn't capturing, in words the artist can act on.
type MicProblem = 'denied' | 'unavailable' | 'interrupted'

type AcrCandidate = { title: string; artist: string; score: number }
type DetectedSong = {
  title: string; artist: string
  source: 'planned' | 'fingerprint' | 'humming' | 'transcript' | 'combined' | 'manual' | 'cloned' | 'unidentified'
  setlist_item_id?: string
  confidence_level?: 'auto' | 'suggest' | 'manual_review'
  isrc?: string; composer?: string; publisher?: string
  was_planned?: boolean
  confirmedAt?: number
  // Inclusion metadata returned by /api/identify (for the confusion-matrix dataset)
  inclusion_reason?: string | null; threshold?: number | null; score?: number | null
  // The performance_songs row this song is saved as during capture (see the
  // in-progress save below). Assigned once, kept across edits and reloads.
  row_id?: string
}
type PendingCandidate = {
  title: string; artist: string
  firstDetectedAt: number; lastDetectedAt: number; matchCount: number
  source: DetectedSong['source']
  confidence_level?: 'auto' | 'suggest' | 'manual_review'
  candidates?: AcrCandidate[]; downgraded_reason?: string
}
type RecentSong = { id: string; title: string; artist: string; play_count: number }
type EngineState = 'idle' | 'listening' | 'slow' | 'stalled'

function isSameSong(a: { title: string }, b: { title: string }): boolean {
  return normalizeSongKey(a.title) === normalizeSongKey(b.title)
}
// Applies answers that arrived during End to the list, the way a live
// detection would: a song already on the list is skipped; one on the planned
// setlist upgrades that entry (or is added under its planned title); anything
// else is appended.
function mergeEndResults(list: DetectedSong[], results: EndResult[], planned: { title: string; normalizedTitle: string; artist: string }[]): DetectedSong[] {
  let out = list
  for (const r of results) {
    if (out.some(s => s.source !== 'planned' && isSameSong(s, r))) continue
    const extra = { isrc: r.isrc || '', composer: r.composer || '', publisher: r.publisher || '', inclusion_reason: r.inclusion_reason ?? null, threshold: r.threshold ?? null, score: r.score ?? null }
    const plannedMatch = planned.find(p => p.normalizedTitle === normalizeSongKey(r.title))
    if (plannedMatch) {
      const idx = out.findIndex(s => normalizeSongKey(s.title) === plannedMatch.normalizedTitle)
      out = idx !== -1
        ? out.map((s, i) => i === idx ? { ...s, source: r.source, confidence_level: 'auto' as const, was_planned: true, confirmedAt: Date.now(), ...extra } : s)
        : [...out, { title: plannedMatch.title, artist: plannedMatch.artist || r.artist, source: r.source, setlist_item_id: r.setlist_item_id, confidence_level: 'auto' as const, was_planned: true, confirmedAt: Date.now(), ...extra }]
    } else {
      out = [...out, { title: r.title, artist: r.artist, source: r.source, setlist_item_id: r.setlist_item_id, confidence_level: 'auto' as const, was_planned: false, confirmedAt: Date.now(), ...extra }]
    }
  }
  return out
}

function timeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000)
  if (sec < 60) return `${sec}s ago`
  return `${Math.floor(sec / 60)} min ago`
}

async function writeUserSong(supabase: ReturnType<typeof createClient>, title: string, artist: string, userId: string, performanceId: string): Promise<void> {
  try {
    const normalizedTitle = normalizeSongKey(title)
    const { error: guardError } = await supabase.from('user_song_performances').insert({ user_id: userId, performance_id: performanceId, normalized_title: normalizedTitle })
    if (guardError) { if (guardError.code === '23505') return; return }
    const { data: existing } = await supabase.from('user_songs').select('id, confirmed_count').eq('user_id', userId).eq('song_title', title).single()
    if (existing) {
      await supabase.from('user_songs').update({ confirmed_count: existing.confirmed_count + 1, canonical_artist: artist || null, last_confirmed_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('user_songs').insert({ user_id: userId, song_title: title, canonical_artist: artist || null, confirmed_count: 1, last_confirmed_at: new Date().toISOString() })
    }
  } catch {}
}

export default function LiveCapturePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { actingAsArtistId } = useActingAs()
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [showId, setShowId]           = useState<string | null>(null)
  const [setlistId, setSetlistId]     = useState<string | null>(null)
  const [artistId, setArtistId]       = useState<string | null>(null)
  const [elapsed, setElapsed]         = useState(0)
  const [ending, setEnding]           = useState(false)
  // End couldn't finish saving. The show is still live and every saved song
  // is kept (lib/live-finalize.ts); the artist can try again.
  const [endFailed, setEndFailed]     = useState(false)
  const [songInput, setSongInput]     = useState('')
  const [songs, setSongs]             = useState<DetectedSong[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectStatus, setDetectStatus] = useState<string>('')
  const [showManual, setShowManual]   = useState(false)
  const [recentSongs, setRecentSongs] = useState<RecentSong[]>([])
  const [catchFlash, setCatchFlash]   = useState(false)
  const [lastCaught, setLastCaught]   = useState<string | null>(null)
  const [pendingCandidate, setPendingCandidate] = useState<PendingCandidate | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editTitle, setEditTitle]       = useState('')
  const [editArtist, setEditArtist]     = useState('')
  const [showUnknowns, setShowUnknowns] = useState(false)
  const [engineState, setEngineState]   = useState<EngineState>('idle')
  const [lastSongAt, setLastSongAt]     = useState<number>(0)
  const [showSilenceWarning, setShowSilenceWarning] = useState(false)
  const [restarting, setRestarting]     = useState(false)
  const [captureStale, setCaptureStale] = useState(false)
  // Daily ACRCloud ceiling hit: capture deliberately stays alive, only the
  // paid calls stop. Mirrored into a ref because the health timers below run
  // off intervals created once on mount.
  const [detectionLimited, setDetectionLimited] = useState(false)
  // /api/identify answered with a non-2xx (e.g. misconfigured recognition
  // credentials in this environment) rather than a real verdict. Distinct
  // from captureStale (which only tracks whether the server answered AT
  // ALL) and from detectionLimited (a real, expected quota stop) — this is
  // "it answered, but with an error," which previously got silently parsed
  // as data.detected === undefined and treated identically to a genuine
  // "no song this time," with Session Health still showing green. No
  // detection/scoring logic changes — this only makes an existing failure
  // visible instead of silent.
  const [recognitionUnavailable, setRecognitionUnavailable] = useState(false)
  // Three different reasons nothing is being recognised, told apart:
  //   micProblem  — the microphone couldn't start or stopped (capture problem)
  //   netProblem  — requests aren't reaching Setlistr (connection problem)
  //   lastCheck   — the last sample was answered: matched, or no match (normal)
  const [micProblem, setMicProblem]   = useState<MicProblem | null>(null)
  const [netProblem, setNetProblem]   = useState(false)
  const [lastCheck, setLastCheck]     = useState<'match' | 'no_match' | null>(null)
  // The in-progress save last failed; it retries on its own.
  const [saveProblem, setSaveProblem] = useState(false)
  const [saveRetryTick, setSaveRetryTick] = useState(0)
  const [plannedCount, setPlannedCount] = useState<number>(0)
  const plannedSongsRef = useRef<{ title: string; normalizedTitle: string; artist: string }[]>([])

  const [deletePending, setDeletePending] = useState<number | null>(null)
  const deletePendingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const [confirmRing, setConfirmRing] = useState(false)
  const prevConfirmedCountRef = useRef<number>(-1)

  const [showPlacementCard, setShowPlacementCard] = useState(false)
  const placementShownRef = useRef(false)
  const placementTimerRef = useRef<NodeJS.Timeout | null>(null)

  const mediaRecorderRef    = useRef<MediaRecorder | null>(null)
  const chunksRef           = useRef<Blob[]>([])
  const listenIntervalRef   = useRef<NodeJS.Timeout | null>(null)
  const streamRef           = useRef<MediaStream | null>(null)
  const lastConfirmedAtRef  = useRef<number>(0)
  const pendingCandidateRef = useRef<PendingCandidate | null>(null)
  const confirmedSongsRef   = useRef<DetectedSong[]>([])
  const showStartRef        = useRef<number>(Date.now())
  // When the current listening session began (start or resume on this page).
  // The automatic end-of-show limits count from here, not from when the show
  // started, so reopening yesterday's unfinished show doesn't end it at once.
  const sessionStartRef     = useRef<number>(Date.now())
  const netFailsRef         = useRef(0)
  // When the capture-health flag tripped; a request started after it that
  // gets answered proves the recording loop is alive again.
  const staleSinceRef       = useRef(0)
  const lastPingRef         = useRef<number>(0)
  const lastSongRef         = useRef<number>(0)
  // Last time /api/identify actually answered — any verdict counts, including
  // "nothing recognized". Distinct from lastPingRef, which marks attempt START.
  const lastAcrResponseRef  = useRef<number>(0)
  const isListeningRef      = useRef<boolean>(false)
  const micProblemRef       = useRef<MicProblem | null>(null)
  const endingRef           = useRef<boolean>(false)
  const wakeLockRef         = useRef<WakeLockSentinel | null>(null)
  const autoStartFiredRef   = useRef(false)
  const performanceRef      = useRef<Performance | null>(null)
  const locationStampedRef  = useRef(false)
  const detectionLimitedRef = useRef(false)
  // Fires capture_started once per mount (first successful startListening),
  // not again on a restartListening() recovery cycle — that's the same
  // capture session, not a new one.
  const captureStartedLoggedRef = useRef(false)
  // In-progress save: the list is written to performance_songs as it changes,
  // so a reload, a closed app or a crashed page reopens with the same songs.
  // restoredRef: the saved list has been loaded (never save before that).
  // lastSavedRef: what was last written, so an unchanged list isn't rewritten.
  // saveChainRef: saves run one at a time, in order; End waits for the last one.
  const restoredRef   = useRef(false)
  const lastSavedRef  = useRef<string>('')
  const saveChainRef  = useRef<Promise<void>>(Promise.resolve())
  const saveRetryTimerRef = useRef<NodeJS.Timeout | null>(null)
  // Song checks in flight, End's start time, answers that arrived during End,
  // and the last partial sample being handed off when End stopped recording.
  const inflightRef     = useRef<Set<Promise<void>>>(new Set())
  const endStartedAtRef = useRef(0)
  const endResultsRef   = useRef<EndResult[]>([])
  const finalChunkRef   = useRef<Promise<void> | null>(null)
  const [endPhase, setEndPhase] = useState<'checks' | 'saving' | null>(null)

  useEffect(() => { pendingCandidateRef.current = pendingCandidate }, [pendingCandidate])
  useEffect(() => { confirmedSongsRef.current = songs }, [songs])
  useEffect(() => { isListeningRef.current = isListening }, [isListening])
  useEffect(() => { endingRef.current = ending }, [ending])
  useEffect(() => { micProblemRef.current = micProblem }, [micProblem])
  useEffect(() => { performanceRef.current = performance }, [performance])

  useEffect(() => {
    return () => {
      if (deletePendingTimerRef.current) clearTimeout(deletePendingTimerRef.current)
      if (placementTimerRef.current) clearTimeout(placementTimerRef.current)
    }
  }, [])

  // Load the songs saved for this show (during capture, or before the app
  // was closed). Anything already on screen that isn't saved yet is kept after
  // them, so a retry after a failed first read never drops a song added since.
  // Until a read succeeds nothing is saved or finalised: a failed read must
  // not let a save or End erase rows it never saw. Returns whether it loaded.
  async function restoreSaved(perf: Performance): Promise<boolean> {
    const { data: existingSongs, error } = await createClient().from('performance_songs_visible')
      .select('id, title, artist, isrc, composer, publisher, source, position, was_planned, inclusion_reason, threshold, score')
      .eq('performance_id', perf.id)
      .order('position', { ascending: true })
    if (error || !existingSongs) return false
    const restored: DetectedSong[] = existingSongs.map(s => ({
      title: s.title || 'Unknown Song', artist: s.artist || '',
      source: (s.source as any) || 'manual',
      isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
      was_planned: s.was_planned === true,
      inclusion_reason: s.inclusion_reason ?? null, threshold: s.threshold ?? null, score: s.score ?? null,
      row_id: s.id,
    }))
    const savedIds = new Set(restored.map(s => s.row_id))
    const unsaved = confirmedSongsRef.current.filter(s => !s.row_id || !savedIds.has(s.row_id))
    const merged = [...restored, ...unsaved]
    lastSavedRef.current = JSON.stringify(songRows(perf, restored))
    confirmedSongsRef.current = merged
    if (merged.length > 0) setSongs(merged)
    restoredRef.current = true
    return true
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.from('performances_visible').select('*, show_id, setlist_id, artist_id').eq('id', params.id).single()
      .then(({ data }) => {
        if (data) {
          setPerformance(data); setShowId(data.show_id || null); setSetlistId(data.setlist_id || null); setArtistId(data.artist_id || null)
          if (data.started_at) showStartRef.current = new Date(data.started_at).getTime()
          const supabase2 = createClient()
          restoreSaved(data)
          supabase2.from('planned_setlists').select('id').eq('performance_id', data.id).single()
            .then(({ data: planned }) => {
              if (!planned?.id) return
              supabase2.from('planned_setlist_songs').select('title, artist').eq('planned_setlist_id', planned.id)
                .then(({ data: pSongs }) => {
                  if (!pSongs) return
                  setPlannedCount(pSongs.length)
                  plannedSongsRef.current = pSongs.map(s => ({
                    title: s.title, artist: s.artist || '',
                    normalizedTitle: normalizeSongKey(s.title),
                  }))
                })
            })
        }
      })
  }, [params.id])

  useEffect(() => {
    if (!performance?.started_at) return
    const start = new Date(performance.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick(); const interval = setInterval(tick, 1000); return () => clearInterval(interval)
  }, [performance?.started_at])

  const handleEndRef = useRef<() => void>(() => {})

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      if (lastPingRef.current === 0 || !isListeningRef.current) { setEngineState('idle'); return }
      if (detectionLimitedRef.current) {
        // Detection is intentionally paused, so the absence of pings is not a
        // fault: the SLOW/STALLED escalation and the silence auto-close would
        // both fire as false alarms, and auto-close would end a show the
        // artist is still adding songs to by hand. The hard ceiling stays as
        // an absolute backstop.
        setEngineState('idle')
        if ((now - sessionStartRef.current) >= HARD_CEILING_MS && !endingRef.current) handleEndRef.current()
        return
      }
      const msSincePing = now - lastPingRef.current
      if (msSincePing < HEARTBEAT_SLOW_MS) setEngineState('listening')
      else if (msSincePing < HEARTBEAT_STALL_MS) setEngineState('slow')
      else setEngineState('stalled')
      // Both limits count from this listening session: a song confirmed
      // yesterday (restored with the show) or a start time hours ago must not
      // end a show the artist has just resumed.
      const msSinceSong = now - Math.max(lastSongRef.current, sessionStartRef.current)
      if (lastSongRef.current > 0 && msSinceSong >= SILENCE_WARNING_MS && !endingRef.current) setShowSilenceWarning(true)
      if (lastSongRef.current > 0 && msSinceSong >= AUTO_CLOSE_SILENCE_MS && !endingRef.current) handleEndRef.current()
      if ((now - sessionStartRef.current) >= HARD_CEILING_MS && !endingRef.current) handleEndRef.current()
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // ── Session health tick ──
  // Separate from the engineState heartbeat above, which works on 3/5-minute
  // horizons.
  //
  // This LATCHES: once we've gone quiet past the window it stays flagged until
  // the artist explicitly resumes. It must not clear itself, because a fetch
  // already in flight when capture broke will resolve afterwards and stamp
  // lastAcrResponseRef — a straggler answer from before the break, which would
  // otherwise clear the warning while the recording loop is still dead.
  // Only startListening() clears it, so the green state always means "capture
  // has been restarted", never "a late response arrived".
  useEffect(() => {
    const interval = setInterval(() => {
      const stale = isListeningRef.current
        && !detectionLimitedRef.current
        && lastAcrResponseRef.current > 0
        && (Date.now() - lastAcrResponseRef.current) > CAPTURE_HEALTH_WINDOW_MS
      if (stale) { if (!staleSinceRef.current) staleSinceRef.current = Date.now(); setCaptureStale(true) }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { return () => stopListening() }, [])

  useEffect(() => {
    const confirmedCount = songs.filter(s => s.source !== 'planned' && s.source !== 'unidentified').length
    if (prevConfirmedCountRef.current === -1) {
      prevConfirmedCountRef.current = confirmedCount
      return
    }
    const didIncrease = confirmedCount > prevConfirmedCountRef.current
    prevConfirmedCountRef.current = confirmedCount
    if (!didIncrease) return
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return
    setConfirmRing(true)
    const t = setTimeout(() => setConfirmRing(false), 650)
    return () => clearTimeout(t)
  }, [songs])

  const fetchRecentSongs = useCallback(() => {
    const exclude = confirmedSongsRef.current
      .filter(s => s.source !== 'unidentified' && s.source !== 'planned')
      .map(s => encodeURIComponent(s.title)).join(',')
    fetch(exclude ? `/api/recent-songs?exclude=${exclude}` : '/api/recent-songs')
      .then(r => r.json()).then(data => { if (data.songs) setRecentSongs(data.songs.slice(0, 8)) }).catch(() => {})
  }, [])

  useEffect(() => { fetchRecentSongs() }, [fetchRecentSongs])

  function dismissPlacementCard() {
    if (placementTimerRef.current) clearTimeout(placementTimerRef.current)
    setShowPlacementCard(false)
  }

  function startEdit(index: number) {
    if (deletePendingTimerRef.current) clearTimeout(deletePendingTimerRef.current)
    setDeletePending(null)
    setEditingIndex(index); setEditTitle(songs[index].title); setEditArtist(songs[index].artist)
  }
  function saveEdit() {
    if (editingIndex === null || !editTitle.trim()) return
    setSongs(prev => prev.map((s, i) => i === editingIndex
      ? { ...s, title: editTitle.trim(), artist: editArtist.trim() || s.artist, source: (s.source === 'unidentified' || s.source === 'planned') ? 'manual' : s.source }
      : s))
    setEditingIndex(null)
  }
  function cancelEdit() { setEditingIndex(null) }

  function handleDeleteTap(e: React.MouseEvent | React.TouchEvent, realIdx: number) {
    e.stopPropagation()
    if (deletePending === realIdx) {
      if (deletePendingTimerRef.current) clearTimeout(deletePendingTimerRef.current)
      setDeletePending(null); deleteSong(realIdx)
    } else {
      if (deletePendingTimerRef.current) clearTimeout(deletePendingTimerRef.current)
      setDeletePending(realIdx)
      deletePendingTimerRef.current = setTimeout(() => setDeletePending(null), 2500)
    }
  }

  function deleteSong(index: number) { setSongs(prev => prev.filter((_, i) => i !== index)) }

  function markPlannedAsPlayed(realIdx: number) {
    const song = songs[realIdx]
    setSongs(prev => prev.map((s, i) => i === realIdx ? { ...s, source: 'manual', was_planned: true, confirmedAt: Date.now() } : s))
    setLastCaught(song.title); setCatchFlash(true)
    const now = Date.now()
    lastSongRef.current = now; setLastSongAt(now); setShowSilenceWarning(false)
    setTimeout(() => setCatchFlash(false), 1200)
    setTimeout(() => setLastCaught(null), 4000)
  }

  const confirmCandidate = useCallback((candidate: PendingCandidate, setlist_item_id?: string, enriched?: { isrc?: string; composer?: string; publisher?: string; inclusion_reason?: string | null; threshold?: number | null; score?: number | null }) => {
    const normalizedIncoming = normalizeSongKey(candidate.title)
    const plannedMatch = plannedSongsRef.current.find(p => p.normalizedTitle === normalizedIncoming)
    if (plannedMatch) {
      setSongs(prev => {
        const existingIdx = prev.findIndex(s => normalizeSongKey(s.title) === plannedMatch.normalizedTitle)
        if (existingIdx !== -1) {
          return prev.map((s, i) => i === existingIdx
            ? { ...s, source: candidate.source, confidence_level: candidate.confidence_level, was_planned: true, confirmedAt: Date.now(), isrc: enriched?.isrc || s.isrc || '', composer: enriched?.composer || s.composer || '', publisher: enriched?.publisher || s.publisher || '', inclusion_reason: enriched?.inclusion_reason ?? s.inclusion_reason ?? null, threshold: enriched?.threshold ?? s.threshold ?? null, score: enriched?.score ?? s.score ?? null }
            : s)
        }
        return [...prev, { title: plannedMatch.title, artist: plannedMatch.artist || candidate.artist, source: candidate.source, setlist_item_id, confidence_level: candidate.confidence_level, was_planned: true, confirmedAt: Date.now(), isrc: enriched?.isrc || '', composer: enriched?.composer || '', publisher: enriched?.publisher || '', inclusion_reason: enriched?.inclusion_reason ?? null, threshold: enriched?.threshold ?? null, score: enriched?.score ?? null }]
      })
    } else {
      setSongs(prev => [...prev, { title: candidate.title, artist: candidate.artist, source: candidate.source, setlist_item_id, confidence_level: candidate.confidence_level, was_planned: false, confirmedAt: Date.now(), isrc: enriched?.isrc || '', composer: enriched?.composer || '', publisher: enriched?.publisher || '', inclusion_reason: enriched?.inclusion_reason ?? null, threshold: enriched?.threshold ?? null, score: enriched?.score ?? null }])
    }
    const now = Date.now()
    lastConfirmedAtRef.current = now; lastSongRef.current = now; setLastSongAt(now); setShowSilenceWarning(false)
    setPendingCandidate(null); setCatchFlash(true); setLastCaught(candidate.title)
    setTimeout(() => setCatchFlash(false), 1200); setTimeout(() => setLastCaught(null), 4000); setDetectStatus('')
    if (candidate.confidence_level === 'suggest' || candidate.source === 'manual') {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => { if (user && params.id) writeUserSong(supabase, candidate.title, candidate.artist || '', actingAsArtistId || user.id, params.id) })
    }
  }, [params.id, actingAsArtistId])

  const confirmPending = useCallback(() => { if (!pendingCandidateRef.current) return; confirmCandidate(pendingCandidateRef.current) }, [confirmCandidate])
  const dismissPending = useCallback(() => { setPendingCandidate(null); setDetectStatus('') }, [])

  // Stop sending paid calls without tearing the session down. The interval is
  // cleared and detectSong short-circuits, but isListening stays true so the
  // timer, manual add, and End Show all keep working — the artist can still
  // save the night by hand.
  const pauseDetectionForLimit = useCallback(() => {
    if (detectionLimitedRef.current) return
    detectionLimitedRef.current = true
    setDetectionLimited(true)
    if (listenIntervalRef.current) { clearInterval(listenIntervalRef.current); listenIntervalRef.current = null }
    setDetectStatus('')
  }, [])

  // recordedFrom: when this sample started recording. Audio recorded after End
  // started is never sent (recording stops at End, so this is a backstop).
  // Every check is tracked so End can wait for it.
  const detectSong = useCallback((audioBlob: Blob, recordedFrom: number): Promise<void> => {
    if (endStartedAtRef.current && recordedFrom >= endStartedAtRef.current) return Promise.resolve()
    const run = detectSongNow(audioBlob)
    inflightRef.current.add(run)
    run.finally(() => inflightRef.current.delete(run))
    return run
  }, [params.id, showId, setlistId, artistId, performance])

  const detectSongNow = async (audioBlob: Blob) => {
    // Already over the ceiling — don't spend another request finding out again.
    if (detectionLimitedRef.current) return
    setIsDetecting(true)
    const pingTime = Date.now(); lastPingRef.current = pingTime; setEngineState('listening')
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm'); formData.append('performance_id', params.id)
      if (showId) formData.append('show_id', showId); if (setlistId) formData.append('setlist_id', setlistId); if (artistId) formData.append('artist_id', artistId)
      if (performance?.artist_name) formData.append('artist_name', performance.artist_name); if (performance?.venue_name) formData.append('venue_name', performance.venue_name)
      formData.append('show_type', (performance as any).show_type || 'single')
      formData.append('previous_songs', JSON.stringify(confirmedSongsRef.current.filter(s => s.source !== 'planned').map(s => s.title)))
      // Fresh session per call (not hoisted) — matches app/app/upload/new/page.tsx's
      // per-request session fetch, so a token refresh mid-capture is handled the
      // same way. /api/identify now requires this; see that route for why.
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: formData,
      })
      lastAcrResponseRef.current = Date.now()  // answered — capture is alive, whatever the verdict
      // The request reached Setlistr: the connection is fine again. And if it
      // was recorded after the health flag tripped, the recording loop is
      // alive too, so the flag can clear (a straggler from before can't).
      netFailsRef.current = 0; setNetProblem(false)
      if (staleSinceRef.current && pingTime > staleSinceRef.current && !micProblemRef.current) { staleSinceRef.current = 0; setCaptureStale(false) }

      // A non-2xx means the route rejected the request before ever reaching
      // a real verdict (e.g. recognition credentials not configured in this
      // environment) — surface that, don't parse its error body as if it
      // were {detected: false}.
      if (!res.ok) { setRecognitionUnavailable(true); setDetectStatus(''); return }
      setRecognitionUnavailable(false)
      const data = await res.json()

      // Daily ceiling reached. The route answered 200 with no detection, so
      // capture health stays green; we just stop asking.
      if (data?.quota_exceeded) { pauseDetectionForLimit(); return }

      // Trust the route's verdict — same as upload mode. No client-side cooldown,
      // pending card, or multi-hit gating; the route already decided.
      if (!data.detected || data.confidence_level !== 'auto') { setLastCheck('no_match'); setDetectStatus(''); return }
      setLastCheck('match')

      // Exclude planned-but-unverified rows from the dedup so a detected planned
      // song can be upgraded in place (→ confirmCandidate's planned match).
      const already = confirmedSongsRef.current
        .filter(s => s.source !== 'planned')
        .some(s => isSameSong(s, { title: data.title }))
      if (already) { setDetectStatus(''); return }

      // Answered while End is running: End adds it to the final list itself.
      if (endingRef.current) {
        endResultsRef.current.push({ title: data.title, artist: data.artist, source: data.source, setlist_item_id: data.setlist_item_id, isrc: data.isrc, composer: data.composer, publisher: data.publisher, inclusion_reason: data.inclusion_reason, threshold: data.threshold, score: data.score })
        return
      }

      const now = Date.now()
      confirmCandidate(
        { title: data.title, artist: data.artist, source: data.source, confidence_level: 'auto', firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 },
        data.setlist_item_id,
        { isrc: data.isrc, composer: data.composer, publisher: data.publisher, inclusion_reason: data.inclusion_reason, threshold: data.threshold, score: data.score }
      )
    } catch {
      // The request never got an answer: a connection problem, not "no song".
      // This sample is not retried (no stored audio in this version); the
      // next one goes out as usual.
      netFailsRef.current += 1
      if (netFailsRef.current >= NETWORK_FAILS_BEFORE_NOTICE || (typeof navigator !== 'undefined' && navigator.onLine === false)) setNetProblem(true)
      setDetectStatus('')
    } finally { setIsDetecting(false) }
  }

  // Record where the device is at the moment capture starts, and measure it
  // against the venue's stored coordinates. Fire-and-forget by design: the
  // GPS fix can take seconds, and nothing about listening for songs should
  // wait on it. A failure here leaves the columns null — never false, which
  // would read as "the artist wasn't at the venue" (see lib/geolocation.ts).
  const stampCaptureLocation = useCallback(() => {
    if (locationStampedRef.current) return
    const perf = performanceRef.current
    if (!perf) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    locationStampedRef.current = true
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const device = toCoords(pos.coords.latitude, pos.coords.longitude)
        if (!device) return
        const venue = toCoords(perf.venue_latitude, perf.venue_longitude)
        const { distanceKm, verified } = evaluateGeolocation(venue, device)
        try {
          await createClient().from('performances').update({
            latitude: device.lat,
            longitude: device.lng,
            location_distance_from_venue: distanceKm,
            location_verified: verified,
          }).eq('id', perf.id)
        } catch (err) { console.error('[CaptureLocation]', err) }
      },
      () => {
        // Denied, timed out, or unavailable. Clear the guard so an explicit
        // restart can retry — a denial is remembered by the browser, so this
        // re-prompts no one, but it does recover a GPS fix that was merely slow.
        locationStampedRef.current = false
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }, [])

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream; setIsListening(true); setMicProblem(null)
      sessionStartRef.current = Date.now()
      // The system can take the microphone mid-show (a call, another app).
      // Say so directly instead of waiting for the health window to notice.
      stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => {
        if (streamRef.current === stream && !endingRef.current) { setMicProblem('interrupted'); setCaptureStale(true) }
      }))
      if (!captureStartedLoggedRef.current && performanceRef.current) {
        captureStartedLoggedRef.current = true
        logProductEvent(createClient(), {
          event_name: 'capture_started', user_id: performanceRef.current.user_id, performance_id: params.id,
          show_id: showId, flow_source: 'live', actor_type: actingAsArtistId ? 'delegate' : 'owner',
          song_count_planned: plannedCount,
        })
      }
      const pingTime = Date.now(); lastPingRef.current = pingTime; setEngineState('listening')
      // Grace period: the first real response is ~14s out, so seed the health
      // clock on start/resume instead of instantly reading as interrupted.
      lastAcrResponseRef.current = pingTime; setCaptureStale(false); staleSinceRef.current = 0
      try { if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen') } catch {}
      if (!placementShownRef.current) {
        placementShownRef.current = true; setShowPlacementCard(true)
        placementTimerRef.current = setTimeout(() => setShowPlacementCard(false), 8000)
      }
      const recordAndDetect = () => {
        // Nothing new is recorded once End has started.
        if (isDetecting || endingRef.current) return; chunksRef.current = []
        const recordedFrom = Date.now()
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
        const recorder = new MediaRecorder(stream, { mimeType }); mediaRecorderRef.current = recorder
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        recorder.onstop = () => detectSong(new Blob(chunksRef.current, { type: mimeType }), recordedFrom)
        recorder.start(); setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 14000)
      }
      recordAndDetect(); listenIntervalRef.current = setInterval(recordAndDetect, 20000)
    } catch (err) {
      // Denied (now or earlier, remembered by the system) versus no usable
      // microphone. Either way nothing is recording, and the artist is told.
      const name = (err as { name?: string } | null)?.name
      setMicProblem(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable')
      setIsListening(false)
    } finally {
      // In `finally`, not the try body: a denied microphone must not also cost
      // the artist their location evidence. Running here keeps the mic prompt
      // first (getUserMedia is awaited above) while still asking for location
      // when that prompt is refused.
      stampCaptureLocation()
    }
  }, [detectSong, isDetecting, stampCaptureLocation])

  const stopListening = useCallback(() => {
    if (listenIntervalRef.current) { clearInterval(listenIntervalRef.current); listenIntervalRef.current = null }
    // Stopping mid-sample hands the audio recorded so far to its song check
    // (onstop). finalChunkRef lets End wait until that check has started.
    const rec = mediaRecorderRef.current
    if (rec?.state === 'recording') {
      finalChunkRef.current = new Promise<void>(res => rec.addEventListener('stop', () => setTimeout(res, 0), { once: true }))
      rec.stop()
    } else finalChunkRef.current = null
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setIsListening(false); setEngineState('idle'); setDetectStatus('')
    if (wakeLockRef.current) { try { wakeLockRef.current.release() } catch {}; wakeLockRef.current = null }
  }, [])

  const restartListening = useCallback(async () => {
    setRestarting(true); stopListening()
    await new Promise(r => setTimeout(r, 400))
    await startListening(); setRestarting(false)
  }, [stopListening, startListening])

  // Auto-start when navigating from setup screen with ?autostart=1.
  // Fires once per mount only (autoStartFiredRef). Uses isListeningRef to
  // avoid re-triggering; reads the URL directly to stay off the render cycle.
  useEffect(() => {
    if (!performance) return
    if (autoStartFiredRef.current) return
    if (isListeningRef.current) return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('autostart') !== '1') return
    autoStartFiredRef.current = true
    startListening()
  }, [performance, startListening])

  // The rows the in-progress save writes: the same songs, order and fields End
  // writes (End still rewrites them with its final labels).
  function songRows(perf: Performance, list: DetectedSong[]) {
    return list
      .filter(s => !(s.source === 'unidentified' && s.title === 'Unknown Song') && s.row_id)
      .map((song, i) => ({
        id: song.row_id as string,
        performance_id: perf.id,
        title: song.title,
        artist: song.artist || perf.artist_name || null,
        position: i + 1, isrc: song.isrc || null, composer: song.composer || null,
        publisher: song.publisher || null, source: song.source || 'manual',
        was_planned: song.was_planned || false,
        inclusion_reason: song.inclusion_reason ?? null, threshold: song.threshold ?? null, score: song.score ?? null,
        confusion_matrix_result: 'TBD',
      }))
  }

  // Give every new song (recognised, added, picked from recent) its row id.
  useEffect(() => {
    if (!songs.some(s => !s.row_id)) return
    setSongs(prev => prev.map(s => s.row_id ? s : { ...s, row_id: crypto.randomUUID() }))
  }, [songs])

  // Save the list while the show is live: upsert by row id, then remove rows
  // the artist deleted. Never before the saved list has loaded, never once
  // End has started (End writes the final rows), never for a show that isn't
  // live. A failure is shown quietly and retried on its own (after
  // SAVE_RETRY_MS, or as soon as the device is back online), as well as on
  // the next change and by End.
  useEffect(() => {
    const perf = performance
    if (!perf || perf.status !== 'live' || !restoredRef.current || endingRef.current) return
    if (songs.some(s => !s.row_id)) return
    const rows = songRows(perf, songs)
    const key = JSON.stringify(rows)
    if (key === lastSavedRef.current) return
    lastSavedRef.current = key
    const failed = () => {
      if (lastSavedRef.current === key) lastSavedRef.current = ''
      setSaveProblem(true)
      if (saveRetryTimerRef.current) clearTimeout(saveRetryTimerRef.current)
      saveRetryTimerRef.current = setTimeout(() => setSaveRetryTick(t => t + 1), SAVE_RETRY_MS)
    }
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (endingRef.current) return
      const supabase = createClient()
      if (rows.length > 0) {
        const { error } = await supabase.from('performance_songs').upsert(rows, { onConflict: 'id' })
        if (error) { failed(); return }
      }
      if (endingRef.current) return
      let del = supabase.from('performance_songs').delete().eq('performance_id', perf.id)
      if (rows.length > 0) del = del.not('id', 'in', `(${rows.map(r => r.id).join(',')})`)
      const { error } = await del
      if (error) { failed(); return }
      if (lastSavedRef.current === key) setSaveProblem(false)
    }).catch(() => failed())
  }, [songs, performance, saveRetryTick])

  // Connection changes: going offline is said at once; coming back retries
  // any save that failed (the recognition notice clears on the next answer).
  useEffect(() => {
    const onOffline = () => setNetProblem(true)
    const onOnline = () => setSaveRetryTick(t => t + 1)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      if (saveRetryTimerRef.current) clearTimeout(saveRetryTimerRef.current)
    }
  }, [])

  // End: finalise through lib/live-finalize.ts, which keeps the show live
  // (and every saved song) until the saved list is verified against this
  // one, and only then marks it finished. Safe to tap twice or retry: one
  // attempt runs at a time (endingRef), the in-progress save is drained and
  // held off first, and a show someone already finished is never rewritten.
  // On any failure the artist stays here with their songs and a Try again.
  const handleEnd = useCallback(async () => {
    if (endingRef.current || !performance) return
    endingRef.current = true; endStartedAtRef.current = Date.now()
    setEnding(true); setEndFailed(false); setEndPhase('checks'); stopListening()
    // Also nudges the in-progress save, so songs given a row id just now are
    // saved even if the artist leaves without retrying. Recording can resume
    // after a failed End, so its start mark is cleared.
    const fail = () => { endingRef.current = false; endStartedAtRef.current = 0; setEnding(false); setEndPhase(null); setEndFailed(true); setSaveRetryTick(t => t + 1) }
    try {
      // Song checks of audio recorded before End: let the last partial sample
      // start its check, then wait (bounded) for every check still running.
      // Their answers are collected in endResultsRef and merged below.
      if (finalChunkRef.current) await awaitWithTimeout(finalChunkRef.current, 2000)
      const pendingChecks = Array.from(inflightRef.current)
      if (pendingChecks.length > 0) await awaitWithTimeout(Promise.allSettled(pendingChecks).then(() => {}), END_CHECK_WAIT_MS)
      setEndPhase('saving')
      // Let an in-progress save finish first, so End's writes are the last.
      await saveChainRef.current
      // Never finalise from a list whose saved songs didn't load: try the read
      // again (keeping anything added since), and stop here if it still fails.
      if (!restoredRef.current && !(await restoreSaved(performance))) return fail()
      const supabase = createClient()
      const endedAt = new Date()
      const startedMs = performance.started_at ? new Date(performance.started_at).getTime() : null
      // A show resumed long after it started (or one left running past the
      // automatic limit) has no trustworthy length: leave it unset rather
      // than record the hours it sat unfinished.
      const durationMinutes = startedMs !== null && endedAt.getTime() - startedMs <= HARD_CEILING_MS
        ? Math.round((endedAt.getTime() - startedMs) / 60000) : null

      // Every song keeps the row id it was saved under; one that hasn't got
      // one yet gets it now, kept on screen so a retry writes the same rows.
      const onScreen = confirmedSongsRef.current
      const current = mergeEndResults(onScreen, endResultsRef.current, plannedSongsRef.current)
      endResultsRef.current = []
      const withIds = current.map(s => s.row_id ? s : { ...s, row_id: crypto.randomUUID() })
      if (withIds.length !== onScreen.length || withIds.some((s, i) => s !== onScreen[i])) { confirmedSongsRef.current = withIds; setSongs(withIds) }

      // Which titles did ACR actually detect this show? Used to label manual mid-show
      // adds: if ACR also caught a manual add it's a TP, otherwise it's an FN.
      // If this read fails, songs keep the labels they already had.
      const { data: detEvents, error: detError } = await supabase.from('detection_events')
        .select('final_title, auto_confirmed, candidate_pool').eq('performance_id', performance.id)
      const detectedMap = new Map<string, { inclusion_reason: string | null; threshold: number | null; score: number | null }>()
      for (const e of detEvents || []) {
        if (!e.final_title) continue
        const key  = normalizeSongKey(e.final_title)
        const pool = Array.isArray(e.candidate_pool) ? e.candidate_pool[0] : null
        const info = { inclusion_reason: pool?.inclusion_reason ?? null, threshold: pool?.threshold ?? null, score: pool?.score ?? null }
        if (!detectedMap.has(key) || e.auto_confirmed) detectedMap.set(key, info)
      }

      // Save all songs — planned (unverified) included so artist can confirm on review
      const songsToSave = withIds.filter(s => !(s.source === 'unidentified' && s.title === 'Unknown Song'))
      const rows: FinalSongRow[] = songsToSave.map((song, i) => {
        const cleanedTitle = song.source === 'unidentified' ? (song.title === 'Unknown Song' ? null : song.title) : song.title

        // ── Confusion-matrix label for this row ────────────────────────────────
        let inclusion_reason: string | null = song.inclusion_reason ?? null
        let threshold: number | null        = song.threshold ?? null
        let score: number | null            = song.score ?? null

        if (song.source === 'planned') {
          // On the plan but never detected
          inclusion_reason = 'planned setlist - not detected'; threshold = null; score = null
        } else if (song.source === 'manual' && !song.was_planned && !detError) {
          // Manual mid-show add: did ACR independently catch it?
          const det = detectedMap.get(normalizeSongKey(song.title))
          if (det) { inclusion_reason = 'added mid-show - detected'; threshold = det.threshold; score = det.score }
          else      { inclusion_reason = 'added mid-show - not detected'; threshold = null; score = null }
        }

        return {
          id: song.row_id as string,
          performance_id: performance.id,
          title: cleanedTitle,
          artist: song.artist || performance.artist_name || null,
          position: i + 1, isrc: song.isrc || null, composer: song.composer || null,
          publisher: song.publisher || null, source: song.source || 'manual',
          was_planned: song.was_planned || false,
          // Confusion result is left undetermined until the artist reviews & saves.
          inclusion_reason, threshold, score, confusion_matrix_result: 'TBD',
        }
      })

      const result = await finalizeLiveCapture(supabase, {
        performanceId: performance.id, rows, endedAt: endedAt.toISOString(), durationMinutes,
      })
      if (!result.ok) return fail()

      // Follow-on records, only from the attempt that finished the show. None
      // of them holds songs: a failure here can't lose the setlist, and
      // nothing is repeated on a later tap.
      if (result.transitioned) {
        try {
          const captureEndedLogged = logProductEvent(supabase, {
            event_name: 'capture_ended', user_id: performance.user_id, performance_id: performance.id,
            show_id: showId, flow_source: 'live', actor_type: actingAsArtistId ? 'delegate' : 'owner',
            song_count_current: withIds.filter(s => s.source !== 'planned' && s.source !== 'unidentified').length,
            song_count_planned: plannedCount,
            occurred_at: endedAt.toISOString(),
          })
          if (showId) await supabase.from('shows').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', showId)
          await supabase.from('capture_sessions').update({ ended_at: new Date().toISOString(), status: 'ended' }).eq('performance_id', performance.id)
          if (setlistId) {
            const manualSongs = withIds.filter(s => s.source === 'manual' && !s.was_planned)
            if (manualSongs.length > 0) {
              const { data: existingItems } = await supabase.from('setlist_items').select('position').eq('setlist_id', setlistId).order('position', { ascending: false }).limit(1)
              const startPosition = (existingItems?.[0]?.position || 0) + 1
              await supabase.from('setlist_items').insert(manualSongs.map((song, i) => ({ setlist_id: setlistId, title: song.title, artist_name: song.artist || performance.artist_name, position: startPosition + i, source: 'manual' })))
            }
            await supabase.from('setlists').update({ status: 'review', updated_at: new Date().toISOString() }).eq('id', setlistId)
          }
          await awaitWithTimeout(captureEndedLogged)
        } catch { /* the show is finished and its songs saved; these are extras */ }
      }
      router.push(`/app/review/${performance.id}?source=live`)
    } catch {
      // A thrown error (dropped connection mid-request) is the same as a
      // refused write: the show is still live with its saved songs.
      fail()
    }
  }, [performance, songs, router, stopListening, showId, setlistId])

  useEffect(() => { handleEndRef.current = handleEnd }, [handleEnd])

  async function addSong() {
    const trimmed = songInput.trim(); if (!trimmed) return
    setSongs(s => [...s, { title: trimmed, artist: performance?.artist_name || '', source: 'manual', was_planned: false }]); setSongInput('')
  }

  // h:mm:ss once past an hour (a two-hour set read "120:00" before).
  function formatTime(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
  }

  if (!performance) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite', opacity: 0.6 }} />
        <span style={{ color: C.muted, fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Getting ready...</span>
      </div>
      <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.9} }`}</style>
    </div>
  )

  const confirmedSongs = songs.filter(s => s.source !== 'planned' && s.source !== 'unidentified')
  const waitingSongs   = songs.filter(s => s.source === 'planned')
  const unknownSongs   = songs.filter(s => s.source === 'unidentified')
  const verifiedCount  = songs.filter(s => s.was_planned && s.source !== 'planned').length
  // Started longer ago than any capture runs (the Dashboard's live window):
  // interrupted and never ended. The running clock means nothing then.
  const isOldShow  = !!performance.started_at && elapsed * 1000 >= LOOK_BACK_MS
  const showUnfinishedNotice = isOldShow && !isListening && !ending && !endFailed
  const savedCount = songs.filter(s => !(s.source === 'unidentified' && s.title === 'Unknown Song')).length

  const ringState   = catchFlash ? 'catch' : isDetecting ? 'detect' : isListening ? 'listen' : 'idle'
  // captureStale (the 45s latched health flag) trips well before engineState
  // reaches 'stalled' at 5 min, so it must win over engineState here.
  const ringMode    = captureStale ? 'alarm'
    : engineState === 'stalled' ? 'alarm'
    : engineState === 'slow' ? 'weak'
    : 'healthy'
  const engineDot   = engineState === 'listening' ? C.green : engineState === 'slow' ? C.amber : engineState === 'stalled' ? 'var(--sl-danger)' : C.muted
  const engineLabel = engineState === 'listening' ? 'ON' : engineState === 'slow' ? 'SLOW' : engineState === 'stalled' ? 'STALLED' : 'IDLE'

  function renderTrustSignal() {
    if (lastCaught) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, animation: 'trustPop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, color: C.gold }}>✦</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{lastCaught}</span>
          </div>
          <span style={{ fontSize: 11, color: C.green, fontWeight: 600, letterSpacing: '0.06em' }}>captured</span>
        </div>
      )
    }
    if (engineState === 'stalled' && isListening) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'fadeIn 0.2s ease' }}>
          <span style={{ fontSize: 13, color: 'var(--sl-danger)', fontWeight: 600 }}>Lost the signal. Tap to reconnect.</span>
          <button onClick={restartListening} disabled={restarting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'color-mix(in srgb, var(--sl-danger) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-danger) 30%, transparent)', borderRadius: 20, color: 'var(--sl-danger)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: restarting ? 0.6 : 1, WebkitTapHighlightColor: 'transparent' }}>
            <RefreshCw size={12} style={{ animation: restarting ? 'spin 0.7s linear infinite' : 'none' }} />
            {restarting ? 'Restarting...' : 'Restart'}
          </button>
        </div>
      )
    }
    if (engineState === 'slow' && isListening) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'fadeIn 0.2s ease' }}>
          <span style={{ fontSize: 12, color: C.amber, fontWeight: 500, textAlign: 'center' as const }}>Having trouble hearing. Move closer to the speakers.</span>
          <button onClick={restartListening} disabled={restarting}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'transparent', border: `1px solid color-mix(in srgb, var(--sl-warn) 35%, transparent)`, borderRadius: 20, color: C.amber, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
            <RefreshCw size={11} style={{ animation: restarting ? 'spin 0.7s linear infinite' : 'none' }} />{restarting ? 'Restarting...' : 'Restart'}
          </button>
        </div>
      )
    }
    // Only show pending card prompt for NON-setlist songs
    if (pendingCandidate) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber, animation: 'pulse-dot 1s ease-in-out infinite' }} />
          <span style={{ fontSize: 13, color: C.secondary, fontWeight: 500 }}>Picking something up...</span>
        </div>
      )
    }
    if (lastSongAt > 0 && isListening) return <span style={{ fontSize: 11, color: 'var(--sl-text-4)' }}>Last song {timeAgo(lastSongAt)}</span>
    if (isDetecting) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {[0,1,2].map(i => <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: C.gold, opacity: 0.7, animation: `dot-bounce 1s ${i * 0.2}s ease-in-out infinite` }} />)}
          </div>
          <span style={{ fontSize: 12, color: C.muted }}>Scanning...</span>
        </div>
      )
    }
    if (isListening) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, animation: 'pulse-dot 1.6s ease-in-out infinite', boxShadow: '0 0 6px color-mix(in srgb, var(--sl-ok) 38%, transparent)' }} />
          <span style={{ fontSize: 12, color: 'var(--sl-text-3)', animation: 'breathe-text 3s ease-in-out infinite' }}>Listening...</span>
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: '"DM Sans", system-ui, sans-serif', overflowX: 'clip', overscrollBehavior: 'none', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
      {/* Inert strip over the top safe-area inset (0px outside the installed app): scrolled content passes under it, not under the status bar. */}
      <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'env(safe-area-inset-top, 0px)', background: C.bg, zIndex: 20, pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '70vh', background: isListening ? `radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--sl-accent) 8%, transparent) 0%, transparent 65%)` : `radial-gradient(ellipse at 50% 35%, color-mix(in srgb, var(--sl-accent) 3%, transparent) 0%, transparent 55%)`, pointerEvents: 'none', transition: 'background 1.8s ease', zIndex: 0 }} />

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 10, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid color-mix(in srgb, var(--sl-text) 5%, transparent)', flexShrink: 0 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, letterSpacing: '-0.01em' }}>{performance.venue_name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: engineDot, animation: engineState === 'listening' ? 'pulse-dot 1.4s ease-in-out infinite' : 'none', boxShadow: engineState === 'listening' ? `0 0 5px color-mix(in srgb, ${engineDot} 50%, transparent)` : 'none', transition: 'background 0.5s ease' }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: engineDot, transition: 'color 0.5s ease' }}>{engineLabel}</span>
          </div>
          {confirmedSongs.length > 0 && (
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 15, fontWeight: 800, color: C.gold, letterSpacing: '-0.01em', animation: 'fadeIn 0.3s ease' }}>{confirmedSongs.length}</span>
          )}
          {isOldShow
            ? <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{`Started ${startedText(performance.started_at as string)}`}</span>
            : <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 18, fontWeight: 700, color: C.muted, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>}
        </div>
      </div>

      {/* Progress bar */}
      {plannedCount > 0 && isListening && (
        <div style={{ position: 'relative', zIndex: 10, background: 'color-mix(in srgb, var(--sl-text) 2%, transparent)', borderBottom: `1px solid ${C.border}`, padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, height: 3, background: 'color-mix(in srgb, var(--sl-text) 6%, transparent)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: C.green, borderRadius: 2, width: `${Math.min((verifiedCount / plannedCount) * 100, 100)}%`, transition: 'width 0.6s ease' }} />
          </div>
          <span style={{ fontSize: 11, color: C.green, fontWeight: 700, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{verifiedCount}/{plannedCount}</span>
          <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>confirmed</span>
        </div>
      )}

      {/* Unfinished show: reopened long after it started. Nothing is removed;
          the artist finishes it (songs go to Review) or keeps capturing. */}
      {showUnfinishedNotice && (
        <div role="status" style={{ position: 'relative', zIndex: 10, background: C.amberDim, borderBottom: `1px solid color-mix(in srgb, var(--sl-warn) 28%, transparent)`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, animation: 'slideDown 0.2s ease' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 3px' }}>This show wasn’t finished</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.45 }}>
              {`Started ${startedText(performance.started_at as string)}. `}
              {savedCount === 0 ? 'No songs were saved.' : savedCount === 1 ? '1 song is saved.' : `${savedCount} songs are saved.`}
              {' Finish it to review the setlist, or keep capturing if you’re still playing.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <button onClick={handleEnd} style={{ flex: '1 1 140px', minHeight: 44, padding: '0 16px', background: C.gold, border: 'none', borderRadius: 10, color: 'var(--sl-on-accent)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Finish and review</button>
            <button onClick={startListening} style={{ flex: '1 1 140px', minHeight: 44, padding: '0 16px', background: 'transparent', border: `1px solid color-mix(in srgb, var(--sl-accent) 35%, transparent)`, borderRadius: 10, color: C.gold, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Keep capturing</button>
          </div>
        </div>
      )}

      {/* Silence warning */}
      {showSilenceWarning && !ending && (
        <div style={{ position: 'relative', zIndex: 10, background: 'color-mix(in srgb, var(--sl-accent) 8%, transparent)', borderBottom: `1px solid color-mix(in srgb, var(--sl-accent) 20%, transparent)`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0, animation: 'slideDown 0.2s ease' }}>
          <p style={{ fontSize: 12, color: C.gold, margin: 0 }}>Quiet for a while. Still playing?</p>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => { setShowSilenceWarning(false); lastSongRef.current = Date.now() }} style={{ padding: '6px 12px', background: 'color-mix(in srgb, var(--sl-accent) 8%, transparent)', border: `1px solid color-mix(in srgb, var(--sl-accent) 30%, transparent)`, borderRadius: 8, color: C.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>Keep Going</button>
            <button onClick={handleEnd} style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>End Now</button>
          </div>
        </div>
      )}

      {/* Hero */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px 28px', flexShrink: 0 }}>
        {(isListening || catchFlash) && (
          <>
            {[{ size: ringState === 'catch' ? 220 : 200, delay: '0s' }, { size: ringState === 'catch' ? 262 : 242, delay: '0.1s' }, { size: ringState === 'catch' ? 304 : 284, delay: '0.2s' }].map(({ size, delay }, idx) => {
              const ringColor = ringState === 'catch' ? C.gold
                : ringMode === 'alarm' ? 'var(--sl-danger)'
                : ringMode === 'weak' ? 'var(--sl-warn)'
                : C.gold
              const ringAnim = ringState === 'catch' ? `ring-catch 0.85s ${delay} ease-out forwards`
                : ringMode === 'alarm' ? `ring-alarm 2s ${delay} ease-out infinite`
                : ringMode === 'weak' ? `ring-pulse-weak 4s ${delay} ease-out infinite`
                : `ring-pulse 2.6s ${delay} ease-out infinite`
              return (
                <div key={idx} style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', border: `1px solid color-mix(in srgb, ${ringColor} ${ringState === 'catch' ? (idx === 0 ? 80 : idx === 1 ? 37.6 : 15.7) : (idx === 0 ? 15.7 : idx === 1 ? 7.8 : 3.1)}%, transparent)`, animation: ringAnim, top: 40, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
              )
            })}
          </>
        )}
        {confirmRing && (
          <div style={{ position: 'absolute', width: 230, height: 230, borderRadius: '50%', border: '1.5px solid color-mix(in srgb, var(--sl-gold) 80%, transparent)', top: 40, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', animation: 'ring-confirm 600ms ease-out forwards' }} />
        )}
        <button onClick={isListening ? stopListening : startListening} disabled={isDetecting && !isListening}
          style={{ width: 160, height: 160, borderRadius: '50%', border: 'none', cursor: isDetecting && !isListening ? 'wait' : 'pointer', position: 'relative', zIndex: 2, opacity: 1, background: catchFlash ? 'radial-gradient(circle at 40% 35%, #e8c76a, #c9a84c 55%, #a07828)' : isListening ? 'radial-gradient(circle at 40% 35%, #c9a84ccc, #c9a84c 55%, #8a6520)' : 'var(--sl-orb-idle-bg)', boxShadow: catchFlash ? '0 0 60px #c9a84c80, 0 0 120px #c9a84c30, inset 0 1px 0 rgba(255,255,255,0.25)' : isListening ? '0 0 40px #c9a84c40, 0 0 80px #c9a84c18, inset 0 1px 0 rgba(255,255,255,0.12)' : 'var(--sl-orb-idle-shadow)', transform: catchFlash ? 'scale(1.05)' : 'scale(1)', transition: 'background 0.4s ease, box-shadow 0.4s ease, transform 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, WebkitTapHighlightColor: 'transparent', outline: 'none', touchAction: 'manipulation' }}>
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDetecting ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
                {[0,1,2,3,4].map(i => <div key={i} style={{ width: 3, borderRadius: 2, background: isListening ? '#0a0908' : 'var(--sl-orb-idle-ink)', animation: `wave-bar 0.8s ${i * 0.12}s ease-in-out infinite alternate`, height: 10 }} />)}
              </div>
            ) : (
              <svg width="28" height="32" viewBox="0 0 28 32" fill="none">
                <rect x="8" y="0" width="12" height="20" rx="6" style={{ fill: isListening ? '#0a0908' : 'var(--sl-orb-idle-ink)' }} opacity={isListening ? 1 : 0.9} />
                <path d="M4 16c0 5.523 4.477 10 10 10s10-4.477 10-10" style={{ stroke: isListening ? '#0a0908' : 'var(--sl-orb-idle-ink)' }} strokeWidth="2" strokeLinecap="round" fill="none" />
                <line x1="14" y1="26" x2="14" y2="31" style={{ stroke: isListening ? '#0a0908' : 'var(--sl-orb-idle-ink)' }} strokeWidth="2" strokeLinecap="round" />
                <line x1="10" y1="31" x2="18" y2="31" style={{ stroke: isListening ? '#0a0908' : 'var(--sl-orb-idle-ink)' }} strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: isListening ? '#0a0908' : 'var(--sl-orb-idle-ink)' }}>
            {isDetecting ? 'catching' : isListening ? 'listening' : confirmedSongs.length > 0 ? 'resume' : 'tap to start'}
          </span>
        </button>

        {detectionLimited && (
          <div style={{ marginTop: 18, width: '100%', maxWidth: 320, background: 'color-mix(in srgb, var(--sl-warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-warn) 32%, transparent)', borderRadius: 12, padding: '12px 16px', animation: 'fadeIn 0.2s ease' }}>
            <span style={{ fontSize: 13, color: C.amber, lineHeight: 1.45, fontWeight: 600 }}>{ACR_LIMIT_MESSAGE}</span>
          </div>
        )}

        {recognitionUnavailable && (
          <div style={{ marginTop: 18, width: '100%', maxWidth: 320, background: 'color-mix(in srgb, var(--sl-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-danger) 30%, transparent)', borderRadius: 12, padding: '12px 16px', animation: 'fadeIn 0.2s ease' }}>
            <span style={{ fontSize: 13, color: C.red, lineHeight: 1.45, fontWeight: 600 }}>Song recognition isn't available right now — you can still add songs manually below.</span>
          </div>
        )}

        {micProblem && micProblem !== 'interrupted' && !isListening && (
          <div role="alert" style={{ marginTop: 18, width: '100%', maxWidth: 320, background: 'color-mix(in srgb, var(--sl-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-danger) 30%, transparent)', borderRadius: 12, padding: '12px 16px', animation: 'fadeIn 0.2s ease' }}>
            <span style={{ display: 'block', fontSize: 13, color: C.red, lineHeight: 1.45, fontWeight: 600 }}>
              {micProblem === 'denied'
                ? 'Microphone access is off for Setlistr. Turn it on in Settings, then tap the mic to start.'
                : 'Couldn’t start the microphone. Tap the mic to try again.'}
            </span>
            <span style={{ display: 'block', fontSize: 12, color: C.secondary, lineHeight: 1.45, marginTop: 4 }}>You can still add songs by hand below.</span>
          </div>
        )}

        {netProblem && isListening && micProblem !== 'interrupted' && (
          <div role="status" style={{ marginTop: 18, width: '100%', maxWidth: 320, background: C.amberDim, border: '1px solid color-mix(in srgb, var(--sl-warn) 32%, transparent)', borderRadius: 12, padding: '12px 16px', animation: 'fadeIn 0.2s ease' }}>
            <span style={{ display: 'block', fontSize: 13, color: C.amber, lineHeight: 1.45, fontWeight: 600 }}>No connection right now. Songs can’t be recognised until it’s back.</span>
            <span style={{ display: 'block', fontSize: 12, color: C.secondary, lineHeight: 1.45, marginTop: 4 }}>Keep playing. Add any songs you want by hand; your list is kept.</span>
          </div>
        )}

        {/* ── Session health — is ACR still answering? ──────────────────────── */}
        {isListening && (
          <div style={{ marginTop: 18, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--sl-text-4)' }}>
              Session Health
            </span>
            {netProblem && micProblem !== 'interrupted' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber }} />
                <span style={{ fontSize: 12, color: C.amber, fontWeight: 600, letterSpacing: '0.04em' }}>Waiting for a connection</span>
              </div>
            ) : captureStale ? (
              <button onClick={restartListening} disabled={restarting}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '11px 16px', background: 'color-mix(in srgb, var(--sl-danger) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-danger) 30%, transparent)', borderRadius: 20, color: 'var(--sl-danger)', fontSize: 12, fontWeight: 700, cursor: restarting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: restarting ? 0.6 : 1, WebkitTapHighlightColor: 'transparent', textAlign: 'center' as const, animation: 'fadeIn 0.2s ease' }}>
                <RefreshCw size={12} style={{ flexShrink: 0, animation: restarting ? 'spin 0.7s linear infinite' : 'none' }} />
                {restarting ? 'Resuming...' : micProblem === 'interrupted' ? 'Microphone stopped — Tap to Resume' : 'Recording Interrupted — Click to Resume'}
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, boxShadow: '0 0 5px color-mix(in srgb, var(--sl-ok) 50%, transparent)' }} />
                <span style={{ fontSize: 12, color: C.green, fontWeight: 600, letterSpacing: '0.04em' }}>Capture Stable</span>
              </div>
            )}
            {/* An answered sample with no song in it is normal between songs —
                said quietly, so it isn't mistaken for a fault. */}
            {!captureStale && !netProblem && lastCheck === 'no_match' && (
              <span style={{ fontSize: 11, color: 'var(--sl-text-4)' }}>Last sample: no song recognised</span>
            )}
          </div>
        )}

        <div style={{ marginTop: 22, minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {renderTrustSignal()}
        </div>

        {showPlacementCard && (
          <div style={{ marginTop: 8, maxWidth: 300, width: '100%', background: 'color-mix(in srgb, var(--sl-text) 3%, transparent)', border: `1px solid color-mix(in srgb, var(--sl-text) 9%, transparent)`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp 0.3s ease' }}>
            <span style={{ fontSize: 14, color: C.secondary, lineHeight: 1.4, flex: 1 }}>For best results, set your phone near the PA or monitor.</span>
            <button onClick={dismissPlacementCard} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', WebkitTapHighlightColor: 'transparent' }}><X size={13} /></button>
          </div>
        )}
      </div>

      {/* Pending card — only for non-setlist songs */}
      {pendingCandidate && (
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '0 16px 12px', animation: 'slideUp 0.2s ease' }}>
          <div style={{ background: C.card, border: `1px solid color-mix(in srgb, var(--sl-accent) 15%, transparent)`, borderRadius: 16, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>
              Picking something up{pendingCandidate.matchCount > 1 ? ` · ${pendingCandidate.matchCount}×` : ''}
            </p>
            <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 2px', letterSpacing: '-0.01em' }}>{pendingCandidate.title}</p>
            <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 12px' }}>{pendingCandidate.artist}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmPending} style={{ flex: 1, padding: '12px', background: C.gold, border: 'none', borderRadius: 12, color: 'var(--sl-on-accent)', fontSize: 14, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>✓ {pendingCandidate.title}</button>
              <button onClick={dismissPending} style={{ padding: '12px 15px', background: 'color-mix(in srgb, var(--sl-text) 4%, transparent)', border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* Lower section */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px max(40px, calc(16px + env(safe-area-inset-bottom, 0px)))', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Confirmed */}
        {confirmedSongs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {confirmedSongs.map((song, i) => {
              const isVerified   = !!song.was_planned
              const isSuggested  = song.confidence_level === 'suggest' && !isVerified
              const realIdx      = songs.indexOf(song)
              const isPendingDel = deletePending === realIdx
              return (
                <div key={i} style={{
                  background: C.card,
                  border: `1px solid ${isPendingDel ? 'color-mix(in srgb, var(--sl-danger) 35%, transparent)' : editingIndex === realIdx ? 'color-mix(in srgb, var(--sl-accent) 45%, transparent)' : isVerified ? 'color-mix(in srgb, var(--sl-ok) 20%, transparent)' : 'color-mix(in srgb, var(--sl-text) 4%, transparent)'}`,
                  borderLeft: isVerified && !isPendingDel && editingIndex !== realIdx ? `3px solid color-mix(in srgb, var(--sl-ok) 55%, transparent)` : undefined,
                  borderRadius: 16, overflow: 'hidden',
                  animation: 'slideUp 350ms ease-out both',
                  transition: 'border-color 0.2s ease',
                }}>
                  {editingIndex === realIdx ? (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} placeholder="Song title"
                        spellCheck={false} autoCorrect="off" autoCapitalize="words"
                        style={{ background: C.input, border: '1px solid var(--sl-input-line-active)', borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <input value={editArtist} onChange={e => setEditArtist(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} placeholder="Artist"
                        spellCheck={false} autoCorrect="off" autoCapitalize="words"
                        style={{ background: C.input, border: `1px solid var(--sl-input-line)`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: C.gold, border: 'none', borderRadius: 8, color: 'var(--sl-on-accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Check size={12} strokeWidth={2.5} /> Save</button>
                        <button onClick={cancelEdit} style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', minHeight: 52 }} onClick={() => !isPendingDel && startEdit(realIdx)}>
                      <span style={{ fontSize: 11, color: 'var(--sl-text-4)', minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: isPendingDel ? 'var(--sl-danger)' : C.text, opacity: isSuggested ? 0.75 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                        {isPendingDel
                          ? <p style={{ fontSize: 11, color: 'var(--sl-danger)', margin: '2px 0 0', fontWeight: 600 }}>Tap ✕ again to delete</p>
                          : isVerified
                          ? <p style={{ fontSize: 12, color: C.green, margin: '2px 0 0', fontWeight: 600, ...(song.confirmedAt !== undefined && Date.now() - song.confirmedAt < 2500 ? { opacity: 0, animation: 'fadeIn 0.25s 350ms ease-out forwards' } : { opacity: 1 }) }}>Matched setlist ✓</p>
                          : song.artist && song.artist !== performance.artist_name
                          ? <p style={{ fontSize: 13, color: C.muted, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
                          : null
                        }
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {!isPendingDel && (
                          isVerified
                            ? <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'color-mix(in srgb, var(--sl-ok) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-ok) 30%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={10} strokeWidth={2.5} style={{ color: C.green }} />
                              </div>
                            : <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, opacity: isSuggested ? 0.3 : 0.65, display: 'inline-block' }} />
                        )}
                        <button onClick={e => handleDeleteTap(e, realIdx)}
                          style={{ background: isPendingDel ? 'color-mix(in srgb, var(--sl-danger) 15%, transparent)' : 'none', border: isPendingDel ? '1px solid color-mix(in srgb, var(--sl-danger) 35%, transparent)' : 'none', borderRadius: 6, color: isPendingDel ? 'var(--sl-danger)' : 'var(--sl-text-4)', cursor: 'pointer', padding: isPendingDel ? '4px 8px' : '4px 6px', fontSize: isPendingDel ? 11 : 14, lineHeight: 1, WebkitTapHighlightColor: 'transparent', fontWeight: isPendingDel ? 700 : 400, transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                          {isPendingDel ? '✕ Delete?' : '✕'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Waiting — on setlist, not yet heard */}
        {waitingSongs.length > 0 && (
          <div style={{ marginTop: confirmedSongs.length > 0 ? 4 : 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: C.muted, margin: '0 0 6px', paddingLeft: 2 }}>
              On your setlist
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {waitingSongs.map((song, i) => {
                const realIdx = songs.indexOf(song)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'color-mix(in srgb, var(--sl-text) 2%, transparent)', border: `1px dashed color-mix(in srgb, var(--sl-text) 9%, transparent)`, borderRadius: 10 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid color-mix(in srgb, var(--sl-text) 15%, transparent)`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'color-mix(in srgb, var(--sl-text) 20%, transparent)' }} />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--sl-text-3)', margin: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                    {isListening && (
                      <button onClick={() => markPlannedAsPlayed(realIdx)}
                        style={{ flexShrink: 0, padding: '4px 10px', background: 'transparent', border: `1px solid color-mix(in srgb, var(--sl-text) 10%, transparent)`, borderRadius: 6, color: C.muted, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', WebkitTapHighlightColor: 'transparent' }}>
                        Played
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Unknowns */}
        {unknownSongs.length > 0 && (
          <div>
            <button onClick={() => setShowUnknowns(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'color-mix(in srgb, var(--sl-text) 2%, transparent)', border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: 14, color: C.muted }}>{unknownSongs.length} moment{unknownSongs.length > 1 ? 's' : ''} we didn't catch</span>
              <span style={{ fontSize: 10, color: 'var(--sl-text-4)' }}>{showUnknowns ? '▲' : '▼'}</span>
            </button>
            {showUnknowns && (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3, animation: 'slideUp 0.15s ease' }}>
                {unknownSongs.map((song, i) => {
                  const realIdx = songs.indexOf(song)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'color-mix(in srgb, var(--sl-warn) 4%, transparent)', border: `1px solid color-mix(in srgb, var(--sl-warn) 12%, transparent)`, borderRadius: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} onClick={() => startEdit(realIdx)}>
                      <span style={{ fontSize: 12, color: C.amber, fontStyle: 'italic', flex: 1 }}>What was this one?</span>
                      <button onClick={e => handleDeleteTap(e, realIdx)} style={{ background: 'none', border: 'none', color: 'var(--sl-text-4)', cursor: 'pointer', padding: '4px', WebkitTapHighlightColor: 'transparent' }}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <button onClick={() => setShowManual(v => !v)}
          style={{ width: '100%', padding: '15px', background: showManual ? 'transparent' : 'color-mix(in srgb, var(--sl-accent) 8%, transparent)', border: `1px solid ${showManual ? C.border : 'color-mix(in srgb, var(--sl-accent) 25%, transparent)'}`, borderRadius: 12, color: showManual ? C.muted : C.gold, fontSize: 15, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 400 }}>{showManual ? '✕' : '+'}</span>
          {showManual ? 'cancel' : 'Add a song'}
        </button>

        {showManual && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'slideUp 0.15s ease' }}>
            <input value={songInput} onChange={e => setSongInput(e.target.value)} placeholder="Search or type a song title..." autoFocus
              spellCheck={false} autoCorrect="off" autoCapitalize="words"
              style={{ background: C.input, border: '1px solid var(--sl-input-line)', borderRadius: 8, padding: '12px 14px', color: C.text, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
              onKeyDown={e => { if (e.key === 'Enter' && songInput.trim()) addSong() }} />
            {songInput.trim() && <button onClick={addSong} style={{ padding: '11px', background: C.gold, border: 'none', borderRadius: 8, color: 'var(--sl-on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>Add "{songInput.trim()}"</button>}
            {recentSongs.length > 0 && !songInput.trim() && (
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Songs you know</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {recentSongs.map(s => (
                    <button key={s.id} onClick={() => { setSongs(prev => [...prev, { title: s.title, artist: s.artist || performance?.artist_name || '', source: 'manual', was_planned: false }]); setShowManual(false) }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', background: 'color-mix(in srgb, var(--sl-text) 3%, transparent)', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', WebkitTapHighlightColor: 'transparent', minHeight: 48 }}
                      onTouchStart={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--sl-accent) 10%, transparent)')} onTouchEnd={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--sl-text) 3%, transparent)')}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</p>
                        {s.artist && <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>{s.artist}</p>}
                      </div>
                      {s.play_count > 1 && <span style={{ fontSize: 11, color: C.gold, flexShrink: 0, marginLeft: 8, fontFamily: '"DM Mono", monospace' }}>×{s.play_count}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {saveProblem && !endFailed && (
          <p role="status" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.secondary, margin: '2px 2px 0', lineHeight: 1.4 }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber, flexShrink: 0 }} />
            Latest changes aren’t saved yet. Retrying automatically.
          </p>
        )}

        {endFailed ? (
          <div role="alert" style={{ background: C.amberDim, border: '1px solid color-mix(in srgb, var(--sl-warn) 32%, transparent)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 3px' }}>Couldn’t finish saving this show</p>
              <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.45 }}>Your songs are still here and nothing has been removed. Check your connection, then try again.</p>
            </div>
            <button onClick={handleEnd} style={{ minHeight: 44, padding: '0 16px', background: C.gold, border: 'none', borderRadius: 10, color: 'var(--sl-on-accent)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
          </div>
        ) : (
        <button onClick={() => { buzzLong(); handleEnd() }} disabled={ending}
          style={{ width: '100%', padding: '16px', background: 'color-mix(in srgb, var(--sl-danger) 5%, transparent)', border: `1px solid color-mix(in srgb, var(--sl-danger) 15%, transparent)`, borderRadius: 12, color: ending ? C.muted : 'var(--sl-danger)', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: ending ? 'not-allowed' : 'pointer', opacity: ending ? 0.4 : 1, transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ width: 6, height: 6, background: ending ? C.muted : C.red, borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
          {ending ? (endPhase === 'checks' ? 'Finishing the last song check…' : 'Saving…') : 'End Show'}
        </button>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes pulse-dot    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        @keyframes ring-pulse      { 0%{opacity:.5;transform:translateX(-50%) scale(.97)} 100%{opacity:0;transform:translateX(-50%) scale(1.2)} }
        @keyframes ring-pulse-weak { 0%{opacity:.5;transform:translateX(-50%) scale(.97)} 100%{opacity:0;transform:translateX(-50%) scale(1.08)} }
        @keyframes ring-scan       { 0%{opacity:.5;transform:translateX(-50%) scale(.97)} 100%{opacity:.15;transform:translateX(-50%) scale(1.2)} }
        @keyframes ring-alarm      { 0%{opacity:.4;transform:translateX(-50%) scale(.98)} 50%{opacity:.9;transform:translateX(-50%) scale(1.02)} 100%{opacity:.4;transform:translateX(-50%) scale(.98)} }
        @keyframes ring-catch   { 0%{opacity:.9;transform:translateX(-50%) scale(.93)} 100%{opacity:0;transform:translateX(-50%) scale(1.42)} }
        @keyframes ring-confirm { 0%{opacity:1;transform:translateX(-50%) scale(0.96)} 100%{opacity:0;transform:translateX(-50%) scale(1.6)} }
        @keyframes wave-bar     { from{height:4px} to{height:22px} }
        @keyframes slideUp      { from{opacity:0;transform:translateY(6px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes slideDown    { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp       { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe      { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.9} }
        @keyframes breathe-text { 0%,100%{opacity:0.85} 50%{opacity:1} }
        @keyframes dot-bounce   { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-4px);opacity:1} }
        @keyframes trustPop     { 0%{opacity:0;transform:scale(0.9) translateY(4px)} 70%{transform:scale(1.04) translateY(-1px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes spin         { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: var(--sl-text-4); }
        input:focus { border-color: var(--sl-input-line-active) !important; outline: none; }
        ::-webkit-scrollbar { display: none; }
        html, body { overscroll-behavior: none; }
      `}</style>
    </div>
  )
}
