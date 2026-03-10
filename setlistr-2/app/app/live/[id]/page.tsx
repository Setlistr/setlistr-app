'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Square, MapPin, Music, Mic, MicOff, Loader2 } from 'lucide-react'
import type { Performance } from '@/types'

type DetectedSong = {
  title: string
  artist: string
  source: 'detected' | 'manual'
}

export default function LiveCapturePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance] = useState<Performance | null>(null)
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
    supabase.from('performances').select('*').eq('id', params.id).single()
      .then(({ data }) => { if (data) setPerformance(data) })
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
    const totalSeconds = (performance.set_duration_minutes + performance.auto_close_buffer_minutes) * 60
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
      const res = await fetch('/api/identify', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.detected) {
        const { title, artist } = data
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
          return [...prev, { title, artist, source: 'detected' }]
        })
      } else {
        setDetectStatus('Listening...')
      }
    } catch {
      setDetectStatus('Listening...')
    } finally {
      setIsDetecting(false)
    }
  }, [])

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
    await supabase.from('performances').update({
      status: 'review',
      ended_at: new Date().toISOString(),
    }).eq('id', performance.id)
    await supabase.from('capture_sessions').update({
      ended_at: new Date().toISOString(),
      status: 'ended',
    }).eq('performance_id', performance.id)
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
  }, [ending, performance, songs, router, stopListening])

  function addSong() {
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
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="text-gold animate-pulse">Loading...</div>
      </div>
    )
  }

  const totalSeconds = performance.set_duration_minutes * 60
  const progress = Math.min(elapsed / totalSeconds, 1)
  const remaining = Math.max(totalSeconds - elapsed, 0)
  const autoCloseAt = totalSeconds + performance.auto_close_buffer_minutes * 60

  return (
    <div className="min-h-screen bg-ink text-cream flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0f0e0c 100%)' }}>

      <div className="flex items-center justify-center gap-2 pt-6 pb-2">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"/>
        <span className="text-xs uppercase tracking-[0.3em] text-red-400 font-medium">Live Now</span>
      </div>

      <div className="text-center px-6 py-4">
        <h1 className="font-display text-2xl text-cream mb-1">{performance.venue_name}</h1>
        <div className="flex items-center justify-center gap-1 text-ink-light text-sm">
          <MapPin size={12} />
          <span>{performance.city}, {performance.country}</span>
        </div>
        <p className="text-gold text-sm mt-1 font-medium">{performance.artist_name}</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-7xl font-mono font-bold text-cream tracking-tight mb-2">
          {formatTime(elapsed)}
        </div>
        <div className="text-ink-light text-sm mb-8">
          {remaining > 0 ? `${formatTime(remaining)} remaining` : `${formatTime(elapsed - totalSeconds)} over`}
        </div>
        <div className="w-full max-w-xs bg-[#2a2620] rounded-full h-1.5 mb-2">
          <div className="h-1.5 rounded-full bg-gold transition-all duration-1000"
            style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="text-xs text-ink-light">Auto-closes at {formatTime(autoCloseAt)}</div>
      </div>

      <div className="px-4 pb-4 max-w-lg mx-auto w-full">
        <div className="bg-[#1a1814] rounded-2xl border border-[#2e2b26] p-4 mb-4">
          <div className="mb-4">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isDetecting}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold text-sm transition-all ${
                isListening ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gold hover:bg-yellow-400 text-ink'
              } disabled:opacity-60`}
            >
              {isDetecting ? <Loader2 size={16} className="animate-spin" />
                : isListening ? <MicOff size={16} />
                : <Mic size={16} />}
              {isDetecting ? 'Identifying...' : isListening ? 'Stop Listening' : 'Auto-Detect Songs'}
            </button>
            {detectStatus && (
              <p className="text-center text-xs mt-2 text-gold">{detectStatus}</p>
            )}
            {isListening && !isDetecting && (
              <p className="text-center text-xs mt-1 text-ink-light">Sampling every 30s</p>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Music size={14} className="text-gold" />
            <span className="text-xs uppercase tracking-wider text-ink-light">Or Add Manually</span>
          </div>
          <div className="flex gap-2">
            <input
              value={songInput}
              onChange={e => setSongInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSong()}
              placeholder="Song title..."
              className="flex-1 bg-[#0f0e0c] border border-[#2e2b26] rounded-xl px-3 py-2.5 text-cream placeholder:text-[#4a4640] text-sm focus:outline-none focus:border-gold"
            />
            <button onClick={addSong} className="bg-gold text-ink font-semibold px-4 rounded-xl text-sm">
              Add
            </button>
          </div>

          {songs.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {songs.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-cream">
                  <span className="text-gold font-mono text-xs w-4">{i + 1}</span>
                  <div className="flex-1">
                    <span>{s.title}</span>
                    {s.artist && s.artist !== performance.artist_name && (
                      <span className="text-ink-light text-xs ml-1">— {s.artist}</span>
                    )}
                  </div>
                  {s.source === 'detected' && (
                    <span className="text-xs text-gold/60">⚡ auto</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleEnd} disabled={ending}
          className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold rounded-2xl py-4 transition-colors">
          <Square size={16} fill="currentColor" />
          {ending ? 'Ending...' : 'End Performance'}
        </button>
      </div>
    </div>
  )
}
