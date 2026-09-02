'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

const UPLOAD_CHUNK_SECONDS      = 14
const UPLOAD_CHUNK_STEP_SECONDS = 20

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

export default function UploadShowPage() {
  const router = useRouter()
  const { actingAsArtistId } = useActingAs()

  const [venueName, setVenueName] = useState('')
  const [showDate, setShowDate] = useState(new Date().toISOString().slice(0, 10))

  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const [setlistFile, setSetlistFile] = useState<File | null>(null)

  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [scanProgress, setScanProgress] = useState(0)
  const [lastCaught, setLastCaught] = useState<string | null>(null)

  const recordingInputRef = useRef<HTMLInputElement>(null)
  const setlistInputRef = useRef<HTMLInputElement>(null)

  function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function handleSubmit() {
    if (!recordingFile || !venueName.trim()) return
    setUploadState('uploading')
    setError('')

    // ── DEV-ONLY TIMING INSTRUMENTATION — remove after the measurement run ──
    // `now()` goes through `window.performance` explicitly, not the bare
    // `performance` identifier, because this function later declares
    // `const { data: performance } = ...` (the performances-table row),
    // which shadows the global Performance API for the rest of the
    // function's scope — a bare `performance.now()` call anywhere in this
    // function would throw.
    const now = () => window.performance.now()
    const tStart = now()
    const timings: {
      storageUpload?: number; fileRead?: number; audioDecode?: number
      chunkScan?: number; finalInsert?: number
    } = {}
    const identifyDurations: number[] = []
    let identifySuccessCount = 0
    let identifyFailCount = 0
    let detectedResponseCount = 0
    let totalChunksCaptured = 0
    let confirmedSongsCaptured = 0

    function logTimingSummary() {
      const fmt = (ms: number | undefined) => ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(2)}s`
      const avgIdentify = identifyDurations.length > 0
        ? identifyDurations.reduce((a, b) => a + b, 0) / identifyDurations.length
        : undefined
      const fastestIdentify = identifyDurations.length > 0 ? Math.min(...identifyDurations) : undefined
      const slowestIdentify = identifyDurations.length > 0 ? Math.max(...identifyDurations) : undefined
      const timingSummary = {
        storageUpload: fmt(timings.storageUpload),
        fileRead: fmt(timings.fileRead),
        audioDecode: fmt(timings.audioDecode),
        chunkScan: fmt(timings.chunkScan),
        avgIdentify: fmt(avgIdentify),
        fastestIdentify: fmt(fastestIdentify),
        slowestIdentify: fmt(slowestIdentify),
        finalInsert: fmt(timings.finalInsert),
        total: fmt(now() - tStart),
        totalChunks: totalChunksCaptured,
        identifySuccessCount,
        identifyFailCount,
        detectedResponseCount,
        confirmedSongs: confirmedSongsCaptured,
      }
      console.log('[UploadTiming]', timingSummary)
      // Console output gets lost across the /app/review navigation (devtools
      // clears on nav unless "preserve log" is on) — sessionStorage survives
      // the client-side transition so the same run's numbers can still be
      // pulled from devtools afterward. Diagnostic only; nothing reads this key.
      try {
        window.sessionStorage.setItem('setlistr_upload_timing', JSON.stringify(timingSummary))
      } catch { /* sessionStorage unavailable — console log above still stands */ }
    }

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const targetUserId = actingAsArtistId || user.id

      setProgress('Uploading recording...')

      // Upload recording to Supabase Storage
      // NOTE: Terms of Service / Privacy Policy retention language (audio
      // fingerprinting + data-retention sections) states recordings uploaded
      // here are retained until deletion is requested — if this storage
      // behavior changes (e.g. adding auto-delete, changing the bucket),
      // update those legal pages too.
      const recordingExt = recordingFile.name.split('.').pop()
      const recordingPath = `${user.id}/${Date.now()}-recording.${recordingExt}`
      const tStorageStart = now()
      const { error: recordingError } = await supabase.storage
        .from('show-recordings')
        .upload(recordingPath, recordingFile, { upsert: false })
      timings.storageUpload = now() - tStorageStart
      if (recordingError) throw new Error('Recording upload failed: ' + recordingError.message)

      // Upload setlist if provided
      let setlistPath: string | null = null
      if (setlistFile) {
        setProgress('Uploading setlist...')
        const setlistExt = setlistFile.name.split('.').pop()
        setlistPath = `${user.id}/${Date.now()}-setlist.${setlistExt}`
        const { error: setlistError } = await supabase.storage
          .from('show-recordings')
          .upload(setlistPath, setlistFile, { upsert: false })
        if (setlistError) throw new Error('Setlist upload failed: ' + setlistError.message)
      }

      setProgress('Creating performance record...')

      // Create performance record
      const { data: show } = await supabase.from('shows').insert({
        name: venueName.trim(),
        show_type: 'single',
        started_at: new Date(showDate).toISOString(),
        status: 'completed',
        created_by: targetUserId,
      }).select().single()

      if (!show) throw new Error('Failed to create show')

      const { data: performance } = await supabase.from('performances').insert({
        show_id: show.id,
        artist_name: '',
        venue_name: venueName.trim(),
        performance_date: new Date(showDate).toISOString(),
        started_at: new Date(showDate).toISOString(),
        ended_at: new Date(showDate).toISOString(),
        status: 'review',
        set_duration_minutes: null,
        auto_close_buffer_minutes: 5,
        user_id: targetUserId,
        data_source: 'captured',
        recording_path: recordingPath,
        setlist_path: setlistPath,
      }).select().single()

      if (!performance) throw new Error('Failed to create performance')

      setUploadState('processing')
      setProgress('Reading audio file...')

      const detectedTitles: string[] = []
      const detectedSongs: { title: string; artist: string | null; isrc: string | null; composer: string | null; publisher: string | null; source: string; inclusion_reason: string | null; threshold: number | null; score: number | null }[] = []

      try {
        const tFileReadStart = now()
        const arrayBuffer = await recordingFile.arrayBuffer()
        timings.fileRead = now() - tFileReadStart

        const AudioCtx    = window.AudioContext || (window as any).webkitAudioContext
        const ctx         = new AudioCtx()
        const tDecodeStart = now()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        timings.audioDecode = now() - tDecodeStart
        ctx.close()

        const duration    = audioBuffer.duration
        const totalChunks = Math.max(1, Math.floor((duration - UPLOAD_CHUNK_SECONDS) / UPLOAD_CHUNK_STEP_SECONDS) + 1)
        totalChunksCaptured = totalChunks

        const tScanStart = now()
        for (let i = 0; i < totalChunks; i++) {
          const startSec = i * UPLOAD_CHUNK_STEP_SECONDS
          setProgress(`Scanning ${fmtClock(startSec)} / ${fmtClock(duration)}`)
          setScanProgress((i + 1) / totalChunks)

          const wav  = sliceToMonoWav(audioBuffer, startSec, UPLOAD_CHUNK_SECONDS)
          const form = new FormData()
          form.append('audio', wav, 'sample.wav')
          form.append('performance_id', performance.id)
          form.append('previous_songs', JSON.stringify(detectedTitles))

          const tIdentifyStart = now()
          try {
            const res  = await fetch('/api/identify', { method: 'POST', body: form })
            const data = await res.json()
            identifyDurations.push(now() - tIdentifyStart)
            identifySuccessCount++
            if (data?.detected === true) detectedResponseCount++
            if (data?.detected && data.confidence_level === 'auto' && data.title) {
              const norm = data.title.toLowerCase().trim()
              if (!detectedTitles.some(t => t.toLowerCase().trim() === norm)) {
                detectedTitles.push(data.title)
                detectedSongs.push({
                  title: data.title,
                  artist: data.artist || null,
                  isrc: data.isrc || null,
                  composer: data.composer || null,
                  publisher: data.publisher || null,
                  source: data.source || 'recognized',
                  inclusion_reason: data.inclusion_reason || null,
                  threshold: data.threshold ?? null,
                  score: data.score ?? null,
                })
                setLastCaught(data.title)
                setTimeout(() => setLastCaught(null), 3000)
              }
            }
          } catch {
            identifyDurations.push(now() - tIdentifyStart)
            identifyFailCount++
          }
        }
        timings.chunkScan = now() - tScanStart
      } catch { /* audio decode failed — proceed to review with whatever was detected */ }

      confirmedSongsCaptured = detectedSongs.length

      if (detectedSongs.length > 0) {
        const tInsertStart = now()
        await supabase.from('performance_songs').insert(
          detectedSongs.map((song, i) => ({
            performance_id: performance.id,
            title: song.title,
            artist: song.artist,
            position: i + 1,
            isrc: song.isrc,
            composer: song.composer,
            publisher: song.publisher,
            source: song.source,
            was_planned: false,
            inclusion_reason: song.inclusion_reason,
            threshold: song.threshold,
            score: song.score,
            confusion_matrix_result: 'TBD',
          }))
        )
        timings.finalInsert = now() - tInsertStart
      }

      setUploadState('done')
      router.push(`/app/review/${performance.id}`)

    } catch (err: any) {
      setError(err.message || 'Something went wrong.')
      setUploadState('error')
    } finally {
      logTimingSummary()
    }
  }

  const isValid = recordingFile && venueName.trim().length > 0
  const isLoading = uploadState === 'uploading' || uploadState === 'processing'

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '24px 20px 80px',
    }}>
      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: 0 }}>
            ←
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
              Upload a Show
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              Board mix, GoPro, or any recording
            </p>
          </div>
        </div>

        {uploadState === 'done' ? (
          <div style={{ background: C.card, border: `1px solid rgba(74,222,128,0.25)`, borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Upload complete.</h2>
            <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 4px', lineHeight: 1.5 }}>
              We're processing your recording. Your setlist will be ready shortly.
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Taking you to the review screen...</p>
          </div>
        ) : (
          <>
            {/* Show details */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>
                Show Details
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>
                    Venue
                  </label>
                  <input
                    type="text"
                    value={venueName}
                    onChange={e => setVenueName(e.target.value)}
                    placeholder="Where did you play?"
                    spellCheck={false} autoCorrect="off" autoCapitalize="words"
                    style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${venueName.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={showDate}
                    onChange={e => setShowDate(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark', WebkitAppearance: 'none' }}
                  />
                </div>
              </div>
            </div>

            {/* Recording upload */}
            <div style={{ background: C.card, border: `1px solid ${recordingFile ? C.borderGold : C.border}`, borderRadius: 16, padding: '20px', marginBottom: 12, transition: 'border-color 0.2s ease' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>
                Show Recording <span style={{ color: C.red, fontSize: 10 }}>REQUIRED</span>
              </p>
              <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.4 }}>
                Board mix, GoPro audio, voice memo — any recording from the show.
              </p>

              <input
                ref={recordingInputRef}
                type="file"
                accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.aac,.mov"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setRecordingFile(f) }}
              />

              {recordingFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recordingFile.name}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{formatFileSize(recordingFile.size)}</p>
                  </div>
                  <button onClick={() => setRecordingFile(null)}
                    style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => recordingInputRef.current?.click()}
                  style={{ width: '100%', padding: '16px', background: 'rgba(255,255,255,0.02)', border: `2px dashed rgba(255,255,255,0.12)`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontSize: 14, fontWeight: 600 }}>
                  Choose audio or video file
                </button>
              )}
            </div>

            {/* Setlist upload */}
            <div style={{ background: C.card, border: `1px solid ${setlistFile ? C.borderGold : C.border}`, borderRadius: 16, padding: '20px', marginBottom: 16, transition: 'border-color 0.2s ease' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>
                Setlist <span style={{ color: C.gold, fontSize: 10, fontWeight: 600 }}>OPTIONAL — BOOSTS VERIFICATION</span>
              </p>
              <p style={{ fontSize: 12, color: C.muted, margin: '0 0 14px', lineHeight: 1.4 }}>
                Add a photo or PDF of your setlist. We'll cross-reference it with the audio fingerprint for stronger verification.
              </p>

              <input
                ref={setlistInputRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setSetlistFile(f) }}
              />

              {setlistFile ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{setlistFile.name}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{formatFileSize(setlistFile.size)}</p>
                  </div>
                  <button onClick={() => setSetlistFile(null)}
                    style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setlistInputRef.current?.click()}
                  style={{ width: '100%', padding: '14px', background: 'rgba(255,255,255,0.02)', border: `2px dashed rgba(255,255,255,0.12)`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontSize: 13, fontWeight: 600 }}>
                  Add setlist photo or PDF
                </button>
              )}
            </div>

            {/* Verification badge */}
            <div style={{ padding: '12px 16px', background: setlistFile ? 'rgba(74,222,128,0.06)' : C.goldDim, border: `1px solid ${setlistFile ? 'rgba(74,222,128,0.2)' : C.borderGold}`, borderRadius: 10, marginBottom: 16, transition: 'all 0.2s ease' }}>
              <p style={{ fontSize: 13, color: setlistFile ? C.green : C.gold, margin: 0, fontWeight: 600 }}>
                {setlistFile
                  ? '✓ Dual verification — audio fingerprint + setlist document'
                  : '◎ Single verification — audio fingerprint only'}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: '12px 14px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 12 }}>
                <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Processing state */}
            {isLoading && (
              <div style={{ padding: '14px 16px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid rgba(201,168,76,0.3)`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: C.gold, margin: 0, fontWeight: 600 }}>{progress}</p>
                </div>
                {scanProgress > 0 && (
                  <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round(scanProgress * 100)}%`, background: C.gold, borderRadius: 2, transition: 'width 0.3s ease' }} />
                  </div>
                )}
                {lastCaught && (
                  <div style={{ marginTop: 14, textAlign: 'center', animation: 'fadeUp 0.3s ease' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 2px' }}>{lastCaught}</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.green, margin: 0, letterSpacing: '0.06em' }}>captured</p>
                  </div>
                )}
              </div>
            )}

            {/* Submit */}
            <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 8px' }}>By uploading, you confirm you have the right to record this performance. Ambient audio may include others nearby.</p>
            <button
              onClick={handleSubmit}
              disabled={!isValid || isLoading}
              style={{ width: '100%', padding: '16px', background: isValid && !isLoading ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: isValid && !isLoading ? 'pointer' : 'not-allowed', opacity: isLoading ? 0.7 : 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isLoading
                ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Processing...</>
                : 'Process Recording →'}
            </button>
          </>
        )}

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
      `}</style>
    </div>
  )
}
