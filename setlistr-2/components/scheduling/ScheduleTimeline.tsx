'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronRight, Mic, RefreshCw } from 'lucide-react'
import { utcToZonedParts, isUpcomingInZone } from '@/lib/scheduleTime'
import { ScheduleForm, ShowActionsMenu, useShowActions, dayLabel, timeLabel, zoneAbbreviation, type ScheduledShow } from './UpcomingShows'

// The Schedule timeline (docs/schedule-timeline-plan.md; approved prototype).
// What's next, how to start it, and what already happened, newest first.
// Three independent loads, so history never delays upcoming shows or their
// actions:
//   /api/shows/schedule            upcoming shows and the actions (unchanged)
//   /api/shows/timeline?section=active   a capture in progress (Dashboard's rejoin rule)
//   /api/shows/timeline?section=history  past shows, 25 at a time, with possible duplicates
// It groups only records Setlistr stored as linked, flags possible
// duplicates without hiding or merging anything, and changes no counts.

type State = { label: string; tone: 'ok' | 'review' | 'live' | 'quiet' } | null
type Partner = { key: string; localDate: string | null; venue: string; city: string | null; state: State; source: string; time: string | null; reason: string }
type Item = {
  key: string; kind: 'show' | 'capture' | 'import' | 'no-capture' | 'cancelled'; localDate: string | null; venue: string; city: string | null; country: string | null
  state: State; source: string; time: string | null; zoneNote: string | null; addedBy: string | null; show: ScheduledShow | null
  captures: { id: string; state: State; method: string | null; time: string | null; link: string | null }[]
  partners: Partner[]
}
type Active = { id: string; venue: string | null; started_at: string } | null

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// Dates are the record's own (YYYY-MM-DD) and are formatted without the
// viewer's zone, so every viewer sees the same date.
function shortDate(d: string | null): string {
  if (!d) return 'No date'
  const [y, m, dd] = d.split('-').map(Number)
  return `${MONTHS[m - 1].slice(0, 3)} ${dd}${y !== new Date().getUTCFullYear() ? `, ${y}` : ''}`
}
function monthOf(d: string | null): string { if (!d) return 'Date not recorded'; const [y, m] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
const TONE: Record<string, string> = { ok: 'var(--sl-ok)', review: 'var(--sl-gold-text)', live: 'var(--sl-live)', quiet: 'var(--sl-text-3)' }
function minutesSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 60000) }
function elapsed(d: string) { const m = Math.max(0, minutesSince(d)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }

export function ScheduleTimeline({ artistId, artistName, canManage }: { artistId: string; artistName?: string | null; canManage: boolean }) {
  // Upcoming (existing route and actions)
  const [up, setUp] = useState<{ status: 'loading' | 'ready' | 'error'; shows: ScheduledShow[] }>({ status: 'loading', shows: [] })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledShow | null>(null)
  // Active capture and history (read-only route)
  const [active, setActive] = useState<Active>(null)
  const [hist, setHist] = useState<{ status: 'loading' | 'ready' | 'error'; items: Item[]; next: string | null; total: number; more: 'idle' | 'loading' | 'error' }>({ status: 'loading', items: [], next: null, total: 0, more: 'idle' })
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const req = useRef({ up: 0, hist: 0, act: 0 })

  const loadUpcoming = useCallback(async () => {
    const mine = ++req.current.up
    setUp(u => ({ ...u, status: 'loading' }))
    try {
      const res = await fetch(`/api/shows/schedule?artist_id=${artistId}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      if (mine === req.current.up) setUp({ status: 'ready', shows: data.shows || [] })
    } catch { if (mine === req.current.up) setUp({ status: 'error', shows: [] }) }
  }, [artistId])

  const loadActive = useCallback(async () => {
    const mine = ++req.current.act
    try {
      const res = await fetch(`/api/shows/timeline?artist_id=${artistId}&section=active`, { cache: 'no-store' })
      const data = res.ok ? await res.json() : { active: null }
      if (mine === req.current.act) setActive(data.active || null)
    } catch { if (mine === req.current.act) setActive(null) }
  }, [artistId])

  const loadHistory = useCallback(async (cursor: string | null) => {
    const mine = ++req.current.hist
    setHist(h => cursor ? { ...h, more: 'loading' } : { status: 'loading', items: [], next: null, total: 0, more: 'idle' })
    try {
      const res = await fetch(`/api/shows/timeline?artist_id=${artistId}&section=history${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as { items: Item[]; next: string | null; total: number }
      if (mine !== req.current.hist) return
      setHist(h => ({ status: 'ready', items: cursor ? [...h.items, ...data.items] : data.items, next: data.next, total: data.total, more: 'idle' }))
    } catch {
      if (mine !== req.current.hist) return
      setHist(h => cursor ? { ...h, more: 'error' } : { status: 'error', items: [], next: null, total: 0, more: 'idle' })
    }
  }, [artistId])

  useEffect(() => { loadUpcoming(); loadActive(); loadHistory(null) }, [loadUpcoming, loadActive, loadHistory])

  const refreshAll = useCallback(() => { loadUpcoming(); loadHistory(null) }, [loadUpcoming, loadHistory])
  const { starting, startError, confirmAndStart, handleCancel } = useShowActions({ artistName, onChanged: refreshAll })

  const upcoming = up.shows
    .filter(s => isUpcomingInZone(s.scheduled_at, s.timezone))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const next = upcoming[0] || null
  const later = upcoming.slice(1)

  const when = (s: ScheduledShow) => { const { dateStr, timeStr } = utcToZonedParts(new Date(s.scheduled_at), s.timezone); return { day: dayLabel(dateStr, s.timezone), time: `${timeLabel(timeStr)} ${zoneAbbreviation(s.scheduled_at, s.timezone)}`.trim() } }
  const addedByOf = (s: ScheduledShow) => s.scheduled_by && s.scheduled_by !== s.created_by ? (s.scheduled_by_name || 'a teammate') : null

  // ── Capture in progress: the Dashboard's band and rule. It links to live
  // capture only for people who can capture (the same check as Start). The
  // capture page has no read-only mode, so a Viewer sees the same band as
  // plain status, with no link and no capture controls. ──
  const activeBand = active && (() => {
    const interrupted = minutesSince(active.started_at) > 5
    const body = <>
      <span className="tl-mic" aria-hidden="true"><Mic size={16} strokeWidth={2.4} /></span>
      <span className="tl-grow">
        <span className="tl-act-st" style={{ color: interrupted ? 'var(--sl-live)' : 'var(--sl-ok)' }}>{interrupted ? 'Capture may have been interrupted' : 'Show in progress'}</span>
        <span className="tl-act-v">{active.venue || 'Untitled show'}</span>
        <span className="tl-sub">{canManage ? (interrupted ? 'Tap to resume capture' : 'Tap to continue capture') : 'Being captured by the artist or their team'}</span>
      </span>
      <span className="tl-mono tl-el">{elapsed(active.started_at)}</span>
    </>
    return canManage ? (
      <Link href={`/app/live/${active.id}`} className="tl-active" aria-label={`${interrupted ? 'Resume capture' : 'Continue capture'} at ${active.venue || 'this show'}`}>
        {body}<ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--sl-text-3)', flexShrink: 0 }} />
      </Link>
    ) : <div className="tl-active" role="status">{body}</div>
  })()

  // ── Next show ──
  let nextBlock: React.ReactNode
  if (up.status === 'loading') nextBlock = <div className="tl-next tl-skel" aria-hidden="true" />
  else if (up.status === 'error') nextBlock = (
    <div className="tl-err"><span>Couldn&apos;t load upcoming shows.</span><button type="button" className="tl-lnk" onClick={loadUpcoming}><RefreshCw size={12} /> Retry</button></div>
  )
  else if (!next) nextBlock = <div className="tl-empty">No shows scheduled yet.{canManage ? ' Add a show to plan ahead.' : ''}</div>
  else {
    const w = when(next), isFuture = new Date(next.scheduled_at).getTime() > Date.now(), by = addedByOf(next)
    nextBlock = (
      <section className="tl-next" aria-label="Next show">
        <div className="tl-grow">
          <div className="tl-when">{w.day} <span className="tl-mono">· {w.time}</span></div>
          <h2 className="tl-venue">{next.venues?.name || 'Venue TBD'}</h2>
          {next.venues?.city && <div className="tl-meta">{next.venues.city}{next.venues.country ? `, ${next.venues.country}` : ''}</div>}
          {by && <div className="tl-meta tl-quiet">Added by {by}</div>}
        </div>
        {canManage && (
          <div className="tl-next-acts">
            <button type="button" className="tl-primary" onClick={() => confirmAndStart(next)} disabled={starting === next.id} aria-busy={starting === next.id}>
              {starting === next.id ? 'Starting…' : isFuture ? 'Start early' : 'Start Capture'}
            </button>
            <ShowActionsMenu show={next} onEdit={() => { setEditing(next); setFormOpen(true) }} onCancel={() => handleCancel(next)} />
          </div>
        )}
      </section>
    )
  }

  // ── Earlier ──
  const rows: React.ReactNode[] = []
  let lastMonth = ''
  for (const it of hist.items) {
    const m = monthOf(it.localDate)
    if (m !== lastMonth) { rows.push(<div key={'m' + m} className="tl-month">{m}</div>); lastMonth = m }
    const isOpen = !!open[it.key]
    rows.push(
      <div key={it.key} className="tl-row">
        <button type="button" className="tl-row-btn" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [it.key]: !o[it.key] }))}>
          <span className="tl-date tl-mono">{shortDate(it.localDate)}</span>
          <span className="tl-main">
            <span className="tl-v">{it.venue}</span>
            <span className="tl-sub tl-ph">{[it.source, it.city].filter(Boolean).join(' · ')}</span>
            {it.partners.length > 0 && <span className="tl-flag">Possible duplicate</span>}
          </span>
          <span className="tl-dk tl-city">{it.city || 'No city on file'}<span className="tl-sub">{it.source}</span></span>
          <span className="tl-right">
            {it.state && <span className="tl-state" style={{ color: TONE[it.state.tone] }}>{it.state.label}</span>}
            <span className="tl-mono tl-time">{it.time || (it.zoneNote ? '' : 'No time')}</span>
          </span>
        </button>
        {isOpen && (
          <div className="tl-detail">
            {it.captures.length > 0 && (
              <dl className="tl-dl">
                {it.captures.map((c, i) => (
                  <div key={c.id}>
                    <dt>{it.captures.length > 1 ? `Capture ${i + 1}` : it.kind === 'import' ? 'Imported record' : 'Capture'}</dt>
                    <dd>
                      {[c.state?.label, c.method, c.time].filter(Boolean).join(' · ') || 'Imported from setlist.fm; not recorded or confirmed in Setlistr'}
                      {c.link && <> · <Link className="tl-lnk" href={c.link}>Open</Link></>}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {it.kind === 'no-capture' && <p className="tl-why">Scheduled in Setlistr. No capture is linked to it. A show captured from New show instead of Start isn&apos;t linked automatically.</p>}
            {it.kind === 'cancelled' && <p className="tl-why">This scheduled show was cancelled.</p>}
            {it.addedBy && <p className="tl-why">Added by {it.addedBy}</p>}
            {it.zoneNote && <p className="tl-why">{it.zoneNote}: the date is shown as stored and the time is left out.</p>}
            {it.partners.map(p => (
              <div key={p.key} className="tl-pair">
                <p className="tl-why"><strong>Possible duplicate:</strong> {shortDate(p.localDate)} · {p.venue}{p.city ? `, ${p.city}` : ''} · {[p.source, p.state?.label, p.time].filter(Boolean).join(' · ')}</p>
                <p className="tl-why">Why: {p.reason}. Setlistr can&apos;t tell whether these are one show recorded twice or separate sets. Both stay listed; nothing is merged or hidden.</p>
              </div>
            ))}
            {it.show && canManage && (
              <div className="tl-row-acts"><span className="tl-sub">This show is still marked scheduled.</span>
                <ShowActionsMenu show={it.show} onEdit={() => { setEditing(it.show); setFormOpen(true) }} onCancel={() => handleCancel(it.show!)} />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="tl">
      <div className="tl-head">
        <div><h1>Schedule</h1>{artistName && <p>{artistName}</p>}</div>
        {canManage && <button type="button" className="tl-lnk" onClick={() => { setEditing(null); setFormOpen(true) }}>+ Add a show</button>}
      </div>
      {activeBand}
      {startError && <div className="tl-start-err" role="alert"><AlertCircle size={14} style={{ flexShrink: 0 }} /> {startError}</div>}
      {nextBlock}

      {later.length > 0 && (
        <section aria-labelledby="tl-up-h">
          <div className="tl-sec"><h3 id="tl-up-h">Upcoming</h3><span>{later.length} more</span></div>
          <div className="tl-rows">
            {later.map(s => { const w = when(s), by = addedByOf(s); return (
              <div key={s.id} className="tl-row"><div className="tl-row-btn tl-static">
                <span className="tl-date tl-mono">{w.day}</span>
                <span className="tl-main"><span className="tl-v">{s.venues?.name || 'Venue TBD'}</span><span className="tl-sub tl-ph">{[w.time, s.venues?.city, by && `added by ${by}`].filter(Boolean).join(' · ')}</span></span>
                <span className="tl-dk tl-city">{s.venues?.city || ''}{by && <span className="tl-sub">Added by {by}</span>}</span>
                <span className="tl-right tl-up-r"><span className="tl-mono tl-time tl-dk">{w.time}</span>{canManage && <ShowActionsMenu show={s} onEdit={() => { setEditing(s); setFormOpen(true) }} onCancel={() => handleCancel(s)} />}</span>
              </div></div>
            ) })}
          </div>
        </section>
      )}

      <section aria-labelledby="tl-ea-h" aria-busy={hist.status === 'loading'}>
        <div className="tl-sec"><h3 id="tl-ea-h">Earlier</h3><span>{hist.status === 'ready' && hist.total > 0 ? `${hist.items.length} of ${hist.total}` : ''}</span></div>
        {hist.status === 'loading' ? (
          <div className="tl-rows" aria-hidden="true"><div className="tl-skel-row" /><div className="tl-skel-row" /><div className="tl-skel-row" /></div>
        ) : hist.status === 'error' ? (
          <div className="tl-err"><span>Past shows didn&apos;t load. Upcoming shows aren&apos;t affected.</span><button type="button" className="tl-lnk" onClick={() => loadHistory(null)}><RefreshCw size={12} /> Retry</button></div>
        ) : hist.items.length === 0 ? (
          <p className="tl-note">Shows you capture or upload appear here, newest first, after they happen.</p>
        ) : (
          <>
            <div className="tl-rows">{rows}</div>
            {hist.next && (
              <button type="button" className="tl-more" onClick={() => loadHistory(hist.next)} disabled={hist.more === 'loading'} aria-busy={hist.more === 'loading'}>
                {hist.more === 'loading' ? 'Loading…' : `Show ${Math.min(25, hist.total - hist.items.length)} more`}
              </button>
            )}
            {hist.more === 'error' && <p className="tl-note" role="alert">Those shows didn&apos;t load. Try again.</p>}
          </>
        )}
      </section>

      <p className="tl-roadmap"><b>Planned for Schedule later:</b> importing past shows in bulk, calendar sync, and tour dates from listings. They aren&apos;t available yet.</p>

      {formOpen && <ScheduleForm artistId={artistId} existing={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refreshAll() }} />}

      <style>{`
        .tl { font-family: "DM Sans", system-ui, sans-serif; color: var(--sl-text); display: grid; gap: 0; }
        .tl-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
        .tl-head h1 { font-size: 26px; font-weight: 800; color: var(--sl-text); margin: 0; letter-spacing: -0.02em; }
        .tl-head p { font-size: 14px; color: var(--sl-text-2); margin: 2px 0 0; }
        .tl-lnk { display: inline-flex; align-items: center; gap: 6px; font: 700 13px "DM Sans", system-ui, sans-serif; color: var(--sl-gold-text); background: none; border: 0; cursor: pointer; padding: 6px 0; min-height: 44px; text-decoration: none; }
        .tl-mono { font-family: "DM Mono", monospace; font-variant-numeric: tabular-nums; }
        .tl-grow { flex: 1; min-width: 0; }
        .tl-sub { display: block; font-size: 12.5px; color: var(--sl-text-3); margin-top: 1px; overflow-wrap: anywhere; }
        .tl-quiet { color: var(--sl-text-3); }
        .tl-active { display: flex; align-items: center; gap: 12px; padding: 14px 16px; margin-bottom: 14px; border-radius: 16px; background: var(--sl-surface); border: 1px solid var(--sl-line); color: var(--sl-text); text-decoration: none; min-height: 64px; }
        .tl-mic { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--sl-accent); color: var(--sl-on-accent); }
        .tl-act-st { display: block; font-size: 12px; font-weight: 700; }
        .tl-act-v { display: block; font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
        .tl-el { font-size: 18px; color: var(--sl-text-2); }
        .tl-start-err { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding: 10px 14px; border-radius: 10px; font-size: 13px; color: var(--sl-danger); background: color-mix(in srgb, var(--sl-danger) 8%, transparent); border: 1px solid color-mix(in srgb, var(--sl-danger) 25%, transparent); }
        .tl-next { display: grid; gap: 14px; padding: 18px; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--sl-accent) 30%, transparent); background: linear-gradient(165deg, var(--sl-surface-2), var(--sl-surface)); }
        .tl-next.tl-skel { min-height: 150px; background: var(--sl-skeleton); border-color: transparent; }
        .tl-when { font-size: 13px; font-weight: 800; color: var(--sl-gold-text); letter-spacing: 0.02em; }
        .tl-when .tl-mono { color: var(--sl-text-2); font-weight: 500; }
        .tl-venue { font-size: 24px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.15; margin: 4px 0 2px; overflow-wrap: anywhere; }
        .tl-meta { font-size: 13px; color: var(--sl-text-2); margin-top: 2px; }
        .tl-next-acts { display: flex; gap: 8px; align-items: center; }
        .tl-primary { flex: 1; min-height: 48px; padding: 0 18px; border-radius: 12px; border: 0; background: var(--sl-accent); color: var(--sl-on-accent); font: 800 15px "DM Sans", system-ui, sans-serif; cursor: pointer; }
        .tl-primary:disabled { opacity: 0.7; cursor: default; }
        .tl-err { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 14px 16px; border-radius: 14px; background: var(--sl-surface); border: 1px solid var(--sl-line); font-size: 13px; color: var(--sl-text-2); }
        .tl-empty { padding: 20px; border-radius: 14px; background: var(--sl-surface); border: 1px solid var(--sl-line); text-align: center; font-size: 13.5px; color: var(--sl-text-3); }
        .tl-sec { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 28px 0 8px; }
        .tl-sec h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sl-text-3); }
        .tl-sec span { font-size: 12.5px; color: var(--sl-text-3); }
        .tl-rows { border-top: 1px solid var(--sl-line); }
        .tl-row { border-bottom: 1px solid var(--sl-line); }
        .tl-row-btn { width: 100%; text-align: left; background: none; border: 0; color: inherit; font: inherit; cursor: pointer; display: grid; grid-template-columns: 70px minmax(0,1fr) auto; column-gap: 12px; align-items: baseline; padding: 12px 2px; min-height: 52px; }
        .tl-row-btn.tl-static { cursor: default; align-items: center; }
        .tl-row-btn:not(.tl-static):hover { background: var(--sl-hover); }
        .tl-date { font-size: 12.5px; color: var(--sl-text-2); white-space: normal; line-height: 1.35; }
        .tl-static .tl-date { white-space: normal; line-height: 1.35; }
        .tl-main { min-width: 0; }
        .tl-v { display: block; font-size: 15px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
        .tl-right { display: grid; gap: 2px; justify-items: end; text-align: right; }
        .tl-up-r { grid-auto-flow: column; align-items: center; gap: 10px; }
        .tl-state { font-size: 12px; font-weight: 700; white-space: nowrap; }
        .tl-time { font-size: 12.5px; color: var(--sl-text-2); white-space: nowrap; }
        .tl-flag { display: inline-flex; align-items: center; gap: 6px; margin-top: 5px; font-size: 12px; font-weight: 700; color: var(--sl-warn); }
        .tl-flag::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--sl-warn); }
        .tl-month { font-family: var(--sl-font-display); font-size: 22px; letter-spacing: 0.03em; color: var(--sl-text-3); margin: 18px 0 2px; }
        .tl-rows > .tl-month:first-child { margin-top: 10px; }
        .tl-detail { padding: 0 2px 16px 84px; display: grid; gap: 8px; font-size: 13.5px; color: var(--sl-text-2); }
        .tl-dl { margin: 0; display: grid; gap: 8px; }
        .tl-dl dt { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--sl-text-3); }
        .tl-dl dd { margin: 1px 0 0; color: var(--sl-text); }
        .tl-dl .tl-lnk { min-height: 0; padding: 0; }
        .tl-why { margin: 0; font-size: 13px; line-height: 1.45; color: var(--sl-text-2); }
        .tl-why strong { color: var(--sl-text); }
        .tl-pair { display: grid; gap: 4px; padding: 10px 12px; border-radius: 10px; background: var(--sl-surface); border: 1px solid var(--sl-line); }
        .tl-row-acts { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .tl-skel-row { height: 52px; border-bottom: 1px solid var(--sl-line); background: linear-gradient(90deg, transparent 84px, var(--sl-skeleton) 84px, var(--sl-skeleton) 60%, transparent 60%) no-repeat center / 100% 12px; }
        .tl-more { font: 700 14px "DM Sans", system-ui, sans-serif; color: var(--sl-gold-text); background: none; border: 0; padding: 12px 0; min-height: 44px; cursor: pointer; justify-self: start; }
        .tl-note { margin: 6px 0 0; font-size: 13px; color: var(--sl-text-3); }
        .tl-roadmap { margin: 30px 0 0; padding-top: 14px; border-top: 1px solid var(--sl-line); font-size: 12.5px; color: var(--sl-text-3); }
        .tl-roadmap b { color: var(--sl-text-2); }
        .tl-dk { display: none; }
        .tl-lnk:focus-visible, .tl-primary:focus-visible, .tl-row-btn:focus-visible, .tl-more:focus-visible, .tl-active:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: 2px; border-radius: 6px; }
        @media (prefers-reduced-motion: reduce) { .tl * { transition: none !important; } }
        @container sl-frame (min-width: 900px) {
          .tl-next { grid-template-columns: minmax(0,1fr) auto; align-items: end; padding: 22px 24px; }
          .tl-next-acts { min-width: 260px; }
          .tl-venue { font-size: 30px; }
          .tl-row-btn { grid-template-columns: 110px minmax(0,1.4fr) minmax(0,1fr) 170px; }
          .tl-date { white-space: nowrap; }
          .tl-ph { display: none; }
          .tl-dk { display: block; font-size: 14px; color: var(--sl-text-2); overflow-wrap: anywhere; }
          .tl-detail { padding-left: 122px; }
        }
      `}</style>
    </div>
  )
}
