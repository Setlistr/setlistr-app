'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { normalizeSongKey } from '@/lib/reconciliation/normalize'

// ─── Standalone Upload Performance ─────────────────────────────────────────
// Deliberately does not import or mount anything from app/app/live/[id] —
// no MediaRecorder, no getUserMedia, no startListening/stopListening, no
// live-capture intervals or health logic. This page's only recognition
// dependency is /api/upload-identify.

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

type DetectedSong = {
  title: string; artist: string | null; isrc: string | null; composer: string | null
  publisher: string | null; source: string; inclusion_reason: string | null
  threshold: number | null; score: number | null
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
  const [scanLabel, setScanLabel] = useState('')
  const [scanError, setScanError] = useState('')
  const [lastCaught, setLastCaught] = useState<string | null>(null)

  const [venueName, setVenueName] = useState('')
  const [showDate, setShowDate] = useState(new Date().toISOString().slice(0, 10))
  const [startTime, setStartTime] = useState('')
  const [showType, setShowType] = useState<'single' | 'writers_round'>('single')

  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState('')

  const detectedSongsRef = useRef<DetectedSong[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Synchronous re-entry guard for goToReview — `finalizing` state is async
  // (won't disable the button until the next render), so a fast double-click
  // can invoke goToReview twice before that happens. This ref is checked and
  // set in the same synchronous tick, before any await.
  const finalizingRef = useRef(false)

  const beginScan = useCallback(async (file: File, perfId: string) => {
    setScanning(true)
    setScanProgress(0)
    setScanLabel('Reading file…')
    const supabase = createClient()
    try {
      const arrayBuffer = await file.arrayBuffer()
      const AudioCtx    = window.AudioContext || (window as any).webkitAudioContext
      const ctx         = new AudioCtx()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      ctx.close()

      const duration    = audioBuffer.duration
      const totalChunks = Math.max(1, Math.floor((duration - UPLOAD_CHUNK_SECONDS) / UPLOAD_CHUNK_STEP_SECONDS) + 1)

      for (let i = 0; i < totalChunks; i++) {
        const startSec = i * UPLOAD_CHUNK_STEP_SECONDS
        setScanLabel(`Scanning ${fmtClock(startSec)} / ${fmtClock(duration)}`)
        const wav = sliceToMonoWav(audioBuffer, startSec, UPLOAD_CHUNK_SECONDS)

        const form = new FormData()
        form.append('audio', wav, 'sample.wav')
        form.append('performance_id', perfId)
        form.append('previous_songs', JSON.stringify(detectedSongsRef.current.map(s => s.title)))

        let data: any = null
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          try {
            const res = await fetch('/api/upload-identify', {
              method: 'POST',
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: form,
            })
            data = await res.json()
          } catch { /* skip a failed chunk, keep going */ }
        }

        if (data?.detected && data.confidence_level === 'auto' && data.title) {
          const already = detectedSongsRef.current.some(s => isSameSong(s, { title: data.title }))
          if (!already) {
            detectedSongsRef.current = [...detectedSongsRef.current, {
              title: data.title,
              artist: data.artist || null,
              isrc: data.isrc || null,
              composer: data.composer || null,
              publisher: data.publisher || null,
              source: data.source || 'recognized',
              inclusion_reason: data.inclusion_reason || null,
              threshold: data.threshold ?? null,
              score: data.score ?? null,
            }]
            setLastCaught(data.title)
            setTimeout(() => setLastCaught(null), 3000)
          }
        }

        setScanProgress((i + 1) / totalChunks)
      }
      setScanLabel('Scan complete')
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

  const detailsValid = venueName.trim().length > 0 && showDate.length > 0
  const readyForReview = scanDone && detailsValid && !finalizing

  async function goToReview() {
    // Synchronous guard, checked and set before any await — must not rely on
    // `finalizing` state alone, since a second click can land before React
    // re-renders the disabled button.
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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save show details')
      router.push(`/app/review/${performanceId}`)
    } catch (err: any) {
      // Allow retry on failure — reset the guard.
      finalizingRef.current = false
      setFinalizing(false)
      setFinalizeError(err.message || 'Could not save show details')
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 20px 80px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: 0 }}>←</button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Upload a Performance</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Already played? Add a recording of the show.</p>
          </div>
        </div>

        {/* ── Step 1 — Choose Recording ─────────────────────────────────── */}
        {!recordingFile && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>Step 1 — Choose Recording</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.aac,.mov"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%', padding: '16px', background: 'rgba(255,255,255,0.02)', border: `2px dashed rgba(255,255,255,0.12)`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontSize: 14, fontWeight: 600 }}>
              Choose audio or video file
            </button>
          </div>
        )}

        {scanError && (
          <div style={{ padding: '12px 14px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{scanError}</p>
          </div>
        )}

        {/* ── Analysis progress ─────────────────────────────────────────── */}
        {recordingFile && (creatingDraft || scanning || scanDone) && (
          <div style={{ padding: '14px 16px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(creatingDraft || scanning) && (
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid rgba(201,168,76,0.3)`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              )}
              <p style={{ fontSize: 13, color: C.gold, margin: 0, fontWeight: 600 }}>
                {creatingDraft ? 'Starting…' : scanning ? `Analyzing your recording…` : 'Analysis complete'}
              </p>
            </div>
            {scanning && (
              <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(scanProgress * 100)}%`, background: C.gold, borderRadius: 2, transition: 'width 0.3s ease' }} />
              </div>
            )}
            {scanning && <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>{scanLabel} · {Math.round(scanProgress * 100)}%</p>}
            {lastCaught && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 2px' }}>{lastCaught}</p>
                <p style={{ fontSize: 11, fontWeight: 600, color: C.green, margin: 0 }}>captured</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2 — Show Details (shown once processing has started) ──── */}
        {performanceId && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>Step 2 — Show Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Venue <span style={{ color: C.red }}>*</span></label>
                <input type="text" value={venueName} onChange={e => setVenueName(e.target.value)} placeholder="Where did you play?"
                  spellCheck={false} autoCorrect="off" autoCapitalize="words"
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${venueName.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Date <span style={{ color: C.red }}>*</span></label>
                <input type="date" value={showDate} onChange={e => setShowDate(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Start Time <span style={{ color: C.muted, textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Show Type <span style={{ color: C.muted, textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <button type="button" onClick={() => setShowType(t => t === 'single' ? 'writers_round' : 'single')}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: showType === 'writers_round' ? C.goldDim : 'transparent', border: `1px solid ${showType === 'writers_round' ? C.borderGold : C.border}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                  <span style={{ fontSize: 14, color: showType === 'writers_round' ? C.gold : C.muted }}>{showType === 'writers_round' ? '✓' : '○'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: showType === 'writers_round' ? C.gold : C.secondary }}>Writer's Round</span>
                </button>
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
          <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: C.muted, margin: 0, textAlign: 'center' }}>Show details saved — waiting for analysis to finish…</p>
          </div>
        )}

        {performanceId && (
          <button
            onClick={goToReview}
            disabled={!readyForReview}
            style={{ width: '100%', padding: '16px', background: readyForReview ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: readyForReview ? 'pointer' : 'not-allowed', opacity: finalizing ? 0.7 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {finalizing
              ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving…</>
              : !scanDone ? 'Waiting for analysis…'
              : !detailsValid ? 'Complete show details'
              : 'Continue to Review →'}
          </button>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
      `}</style>
    </div>
  )
}
