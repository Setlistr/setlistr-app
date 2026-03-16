'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin } from 'lucide-react'
import type { Performance } from '@/types'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  input: '#0f0e0c',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
  goldDim: 'rgba(201,168,76,0.15)',
  red: '#dc2626',
}

// ─── Tuning constants ─────────────────────────────────────────────────────────
// Adjust these to change detection sensitivity
const MIN_SONG_GAP_SECONDS      = 75  // cooldown after confirming a song
const REPEAT_MATCH_CONFIRM_COUNT = 2  // how many times a candidate must match to auto-confirm
const CANDIDATE_WINDOW_SECONDS  = 60  // window in which repeat matches count

// ─── Types ────────────────────────────────────────────────────────────────────

type DetectedSong = {
  title: string
  artist: string
  source: 'detected' | 'manual'
  setlist_item_id?: string
  // For future correction tracking in review page
  detected_title?: string
  detected_artist?: string
}

// A candidate is a song that has been detected but not yet confirmed
type PendingCandidate = {
  title: string
  artist: string
  firstDetectedAt: number   // Date.now()
  lastDetectedAt: number
  matchCount: number
  source: 'detected'
  confidence?: number       // 0-1 if ACRCloud returns it
}

// Shape for detection event logging (insert to detection_events table when ready)
interface DetectionEvent {
  performance_id: string
  detected_title: string
  detected_artist: string
  detected_at: string       // ISO
  confidence?: number
  matched_confirmed: boolean
  became_candidate: boolean
  became_confirmed: boolean
  // set later if user corrects in review
  corrected_title?: string
  correction_type?: 'swap' | 'edit' | 'delete'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normalize a song key for comparison
function normalizeSongKey(title: string, artist?: string): string {
  let key = title
    .toLowerCase()
    .trim()
    .replace(/\(.*?\)/g, '')       // strip parentheses content e.g. "(live)", "(acoustic)"
    .replace(/\[.*?\]/g, '')       // strip bracket content
    .replace(/[-–—]/g, ' ')        // normalize dashes
    .replace(/[^a-z0-9 ]/g, '')   // strip punctuation
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim()

  if (artist) {
    key += '|' + artist.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '').trim()
  }

  return key
}

// Check if two detections are effectively the same song
function isSameSong(
  a: { title: string; artist?: string },
  b: { title: string; artist?: string }
): boolean {
  const keyA = normalizeSongKey(a.title, a.artist)
  const keyB = normalizeSongKey(b.title, b.artist)
  if (keyA === keyB) return true

  // Also check title-only match (artist names can vary from detector)
  const titleA = normalizeSongKey(a.title)
  const titleB = normalizeSongKey(b.title)
  return titleA === titleB
}

// Log a detection event — insert to Supabase when detection_events table exists
async function logDetectionEvent(
  event: DetectionEvent,
  _supabase: ReturnType<typeof createClient>
): Promise<void> {
  // TODO: uncomment when detection_events table is created
  // await _supabase.from('detection_events').insert(event)
  console.debug('[detection]', event)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveCapturePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [showId, setShowId]           = useState<string | null>(null)
  const [setlistId, setSetlistId]     = useState<string | null>(null)
  const [artistId, setArtistId]       = useState<string | null>(null)
  const [elapsed, setElapsed]         = useState(0)
  const [ending, setEnding]           = useState(false)
  const [songInput, setSongInput]     = useState('')
  const [songs, setSongs]             = useState<DetectedSong[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectStatus, setDetectStatus] = useState<string>('')
  const [showManual, setShowManual]   = useState(false)
  const [catchFlash, setCatchFlash]   = useState(false)
  const [lastCaught, setLastCaught]   = useState<string | null>(null)

  // Pending candidate shown in UI
  const [pendingCandidate, setPendingCandidate] = useState<PendingCandidate | null>(null)

  // Refs for detection state that doesn't need re-renders
  const mediaRecorderRef      = useRef<MediaRecorder | null>(null)
  const chunksRef             = useRef<Blob[]>([])
  const listenIntervalRef     = useRef<NodeJS.Timeout | null>(null)
  const streamRef             = useRef<MediaStream | null>(null)
  const lastConfirmedAtRef    = useRef<number>(0)       // timestamp of last confirmed song
  const pendingCandidateRef   = useRef<PendingCandidate | null>(null) // mirror of state for use in callbacks
  const confirmedSongsRef     = useRef<DetectedSong[]>([])            // mirror of songs state

  // Keep refs in sync with state
  useEffect(() => { pendingCandidateRef.current = pendingCandidate }, [pendingCandidate])
  useEffect(() => { confirmedSongsRef.current = songs }, [songs])

  // ── Load performance ──────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.from('performances')
      .select('*, show_id, setlist_id, artist_id')
      .eq('id', params.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPerformance(data)
          setShowId(data.show_id || null)
          setSetlistId(data.setlist_id || null)
          setArtistId(data.artist_id || null)
        }
      })
  }, [params.id])

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!performance?.started_at) return
    const start = new Date(performance.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [performance?.started_at])

  // ── Auto-close ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!performance) return
    const totalSeconds = (performance.set_duration_minutes + (performance.auto_close_buffer_minutes || 5)) * 60
    if (elapsed >= totalSeconds && !ending) handleEnd()
  }, [elapsed, performance, ending])

  useEffect(() => {
    return () => stopListening()
  }, [])

  // ── Confirm a candidate into the setlist ─────────────────────────────────
  const confirmCandidate = useCallback((candidate: PendingCandidate, setlist_item_id?: string) => {
    const newSong: DetectedSong = {
      title: candidate.title,
      artist: candidate.artist,
      source: 'detected',
      setlist_item_id,
      detected_title: candidate.title,
      detected_artist: candidate.artist,
    }

    setSongs(prev => [...prev, newSong])
    lastConfirmedAtRef.current = Date.now()
    setPendingCandidate(null)

    // Trigger catch animation
    setCatchFlash(true)
    setLastCaught(candidate.title)
    setTimeout(() => setCatchFlash(false), 1200)
    setTimeout(() => setLastCaught(null), 3500)
    setDetectStatus('')
  }, [])

  // ── Core detection logic ──────────────────────────────────────────────────
  const detectSong = useCallback(async (audioBlob: Blob) => {
    setIsDetecting(true)
    setDetectStatus('listening...')

    const supabase = createClient()

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('performance_id', params.id)
      if (showId) formData.append('show_id', showId)
      if (setlistId) formData.append('setlist_id', setlistId)
      if (artistId) formData.append('artist_id', artistId)

      const res  = await fetch('/api/identify', { method: 'POST', body: formData })
      const data = await res.json()

      if (!data.detected) {
        setDetectStatus('listening...')
        return
      }

      const { title, artist, setlist_item_id, confidence } = data
      const detected = { title, artist }
      const now      = Date.now()
      const secondsSinceLastConfirm = (now - lastConfirmedAtRef.current) / 1000
      const confirmed = confirmedSongsRef.current
      const candidate = pendingCandidateRef.current

      // ── 1. Check if this matches an already-confirmed song ──────────────
      const alreadyConfirmed = confirmed.some(s => isSameSong(s, detected))
      if (alreadyConfirmed) {
        setDetectStatus('already logged')
        setTimeout(() => setDetectStatus(''), 3000)

        await logDetectionEvent({
          performance_id: params.id,
          detected_title: title,
          detected_artist: artist,
          detected_at: new Date().toISOString(),
          confidence,
          matched_confirmed: true,
          became_candidate: false,
          became_confirmed: false,
        }, supabase)
        return
      }

      // ── 2. Check if this matches the current pending candidate ───────────
      if (candidate && isSameSong(candidate, detected)) {
        const updatedCandidate: PendingCandidate = {
          ...candidate,
          lastDetectedAt: now,
          matchCount: candidate.matchCount + 1,
          confidence,
        }

        const withinWindow = (now - candidate.firstDetectedAt) / 1000 <= CANDIDATE_WINDOW_SECONDS
        const enoughMatches = updatedCandidate.matchCount >= REPEAT_MATCH_CONFIRM_COUNT

        if (withinWindow && enoughMatches) {
          // Confirmed by repeat match
          confirmCandidate(updatedCandidate, setlist_item_id)

          await logDetectionEvent({
            performance_id: params.id,
            detected_title: title,
            detected_artist: artist,
            detected_at: new Date().toISOString(),
            confidence,
            matched_confirmed: false,
            became_candidate: false,
            became_confirmed: true,
          }, supabase)
        } else {
          // Update candidate but don't confirm yet
          setPendingCandidate(updatedCandidate)
          setDetectStatus(`hearing "${title}"...`)

          await logDetectionEvent({
            performance_id: params.id,
            detected_title: title,
            detected_artist: artist,
            detected_at: new Date().toISOString(),
            confidence,
            matched_confirmed: false,
            became_candidate: true,
            became_confirmed: false,
          }, supabase)
        }
        return
      }

      // ── 3. Brand new detection — check cooldown ──────────────────────────
      const cooldownPassed = secondsSinceLastConfirm >= MIN_SONG_GAP_SECONDS
      const isFirstSong    = confirmed.length === 0 && lastConfirmedAtRef.current === 0

      if (cooldownPassed || isFirstSong) {
        // No cooldown blocking — start a candidate or confirm if high confidence
        const highConfidence = confidence && confidence >= 0.8

        if (highConfidence) {
          // High confidence + cooldown passed = confirm immediately
          const newCandidate: PendingCandidate = {
            title, artist,
            firstDetectedAt: now,
            lastDetectedAt: now,
            matchCount: 1,
            source: 'detected',
            confidence,
          }
          confirmCandidate(newCandidate, setlist_item_id)

          await logDetectionEvent({
            performance_id: params.id,
            detected_title: title,
            detected_artist: artist,
            detected_at: new Date().toISOString(),
            confidence,
            matched_confirmed: false,
            became_candidate: false,
            became_confirmed: true,
          }, supabase)
        } else {
          // Start as candidate, needs repeat to confirm
          const newCandidate: PendingCandidate = {
            title, artist,
            firstDetectedAt: now,
            lastDetectedAt: now,
            matchCount: 1,
            source: 'detected',
            confidence,
          }
          setPendingCandidate(newCandidate)
          setDetectStatus(`hearing "${title}"...`)

          await logDetectionEvent({
            performance_id: params.id,
            detected_title: title,
            detected_artist: artist,
            detected_at: new Date().toISOString(),
            confidence,
            matched_confirmed: false,
            became_candidate: true,
            became_confirmed: false,
          }, supabase)
        }
      } else {
        // Still in cooldown — store as candidate but don't confirm yet
        const secondsRemaining = Math.round(MIN_SONG_GAP_SECONDS - secondsSinceLastConfirm)
        setDetectStatus(`hearing "${title}"... (${secondsRemaining}s)`)

        const newCandidate: PendingCandidate = {
          title, artist,
          firstDetectedAt: now,
          lastDetectedAt: now,
          matchCount: 1,
          source: 'detected',
          confidence,
        }
        setPendingCandidate(newCandidate)

        await logDetectionEvent({
          performance_id: params.id,
          detected_title: title,
          detected_artist: artist,
          detected_at: new Date().toISOString(),
          confidence,
          matched_confirmed: false,
          became_candidate: true,
          became_confirmed: false,
        }, supabase)
      }

    } catch {
      setDetectStatus('listening...')
    } finally {
      setIsDetecting(false)
    }
  }, [params.id, showId, setlistId, artistId, confirmCandidate])

  // ── Manual confirm pending candidate ─────────────────────────────────────
  const confirmPending = useCallback(() => {
    if (!pendingCandidateRef.current) return
    confirmCandidate(pendingCandidateRef.current)
  }, [confirmCandidate])

  const dismissPending = useCallback(() => {
    setPendingCandidate(null)
    setDetectStatus('listening...')
  }, [])

  // ── Start / stop listening ────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setIsListening(true)
      setDetectStatus('listening...')

      const recordAndDetect = () => {
        if (isDetecting) return
        chunksRef.current = []
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'
        const recorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = recorder
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType })
          detectSong(blob)
        }
        recorder.start()
        setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 12000)
      }

      recordAndDetect()
      listenIntervalRef.current = setInterval(recordAndDetect, 30000)
    } catch {
      setDetectStatus('mic access denied')
      setIsListening(false)
    }
  }, [detectSong, isDetecting])

  const stopListening = useCallback(() => {
    if (listenIntervalRef.current) {
      clearInterval(listenIntervalRef.current)
      listenIntervalRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setIsListening(false)
    setDetectStatus('')
  }, [])

  // ── End performance ───────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => {
    if (ending || !performance) return
    setEnding(true)
    stopListening()
    const supabase = createClient()

    await supabase.from('performances').update({
      status: 'review',
      ended_at: new Date().toISOString(),
    }).eq('id', performance.id)

    if (showId) {
      await supabase.from('shows').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      }).eq('id', showId)
    }

    await supabase.from('capture_sessions').update({
      ended_at: new Date().toISOString(),
      status: 'ended',
    }).eq('performance_id', performance.id)

    if (setlistId) {
      const manualSongs = songs.filter(s => s.source === 'manual')
      if (manualSongs.length > 0) {
        const { data: existingItems } = await supabase
          .from('setlist_items')
          .select('position')
          .eq('setlist_id', setlistId)
          .order('position', { ascending: false })
          .limit(1)

        const startPosition = (existingItems?.[0]?.position || 0) + 1

        await supabase.from('setlist_items').insert(
          manualSongs.map((song, i) => ({
            setlist_id: setlistId,
            title: song.title,
            artist_name: song.artist || performance.artist_name,
            position: startPosition + i,
            source: 'manual',
          }))
        )
      }

      await supabase.from('setlists').update({
        status: 'review',
        updated_at: new Date().toISOString(),
      }).eq('id', setlistId)
    }

    if (songs.length > 0) {
      await supabase.from('performance_songs').insert(
        songs.map((song, i) => ({
          performance_id: performance.id,
          title: song.title,
          artist: song.artist || performance.artist_name,
          position: i + 1,
          // Store original detection for correction tracking
          detected_title: song.detected_title || song.title,
          detected_artist: song.detected_artist || song.artist,
        }))
      )
    }

    router.push(`/app/review/${performance.id}`)
  }, [ending, performance, songs, router, stopListening, showId, setlistId])

  // ── Manual add ────────────────────────────────────────────────────────────
  async function addSong() {
    const trimmed = songInput.trim()
    if (!trimmed) return
    setSongs(s => [...s, {
      title: trimmed,
      artist: performance?.artist_name || '',
      source: 'manual',
    }])
    setSongInput('')
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (!performance) {
    return (
      <div style={{
        minHeight: '100svh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            border: `2px solid ${C.gold}`,
            animation: 'breathe 1.8s ease-in-out infinite',
            opacity: 0.6,
          }} />
          <span style={{ color: C.muted, fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Loading
          </span>
        </div>
        <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.9} }`}</style>
      </div>
    )
  }

  const totalSeconds = performance.set_duration_minutes * 60
  const progress     = Math.min(elapsed / totalSeconds, 1)
  const remaining    = Math.max(totalSeconds - elapsed, 0)
  const autoCloseAt  = totalSeconds + (performance.auto_close_buffer_minutes || 5) * 60
  const ringState    = catchFlash ? 'catch' : isDetecting ? 'detect' : isListening ? 'listen' : 'idle'

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      overflowX: 'hidden',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '120vw', height: '55vh',
        background: isListening
          ? `radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.09) 0%, transparent 70%)`
          : `radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.04) 0%, transparent 60%)`,
        pointerEvents: 'none',
        transition: 'background 1.5s ease', zIndex: 0,
      }} />

      {/* ── Top strip ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        padding: '20px 24px 0',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(220,38,38,0.12)',
          border: '1px solid rgba(220,38,38,0.3)',
          borderRadius: 20, padding: '5px 10px',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: C.red,
            animation: 'pulse-dot 1.4s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: '#f87171',
          }}>Live</span>
        </div>

        {songs.length > 0 && (
          <div style={{
            background: C.goldDim, border: `1px solid rgba(201,168,76,0.25)`,
            borderRadius: 20, padding: '5px 12px',
            animation: 'fadeIn 0.3s ease',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.08em' }}>
              {songs.length} {songs.length === 1 ? 'song' : 'songs'}
            </span>
          </div>
        )}
      </div>

      {/* ── Venue / Artist ── */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '20px 24px 0' }}>
        <h1 style={{
          fontSize: 22, fontWeight: 700, color: C.text,
          margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2,
        }}>
          {performance.venue_name}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 5 }}>
          <MapPin size={11} color={C.muted} />
          <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.04em' }}>
            {performance.city}, {performance.country}
          </span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.gold, margin: '6px 0 0', letterSpacing: '0.06em' }}>
          {performance.artist_name}
        </p>
      </div>

      {/* ── Timer ── */}
      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '22px 24px 0' }}>
        <div style={{
          fontSize: 56, fontWeight: 800, color: C.text,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1,
          fontFamily: '"DM Mono", "Courier New", monospace',
        }}>
          {formatTime(elapsed)}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6, letterSpacing: '0.04em' }}>
          {remaining > 0 ? `${formatTime(remaining)} remaining` : `${formatTime(elapsed - totalSeconds)} over set`}
        </div>
        <div style={{
          width: '100%', maxWidth: 280, margin: '14px auto 0',
          height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: `linear-gradient(90deg, ${C.gold}99, ${C.gold})`,
            width: `${progress * 100}%`, transition: 'width 1s linear',
            boxShadow: `0 0 8px ${C.gold}66`,
          }} />
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Auto-closes {formatTime(autoCloseAt)}
        </div>
      </div>

      {/* ── Pulse Button ── */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '36px 24px 28px',
      }}>
        {(isListening || catchFlash) && (
          <>
            {[
              { size: ringState === 'catch' ? 220 : 200, delay: '0s' },
              { size: ringState === 'catch' ? 260 : 240, delay: '0.1s' },
              { size: ringState === 'catch' ? 300 : 280, delay: '0.2s' },
            ].map(({ size, delay }, idx) => (
              <div key={idx} style={{
                position: 'absolute',
                width: size, height: size, borderRadius: '50%',
                border: `1px solid ${ringState === 'catch' ? C.gold + (idx === 0 ? '' : idx === 1 ? '60' : '30') : C.gold + (idx === 0 ? '30' : idx === 1 ? '18' : '0c')}`,
                animation: ringState === 'catch' ? `ring-catch 0.8s ${delay} ease-out forwards` : `ring-pulse 2.5s ${delay} ease-out infinite`,
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }} />
            ))}
          </>
        )}

        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isDetecting && !isListening}
          style={{
            width: 160, height: 160, borderRadius: '50%', border: 'none',
            cursor: isDetecting && !isListening ? 'wait' : 'pointer',
            position: 'relative', zIndex: 2,
            background: catchFlash
              ? `radial-gradient(circle at 40% 35%, #e8c76a, ${C.gold} 55%, #a07828)`
              : isListening
              ? `radial-gradient(circle at 40% 35%, ${C.gold}cc, ${C.gold} 55%, #8a6520)`
              : `radial-gradient(circle at 40% 35%, #2a2520, #1a1610 55%, #0f0e0c)`,
            boxShadow: catchFlash
              ? `0 0 60px ${C.gold}80, 0 0 120px ${C.gold}30, inset 0 1px 0 rgba(255,255,255,0.25)`
              : isListening
              ? `0 0 40px ${C.gold}40, 0 0 80px ${C.gold}18, inset 0 1px 0 rgba(255,255,255,0.12)`
              : `0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            transform: catchFlash ? 'scale(1.06)' : 'scale(1)',
            transition: 'background 0.4s ease, box-shadow 0.4s ease, transform 0.25s ease',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDetecting ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{
                    width: 3, borderRadius: 2,
                    background: isListening ? '#0a0908' : C.gold,
                    animation: `wave-bar 0.8s ${i * 0.12}s ease-in-out infinite alternate`,
                    height: 10,
                  }} />
                ))}
              </div>
            ) : (
              <svg width="28" height="32" viewBox="0 0 28 32" fill="none">
                <rect x="8" y="0" width="12" height="20" rx="6" fill={isListening ? '#0a0908' : C.gold} opacity={isListening ? 1 : 0.9} />
                <path d="M4 16c0 5.523 4.477 10 10 10s10-4.477 10-10" stroke={isListening ? '#0a0908' : C.gold} strokeWidth="2" strokeLinecap="round" fill="none" />
                <line x1="14" y1="26" x2="14" y2="31" stroke={isListening ? '#0a0908' : C.gold} strokeWidth="2" strokeLinecap="round" />
                <line x1="10" y1="31" x2="18" y2="31" stroke={isListening ? '#0a0908' : C.gold} strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: isListening ? '#0a0908' : C.gold,
          }}>
            {isDetecting ? 'catching' : isListening ? 'tap to stop' : 'tap to listen'}
          </span>
        </button>

        {/* Status line */}
        <div style={{ marginTop: 18, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {lastCaught ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, animation: 'fadeIn 0.25s ease' }}>
              <span style={{ fontSize: 13, color: C.gold }}>✦</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{lastCaught}</span>
              <span style={{ fontSize: 11, color: C.gold, opacity: 0.7 }}>caught</span>
            </div>
          ) : detectStatus ? (
            <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.06em', animation: 'fadeIn 0.2s ease' }}>
              {detectStatus}
            </span>
          ) : null}
        </div>

        {isListening && !isDetecting && !pendingCandidate && (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 14 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 2, borderRadius: 1, background: C.gold + '60',
                  animation: `wave-bar 1s ${i * 0.2}s ease-in-out infinite alternate`, height: 6,
                }} />
              ))}
            </div>
            <span style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              sampling every 30s
            </span>
          </div>
        )}
      </div>

      {/* ── Pending Candidate Card ── */}
      {pendingCandidate && (
        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: 480, width: '100%', margin: '0 auto',
          padding: '0 16px 12px',
          animation: 'slideUp 0.2s ease',
        }}>
          <div style={{
            background: C.card,
            border: `1px solid ${C.gold}40`,
            borderRadius: 12, padding: '14px',
          }}>
            <p style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.gold, margin: '0 0 8px',
            }}>
              Hearing something...
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 2px' }}>
              {pendingCandidate.title}
            </p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 12px' }}>
              {pendingCandidate.artist}
              {pendingCandidate.matchCount > 1 && (
                <span style={{ color: C.gold, marginLeft: 6 }}>
                  · detected {pendingCandidate.matchCount}×
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={confirmPending}
                style={{
                  flex: 1, padding: '9px',
                  background: C.gold, border: 'none', borderRadius: 8,
                  color: '#0a0908', fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ✓ Add to Setlist
              </button>
              <button
                onClick={dismissPending}
                style={{
                  padding: '9px 14px',
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  borderRadius: 8, color: C.muted,
                  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lower section ── */}
      <div style={{
        position: 'relative', zIndex: 1, flex: 1,
        display: 'flex', flexDirection: 'column', gap: 12,
        padding: '0 16px 40px',
        maxWidth: 480, width: '100%', margin: '0 auto',
        boxSizing: 'border-box',
      }}>

        {/* Manual Add Toggle */}
        <button
          onClick={() => setShowManual(v => !v)}
          style={{
            width: '100%', padding: '11px 16px',
            background: showManual ? 'rgba(201,168,76,0.06)' : 'transparent',
            border: `1px solid ${showManual ? C.gold + '40' : C.border}`,
            borderRadius: 10, color: showManual ? C.gold : C.muted,
            fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <span style={{
            fontSize: 16, lineHeight: 1, display: 'inline-block',
            transform: showManual ? 'rotate(45deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
          }}>+</span>
          {showManual ? 'Cancel' : 'Add Manually'}
        </button>

        {showManual && (
          <div style={{
            padding: '14px', background: C.card,
            border: `1px solid ${C.border}`, borderRadius: 12,
            display: 'flex', flexDirection: 'column', gap: 10,
            animation: 'slideUp 0.2s ease',
          }}>
            <input
              value={songInput}
              onChange={e => setSongInput(e.target.value)}
              placeholder="Song title"
              style={{
                background: C.input, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '10px 12px',
                color: C.text, fontSize: 14, outline: 'none',
                width: '100%', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && songInput.trim()) addSong() }}
            />
            <button
              onClick={addSong}
              disabled={!songInput.trim()}
              style={{
                padding: '10px 16px',
                background: songInput.trim() ? C.gold : C.muted,
                border: 'none', borderRadius: 8,
                color: '#0a0908', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: songInput.trim() ? 'pointer' : 'not-allowed',
                opacity: songInput.trim() ? 1 : 0.4,
                transition: 'all 0.15s ease',
              }}
            >
              Add to Setlist
            </button>
          </div>
        )}

        {/* Setlist */}
        {songs.length > 0 && (
          <div>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.muted, margin: '4px 0 10px 2px',
            }}>
              Setlist — {songs.length} {songs.length === 1 ? 'song' : 'songs'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {songs.map((song, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: C.card,
                  border: `1px solid ${song.source === 'detected' ? C.gold + '20' : C.border}`,
                  borderRadius: 10, animation: 'slideUp 0.25s ease',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: C.muted,
                    minWidth: 16, textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums', fontFamily: '"DM Mono", monospace',
                  }}>
                    {i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 14, fontWeight: 600, color: C.text, margin: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {song.title}
                    </p>
                    {song.artist && song.artist !== performance.artist_name && (
                      <p style={{
                        fontSize: 11, color: C.secondary, margin: '2px 0 0',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {song.artist}
                      </p>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', flexShrink: 0,
                    color: song.source === 'detected' ? C.gold : C.muted, opacity: 0.6,
                  }}>
                    {song.source === 'detected' ? '⚡ auto' : '✎ manual'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* End Performance */}
        <div style={{ marginTop: songs.length > 0 ? 8 : 0 }}>
          <button
            onClick={handleEnd}
            disabled={ending}
            style={{
              width: '100%', padding: '13px 16px',
              background: 'transparent', border: `1px solid rgba(220,38,38,0.35)`,
              borderRadius: 10, color: '#f87171',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: ending ? 'not-allowed' : 'pointer',
              opacity: ending ? 0.5 : 1, transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={e => {
              if (!ending) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.1)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.6)'
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.35)'
            }}
          >
            <span style={{
              display: 'inline-block', width: 8, height: 8,
              background: ending ? '#6a6050' : C.red, borderRadius: 1, flexShrink: 0,
            }} />
            {ending ? 'Ending performance...' : 'End Performance'}
          </button>
        </div>
      </div>

      {/* Global keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes pulse-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
        @keyframes ring-pulse { 0%{opacity:.7;transform:translate(-50%,-50%) scale(.95)} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.25)} }
        @keyframes ring-catch { 0%{opacity:1;transform:translate(-50%,-50%) scale(.9)} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)} }
        @keyframes wave-bar   { from{height:4px} to{height:22px} }
        @keyframes slideUp    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
        @keyframes breathe    { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.9} }
        * { -webkit-tap-highlight-color: transparent; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; }
      `}</style>
    </div>
  )
}
