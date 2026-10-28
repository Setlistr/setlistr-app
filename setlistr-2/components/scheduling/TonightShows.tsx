'use client'
// "Tonight's show, one tap" (docs/tonight-show-one-tap-plan.md). One shared
// vocabulary for the Dashboard's Tonight row and the gold capture button's
// first screen, so both say and do the same thing. Every Start goes through
// the existing linked start (useShowActions → POST /api/shows/schedule/[id]/
// start → live capture, autostart) with its existing confirmation.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Mic, Play } from 'lucide-react'
import { tonightShows, type TonightItem } from '@/lib/tonightShows'
import type { ScheduledShow } from './UpcomingShows'

export type Item = TonightItem<ScheduledShow>
// Who is capturing the artist's in-progress show (from /api/shows/timeline's
// active section). own: the signed-in person may rejoin it; otherwise it is
// status only — never an action that starts listening on a second device.
export type ActiveCapture = { id: string; venue: string | null; started_at: string; own?: boolean; by?: 'you' | 'artist' | 'teammate'; byName?: string | null }

const REFRESH_MS = 60_000

// Loads the artist's still-scheduled shows and any capture in progress.
// Reloads on focus, when the page becomes visible, and every minute (which
// also re-evaluates "tonight" against the clock, e.g. at midnight).
// Responses for a workspace the viewer has since switched away from are
// dropped, and the list is cleared at once on a switch.
export function useTonightShows(artistId: string | null, enabled: boolean) {
  const [shows, setShows] = useState<ScheduledShow[]>([])
  const [active, setActive] = useState<ActiveCapture | null>(null)
  const [now, setNow] = useState(() => new Date())
  const reqFor = useRef<string | null>(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!artistId || !enabled) return
    const mine = ++seq.current, forId = artistId
    reqFor.current = forId
    try {
      const [s, a] = await Promise.all([
        fetch(`/api/shows/schedule?artist_id=${forId}`, { cache: 'no-store' }),
        fetch(`/api/shows/timeline?artist_id=${forId}&section=active`, { cache: 'no-store' }),
      ])
      if (mine !== seq.current || reqFor.current !== forId) return
      // A failed read offers nothing to start (never a stale list).
      setShows(s.ok ? ((await s.json()).shows || []) : [])
      setActive(a.ok ? ((await a.json()).active || null) : null)
      setNow(new Date())
    } catch {
      if (mine === seq.current) { setShows([]); setActive(null) }
    }
  }, [artistId, enabled])

  useEffect(() => {
    setShows([]); setActive(null)
    if (!artistId || !enabled) return
    load()
    const onFocus = () => load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    const t = setInterval(load, REFRESH_MS)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisible); clearInterval(t) }
  }, [artistId, enabled, load])

  const deviceZone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null } }, [])
  const items = useMemo(() => tonightShows(shows, now, deviceZone), [shows, now, deviceZone])
  return { items, active, refresh: load }
}

// ── Shared look (the Dashboard's existing band values) ─────────────────────
const SANS = '"DM Sans", system-ui, sans-serif'
const band: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--d-band, 64px)', padding: '10px 12px',
  borderRadius: 18, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: SANS,
  background: 'var(--sl-band-bg)', boxShadow: 'var(--sl-band-ring)', color: 'var(--sl-text)',
}
const title: React.CSSProperties = { display: 'block', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const sub: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--sl-text-2)', marginTop: 2 }
const chevron = <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--sl-text-3)', flexShrink: 0 }} />
const micDot = (
  <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--sl-ok) 14%, transparent)', color: 'var(--sl-ok)' }}>
    <Mic size={16} strokeWidth={2.4} />
  </span>
)

function StatusLine({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color, marginBottom: 1 }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {children}
    </span>
  )
}

const venueOf = (i: Item) => i.show.venues?.name || 'Venue TBD'
export const scheduledLine = (i: Item) => `Scheduled · ${i.dayText}`

// Plain words for who is capturing someone else's show.
export function capturerText(a: ActiveCapture, artistName: string | null): string {
  if (a.by === 'artist') return `Being captured by ${artistName || 'the artist'}`
  if (a.by === 'teammate') return a.byName ? `Being captured by ${a.byName}` : 'Being captured by a teammate'
  return 'Being captured by the artist or their team'
}

// ── Capture in progress: rejoin your own, status for anyone else's ────────
export function ActiveCaptureRow({ active, artistName, canCapture, interrupted, elapsed, onRejoin }: {
  active: ActiveCapture; artistName: string | null; canCapture: boolean; interrupted?: boolean; elapsed?: React.ReactNode; onRejoin: () => void
}) {
  const mine = canCapture && !!active.own
  const body = (
    <>
      {micDot}
      <span style={{ flex: 1, minWidth: 0 }}>
        {interrupted && mine
          ? <StatusLine color="var(--sl-live)">Capture may have been interrupted</StatusLine>
          : <StatusLine color="var(--sl-ok)">Show in progress</StatusLine>}
        <span style={title}>{active.venue || 'Untitled show'}</span>
        <span style={sub}>{mine ? (interrupted ? 'Tap to resume capture' : 'Tap to continue capture') : capturerText(active, artistName)}</span>
      </span>
      {elapsed}
    </>
  )
  return mine
    ? <button onClick={onRejoin} aria-label={`${interrupted ? 'Resume' : 'Continue'} capture at ${active.venue || 'this show'}`} style={band}>{body}{chevron}</button>
    : <div role="status" style={{ ...band, cursor: 'default' }}>{body}</div>
}

// ── Dashboard row ─────────────────────────────────────────────────────────
// Offered only to people who can capture, and only when no capture is in
// progress (the in-progress row always comes first).
export function TonightBand({ items, onStart, onChoose, onAddTime }: {
  items: Item[]
  onStart: (i: Item) => void      // one startable show: the existing Start confirmation
  onChoose: () => void            // several shows: the gold button's choice screen
  onAddTime: () => void           // a date-only booking: Schedule's "Add a start time"
}) {
  if (!items.length) return null
  if (items.length > 1) {
    return (
      <button onClick={onChoose} aria-label={`Choose one of ${items.length} scheduled shows to start`} style={band}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <StatusLine color="var(--sl-ok)">{scheduledLine(items[0])}</StatusLine>
          <span style={title}>{items.length} shows · choose one to start</span>
          <span style={{ ...sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {items.map(i => `${venueOf(i)} ${i.timeText || '(time not set)'}`).join(' · ')}
          </span>
        </span>
        {chevron}
      </button>
    )
  }
  const i = items[0]
  if (i.kind === 'needs_time') {
    return (
      <button onClick={onAddTime} aria-label={`Add a start time for ${venueOf(i)}`} style={band}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <StatusLine color="var(--sl-gold-text)">{scheduledLine(i)}</StatusLine>
          <span style={title}>{venueOf(i)}</span>
          <span style={sub}>Add a start time to start capture</span>
        </span>
        {chevron}
      </button>
    )
  }
  return (
    <button onClick={() => onStart(i)} aria-label={`Start capture at ${venueOf(i)}, ${i.dayText} ${i.timeText}`} style={band}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <StatusLine color="var(--sl-ok)">{scheduledLine(i)}</StatusLine>
        <span style={title}>{venueOf(i)}</span>
        <span style={sub}>{i.timeText}{i.show.venues?.city ? ` · ${i.show.venues.city}` : ''} · Start capture</span>
      </span>
      {chevron}
    </button>
  )
}

// ── Gold capture button: first screen ─────────────────────────────────────
// Leads with the scheduled show(s) or the capture in progress. "A different
// show" opens today's unchanged choice (Start Live Capture / Upload a
// Recording); the booking itself is never changed by it.
export function TonightLead({ items, artistName, startingId, error, active, onStart, onAddTime, onRejoin, onDifferent }: {
  items: Item[]
  artistName: string | null
  startingId: string | null
  error: string
  active: ActiveCapture | null
  onStart: (i: Item) => void
  onAddTime: () => void
  onRejoin: () => void
  onDifferent: () => void
}) {
  const who = artistName || 'this artist'
  return (
    <div style={{ animation: 'fadeUp 0.3s ease' }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--sl-text)', margin: '0 0 8px', letterSpacing: '-0.025em' }}>Where tonight?</h1>
      <p style={{ fontSize: 14, color: 'var(--sl-text-2)', margin: '0 0 20px' }}>
        {active ? `A show is already being captured for ${who}.`
          : items.length > 1 ? `Scheduled for ${who}. Choose the show you’re at.`
          : items.length ? `Scheduled for ${who}.`
          : `Nothing else is scheduled for ${who} right now.`}
      </p>

      {active ? (
        <div style={{ marginBottom: 12 }}>
          <ActiveCaptureRow active={active} artistName={artistName} canCapture onRejoin={onRejoin} />
        </div>
      ) : items.map(i => (
        <div key={i.show.id} style={{ background: 'var(--sl-card-bg)', boxShadow: 'var(--sl-card-inset)', border: '1px solid color-mix(in srgb, var(--sl-accent) 30%, transparent)', borderRadius: 16, padding: '16px 16px 14px', marginBottom: 10 }}>
          <StatusLine color={i.kind === 'startable' ? 'var(--sl-ok)' : 'var(--sl-gold-text)'}>{scheduledLine(i)}</StatusLine>
          <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--sl-text)', margin: '2px 0 2px', letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{venueOf(i)}</p>
          <p style={{ fontSize: 13, color: 'var(--sl-text-2)', margin: '0 0 2px' }}>
            {i.timeText || 'Start time not set'}{i.show.venues?.city ? ` · ${i.show.venues.city}` : ''}
          </p>
          <p style={{ fontSize: 12, color: 'var(--sl-text-3)', margin: '0 0 12px' }}>
            {i.show.import_batch_id ? `Imported from ${i.show.show_import_batches?.file_name || 'a spreadsheet'}` : i.show.scheduled_by_name ? `Added by ${i.show.scheduled_by_name}` : ' '}
          </p>
          {i.kind === 'startable' ? (
            <button onClick={() => onStart(i)} disabled={startingId === i.show.id} aria-busy={startingId === i.show.id}
              style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--sl-accent)', border: 'none', borderRadius: 12, color: 'var(--sl-on-accent)', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', opacity: startingId === i.show.id ? 0.7 : 1 }}>
              <Play size={14} aria-hidden="true" /> {startingId === i.show.id ? 'Starting…' : 'Start capture'}
            </button>
          ) : (
            <button onClick={onAddTime}
              style={{ width: '100%', minHeight: 48, background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-accent) 30%, transparent)', borderRadius: 12, color: 'var(--sl-gold-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Add a start time
            </button>
          )}
        </div>
      ))}

      {error && <p role="alert" style={{ fontSize: 13, color: 'var(--sl-danger)', margin: '4px 0 12px', lineHeight: 1.4 }}>{error}</p>}

      <button onClick={onDifferent}
        style={{ width: '100%', minHeight: 48, marginTop: 6, background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-text) 14%, transparent)', borderRadius: 14, color: 'var(--sl-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        A different show
      </button>
      <p style={{ fontSize: 12, color: 'var(--sl-text-3)', margin: '8px 0 0', textAlign: 'center' }}>Capture somewhere else, or upload a recording.</p>
    </div>
  )
}
