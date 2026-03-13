'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Square, MapPin, Music, Mic, MicOff, Loader2 } from 'lucide-react'
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
}

type DetectedSong = {
  title: string
  artist: string
  source: 'detected' | 'manual'
  setlist_item_id?: string
}

export default function LiveCapturePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [showId, setShowId] = useState<string | null>(null)
  const [setlistId, setSetlistId] = useState<string | null>(null)
  const [artistId, setArtistId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [ending, setEnding] = useState(false)
  const [songInput, setSongInput] = useState('')
  const [songs, setSongs] = useState<DetectedSong[]>([])
  const [isListening, setIsListening] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectStatus, setDetectStatus] = useState<string>('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const listenIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

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

  useEffect(() => {
    return () => stopListening()
  }, [])

  const detectSong = useCallback(async (audioBlob: Blob) => {
    setIsDetecting(true)
    setDetectStatus('Identifying song...')
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('performance_id', params.id)
      if (showId) formData.append('show_id', showId)
      if (setlistId) formData.append('setlist_id', setlistId)
      if (artistId) formData.append('artist_id', artistId)

      const res = await fetch('/api/identify', { method: 'POST', body: formData })
      const data = await res.json()

      if (data.detected) {
        const { title, artist, setlist_item_id } = data
        setSongs(prev => {
          const alreadyExists = prev.some(
            s => s.title.toLowerCase() === title.toLowerCase() &&
                 s.artist.toLowerCase() === artist.toLowerCase()
          )
          if (alreadyExists) {
            setDetectStatus(`Already logged: ${title}`)
            setTimeout(() => setDetectStatus(''), 3000)
            return prev
          }
          setDetectStatus(`✓ ${title} — ${artist}`)
          setTimeout(() => setDetectStatus(''), 4000)
          return [...prev, { title, artist, source: 'detected', setlist_item_id }]
        })
      } else {
        setDetectStatus('Listening...')
      }
    } catch {
      setDetectStatus('Listening...')
    } finally {
      setIsDetecting(false)
    }
  }, [params.id, showId, setlistId, artistId])

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setIsListening(true)
      setDetectStatus('Listening...')

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
      setDetectStatus('Microphone access denied')
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

  const handleEnd = useCallback(async () => {
    if (ending || !performance) return
    setEnding(true)
    stopListening()
    const supabase = createClient()

    // Update performance status
    await supabase.from('performances').update({
      status: 'review',
      ended_at: new Date().toISOString(),
    }).eq('id', performance.id)

    // Update show status
    if (showId) {
      await supabase.from('shows').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      }).eq('id', showId)
    }

    // End capture session
    await supabase.from('capture_sessions').update({
      ended_at: new Date().toISOString(),
      status: 'ended',
    }).eq('performance_id', performance.id)

    // Write manual songs to setlist_items (detected songs already written by identify route)
    if (setlistId) {
      const manualSongs = songs.filter(s => s.source === 'manual')
      if (manualSongs.length > 0) {
        // Get current max position
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

      // Update setlist status to review
      await supabase.from('setlists').update({
        status: 'review',
        updated_at: new Date().toISOString(),
      }).eq('id', setlistId)
    }

    // Legacy: write all songs to performance_songs for review page compatibility
    if (songs.length > 0) {
      await supabase.from('performance_songs').insert(
        songs.map((song, i) => ({
          performance_id: performance.id,
          title: song.title,
          artist: song.artist || performance.artist_name,
          position: i + 1,
        }))
      )
    }

    router.push(`/app/review/${performance.id}`)
  }, [ending, performance, songs, router, stopListening, showId, setlistId])

  async function addSong() {
    const trimmed = songInput.trim()
    if (!trimmed) return
    setSongs(s => [...s, {
      title: trimmed,
      artist: performance?.artist_name || '',
      source: 'manual'
    }])
    setSongInput('')
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!performance) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="animate-pulse" style={{ color: C.gold }}>Loading...</div>
      </div>
    )
  }

  const totalSeconds = performance.set_duration_minutes * 60
  const progress = Math.min(elapsed / totalSeconds, 1)
  const remaining = Math.max(totalSeconds - elapsed, 0)
  const autoCloseAt = totalSeconds + (performance.auto_close_buffer_minutes || 5) * 60

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>

      <div className="flex items-center justify-center gap-2 pt-6 pb-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs uppercase tracking-[0.3em] text-red-400 font-medium">Live Now</span>
      </div>

      <div className="text-center px-6 py-4">
        <h1 className="font-display text-2xl mb-1" style={{ color: C.text }}>
          {performance.venue_name}
        </h1>
        <div className="flex items-center justify-center gap-1 text-sm" style={{ color: C.secondary }}>
          <MapPin size={12} />
          <span>{performance.city}, {performance.country}</span>
        </div>
        <p className="text-sm mt-1 font-medium" style={{ color: C.gold }}>
          {performance.artist_name}
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-7xl font-mono font-bold tracking-tight mb-2" style={{ color: C.text }}>
          {formatTime(elapsed)}
        </div>
        <div className="text-sm mb-8" style={{ color: C.secondary }}>
          {remaining > 0
            ? `${formatTime(remaining)} remaining`
            : `${formatTime(elapsed - totalSeconds)} over`}
        </div>
        <div className="w-full max-w-xs rounded-full h-1.5 mb-2" style={{ background: '#2a2620' }}>
          <div className="h-1.5 rounded-full transition-all duration-1000"
            style={{ width: `${progress * 100}%`, background: C.gold }} />
        </div>
        <div className="text-xs" style={{ color: C.muted }}>
          Auto-closes at {formatTime(autoCloseAt)}
        </div>
      </div>

      <div className="px-4 pb-4 max-w-lg mx-auto w-full">
        <div className="rounded-2xl p-4 mb-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>

          <div className="mb-4">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isDetecting}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm transition-all disabled:opacity-60"
              style={{
                background: isListening ? '#dc2626' : C.gold,
                color: isListening ? '#fff' : '#0a0908',
              }}
            >
              {isDetecting ? <Loader2 size={16} className="animate-spin" />
                : isListening ? <MicOff size={16} />
                : <Mic size={16} />}
              {isDetecting ? 'Identifying...' : isListening ? 'Stop Listening' : 'Auto-Detect Songs'}
            </button>
            {detectStatus && (
              <p className="text-center text-xs mt-2" style={{ color: C.gold }}>{detectStatus}</p>
            )}
            {isListening && !isDetecting && (
              <p className="text-center text-xs mt-1" style={{ color: C.secondary }}>Sampling every 30s</p>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Music size={14} style={{ color: C.gold }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: C.secondary }}>
              Or Add Manually
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={songInput}
              onChange={e => setSongInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSong()}
              placeholder="Song title..."
              className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
              style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
            />
            <button onClick={addSong}
              className="font-semibold px-4 rounded-xl text-sm"
              style={{ background: C.gold, color: '#0a0908' }}>
              Add
            </button>
          </div>

          {songs.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {songs.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs w-4" style={{ color: C.gold }}>{i + 1}</span>
                  <div className="flex-1">
                    <span style={{ color: C.text }}>{s.title}</span>
                    {s.artist && s.artist !== performance.artist_name && (
                      <span className="text-xs ml-1" style={{ color: C.secondary }}>— {s.artist}</span>
                    )}
                  </div>
                  {s.source === 'detected' && (
                    <span className="text-xs" style={{ color: C.gold + '80' }}>⚡ auto</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleEnd} disabled={ending}
          className="flex items-center justify-center gap-2 w-full font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
          style={{ background: '#dc2626', color: '#fff' }}>
          <Square size={16} fill="currentColor" />
          {ending ? 'Ending...' : 'End Performance'}
        </button>
      </div>
    </div>
  )
}
