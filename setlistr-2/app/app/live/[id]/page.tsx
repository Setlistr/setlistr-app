'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, X, RefreshCw } from 'lucide-react'
import type { Performance } from '@/types'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.15)', red: '#dc2626',
  amber: '#f59e0b', amberDim: 'rgba(245,158,11,0.12)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
}

const MIN_SONG_GAP_SECONDS     = 30
const CANDIDATE_WINDOW_SECONDS = 60
const HEARTBEAT_SLOW_MS  = 3 * 60 * 1000
const HEARTBEAT_STALL_MS = 5 * 60 * 1000
const AUTO_CLOSE_SILENCE_MS = 60 * 60 * 1000
const HARD_CEILING_MS = 4 * 60 * 60 * 1000
const SILENCE_WARNING_MS = 45 * 60 * 1000

type AcrCandidate = { title: string; artist: string; score: number }
type DetectedSong = {
  title: string; artist: string
  // 'planned' = pre-loaded, not yet heard. All other sources = confirmed.
  source: 'planned' | 'fingerprint' | 'humming' | 'transcript' | 'combined' | 'manual' | 'cloned' | 'unidentified'
  setlist_item_id?: string
  confidence_level?: 'auto' | 'suggest' | 'manual_review'
  isrc?: string; composer?: string; publisher?: string
  was_planned?: boolean  // was on setlist AND subsequently verified
}
type PendingCandidate = {
  title: string; artist: string
  firstDetectedAt: number; lastDetectedAt: number; matchCount: number
  source: DetectedSong['source']
  confidence_level?: 'auto' | 'suggest' | 'manual_review'
  candidates?: AcrCandidate[]; downgraded_reason?: string
}
type CandidateHistoryEntry = { title: string; artist: string; score: number; timestamp: number }
type RecentSong = { id: string; title: string; artist: string; play_count: number }
type EngineState = 'idle' | 'listening' | 'slow' | 'stalled'

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}
function isSameSong(a: { title: string }, b: { title: string }): boolean {
  return normalizeSongKey(a.title) === normalizeSongKey(b.title)
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
  const [plannedCount, setPlannedCount] = useState<number>(0)
  const plannedSongsRef = useRef<{ title: string; normalizedTitle: string; artist: string }[]>([])

  const [deletePending, setDeletePending] = useState<number | null>(null)
  const deletePendingTimerRef = useRef<NodeJS.Timeout | null>(null)

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
  const candidateHistoryRef = useRef<CandidateHistoryEntry[]>([])
  const showStartRef        = useRef<number>(Date.now())
  const lastPingRef         = useRef<number>(0)
  const lastSongRef         = useRef<number>(0)
  const isListeningRef      = useRef<boolean>(false)
  const endingRef           = useRef<boolean>(false)
  const wakeLockRef         = useRef<WakeLockSentinel | null>(null)

  useEffect(() => { pendingCandidateRef.current = pendingCandidate }, [pendingCandidate])
  useEffect(() => { confirmedSongsRef.current = songs }, [songs])
  useEffect(() => { isListeningRef.current = isListening }, [isListening])
  useEffect(() => { endingRef.current = ending }, [ending])

  useEffect(() => {
    return () => {
      if (deletePendingTimerRef.current) clearTimeout(deletePendingTimerRef.current)
      if (placementTimerRef.current) clearTimeout(placementTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('performances').select('*, show_id, setlist_id, artist_id').eq('id', params.id).single()
      .then(({ data }) => {
        if (data) {
          setPerformance(data); setShowId(data.show_id || null); setSetlistId(data.setlist_id || null); setArtistId(data.artist_id || null)
          if (data.started_at) showStartRef.current = new Date(data.started_at).getTime()
          const supabase2 = createClient()
          supabase2.from('performance_songs')
            .select('title, artist, isrc, composer, publisher, source, position, was_planned')
            .eq('performance_id', data.id)
            .order('position', { ascending: true })
            .then(({ data: existingSongs }) => {
              if (existingSongs && existingSongs.length > 0) {
                setSongs(existingSongs.map(s => ({
                  title: s.title || 'Unknown Song', artist: s.artist || '',
                  source: (s.source as any) || 'manual',
                  isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
                  was_planned: s.was_planned === true,
                })))
              }
            })
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
      const msSincePing = now - lastPingRef.current
      if (msSincePing < HEARTBEAT_SLOW_MS) setEngineState('listening')
      else if (msSincePing < HEARTBEAT_STALL_MS) setEngineState('slow')
      else setEngineState('stalled')
      const msSinceSong = now - (lastSongRef.current || showStartRef.current)
      if (lastSongRef.current > 0 && msSinceSong >= SILENCE_WARNING_MS && !endingRef.current) setShowSilenceWarning(true)
      if (lastSongRef.current > 0 && msSinceSong >= AUTO_CLOSE_SILENCE_MS && !endingRef.current) handleEndRef.current()
      if ((now - showStartRef.current) >= HARD_CEILING_MS && !endingRef.current) handleEndRef.current()
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { return () => stopListening() }, [])

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
    setSongs(prev => prev.map((s, i) => i === realIdx ? { ...s, source: 'manual', was_planned: true } : s))
    setLastCaught(song.title); setCatchFlash(true)
    const now = Date.now()
    lastSongRef.current = now; setLastSongAt(now); setShowSilenceWarning(false)
    setTimeout(() => setCatchFlash(false), 1200)
    setTimeout(() => setLastCaught(null), 4000)
  }

  const confirmCandidate = useCallback((candidate: PendingCandidate, setlist_item_id?: string, enriched?: { isrc?: string; composer?: string; publisher?: string }) => {
    const normalizedIncoming = normalizeSongKey(candidate.title)
    const plannedMatch = plannedSongsRef.current.find(p => p.normalizedTitle === normalizedIncoming)

    if (plannedMatch) {
      setSongs(prev => {
        const existingIdx = prev.findIndex(s => normalizeSongKey(s.title) === plannedMatch.normalizedTitle)
        if (existingIdx !== -1) {
          return prev.map((s, i) => i === existingIdx
            ? { ...s, source: candidate.source, confidence_level: candidate.confidence_level, was_planned: true, isrc: enriched?.isrc || s.isrc || '', composer: enriched?.composer || s.composer || '', publisher: enriched?.publisher || s.publisher || '' }
            : s)
        }
        return [...prev, { title: plannedMatch.title, artist: plannedMatch.artist || candidate.artist, source: candidate.source, setlist_item_id, confidence_level: candidate.confidence_level, was_planned: true, isrc: enriched?.isrc || '', composer: enriched?.composer || '', publisher: enriched?.publisher || '' }]
      })
    } else {
      setSongs(prev => [...prev, { title: candidate.title, artist: candidate.artist, source: candidate.source, setlist_item_id, confidence_level: candidate.confidence_level, was_planned: false, isrc: enriched?.isrc || '', composer: enriched?.composer || '', publisher: enriched?.publisher || '' }])
    }

    const now = Date.now()
    lastConfirmedAtRef.current = now; lastSongRef.current = now; setLastSongAt(now); setShowSilenceWarning(false)
    setPendingCandidate(null); setCatchFlash(true); setLastCaught(candidate.title)
    setTimeout(() => setCatchFlash(false), 1200); setTimeout(() => setLastCaught(null), 4000); setDetectStatus('')
    if (candidate.confidence_level === 'suggest' || candidate.source === 'manual') {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data: { user } }) => { if (user && params.id) writeUserSong(supabase, candidate.title, candidate.artist || '', user.id, params.id) })
    }
  }, [params.id])

  const confirmPending = useCallback(() => { if (!pendingCandidateRef.current) return; confirmCandidate(pendingCandidateRef.current) }, [confirmCandidate])
  const dismissPending = useCallback(() => { setPendingCandidate(null); setDetectStatus('') }, [])

  const detectSong = useCallback(async (audioBlob: Blob) => {
    setIsDetecting(true)
    const pingTime = Date.now(); lastPingRef.current = pingTime; setEngineState('listening')
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm'); formData.append('performance_id', params.id)
      if (showId) formData.append('show_id', showId); if (setlistId) formData.append('setlist_id', setlistId); if (artistId) formData.append('artist_id', artistId)
      if (performance?.artist_name) formData.append('artist_name', performance.artist_name); if (performance?.venue_name) formData.append('venue_name', performance.venue_name)
      formData.append('show_type', (performance as any).show_type || 'single')
      formData.append('previous_songs', JSON.stringify(confirmedSongsRef.current.filter(s => s.source !== 'planned').map(s => s.title)))
      formData.append('candidate_history', JSON.stringify(candidateHistoryRef.current))
      const res = await fetch('/api/identify', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.acr_score) { candidateHistoryRef.current = [{ title: data.title || '', artist: data.artist || '', score: data.acr_score, timestamp: Date.now() }, ...candidateHistoryRef.current].slice(0, 3) }
      const now = Date.now()
      const confirmed = confirmedSongsRef.current.filter(s => s.source !== 'planned')
      const pending = pendingCandidateRef.current
      if (!data.detected) { setDetectStatus(''); return }
      const { title, artist, setlist_item_id, source } = data
      let { confidence_level } = data
      if (confirmed.some(s => isSameSong(s, { title }))) { setDetectStatus(''); return }

      // ── Setlist-constrained auto-confirm ─────────────────────────────────
      // If the detected song is on the preloaded setlist, treat it as 'auto'
      // confidence regardless of what ACR returned. The pre-load is the first
      // vote; a single detection hit is sufficient corroboration.
      const isOnSetlist = plannedSongsRef.current.some(
        p => p.normalizedTitle === normalizeSongKey(title)
      )
      const effectiveConfidence = (isOnSetlist && confidence_level !== 'manual_review')
        ? 'auto'
        : confidence_level

      if (effectiveConfidence === 'auto') {
        const secondsSinceLast = (now - lastConfirmedAtRef.current) / 1000
        const isFirstSong      = confirmed.length === 0 && lastConfirmedAtRef.current === 0
        const cooldownPassed   = secondsSinceLast >= MIN_SONG_GAP_SECONDS

        if (isFirstSong) {
          confirmCandidate({ title, artist, source, confidence_level: effectiveConfidence, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 }, setlist_item_id, { isrc: data.isrc, composer: data.composer, publisher: data.publisher })
          return
        }
        if (!cooldownPassed) {
          if (pending && normalizeSongKey(pending.title) === normalizeSongKey(title)) {
            setPendingCandidate({ ...pending, lastDetectedAt: now, matchCount: pending.matchCount + 1 })
          } else if (!pending) {
            setPendingCandidate({ title, artist, source, confidence_level: effectiveConfidence, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 })
          }
          setDetectStatus(`hearing "${title}"...`); return
        }
        if (pending && normalizeSongKey(pending.title) === normalizeSongKey(title)) {
          confirmCandidate({ ...pending, lastDetectedAt: now, matchCount: pending.matchCount + 1 }, setlist_item_id, { isrc: data.isrc, composer: data.composer, publisher: data.publisher })
        } else {
          setPendingCandidate({ title, artist, source, confidence_level: effectiveConfidence, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 })
          setDetectStatus(`hearing "${title}"...`)
        }
        return
      }

      // Non-setlist 'suggest' — existing multi-hit logic
      if (effectiveConfidence === 'suggest') {
        if (pending && normalizeSongKey(pending.title) === normalizeSongKey(title)) {
          const updated: PendingCandidate = { ...pending, lastDetectedAt: now, matchCount: pending.matchCount + 1, source }
          const withinWindow = (now - pending.firstDetectedAt) / 1000 <= CANDIDATE_WINDOW_SECONDS
          if (withinWindow && updated.matchCount >= 2) { confirmCandidate(updated, setlist_item_id, { isrc: data.isrc, composer: data.composer, publisher: data.publisher }) } else { setPendingCandidate(updated); setDetectStatus(`hearing "${title}"... (${updated.matchCount}×)`) }
          return
        }
        const secondsSinceLast = (now - lastConfirmedAtRef.current) / 1000
        const cooldownPassed   = secondsSinceLast >= MIN_SONG_GAP_SECONDS
        const isFirstSong      = confirmed.length === 0 && lastConfirmedAtRef.current === 0
        if (!pending || cooldownPassed || isFirstSong) {
          setPendingCandidate({ title, artist, source, confidence_level: effectiveConfidence, firstDetectedAt: now, lastDetectedAt: now, matchCount: 1 })
          setDetectStatus(`hearing "${title}"...`)
        } else {
          setDetectStatus(`hearing "${pending.title}"...`)
        }
      }
    } catch { setDetectStatus('') } finally { setIsDetecting(false) }
  }, [params.id, showId, setlistId, artistId, confirmCandidate, performance])

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream; setIsListening(true)
      const pingTime = Date.now(); lastPingRef.current = pingTime; setEngineState('listening')
      try { if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen') } catch {}
      if (!placementShownRef.current) {
        placementShownRef.current = true; setShowPlacementCard(true)
        placementTimerRef.current = setTimeout(() => setShowPlacementCard(false), 8000)
      }
      const recordAndDetect = () => {
        if (isDetecting) return; chunksRef.current = []
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
        const recorder = new MediaRecorder(stream, { mimeType }); mediaRecorderRef.current = recorder
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        recorder.onstop = () => detectSong(new Blob(chunksRef.current, { type: mimeType }))
        recorder.start(); setTimeout(() => { if (recorder.state === 'recording') recorder.stop() }, 12000)
      }
      recordAndDetect(); listenIntervalRef.current = setInterval(recordAndDetect, 20000)
    } catch { setIsListening(false) }
  }, [detectSong, isDetecting])

  const stopListening = useCallback(() => {
    if (listenIntervalRef.current) { clearInterval(listenIntervalRef.current); listenIntervalRef.current = null }
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setIsListening(false); setEngineState('idle'); setDetectStatus('')
    if (wakeLockRef.current) { try { wakeLockRef.current.release() } catch {}; wakeLockRef.current = null }
  }, [])

  const restartListening = useCallback(async () => {
    setRestarting(true); stopListening()
    await new Promise(r => setTimeout(r, 400))
    await startListening(); setRestarting(false)
  }, [stopListening, startListening])

  const handleEnd = useCallback(async () => {
    if (endingRef.current || !performance) return
    setEnding(true); endingRef.current = true; stopListening()
    const supabase = createClient()
    await supabase.from('performances').update({ status: 'review', ended_at: new Date().toISOString() }).eq('id', performance.id)
    if (showId) await supabase.from('shows').update({ status: 'completed', ended_at: new Date().toISOString() }).eq('id', showId)
    await supabase.from('capture_sessions').update({ ended_at: new Date().toISOString(), status: 'ended' }).eq('performance_id', performance.id)
    if (setlistId) {
      const manualSongs = confirmedSongsRef.current.filter(s => s.source === 'manual' && !s.was_planned)
      if (manualSongs.length > 0) {
        const { data: existingItems } = await supabase.from('setlist_items').select('position').eq('setlist_id', setlistId).order('position', { ascending: false }).limit(1)
        const startPosition = (existingItems?.[0]?.position || 0) + 1
        await supabase.from('setlist_items').insert(manualSongs.map((song, i) => ({ setlist_id: setlistId, title: song.title, artist_name: song.artist || performance.artist_name, position: startPosition + i, source: 'manual' })))
      }
      await supabase.from('setlists').update({ status: 'review', updated_at: new Date().toISOString() }).eq('id', setlistId)
    }
    await supabase.from('performance_songs').delete().eq('performance_id', performance.id)

    // Save ALL songs — including planned-but-unverified so the artist can
    // confirm or remove them on the review screen. Nothing gets silently dropped.
    const songsToSave = confirmedSongsRef.current.filter(s => s.source !== 'unidentified' || s.title !== 'Unknown Song')
    if (songsToSave.length > 0) {
      await supabase.from('performance_songs').insert(songsToSave.map((song, i) => ({
        performance_id: performance.id,
        title: song.source === 'unidentified' ? (song.title === 'Unknown Song' ? null : song.title) : song.title,
        artist: song.artist || performance.artist_name || null,
        position: i + 1,
        isrc: song.isrc || null,
        composer: song.composer || null,
        publisher: song.publisher || null,
        source: song.source || 'manual',
        was_planned: song.was_planned || false,
      })))
    }
    router.push(`/app/review/${performance.id}`)
  }, [performance, songs, router, stopListening, showId, setlistId])

  useEffect(() => { handleEndRef.current = handleEnd }, [handleEnd])

  async function addSong() {
    const trimmed = songInput.trim(); if (!trimmed) return
    setSongs(s => [...s, { title: trimmed, artist: performance?.artist_name || '', source: 'manual', was_planned: false }]); setSongInput('')
  }

  function formatTime(s: number) { const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${sec.toString().padStart(2, '0')}` }

  if (!performance) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: `2px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite', opacity: 0.6 }} />
        <span style={{ color: C.muted, fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
      </div>
      <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.9} }`}</style>
    </div>
  )

  const confirmedSongs = songs.filter(s => s.source !== 'planned' && s.source !== 'unidentified')
  const waitingSongs   = songs.filter(s => s.source === 'planned')
  const unknownSongs   = songs.filter(s => s.source === 'unidentified')
  const verifiedCount  = songs.filter(s => s.was_planned && s.source !== 'planned').length

  const ringState   = catchFlash ? 'catch' : isDetecting ? 'detect' : isListening ? 'listen' : 'idle'
  const engineDot   = engineState === 'listening' ? C.green : engineState === 'slow' ? C.amber : engineState === 'stalled' ? '#f87171' : C.muted
  const engineLabel = engineState === 'listening' ? 'LISTENING' : engineState === 'slow' ? 'SLOW' : engineState === 'stalled' ? 'STALLED' : 'IDLE'

  function renderTrustSignal() {
    if (lastCaught) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, animation: 'trustPop 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16, color: C.gold }}>✦</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{lastCaught}</span>
          </div>
          <span style={{ fontSize: 11, color: C.green, fontWeight: 600, letterSpacing: '0.06em' }}>CAUGHT</span>
        </div>
      )
    }
    if (engineState === 'stalled' && isListening) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'fadeIn 0.2s ease' }}>
          <span style={{ fontSize: 13, color: '#f87171', fontWeight: 600 }}>Engine stalled — tap to restart</span>
          <button onClick={restartListening} disabled={restarting}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 20, color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: restarting ? 0.6 : 1, WebkitTapHighlightColor: 'transparent' }}>
            <RefreshCw size={12} style={{ animation: restarting ? 'spin 0.7s linear infinite' : 'none' }} />
            {restarting ? 'Restarting...' : 'Restart'}
          </button>
        </div>
      )
    }
    if (engineState === 'slow' && isListening) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'fadeIn 0.2s ease' }}>
          <span style={{ fontSize: 12, color: C.amber, fontWeight: 500, textAlign: 'center' as const }}>Having trouble hearing — move closer to the speakers</span>
          <button onClick={restartListening} disabled={restarting}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: 'transparent', border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 20, color: C.amber, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
            <RefreshCw size={11} style={{ animation: restarting ? 'spin 0.7s linear infinite' : 'none' }} />{restarting ? 'Restarting...' : 'Restart'}
          </button>
        </div>
      )
    }
    if (pendingCandidate) {
      const isOnSetlist = plannedSongsRef.current.some(p => p.normalizedTitle === normalizeSongKey(pendingCandidate.title))
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: isOnSetlist ? C.green : C.amber, animation: 'pulse-dot 1s ease-in-out infinite' }} />
          <span style={{ fontSize: 13, color: C.secondary, fontWeight: 500 }}>
            {isOnSetlist ? `Hearing "${pendingCandidate.title}"...` : 'Hearing something...'}
          </span>
        </div>
      )
    }
    if (lastSongAt > 0 && isListening) return <span style={{ fontSize: 11, color: C.muted + '90' }}>Last song {timeAgo(lastSongAt)}</span>
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
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, animation: 'pulse-dot 1.6s ease-in-out infinite', boxShadow: `0 0 6px ${C.green}60` }} />
          <span style={{ fontSize: 12, color: C.muted + 'a0', animation: 'breathe-text 3s ease-in-out infinite' }}>Listening...</span>
        </div>
      )
    }
    return null
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: '"DM Sans", system-ui, sans-serif', overflowX: 'hidden', overscrollBehavior: 'none' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '70vh', background: isListening ? `radial-gradient(ellipse at 50% 35%, rgba(201,168,76,0.08) 0%, transparent 65%)` : `radial-gradient(ellipse at 50% 35%, rgba(201,168,76,0.03) 0%, transparent 55%)`, pointerEvents: 'none', transition: 'background 1.8s ease', zIndex: 0 }} />

      {/* Header */}
      <div style={{ position: 'relative', zIndex: 10, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, letterSpacing: '-0.01em' }}>{performance.venue_name}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: engineDot, animation: engineState === 'listening' ? 'pulse-dot 1.4s ease-in-out infinite' : 'none', boxShadow: engineState === 'listening' ? `0 0 5px ${engineDot}80` : 'none', transition: 'background 0.5s ease' }} />
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: engineDot, transition: 'color 0.5s ease' }}>{engineLabel}</span>
          </div>
          {confirmedSongs.length > 0 && (
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 13, fontWeight: 800, color: C.gold, letterSpacing: '-0.01em', animation: 'fadeIn 0.3s ease' }}>{confirmedSongs.length}♪</span>
          )}
          <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 16, fontWeight: 700, color: C.muted, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* Progress bar */}
      {plannedCount > 0 && isListening && (
        <div style={{ position: 'relative', zIndex: 10, background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}`, padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: C.green, borderRadius: 2, width: `${Math.min((verifiedCount / plannedCount) * 100, 100)}%`, transition: 'width 0.6s ease' }} />
          </div>
          <span style={{ fontSize: 11, color: C.green, fontWeight: 700, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{verifiedCount}/{plannedCount}</span>
          <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>verified</span>
        </div>
      )}

      {/* Silence warning */}
      {showSilenceWarning && !ending && (
        <div style={{ position: 'relative', zIndex: 10, background: 'rgba(201,168,76,0.08)', borderBottom: `1px solid rgba(201,168,76,0.2)`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0, animation: 'slideDown 0.2s ease' }}>
          <p style={{ fontSize: 12, color: C.gold, margin: 0 }}>No songs in a while · auto-closing soon</p>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => { setShowSilenceWarning(false); lastSongRef.current = Date.now() }} style={{ padding: '6px 12px', background: C.goldDim, border: `1px solid rgba(201,168,76,0.3)`, borderRadius: 8, color: C.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>Keep Going</button>
            <button onClick={handleEnd} style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>End Now</button>
          </div>
        </div>
      )}

      {/* Hero */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px 28px', flexShrink: 0 }}>
        {(isListening || catchFlash) && (
          <>
            {[{ size: ringState === 'catch' ? 220 : 200, delay: '0s' }, { size: ringState === 'catch' ? 262 : 242, delay: '0.1s' }, { size: ringState === 'catch' ? 304 : 284, delay: '0.2s' }].map(({ size, delay }, idx) => (
              <div key={idx} style={{ position: 'absolute', width: size, height: size, borderRadius: '50%', border: `1px solid ${ringState === 'catch' ? C.gold + (idx === 0 ? 'cc' : idx === 1 ? '60' : '28') : C.gold + (idx === 0 ? '28' : idx === 1 ? '14' : '08')}`, animation: ringState === 'catch' ? `ring-catch 0.85s ${delay} ease-out forwards` : `ring-pulse 2.6s ${delay} ease-out infinite`, top: 40, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
            ))}
          </>
        )}
        <button onClick={isListening ? stopListening : startListening} disabled={isDetecting && !isListening}
          style={{ width: 160, height: 160, borderRadius: '50%', border: 'none', cursor: isDetecting && !isListening ? 'wait' : 'pointer', position: 'relative', zIndex: 2, background: catchFlash ? `radial-gradient(circle at 40% 35%, #e8c76a, ${C.gold} 55%, #a07828)` : isListening ? `radial-gradient(circle at 40% 35%, ${C.gold}cc, ${C.gold} 55%, #8a6520)` : `radial-gradient(circle at 40% 35%, #2a2520, #1a1610 55%, #0f0e0c)`, boxShadow: catchFlash ? `0 0 60px ${C.gold}80, 0 0 120px ${C.gold}30, inset 0 1px 0 rgba(255,255,255,0.25)` : isListening ? `0 0 40px ${C.gold}40, 0 0 80px ${C.gold}18, inset 0 1px 0 rgba(255,255,255,0.12)` : `0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`, transform: catchFlash ? 'scale(1.05)' : 'scale(1)', transition: 'background 0.4s ease, box-shadow 0.4s ease, transform 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, WebkitTapHighlightColor: 'transparent', outline: 'none', touchAction: 'manipulation' }}>
          <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isDetecting ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 28 }}>
                {[0,1,2,3,4].map(i => <div key={i} style={{ width: 3, borderRadius: 2, background: isListening ? '#0a0908' : C.gold, animation: `wave-bar 0.8s ${i * 0.12}s ease-in-out infinite alternate`, height: 10 }} />)}
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

        <div style={{ marginTop: 22, minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {renderTrustSignal()}
        </div>

        {showPlacementCard && (
          <div style={{ marginTop: 8, maxWidth: 300, width: '100%', background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.09)`, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeUp 0.3s ease' }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>📍</span>
            <span style={{ fontSize: 12, color: C.secondary, lineHeight: 1.4, flex: 1 }}>Best results at front of house or near the PA</span>
            <button onClick={dismissPlacementCard} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', WebkitTapHighlightColor: 'transparent' }}><X size={13} /></button>
          </div>
        )}
      </div>

      {/* Pending card */}
      {pendingCandidate && (
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '0 16px 12px', animation: 'slideUp 0.2s ease' }}>
          <div style={{ background: '#161310', border: `1px solid rgba(201,168,76,0.22)`, borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>
              Hearing something{pendingCandidate.matchCount > 1 ? ` · ${pendingCandidate.matchCount}×` : ''}
              {plannedSongsRef.current.some(p => p.normalizedTitle === normalizeSongKey(pendingCandidate.title)) && (
                <span style={{ marginLeft: 6, color: C.green }}>· on your setlist ✓</span>
              )}
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 2px', letterSpacing: '-0.01em' }}>{pendingCandidate.title}</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 12px' }}>{pendingCandidate.artist}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmPending} style={{ flex: 1, padding: '10px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>✓ {pendingCandidate.title}</button>
              <button onClick={dismissPending} style={{ padding: '10px 15px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>✕</button>
            </div>
          </div>
        </div>
      )}

      {/* Lower section */}
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 40px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Confirmed — heard or manually added */}
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
                  border: `1px solid ${isPendingDel ? 'rgba(220,38,38,0.35)' : editingIndex === realIdx ? 'rgba(201,168,76,0.45)' : isVerified ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)'}`,
                  borderLeft: isVerified && !isPendingDel && editingIndex !== realIdx ? `3px solid rgba(74,222,128,0.55)` : undefined,
                  borderRadius: 10, overflow: 'hidden',
                  animation: 'songPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
                  transition: 'border-color 0.2s ease',
                }}>
                  {editingIndex === realIdx ? (
                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} placeholder="Song title"
                        style={{ background: C.input, border: `1px solid rgba(201,168,76,0.35)`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <input value={editArtist} onChange={e => setEditArtist(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }} placeholder="Artist"
                        style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveEdit} style={{ flex: 1, padding: '8px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><Check size={12} strokeWidth={2.5} /> Save</button>
                        <button onClick={cancelEdit} style={{ padding: '8px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', minHeight: 52 }} onClick={() => !isPendingDel && startEdit(realIdx)}>
                      <span style={{ fontSize: 11, color: C.muted, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace', opacity: 0.45 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: isPendingDel ? '#f87171' : C.text, opacity: isSuggested ? 0.75 : 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                        {isPendingDel
                          ? <p style={{ fontSize: 11, color: '#f87171', margin: '2px 0 0', fontWeight: 600 }}>Tap ✕ again to delete</p>
                          : isVerified
                          ? <p style={{ fontSize: 10, color: C.green, margin: '2px 0 0', fontWeight: 600, opacity: 0.85 }}>Verified ✓</p>
                          : song.artist && song.artist !== performance.artist_name
                          ? <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.artist}</p>
                          : null
                        }
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {!isPendingDel && (
                          isVerified
                            ? <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={10} color={C.green} strokeWidth={2.5} />
                              </div>
                            : <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, opacity: isSuggested ? 0.3 : 0.65, display: 'inline-block' }} />
                        )}
                        <button onClick={e => handleDeleteTap(e, realIdx)}
                          style={{ background: isPendingDel ? 'rgba(220,38,38,0.15)' : 'none', border: isPendingDel ? '1px solid rgba(220,38,38,0.35)' : 'none', borderRadius: 6, color: isPendingDel ? '#f87171' : C.muted, cursor: 'pointer', padding: isPendingDel ? '4px 8px' : '4px 6px', fontSize: isPendingDel ? 11 : 14, lineHeight: 1, opacity: isPendingDel ? 1 : 0.5, WebkitTapHighlightColor: 'transparent', fontWeight: isPendingDel ? 700 : 400, transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
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
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px', paddingLeft: 2 }}>
              On your setlist · waiting to be heard
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {waitingSongs.map((song, i) => {
                const realIdx = songs.indexOf(song)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'rgba(255,255,255,0.02)', border: `1px dashed rgba(255,255,255,0.09)`, borderRadius: 10, opacity: 0.6 }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid rgba(255,255,255,0.15)`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.secondary, margin: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                    <button onClick={() => markPlannedAsPlayed(realIdx)}
                      style={{ flexShrink: 0, padding: '4px 10px', background: 'transparent', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 6, color: C.muted, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', WebkitTapHighlightColor: 'transparent' }}>
                      Played
                    </button>
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
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: 12, color: C.muted }}>○ {unknownSongs.length} moment{unknownSongs.length > 1 ? 's' : ''} couldn't be identified</span>
              <span style={{ fontSize: 10, color: C.muted, opacity: 0.6 }}>{showUnknowns ? '▲' : '▼'}</span>
            </button>
            {showUnknowns && (
              <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3, animation: 'slideUp 0.15s ease' }}>
                {unknownSongs.map((song, i) => {
                  const realIdx = songs.indexOf(song)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(245,158,11,0.04)', border: `1px solid rgba(245,158,11,0.12)`, borderRadius: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} onClick={() => startEdit(realIdx)}>
                      <span style={{ fontSize: 12, color: C.amber, fontStyle: 'italic', flex: 1 }}>Unknown — tap to fill</span>
                      <button onClick={e => handleDeleteTap(e, realIdx)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: '4px', opacity: 0.5, WebkitTapHighlightColor: 'transparent' }}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <button onClick={() => setShowManual(v => !v)}
          style={{ width: '100%', padding: '13px', background: showManual ? 'transparent' : 'rgba(201,168,76,0.08)', border: `1px solid ${showManual ? C.border : 'rgba(201,168,76,0.25)'}`, borderRadius: 10, color: showManual ? C.muted : C.gold, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 400 }}>{showManual ? '✕' : '+'}</span>
          {showManual ? 'cancel' : 'Add a Song'}
        </button>

        {showManual && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'slideUp 0.15s ease' }}>
            <input value={songInput} onChange={e => setSongInput(e.target.value)} placeholder="Search or type a song title..." autoFocus
              style={{ background: C.input, border: `1px solid rgba(201,168,76,0.3)`, borderRadius: 8, padding: '12px 14px', color: C.text, fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
              onKeyDown={e => { if (e.key === 'Enter' && songInput.trim()) addSong() }} />
            {songInput.trim() && <button onClick={addSong} style={{ padding: '11px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>Add "{songInput.trim()}"</button>}
            {recentSongs.length > 0 && !songInput.trim() && (
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Recent songs</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {recentSongs.map(s => (
                    <button key={s.id} onClick={() => { setSongs(prev => [...prev, { title: s.title, artist: s.artist || performance?.artist_name || '', source: 'manual', was_planned: false }]); setShowManual(false) }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 12px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', WebkitTapHighlightColor: 'transparent', minHeight: 48 }}
                      onTouchStart={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.1)')} onTouchEnd={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</p>
                        {s.artist && <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>{s.artist}</p>}
                      </div>
                      {s.play_count > 1 && <span style={{ fontSize: 11, color: C.gold, opacity: 0.6, flexShrink: 0, marginLeft: 8, fontFamily: '"DM Mono", monospace' }}>×{s.play_count}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={handleEnd} disabled={ending}
          style={{ width: '100%', padding: '14px', background: 'rgba(220,38,38,0.07)', border: `1px solid rgba(220,38,38,0.22)`, borderRadius: 10, color: ending ? C.muted : '#f87171', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: ending ? 'not-allowed' : 'pointer', opacity: ending ? 0.4 : 1, transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ width: 6, height: 6, background: ending ? C.muted : C.red, borderRadius: 1, display: 'inline-block', flexShrink: 0 }} />
          {ending ? 'Ending...' : 'End Show'}
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes pulse-dot    { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
        @keyframes ring-pulse   { 0%{opacity:.5;transform:translateX(-50%) scale(.97)} 100%{opacity:0;transform:translateX(-50%) scale(1.2)} }
        @keyframes ring-catch   { 0%{opacity:.9;transform:translateX(-50%) scale(.93)} 100%{opacity:0;transform:translateX(-50%) scale(1.42)} }
        @keyframes wave-bar     { from{height:4px} to{height:22px} }
        @keyframes slideUp      { from{opacity:0;transform:translateY(6px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes slideDown    { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes songPop      { 0%{opacity:0;transform:translateY(4px) scale(0.96)} 60%{transform:translateY(-2px) scale(1.01)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp       { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe      { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.9} }
        @keyframes breathe-text { 0%,100%{opacity:0.5} 50%{opacity:0.85} }
        @keyframes dot-bounce   { 0%,100%{transform:translateY(0);opacity:0.4} 50%{transform:translateY(-4px);opacity:1} }
        @keyframes trustPop     { 0%{opacity:0;transform:scale(0.9) translateY(4px)} 70%{transform:scale(1.04) translateY(-1px)} 100%{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes spin         { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #5a5040; }
        input:focus { border-color: rgba(201,168,76,0.3) !important; outline: none; }
        ::-webkit-scrollbar { display: none; }
        html, body { overscroll-behavior: none; }
      `}</style>
    </div>
  )
}
