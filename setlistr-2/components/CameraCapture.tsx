'use client'
import { useRef, useState } from 'react'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.3)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

interface Props {
  onCapture: (file: File) => void
  onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const [ready, setReady]   = useState(false)
  const [error, setError]   = useState('')

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // rear camera
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setReady(true)
      }
    } catch (err: any) {
      setError('Could not access camera. Use "Choose File" to upload a screenshot instead.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const video  = videoRef.current
    const canvas = canvasRef.current
    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], 'setlist.jpg', { type: 'image/jpeg' })
      stopCamera()
      onCapture(file)
      onClose()
    }, 'image/jpeg', 0.9)
  }

  function handleClose() {
    stopCamera()
    onClose()
  }

  // Start camera when component mounts
  if (typeof window !== 'undefined' && !streamRef.current && !error) {
    startCamera()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.95)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {error ? (
        <div style={{ padding: 24, textAlign: 'center', maxWidth: 320 }}>
          <p style={{ fontSize: 14, color: C.red, margin: '0 0 20px', lineHeight: 1.5 }}>{error}</p>
          <button onClick={handleClose}
            style={{ padding: '12px 24px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, color: C.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Close
          </button>
        </div>
      ) : (
        <>
          {/* Video preview */}
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ width: '100%', maxWidth: 480, borderRadius: 12, background: '#000' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Controls */}
          <div style={{ display: 'flex', gap: 16, marginTop: 24, alignItems: 'center' }}>
            <button onClick={handleClose}
              style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.08)', border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>

            {/* Shutter button */}
            <button onClick={capturePhoto} disabled={!ready}
              style={{ width: 72, height: 72, borderRadius: '50%', background: ready ? C.gold : C.muted, border: '4px solid rgba(255,255,255,0.3)', cursor: ready ? 'pointer' : 'default', transition: 'background 0.2s ease' }}>
            </button>

            <div style={{ width: 80 }} /> {/* spacer */}
          </div>

          <p style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
            Point at your setlist and tap the button
          </p>
        </>
      )}
    </div>
  )
}
