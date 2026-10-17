'use client'
// Internal preview of the share cards with labelled sample data. Each card can
// be exported through the same path the celebration uses
// (lib/share-card-export.ts), so the shared image can be checked on a device.
import { useRef, useState } from 'react'
import { NightCard, MilestoneCard } from '@/components/share-cards/RecordCards'
import { exportShareCard, type ShareFormat } from '@/lib/share-card-export'

const SAMPLE = { artist: 'Northern Lights', venue: 'The Horseshoe Tavern', city: 'Toronto', date: 'Sat, Oct 10, 2026', songs: 12 }

function Exportable({ label, format, children }: { label: string; format: ShareFormat; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle')
  async function save() {
    const node = ref.current?.firstElementChild as HTMLElement | null
    if (!node) return
    setState('working')
    try {
      const blob = await exportShareCard(node, format)
      const file = new File([blob], `setlistr-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); URL.revokeObjectURL(url) }
      setState('idle')
    } catch (err) {
      if ((err as any)?.name === 'AbortError') { setState('idle'); return }
      console.error(err); setState('failed')
    }
  }
  return (
    <div style={{ width: 320 }}>
      <p style={{ fontSize: 11, color: '#8a7a68', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>{label}</p>
      <div ref={ref}>{children}</div>
      <button onClick={save} disabled={state === 'working'} style={{ marginTop: 10, width: '100%', minHeight: 40, borderRadius: 10, border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: '#c9a84c', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>
        {state === 'working' ? 'Preparing…' : state === 'failed' ? 'Export failed: try again' : 'Export image'}
      </button>
    </div>
  )
}

export default function SharePreviewPage() {
  const [format, setFormat] = useState<ShareFormat>('story')
  return (
    <div style={{ minHeight: '100svh', background: '#0a0908', fontFamily: '"DM Sans", system-ui, sans-serif', padding: '40px 20px' }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c9a84c', margin: '0 0 8px', textAlign: 'center' }}>Share card preview</p>
      <p style={{ fontSize: 13, color: '#8a7a68', margin: '0 0 20px', textAlign: 'center' }}>Sample data: {SAMPLE.artist} · {SAMPLE.venue} · {SAMPLE.date} · {SAMPLE.songs} songs</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
        {(['story', 'feed'] as ShareFormat[]).map(f => (
          <button key={f} onClick={() => setFormat(f)} aria-pressed={format === f} style={{ minHeight: 36, padding: '0 16px', borderRadius: 999, border: '1px solid rgba(201,168,76,0.4)', background: format === f ? 'rgba(201,168,76,0.18)' : 'transparent', color: '#c9a84c', fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer' }}>{f === 'story' ? 'Story 9:16' : 'Feed 4:5'}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', maxWidth: 1200, margin: '0 auto' }}>
        <Exportable label="The night" format={format}>
          <NightCard format={format} artistName={SAMPLE.artist} venueName={SAMPLE.venue} city={SAMPLE.city} date={SAMPLE.date} songCount={SAMPLE.songs} />
        </Exportable>
        <Exportable label="The night · long names" format={format}>
          <NightCard format={format} artistName="The Weather Station & the Northern Lights Orchestra" venueName="The Rex Hotel Jazz & Blues Bar" city="Saint-Jean-sur-Richelieu" date={SAMPLE.date} songCount={1} />
        </Exportable>
        <Exportable label="Milestone 50" format={format}>
          <MilestoneCard format={format} milestone={50} artistName={SAMPLE.artist} venueName={SAMPLE.venue} date={SAMPLE.date} />
        </Exportable>
        <Exportable label="Milestone 25" format={format}>
          <MilestoneCard format={format} milestone={25} artistName={SAMPLE.artist} venueName={SAMPLE.venue} date={SAMPLE.date} />
        </Exportable>
        <Exportable label="Milestone 250" format={format}>
          <MilestoneCard format={format} milestone={250} artistName="The Weather Station & the Northern Lights Orchestra" venueName="The Rex Hotel Jazz & Blues Bar" date={SAMPLE.date} />
        </Exportable>
        {/* Royalty Moment and First Appearance are held back until they're refined. */}
      </div>
    </div>
  )
}
