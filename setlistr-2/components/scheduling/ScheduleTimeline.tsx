'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ChevronRight, Mic, RefreshCw } from 'lucide-react'
import { isShowUpcoming, compareScheduled, showLocalDate, zonedToday } from '@/lib/scheduleTime'
import { ScheduleForm, ShowActionsMenu, useShowActions, showWhen, type ScheduledShow } from './UpcomingShows'
import { TIMELINE_CSS } from './timelineStyles'
import { ImportNotice } from './import/ImportNotice'

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
  importedFrom?: { batchId: string; file: string; row: number | null } | null
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

export function ScheduleTimeline({ artistId, artistName, canManage, importId }: { artistId: string; artistName?: string | null; canManage: boolean; importId?: string | null }) {
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

  // Timed shows and date-only bookings (spreadsheet import), each on its own clock.
  const upcoming = up.shows.filter(s => isShowUpcoming(s)).sort(compareScheduled)
  const next = upcoming[0] || null
  const later = upcoming.slice(1)

  const when = (s: ScheduledShow) => { const w = showWhen(s); return { day: w.day, time: w.time || 'Time not set' } }
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
    const w = when(next), by = addedByOf(next)
    const isFuture = next.scheduled_at ? new Date(next.scheduled_at).getTime() > Date.now() : (showLocalDate(next) || '') > zonedToday(new Date(), next.timezone)
    nextBlock = (
      <section className="tl-next" aria-label="Next show">
        <div className="tl-grow">
          <div className="tl-when">{w.day} <span className="tl-mono">· {w.time}</span></div>
          <h2 className="tl-venue">{next.venues?.name || 'Venue TBD'}</h2>
          {next.venues?.city && <div className="tl-meta">{next.venues.city}{next.venues.country ? `, ${next.venues.country}` : ''}</div>}
          {next.import_batch_id && <div className="tl-meta tl-quiet">Imported from {next.show_import_batches?.file_name || 'a spreadsheet'}</div>}
          {by && <div className="tl-meta tl-quiet">Added by {by}</div>}
        </div>
        {canManage && (
          <div className="tl-next-acts">
            {next.scheduled_at ? (
              <button type="button" className="tl-primary" onClick={() => confirmAndStart(next)} disabled={starting === next.id} aria-busy={starting === next.id}>
                {starting === next.id ? 'Starting…' : isFuture ? 'Start early' : 'Start Capture'}
              </button>
            ) : (
              // A date-only booking needs a start time before capture can start.
              <button type="button" className="tl-primary tl-secondary" onClick={() => { setEditing(next); setFormOpen(true) }}>Add a start time</button>
            )}
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
            {it.kind === 'no-capture' && (it.importedFrom
              ? <p className="tl-why">Imported from {it.importedFrom.file}{it.importedFrom.row ? `, row ${it.importedFrom.row}` : ''}. No capture is linked to it, and a date in a spreadsheet doesn&apos;t show the show was performed. <Link className="tl-lnk tl-inline" href={`/app/schedule/import/${it.importedFrom.batchId}`}>View import</Link></p>
              : <p className="tl-why">Scheduled in Setlistr. No capture is linked to it. A show captured from New show instead of Start isn&apos;t linked automatically.</p>)}
            {it.kind === 'cancelled' && <p className="tl-why">This scheduled show was cancelled.</p>}
            {it.addedBy && <p className="tl-why">Added by {it.addedBy}</p>}
            {it.zoneNote && <p className="tl-why">{it.zoneNote}: {it.importedFrom ? 'the date and time are shown as written in the sheet.' : 'the date is shown as stored and the time is left out.'}</p>}
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
        {canManage && (
          <div className="tl-head-acts">
            <Link className="tl-lnk" href="/app/schedule/import">Import shows</Link>
            <button type="button" className="tl-lnk" onClick={() => { setEditing(null); setFormOpen(true) }}>+ Add a show</button>
          </div>
        )}
      </div>
      {importId && <ImportNotice key={importId} importId={importId} />}
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

      {formOpen && <ScheduleForm artistId={artistId} existing={editing} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refreshAll() }} />}

      <style>{TIMELINE_CSS + IMPORT_ENTRY_CSS}</style>
    </div>
  )
}

// The header's two text actions, and the date-only booking's secondary
// action in the next-show card.
const IMPORT_ENTRY_CSS = `
  .tl-head-acts { display: flex; column-gap: 18px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .tl-secondary { background: transparent; border: 1px solid color-mix(in srgb, var(--sl-accent) 45%, transparent); color: var(--sl-gold-text); font-weight: 700; }
  .tl-why .tl-inline { min-height: 0; padding: 0; display: inline; }
`
