'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, X } from 'lucide-react'
import type { Performance } from '@/types'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.06)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.12)', red: '#dc2626',
  amber: '#f59e0b',
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
  isrc?: string; composer?: string; publisher?: string
}

type PendingCandidate = {
  title: string; artist: string
  firstDetectedAt: number; lastDetectedAt: number; matchCount: number
  source: DetectedSong['source']
  confidence_level?: 'auto' | 'suggest' | 'manual_review'
  candidates?: AcrCandidate[]
  downgraded_reason?: string
}

type CandidateHistoryEntry = { title: string; artist: string; score: number; timestamp: number }

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function isSameSong(a: { title: string }, b: { title: string }): boolean {
  return normalizeSongKey(a.title) === normalizeSongKey(b.title)
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
  const [btnPressed, setBtnPressed]     = useState(false)

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
      title: candidate.title, artist: candidate.artist, source: candidate.source,
      setlist_item_id, confidence_level: candidate.confidence_level,
      isrc: enriched?.isrc || '', composer: enriched?.composer || '', publisher: enriched?.publisher || '',
    }])
    lastConfirmedAtRef.current = Date.now()
    setPendingCandidate(null)
    setCatchFlash(true)
    setLastCaught(candidate.title)
    setTimeout(() => setCatchFlash(false), 1000)
    setTimeout(() => setLastCaught(null), 3000)
    setDetectStatus('')
  }, [])

  const selectCandidate = useCallback((candidate: AcrCandidate) => {
    if (!pendingCandidateRef.current) return
    confirmCandidate({ ...pendingCandidateRef.current, title: candidate.title, artist: candidate.artist })
  }, [confirmCandidate])

  // ── Detection logic — identical to stable ────────────────────────────────
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

      if (confirmed.some(s => isSameSong(s, { title }))) {
        setDetectStatus('already logged')
        setTimeout(() => setDetectStatus(''), 2000)
        return
      }

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
          if (pending && normalizeSongKey(pending.title) === normalizeSongKey(title)) {
            setPendingCandidate({ ...pending, lastDetectedAt: now, matchCount: pending.matchCount + 1 })
          } else if (!pending) {
            setPendingCandidate({ title, artist, source, confidence_level, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 })
          }
          setDetectStatus(`hearing "${title}"...`)
        }
        return
      }

      if (confidence_level === 'suggest') {
        if (pending && normalizeSongKey(pending.title) === normalizeSongKey(title)) {
          const updated: PendingCandidate = { ...pending, lastDetectedAt: now, matchCount: pending.matchCount + 1, source }
          const withinWindow = (now - pending.firstDetectedAt) / 1000 <= CANDIDATE_WINDOW_SECONDS
          if (withinWindow && updated.matchCount >= 2) {
            confirmCandidate(updated, setlist_item_id, { isrc: data.isrc, composer: data.composer, publisher: data.publisher })
          } else {
            setPendingCandidate(updated)
            setDetectStatus(`hearing "${title}"...`)
          }
          return
        }

        const secondsSinceLast = (now - lastConfirmedAtRef.current) / 1000
        const cooldownPassed   = secondsSinceLast >= MIN_SONG_GAP_SECONDS
        const isFirstSong      = confirmed.length === 0 && lastConfirmedAtRef.current === 0

        if (!pending || cooldownPassed || isFirstSong) {
          setPendingCandidate({ title, artist, source, confidence_level, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 })
          setDetectStatus(`hearing "${title}"...`)
        } else {
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
    setDetectStatus('')
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
          title: song.title, artist: song.artist || performance.artist_name,
          position: i + 1, isrc: song.isrc || null,
          composer: song.composer || null, publisher: song.publisher || null,
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
    setShowManual(false)
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function handleBtnPress() {
    setBtnPressed(true)
    setTimeout(() => setBtnPressed(false), 150)
    if (isListening) stopListening()
    else startListening()
  }

  if (!performance) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'spin 1.2s linear infinite', opacity: 0.5 }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const totalSeconds      = performance.set_duration_minutes * 60
  const progress          = Math.min(elapsed / totalSeconds, 1)
  const unidentifiedCount = songs.filter(s => s.source === 'unidentified').length
  const isActive          = isListening || catchFlash

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      overflowX: 'hidden', position: 'relative',
    }}>
      {/* ── Ambient background glow ── */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: isActive
          ? `radial-gradient(ellipse 80% 50% at 50% 100%, rgba(201,168,76,0.08) 0%, transparent 70%)`
          : `radial-gradient(ellipse 60% 40% at 50% 100%, rgba(201,168,76,0.03) 0%, transparent 60%)`,
        transition: 'background 2s ease',
      }} />

      {/* ── Top strip: venue + LIVE + timer — 44px total ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        height: 44, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 16px',
        borderBottom: `1px solid rgba(255,255,255,0.04)`,
        flexShrink: 0,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{
            fontSize: 13, fontWeight: 700, color: C.text, margin: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            letterSpacing: '-0.01em',
          }}>{performance.venue_name}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%', background: C.red,
              animation: 'pulse-dot 1.4s ease-in-out infinite',
              boxShadow: '0 0 4px rgba(220,38,38,0.6)',
            }} />
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#f87171' }}>Live</span>
          </div>
          <span style={{
            fontFamily: '"DM Mono", monospace', fontSize: 16, fontWeight: 700,
            color: C.text, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
          }}>{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* Progress bar — 2px, flush */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', flexShrink: 0, position: 'relative', zIndex: 10 }}>
        <div style={{ height: '100%', background: C.gold, width: `${progress * 100}%`, transition: 'width 1s linear', opacity: 0.4 }} />
      </div>

      {/* ── Scrollable middle: setlist ── */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 1, padding: '8px 16px 0' }}>

        {/* Unidentified banner */}
        {unidentifiedCount > 0 && (
          <div style={{
            background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.18)`,
            borderRadius: 10, padding: '8px 12px', marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 8,
            animation: 'fadeUp 0.2s ease',
          }}>
            <span style={{ fontSize: 10, color: C.amber }}>○</span>
            <p style={{ fontSize: 12, color: C.amber, margin: 0, fontWeight: 600 }}>
              {unidentifiedCount} {unidentifiedCount === 1 ? 'song' : 'songs'} need review
            </p>
          </div>
        )}

        {/* Song list */}
        {songs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {songs.map((song, i) => {
              const isUnidentified = song.source === 'unidentified'
              const isSuggested    = song.confidence_level === 'suggest'
              return (
                <div key={i} style={{
                  background: isUnidentified ? 'rgba(245,158,11,0.04)' : C.card,
                  border: `1px solid ${
                    editingIndex === i ? `rgba(201,168,76,0.4)`
                    : isUnidentified ? 'rgba(245,158,11,0.15)'
                    : 'rgba(255,255,255,0.04)'
                  }`,
                  borderRadius: 10, overflow: 'hidden',
                  animation: 'fadeUp 0.22s ease',
                  transition: 'border-color 0.15s ease',
                }}>
                  {editingIndex === i ? (
                    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <input autoFocus value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                        placeholder="Song title"
                        style={{ background: C.input, border: `1px solid rgba(201,168,76,0.3)`, borderRadius: 7, padding: '8px 10px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <input value={editArtist}
                        onChange={e => setEditArtist(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                        placeholder="Artist"
                        style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: C.gold, border: 'none', borderRadius: 7, color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <Check size={12} strokeWidth={2.5} /> Save
                        </button>
                        <button onClick={cancelEdit} style={{ padding: '8px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                      onClick={() => startEdit(i)}>
                      <span style={{ fontSize: 10, color: C.muted, minWidth: 14, textAlign: 'right', fontFamily: '"DM Mono", monospace', opacity: 0.5 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 14, fontWeight: 600, margin: 0,
                          color: isUnidentified ? C.amber : C.text,
                          opacity: isSuggested ? 0.75 : 1,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          fontStyle: isUnidentified ? 'italic' : 'normal',
                        }}>
                          {isUnidentified ? 'Unknown song' : song.title}
                        </p>
                        {!isUnidentified && song.artist && song.artist !== performance.artist_name && (
                          <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
                        )}
                      </div>
                      {/* State indicator */}
                      {isUnidentified
                        ? <span style={{ fontSize: 10, color: C.amber, opacity: 0.6, flexShrink: 0 }}>tap</span>
                        : <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, opacity: isSuggested ? 0.3 : 0.7, flexShrink: 0, display: 'inline-block' }} />
                      }
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 0 16px' }}>
            <p style={{ fontSize: 12, color: C.muted, margin: 0, letterSpacing: '0.04em' }}>
              {isListening ? 'Songs will appear here' : 'Tap the button to start'}
            </p>
          </div>
        )}

        {/* Add manually */}
        <div style={{ marginTop: 8, paddingBottom: 8 }}>
          <button
            onClick={() => setShowManual(v => !v)}
            style={{
              width: '100%', padding: '9px', background: 'transparent',
              border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 10,
              color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s ease', WebkitTapHighlightColor: 'transparent',
            }}>
            {showManual ? '✕ cancel' : '+ add manually'}
          </button>

          {showManual && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeUp 0.15s ease' }}>
              <input value={songInput} onChange={e => setSongInput(e.target.value)}
                placeholder="Song title" autoFocus
                style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 10px', color: C.text, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                onKeyDown={e => { if (e.key === 'Enter' && songInput.trim()) addSong() }} />
              <button onClick={addSong} disabled={!songInput.trim()}
                style={{ padding: '9px', background: songInput.trim() ? C.gold : 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 7, color: songInput.trim() ? '#0a0908' : C.muted, fontSize: 12, fontWeight: 700, cursor: songInput.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                Add
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Fixed bottom zone: pending card + button + end ── */}
      <div style={{
        position: 'relative', zIndex: 10, flexShrink: 0,
        padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10,
        background: `linear-gradient(to bottom, transparent, ${C.bg} 20%)`,
        paddingTop: 16,
      }}>

        {/* Pending candidate card */}
        {pendingCandidate && (
          <div style={{
            background: '#161310', border: `1px solid rgba(201,168,76,0.22)`,
            borderRadius: 14, padding: '12px 14px',
            animation: 'slideUp 0.18s ease',
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>
              Hearing something{pendingCandidate.matchCount > 1 ? ` · ${pendingCandidate.matchCount}×` : ''}
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 1px', letterSpacing: '-0.01em' }}>{pendingCandidate.title}</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 10px' }}>{pendingCandidate.artist}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={confirmPending}
                style={{ flex: 1, padding: '11px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em', WebkitTapHighlightColor: 'transparent', transition: 'transform 0.1s ease, opacity 0.1s ease' }}
                onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}>
                ✓ {pendingCandidate.title}
              </button>
              <button
                onClick={dismissPending}
                style={{ padding: '11px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Status line above button */}
        <div style={{ height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {lastCaught ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, animation: 'fadeUp 0.2s ease' }}>
              <span style={{ fontSize: 11, color: C.gold }}>✦</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{lastCaught}</span>
              <span style={{ fontSize: 11, color: C.muted }}>added</span>
            </div>
          ) : detectStatus && detectStatus !== 'listening...' ? (
            <span style={{ fontSize: 11, color: C.muted }}>{detectStatus}</span>
          ) : null}
        </div>

        {/* Main action button — thumb zone, full width feel */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          {/* Rings */}
          {isActive && [
            { size: isListening ? 176 : 160, delay: '0s' },
            { size: isListening ? 212 : 196, delay: '0.15s' },
          ].map(({ size, delay }, idx) => (
            <div key={idx} style={{
              position: 'absolute', width: size, height: size, borderRadius: '50%',
              border: `1px solid ${catchFlash
                ? C.gold + (idx === 0 ? '90' : '40')
                : C.gold + (idx === 0 ? '20' : '0e')}`,
              animation: catchFlash
                ? `ring-catch 0.8s ${delay} ease-out forwards`
                : `ring-pulse 3s ${delay} ease-out infinite`,
              top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }} />
          ))}

          <button
            onPointerDown={handleBtnPress}
            style={{
              width: 136, height: 136, borderRadius: '50%', border: 'none',
              cursor: 'pointer', position: 'relative', zIndex: 2,
              background: catchFlash
                ? `radial-gradient(circle at 40% 35%, #e8c76a, ${C.gold} 55%, #a07828)`
                : isListening
                ? `radial-gradient(circle at 40% 35%, ${C.gold}cc, ${C.gold} 55%, #8a6520)`
                : `radial-gradient(circle at 40% 35%, #201c16, #141108 55%, #0a0908)`,
              boxShadow: catchFlash
                ? `0 0 48px ${C.gold}55, 0 0 80px ${C.gold}18, inset 0 1px 0 rgba(255,255,255,0.2)`
                : isListening
                ? `0 0 32px ${C.gold}28, inset 0 1px 0 rgba(255,255,255,0.08)`
                : `0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`,
              transform: btnPressed ? 'scale(0.95)' : catchFlash ? 'scale(1.04)' : 'scale(1)',
              transition: 'transform 0.12s ease, box-shadow 0.3s ease, background 0.3s ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7,
              WebkitTapHighlightColor: 'transparent', outline: 'none',
            }}>
            <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isDetecting ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 20 }}>
                  {[0,1,2,3,4].map(i => (
                    <div key={i} style={{ width: 3, borderRadius: 2, background: isListening ? '#0a0908' : C.gold, animation: `wave-bar 0.7s ${i * 0.1}s ease-in-out infinite alternate`, height: 7 }} />
                  ))}
                </div>
              ) : (
                <svg width="22" height="26" viewBox="0 0 28 32" fill="none">
                  <rect x="8" y="0" width="12" height="20" rx="6" fill={isListening ? '#0a0908' : C.gold} opacity={0.9} />
                  <path d="M4 16c0 5.523 4.477 10 10 10s10-4.477 10-10" stroke={isListening ? '#0a0908' : C.gold} strokeWidth="2" strokeLinecap="round" fill="none" />
                  <line x1="14" y1="26" x2="14" y2="31" stroke={isListening ? '#0a0908' : C.gold} strokeWidth="2" strokeLinecap="round" />
                  <line x1="10" y1="31" x2="18" y2="31" stroke={isListening ? '#0a0908' : C.gold} strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: isListening ? '#0a090870' : C.gold + '70' }}>
              {isDetecting ? 'catching' : isListening ? 'listening' : 'tap to start'}
            </span>
          </button>
        </div>

        {/* End Performance */}
        <button
          onClick={handleEnd}
          disabled={ending}
          style={{
            width: '100%', padding: '12px', background: 'rgba(220,38,38,0.07)',
            border: `1px solid rgba(220,38,38,0.22)`, borderRadius: 10,
            color: ending ? C.muted : '#f87171', fontSize: 12, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: ending ? 'not-allowed' : 'pointer', opacity: ending ? 0.4 : 1,
            transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
          }}
          onTouchStart={e => { if (!ending) (e.currentTarget.style.background = 'rgba(220,38,38,0.14)') }}
          onTouchEnd={e => { if (!ending) (e.currentTarget.style.background = 'rgba(220,38,38,0.07)') }}>
          <span style={{ width: 6, height: 6, background: ending ? C.muted : C.red, borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
          {ending ? 'Ending...' : 'End Performance'}
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes pulse-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.75)} }
        @keyframes ring-pulse { 0%{opacity:.45;transform:translate(-50%,-50%) scale(.97)} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.18)} }
        @keyframes ring-catch { 0%{opacity:.85;transform:translate(-50%,-50%) scale(.94)} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.4)} }
        @keyframes wave-bar   { from{height:3px} to{height:16px} }
        @keyframes fadeUp     { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #4a4035; }
        input:focus { border-color: rgba(201,168,76,0.3) !important; outline: none; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
