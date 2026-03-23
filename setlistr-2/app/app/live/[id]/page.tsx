'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Check, X, Pencil } from 'lucide-react'
import type { Performance } from '@/types'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.15)', red: '#dc2626',
  amber: '#f59e0b', amberDim: 'rgba(245,158,11,0.12)',
}

const MIN_SONG_GAP_SECONDS     = 30
const CANDIDATE_WINDOW_SECONDS = 60
const PLACEHOLDER_GAP_SECONDS  = 35

type AcrCandidate = { title: string; artist: string; score: number }

type DetectedSong = {
  title: string
  artist: string
  source: 'fingerprint' | 'humming' | 'transcript' | 'combined' | 'manual' | 'cloned' | 'unidentified'
  setlist_item_id?: string
  confidence_level?: 'auto' | 'suggest' | 'manual_review'
  isrc?: string
  composer?: string
  publisher?: string
}

type PendingCandidate = {
  title: string
  artist: string
  firstDetectedAt: number
  lastDetectedAt: number
  matchCount: number
  source: DetectedSong['source']
  confidence_level?: 'auto' | 'suggest' | 'manual_review'
  candidates?: AcrCandidate[]
  downgraded_reason?: string
}

type CandidateHistoryEntry = {
  title: string; artist: string; score: number; timestamp: number
}

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function isSameSong(a: { title: string }, b: { title: string }): boolean {
  return normalizeSongKey(a.title) === normalizeSongKey(b.title)
}

// ── user_songs write helper ───────────────────────────────────────────────────
// Non-blocking. Uses dedup guard to prevent overcounting across paths.
async function writeUserSong(
  supabase: ReturnType<typeof createClient>,
  title: string,
  artist: string,
  userId: string,
  performanceId: string
): Promise<void> {
  try {
    const normalizedTitle = normalizeSongKey(title)

    // Per-performance dedup guard
    const { error: guardError } = await supabase
      .from('user_song_performances')
      .insert({ user_id: userId, performance_id: performanceId, normalized_title: normalizedTitle })

    if (guardError) {
      // 23505 = unique violation = already counted this song for this performance
      if (guardError.code === '23505') return
      console.error('[UserSongs] guard error:', guardError.message)
      return
    }

    // Upsert into user_songs
    const { data: existing } = await supabase
      .from('user_songs')
      .select('id, confirmed_count')
      .eq('user_id', userId)
      .eq('song_title', title)
      .single()

    if (existing) {
      await supabase.from('user_songs').update({
        confirmed_count: existing.confirmed_count + 1,
        canonical_artist: artist || null,
        last_confirmed_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('user_songs').insert({
        user_id: userId,
        song_title: title,
        canonical_artist: artist || null,
        confirmed_count: 1,
        last_confirmed_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[UserSongs] write failed:', err)
  }
}

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
  const [pendingCandidate, setPendingCandidate] = useState<PendingCandidate | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editTitle, setEditTitle]       = useState('')
  const [editArtist, setEditArtist]     = useState('')

  const mediaRecorderRef    = useRef<MediaRecorder | null>(null)
  const chunksRef           = useRef<Blob[]>([])
  const listenIntervalRef   = useRef<NodeJS.Timeout | null>(null)
  const streamRef           = useRef<MediaStream | null>(null)
  const lastConfirmedAtRef  = useRef<number>(0)
  const pendingCandidateRef = useRef<PendingCandidate | null>(null)
  const confirmedSongsRef   = useRef<DetectedSong[]>([])
  const candidateHistoryRef = useRef<CandidateHistoryEntry[]>([])

  useEffect(() => { pendingCandidateRef.current = pendingCandidate }, [pendingCandidate])
  useEffect(() => { confirmedSongsRef.current = songs }, [songs])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('performances')
      .select('*, show_id, setlist_id, artist_id')
      .eq('id', params.id).single()
      .then(({ data }) => {
        if (data) {
          setPerformance(data)
          setShowId(data.show_id || null)
          setSetlistId(data.setlist_id || null)
          setArtistId(data.artist_id || null)
        }
      })
  }, [params.id])

  useEffect(() => {
    if (!performance?.started_at) return
    const start = new Date(performance.started_at).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [performance?.started_at])

  useEffect(() => {
    if (!performance) return
    const totalSeconds = (performance.set_duration_minutes + (performance.auto_close_buffer_minutes || 5)) * 60
    if (elapsed >= totalSeconds && !ending) handleEnd()
  }, [elapsed, performance, ending])

  useEffect(() => { return () => stopListening() }, [])

  function startEdit(index: number) {
    setEditingIndex(index)
    setEditTitle(songs[index].title)
    setEditArtist(songs[index].artist)
  }

  function saveEdit() {
    if (editingIndex === null || !editTitle.trim()) return
    setSongs(prev => prev.map((s, i) =>
      i === editingIndex ? { ...s, title: editTitle.trim(), artist: editArtist.trim() || s.artist } : s
    ))
    setEditingIndex(null)
  }

  function cancelEdit() { setEditingIndex(null) }

  const confirmCandidate = useCallback((
    candidate: PendingCandidate,
    setlist_item_id?: string,
    enriched?: { isrc?: string; composer?: string; publisher?: string }
  ) => {
    setSongs(prev => [...prev, {
      title: candidate.title,
      artist: candidate.artist,
      source: candidate.source,
      setlist_item_id,
      confidence_level: candidate.confidence_level,
      isrc: enriched?.isrc || '',
      composer: enriched?.composer || '',
      publisher: enriched?.publisher || '',
    }])
    lastConfirmedAtRef.current = Date.now()
    setPendingCandidate(null)
    setCatchFlash(true)
    setLastCaught(candidate.title)
    setTimeout(() => setCatchFlash(false), 1200)
    setTimeout(() => setLastCaught(null), 3500)
    setDetectStatus('')

    // Write to user_songs (manual confirm path)
    // Only for suggest/manual — auto-confirmed written by identify route.
    // Dedup guard prevents double-counting.
    if (candidate.confidence_level === 'suggest' || candidate.source === 'manual') {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user && params.id) {
          writeUserSong(supabase, candidate.title, candidate.artist || '', user.id, params.id)
        }
      })
    }
  }, [params.id])

  const selectCandidate = useCallback((candidate: AcrCandidate) => {
    if (!pendingCandidateRef.current) return
    confirmCandidate({ ...pendingCandidateRef.current, title: candidate.title, artist: candidate.artist })
  }, [confirmCandidate])

  const detectSong = useCallback(async (audioBlob: Blob) => {
    setIsDetecting(true)
    setDetectStatus('listening...')

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('performance_id', params.id)
      if (showId)    formData.append('show_id', showId)
      if (setlistId) formData.append('setlist_id', setlistId)
      if (artistId)  formData.append('artist_id', artistId)
      if (performance?.artist_name) formData.append('artist_name', performance.artist_name)
      formData.append('show_type', (performance as any).show_type || 'single')
      formData.append('previous_songs', JSON.stringify(confirmedSongsRef.current.map(s => s.title)))
      formData.append('candidate_history', JSON.stringify(candidateHistoryRef.current))

      const res  = await fetch('/api/identify', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.acr_score) {
        candidateHistoryRef.current = [
          { title: data.title || '', artist: data.artist || '', score: data.acr_score, timestamp: Date.now() },
          ...candidateHistoryRef.current,
        ].slice(0, 3)
      }

      const now       = Date.now()
      const confirmed = confirmedSongsRef.current
      const pending   = pendingCandidateRef.current

      // ── No detection ──────────────────────────────────────────────────────
      if (!data.detected) {
        const timeSinceLast = (now - lastConfirmedAtRef.current) / 1000
        if (confirmed.length > 0 && timeSinceLast > PLACEHOLDER_GAP_SECONDS) {
          setSongs(prev => {
            if (prev[prev.length - 1]?.source === 'unidentified') return prev
            return [...prev, { title: 'Unknown Song', artist: '', source: 'unidentified' }]
          })
          lastConfirmedAtRef.current = now
        }
        setDetectStatus('listening...')
        return
      }

      const { title, artist, setlist_item_id, confidence_level, source } = data

      // ── Already confirmed this title ──────────────────────────────────────
      if (confirmed.some(s => isSameSong(s, { title }))) {
        setDetectStatus('already logged')
        setTimeout(() => setDetectStatus(''), 3000)
        return
      }

      // ── AUTO: confirm immediately ─────────────────────────────────────────
      // The identify route already validated this. Trust it.
      if (confidence_level === 'auto') {
        const secondsSinceLast = (now - lastConfirmedAtRef.current) / 1000
        const isFirstSong      = confirmed.length === 0 && lastConfirmedAtRef.current === 0
        const cooldownPassed   = secondsSinceLast >= MIN_SONG_GAP_SECONDS

        if (isFirstSong || cooldownPassed) {
          confirmCandidate(
            { title, artist, source, confidence_level, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 },
            setlist_item_id,
            { isrc: data.isrc, composer: data.composer, publisher: data.publisher }
          )
        } else {
          // Within cooldown — put in pending so next match confirms it
          if (pending && normalizeSongKey(pending.title) === normalizeSongKey(title)) {
            // Same song already pending — just update
            setPendingCandidate({ ...pending, lastDetectedAt: now, matchCount: pending.matchCount + 1 })
          } else if (!pending) {
            setPendingCandidate({ title, artist, source, confidence_level, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 })
          }
          setDetectStatus(`hearing "${title}"...`)
        }
        return
      }

      // ── SUGGEST: needs 2 matches to confirm ──────────────────────────────
      if (confidence_level === 'suggest') {
        // Title matches pending → accumulate
        if (pending && normalizeSongKey(pending.title) === normalizeSongKey(title)) {
          const updated: PendingCandidate = {
            ...pending, lastDetectedAt: now, matchCount: pending.matchCount + 1, source,
          }
          const withinWindow = (now - pending.firstDetectedAt) / 1000 <= CANDIDATE_WINDOW_SECONDS
          if (withinWindow && updated.matchCount >= 2) {
            confirmCandidate(updated, setlist_item_id, { isrc: data.isrc, composer: data.composer, publisher: data.publisher })
          } else {
            setPendingCandidate(updated)
            setDetectStatus(`hearing "${title}"... (${updated.matchCount}×)`)
          }
          return
        }

        // Different title — only replace pending if cooldown passed
        const secondsSinceLast = (now - lastConfirmedAtRef.current) / 1000
        const cooldownPassed   = secondsSinceLast >= MIN_SONG_GAP_SECONDS
        const isFirstSong      = confirmed.length === 0 && lastConfirmedAtRef.current === 0

        if (!pending || cooldownPassed || isFirstSong) {
          setPendingCandidate({
            title, artist, source, confidence_level,
            firstDetectedAt: now, lastDetectedAt: now, matchCount: 1,
          })
          setDetectStatus(`hearing "${title}"...`)
        } else {
          // Protect existing pending
          setDetectStatus(`hearing "${pending.title}"...`)
        }
      }

    } catch {
      setDetectStatus('listening...')
    } finally {
      setIsDetecting(false)
    }
  }, [params.id, showId, setlistId, artistId, confirmCandidate, performance])

  const confirmPending = useCallback(() => {
    if (!pendingCandidateRef.current) return
    confirmCandidate(pendingCandidateRef.current)
  }, [confirmCandidate])

  const dismissPending = useCallback(() => {
    setPendingCandidate(null)
    setDetectStatus('listening...')
  }, [])

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
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
        const recorder = new MediaRecorder(stream, { mimeType })
        mediaRecorderRef.current = recorder
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        recorder.onstop = () => detectSong(new Blob(chunksRef.current, { type: mimeType }))
        recorder.start()
        setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 12000)
      }

      recordAndDetect()
      listenIntervalRef.current = setInterval(recordAndDetect, 20000)
    } catch {
      setDetectStatus('mic access denied')
      setIsListening(false)
    }
  }, [detectSong, isDetecting])

  const stopListening = useCallback(() => {
    if (listenIntervalRef.current) { clearInterval(listenIntervalRef.current); listenIntervalRef.current = null }
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setIsListening(false)
    setDetectStatus('')
  }, [])

  const handleEnd = useCallback(async () => {
    if (ending || !performance) return
    setEnding(true)

    const timeSinceLast = (Date.now() - lastConfirmedAtRef.current) / 1000
    const currentSongs  = confirmedSongsRef.current
    if (currentSongs.length > 0 && timeSinceLast > PLACEHOLDER_GAP_SECONDS) {
      const last = currentSongs[currentSongs.length - 1]
      if (last?.source !== 'unidentified') {
        setSongs(prev => [...prev, { title: 'Unknown Song', artist: '', source: 'unidentified' }])
      }
    }

    stopListening()
    const supabase = createClient()

    await supabase.from('performances').update({ status: 'review', ended_at: new Date().toISOString() }).eq('id', performance.id)
    if (showId) await supabase.from('shows').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', showId)
    await supabase.from('capture_sessions').update({ ended_at: new Date().toISOString(), status: 'ended' }).eq('performance_id', performance.id)

    if (setlistId) {
      const manualSongs = songs.filter(s => s.source === 'manual')
      if (manualSongs.length > 0) {
        const { data: existingItems } = await supabase.from('setlist_items').select('position').eq('setlist_id', setlistId).order('position', { ascending: false }).limit(1)
        const startPosition = (existingItems?.[0]?.position || 0) + 1
        await supabase.from('setlist_items').insert(
          manualSongs.map((song, i) => ({
            setlist_id: setlistId, title: song.title,
            artist_name: song.artist || performance.artist_name,
            position: startPosition + i, source: 'manual',
          }))
        )
      }
      await supabase.from('setlists').update({ status: 'review', updated_at: new Date().toISOString() }).eq('id', setlistId)
    }

    const songsToSave = songs.filter(s => s.source !== 'unidentified')
    if (songsToSave.length > 0) {
      await supabase.from('performance_songs').insert(
        songsToSave.map((song, i) => ({
          performance_id: performance.id,
          title: song.title,
          artist: song.artist || performance.artist_name,
          position: i + 1,
          isrc: song.isrc || null,
          composer: song.composer || null,
          publisher: song.publisher || null,
        }))
      )
    }

    router.push(`/app/review/${performance.id}`)
  }, [ending, performance, songs, router, stopListening, showId, setlistId])

  async function addSong() {
    const trimmed = songInput.trim()
    if (!trimmed) return
    setSongs(s => [...s, { title: trimmed, artist: performance?.artist_name || '', source: 'manual' }])
    setSongInput('')
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!performance) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite', opacity: 0.6 }} />
          <span style={{ color: C.muted, fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
        </div>
        <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.9} }`}</style>
      </div>
    )
  }

  const totalSeconds      = performance.set_duration_minutes * 60
  const progress          = Math.min(elapsed / totalSeconds, 1)
  const remaining         = Math.max(totalSeconds - elapsed, 0)
  const autoCloseAt       = totalSeconds + (performance.auto_close_buffer_minutes || 5) * 60
  const ringState         = catchFlash ? 'catch' : isDetecting ? 'detect' : isListening ? 'listen' : 'idle'
  const unidentifiedCount = songs.filter(s => s.source === 'unidentified').length

  return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: '"DM Sans", system-ui, sans-serif', overflowX: 'hidden' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', background: isListening ? `radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.09) 0%, transparent 70%)` : `radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.04) 0%, transparent 60%)`, pointerEvents: 'none', transition: 'background 1.5s ease', zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 20, padding: '5px 10px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f87171' }}>Live</span>
        </div>
        {songs.length > 0 && (
          <div style={{ background: C.goldDim, border: `1px solid rgba(201,168,76,0.25)`, borderRadius: 20, padding: '5px 12px', animation: 'fadeIn 0.3s ease' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.08em' }}>{songs.length} {songs.length === 1 ? 'song' : 'songs'}</span>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '20px 24px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{performance.venue_name}</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 5 }}>
          <MapPin size={11} color={C.muted} />
          <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.04em' }}>{performance.city}, {performance.country}</span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.gold, margin: '6px 0 0', letterSpacing: '0.06em' }}>{performance.artist_name}</p>
      </div>

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '22px 24px 0' }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em', lineHeight: 1, fontFamily: '"DM Mono", "Courier New", monospace' }}>{formatTime(elapsed)}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6, letterSpacing: '0.04em' }}>
          {remaining > 0 ? `${formatTime(remaining)} remaining` : `${formatTime(elapsed - totalSeconds)} over set`}
        </div>
        <div style={{ width: '100%', maxWidth: 280, margin: '14px auto 0', height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${C.gold}99, ${C.gold})`, width: `${progress * 100}%`, transition: 'width 1s linear', boxShadow: `0 0 8px ${C.gold}66` }} />
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Auto-closes {formatTime(autoCloseAt)}</div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 24px 28px' }}>
        {(isListening || catchFlash) && (
          <>
            {[{ size: ringState === 'catch' ? 220 : 200, delay: '0s' }, { size: ringState === 'catch' ? 260 : 240, delay: '0.1s' }, { size: ringState === 'catch' ? 300 : 280, delay: '0.2s' }].map(({ size, delay }, idx) => (
              <div key={idx} style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', border: `1px solid ${ringState === 'catch' ? C.gold + (idx === 0 ? '' : idx === 1 ? '60' : '30') : C.gold + (idx === 0 ? '30' : idx === 1 ? '18' : '0c')}`, animation: ringState === 'catch' ? `ring-catch 0.8s ${delay} ease-out forwards` : `ring-pulse 2.5s ${delay} ease-out infinite`, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
            ))}
          </>
        )}
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={isDetecting && !isListening}
          style={{ width: 160, height: 160, borderRadius: '50%', border: 'none', cursor: isDetecting && !isListening ? 'wait' : 'pointer', position: 'relative', zIndex: 2, background: catchFlash ? `radial-gradient(circle at 40% 35%, #e8c76a, ${C.gold} 55%, #a07828)` : isListening ? `radial-gradient(circle at 40% 35%, ${C.gold}cc, ${C.gold} 55%, #8a6520)` : `radial-gradient(circle at 40% 35%, #2a2520, #1a1610 55%, #0f0e0c)`, boxShadow: catchFlash ? `0 0 60px ${C.gold}80, 0 0 120px ${C.gold}30, inset 0 1px 0 rgba(255,255,255,0.25)` : isListening ? `0 0 40px ${C.gold}40, 0 0 80px ${C.gold}18, inset 0 1px 0 rgba(255,255,255,0.12)` : `0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`, transform: catchFlash ? 'scale(1.06)' : 'scale(1)', transition: 'background 0.4s ease, box-shadow 0.4s ease, transform 0.25s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDetecting ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
                {[0,1,2,3,4].map(i => (<div key={i} style={{ width: 3, borderRadius: 2, background: isListening ? '#0a0908' : C.gold, animation: `wave-bar 0.8s ${i * 0.12}s ease-in-out infinite alternate`, height: 10 }} />))}
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
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: isListening ? '#0a0908' : C.gold }}>
            {isDetecting ? 'catching' : isListening ? 'tap to stop' : 'tap to listen'}
          </span>
        </button>

        <div style={{ marginTop: 18, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {lastCaught ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, animation: 'fadeIn 0.25s ease' }}>
              <span style={{ fontSize: 13, color: C.gold }}>✦</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{lastCaught}</span>
              <span style={{ fontSize: 11, color: C.gold, opacity: 0.7 }}>caught</span>
            </div>
          ) : detectStatus ? (
            <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.06em', animation: 'fadeIn 0.2s ease' }}>{detectStatus}</span>
          ) : null}
        </div>

        {isListening && !isDetecting && !pendingCandidate && (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 14 }}>
              {[0,1,2].map(i => (<div key={i} style={{ width: 2, borderRadius: 1, background: C.gold + '60', animation: `wave-bar 1s ${i * 0.2}s ease-in-out infinite alternate`, height: 6 }} />))}
            </div>
            <span style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>sampling every 20s</span>
          </div>
        )}
      </div>

      {pendingCandidate && (
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '0 16px 12px', animation: 'slideUp 0.2s ease' }}>
          <div style={{ background: C.card, border: `1px solid ${C.gold}40`, borderRadius: 12, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>Hearing something...</p>
              {pendingCandidate.matchCount > 1 && (
                <span style={{ fontSize: 10, color: C.gold, opacity: 0.7 }}>detected {pendingCandidate.matchCount}×</span>
              )}
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 2px' }}>{pendingCandidate.title}</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 12px' }}>{pendingCandidate.artist}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmPending} style={{ flex: 1, padding: '9px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✓ {pendingCandidate.title}
              </button>
              <button onClick={dismissPending} style={{ padding: '9px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 16px 40px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {unidentifiedCount > 0 && (
          <div style={{ background: C.amberDim, border: `1px solid ${C.amber}40`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>⚠</span>
            <p style={{ fontSize: 12, color: C.amber, margin: 0, fontWeight: 600 }}>
              {unidentifiedCount} song{unidentifiedCount > 1 ? 's' : ''} need{unidentifiedCount === 1 ? 's' : ''} review — tap to fill in
            </p>
          </div>
        )}

        <button onClick={() => setShowManual(v => !v)} style={{ width: '100%', padding: '11px 16px', background: showManual ? 'rgba(201,168,76,0.06)' : 'transparent', border: `1px solid ${showManual ? C.gold + '40' : C.border}`, borderRadius: 10, color: showManual ? C.gold : C.muted, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: 16, lineHeight: 1, display: 'inline-block', transform: showManual ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}>+</span>
          {showManual ? 'Cancel' : 'Add Manually'}
        </button>

        {showManual && (
          <div style={{ padding: '14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, animation: 'slideUp 0.2s ease' }}>
            <input value={songInput} onChange={e => setSongInput(e.target.value)} placeholder="Song title"
              style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
              onKeyDown={e => { if (e.key === 'Enter' && songInput.trim()) addSong() }} />
            <button onClick={addSong} disabled={!songInput.trim()} style={{ padding: '10px 16px', background: songInput.trim() ? C.gold : C.muted, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: songInput.trim() ? 'pointer' : 'not-allowed', opacity: songInput.trim() ? 1 : 0.4 }}>
              Add to Setlist
            </button>
          </div>
        )}

        {songs.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '4px 0 10px 2px' }}>
              Setlist — {songs.length} {songs.length === 1 ? 'song' : 'songs'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {songs.map((song, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${editingIndex === i ? C.gold + '60' : song.source === 'unidentified' ? C.amber + '50' : song.source !== 'manual' ? C.gold + '20' : C.border}`, borderRadius: 10, animation: 'slideUp 0.25s ease', overflow: 'hidden' }}>
                  {editingIndex === i ? (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>Edit Song</p>
                      <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} placeholder="Song title" style={{ background: C.input, border: `1px solid ${C.gold}60`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <input value={editArtist} onChange={e => setEditArtist(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} placeholder="Artist" style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveEdit} style={{ flex: 1, padding: '9px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Check size={13} strokeWidth={2.5} />Save</button>
                        <button onClick={cancelEdit} style={{ padding: '9px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}><X size={13} />Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }} onClick={() => startEdit(i)}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, minWidth: 16, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: song.source === 'unidentified' ? C.amber : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: song.source === 'unidentified' ? 'italic' : 'normal' }}>
                          {song.source === 'unidentified' ? '? Unknown Song' : song.title}
                        </p>
                        {song.artist && song.artist !== performance.artist_name && song.source !== 'unidentified' && (
                          <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: song.source === 'unidentified' ? C.amber : song.source !== 'manual' ? C.gold : C.muted, opacity: 0.7 }}>
                          {song.source === 'unidentified' ? '? review' : song.source === 'manual' ? '✎ manual' : '⚡ auto'}
                        </span>
                        <Pencil size={11} color={C.muted} opacity={0.4} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {editingIndex === null && (
              <p style={{ fontSize: 10, color: C.muted, textAlign: 'center', margin: '8px 0 0', opacity: 0.6 }}>Tap any song to edit</p>
            )}
          </div>
        )}

        <div style={{ marginTop: songs.length > 0 ? 8 : 0 }}>
          <button onClick={handleEnd} disabled={ending}
            style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: `1px solid rgba(220,38,38,0.35)`, borderRadius: 10, color: '#f87171', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: ending ? 'not-allowed' : 'pointer', opacity: ending ? 0.5 : 1, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onMouseEnter={e => { if (!ending) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.6)' } }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.35)' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: ending ? '#6a6050' : C.red, borderRadius: 1, flexShrink: 0 }} />
            {ending ? 'Ending performance...' : 'End Performance'}
          </button>
        </div>
      </div>

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
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
      `}</style>
    </div>
  )
}
