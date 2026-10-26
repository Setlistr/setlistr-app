'use client'
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/ui/LoadError'
import { TIMELINE_CSS } from '../timelineStyles'
import { C, primaryBtn, secondaryBtn, textAction, CONTROL_CSS } from '@/components/ui/controls'
import { REASON_TEXT, shortDate, timeLabel, type Reason } from '@/lib/shows/import/review'

// One import's result (docs/spreadsheet-import-plan.md), reopenable from
// Schedule, Import shows → Recent imports, and an imported show's details:
// what it added, what was left out and why, and Undo. Undo removes only the
// shows nobody has used since; it keeps, and names, every show that was
// edited, started, cancelled, or linked to a capture or setlist.

type Result = {
  id: string; artistId: string; file: string; sheet: string | null; at: string; by: string | null; rowCount: number; undoneAt: string | null; status: 'imported' | 'undone' | 'partly_undone'
  undo: { removed: { source_row: number; local_date: string }[]; kept: { source_row: number; local_date: string; reason: string }[] } | null
  leftOut: { row: number; reason: Reason }[]
  shows: { id: string; row: number; date: string; time: string | null; status: string; venue: string; city: string; used: string | null }[]
}
const USED: Record<string, string> = { linked_record: 'linked to another record', capture_linked: 'capture linked', setlist_attached: 'setlist attached', started: 'started', cancelled: 'cancelled', edited: 'edited since the import' }
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ImportResult({ id, artistName, canWrite }: { id: string; artistName: string; canWrite: boolean }) {
  const [r, setR] = useState<{ status: 'loading' | 'ready' | 'error' | 'missing'; data: Result | null }>({ status: 'loading', data: null })
  const [open, setOpen] = useState({ shows: false, leftOut: false })
  const [undo, setUndo] = useState<'idle' | 'confirm' | 'working' | 'error'>('idle')
  const load = useCallback(async () => {
    setR(x => ({ ...x, status: x.data ? 'ready' : 'loading' }))
    try {
      const res = await fetch(`/api/shows/import/${id}`, { cache: 'no-store' })
      if (res.status === 404) { setR({ status: 'missing', data: null }); return }
      if (!res.ok) throw new Error(String(res.status))
      setR({ status: 'ready', data: await res.json() })
    } catch { setR(x => ({ status: x.data ? 'ready' : 'error', data: x.data })) }
  }, [id])
  useEffect(() => { load() }, [load])

  const styles = <style>{TIMELINE_CSS + CONTROL_CSS + RESULT_CSS}</style>
  if (r.status === 'loading') return <div className="tl" aria-busy="true"><PageHeader title="Import result" backHref="/app/schedule" /><Skeleton h={20} w="50%" /><Skeleton h={64} mt={18} /><Skeleton h={64} mt={8} />{styles}</div>
  if (r.status === 'missing') return <div className="tl"><PageHeader title="Import result" backHref="/app/schedule" /><p className="tl-why">This import isn’t available. It may belong to another workspace.</p>{styles}</div>
  if (r.status === 'error' || !r.data) return <div className="tl"><PageHeader title="Import result" backHref="/app/schedule" /><LoadError message="This import didn’t load" onRetry={load} />{styles}</div>
  const d = r.data
  const live = d.shows
  const unused = live.filter(s => !s.used), used = live.filter(s => s.used)
  const future = live.filter(s => s.status === 'scheduled').length, listings = live.filter(s => s.status === 'listed').length

  async function doUndo() {
    setUndo('working')
    try {
      const res = await fetch(`/api/shows/import/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      setUndo('idle'); await load()
    } catch { setUndo('error') }
  }

  return (
    <div className="tl" style={{ maxWidth: 640 }}>
      <PageHeader title="Import result" backHref="/app/schedule" />
      <p style={{ fontSize: 14, color: C.secondary, margin: '-8px 0 16px' }}>{artistName} · {d.file} · {shortDate(d.at.slice(0, 10))}{d.by ? ` · added by ${d.by}` : ''}</p>

      {d.status !== 'imported' && d.undo && (
        <div className="tl-err" role="status" style={{ marginBottom: 14, display: 'grid', justifyContent: 'stretch' }}>
          <span style={{ color: 'var(--sl-text)', fontWeight: 600 }}>{d.undo.kept.length
            ? `Import partly undone: ${pl(d.undo.removed.length, 'show', 'shows')} removed, ${pl(d.undo.kept.length, 'show', 'shows')} kept because ${d.undo.kept.length === 1 ? 'it was' : 'they were'} used.`
            : `Import undone: ${pl(d.undo.removed.length, 'show', 'shows')} removed. Nothing else changed.`}</span>
        </div>
      )}

      <div className="im-stats">
        {d.undo ? (<>
          <div className="im-stat"><span className="im-num">{d.undo.removed.length}</span><span><span className="im-lab">{d.undo.removed.length === 1 ? 'show removed' : 'shows removed'}</span><span className="tl-sub">By Undo{d.undoneAt ? `, ${shortDate(d.undoneAt.slice(0, 10))}` : ''}</span></span></div>
          <div className="im-stat"><span className="im-num">{d.undo.kept.length}</span><span><span className="im-lab">{d.undo.kept.length === 1 ? 'show kept' : 'shows kept'}</span>
            <span className="tl-sub">{d.undo.kept.length ? d.undo.kept.map(k => { const s = live.find(x => x.row === k.source_row && x.date === k.local_date); return `${s?.venue || `Row ${k.source_row}`}, ${shortDate(k.local_date)}: ${USED[k.reason] || k.reason}` }).join('; ') : 'None'}</span></span></div>
        </>) : (<>
        <div className="im-stat"><span className="im-num">{future}</span><span><span className="im-lab">{future === 1 ? 'future booking' : 'future bookings'}</span><span className="tl-sub">In Upcoming</span></span></div>
        <div className="im-stat"><span className="im-num">{listings}</span><span><span className="im-lab">{listings === 1 ? 'past listing' : 'past listings'}</span><span className="tl-sub">In Earlier, “No capture linked”</span></span></div>
        </>)}
        <div className="im-stat"><span className="im-num">{d.leftOut.length}</span><span><span className="im-lab">{d.leftOut.length === 1 ? 'row left out' : 'rows left out'}</span>
          {d.leftOut.length > 0 && <button type="button" className="sb-btn" style={textAction} aria-expanded={open.leftOut} onClick={() => setOpen(o => ({ ...o, leftOut: !o.leftOut }))}>{open.leftOut ? 'Hide reasons' : 'Show rows and reasons'}</button>}</span></div>
      </div>
      {open.leftOut && <ul className="im-reasons">{d.leftOut.map(x => <li key={x.row}>Row {x.row}: {REASON_TEXT[x.reason] || x.reason}</li>)}</ul>}

      {live.length > 0 && (
        <section aria-label="Imported shows">
          <button type="button" className="im-group" aria-expanded={open.shows} onClick={() => setOpen(o => ({ ...o, shows: !o.shows }))}>
            <span className="im-group-t">Imported shows</span><span className="im-group-n">{pl(live.length, 'show', 'shows')}{used.length ? `, ${used.length} used since` : ''}</span><ChevronDown size={16} className="im-chev" aria-hidden="true" />
          </button>
          {open.shows && <div className="tl-rows">{live.map(s => (
            <div key={s.id} className="tl-row"><div className="tl-row-btn tl-static">
              <span className="tl-date tl-mono">{shortDate(s.date)}</span>
              <span className="tl-main"><span className="tl-v">{s.venue}</span><span className="tl-sub">{[s.city, `row ${s.row}`, s.time ? timeLabel(s.time) : 'date only'].join(' · ')}</span></span>
              <span className="tl-right"><span className="tl-state" style={{ color: s.used ? 'var(--sl-gold-text)' : 'var(--sl-text-3)' }}>{s.used ? USED[s.used] : s.status === 'listed' ? 'No capture linked' : 'Upcoming'}</span></span>
            </div></div>))}</div>}
        </section>
      )}

      {canWrite && d.status === 'imported' && live.length > 0 && (
        <section aria-labelledby="im-undo-h" style={{ marginTop: 22, display: 'grid', gap: 8 }}>
          <div className="tl-sec" style={{ marginTop: 0 }}><h3 id="im-undo-h">Undo this import</h3></div>
          <p className="tl-why">Removes the {pl(unused.length, 'show', 'shows')} from this import that nobody has used since.{used.length ? ` ${pl(used.length, 'show is', 'shows are')} kept: ${used.map(s => `${s.venue}, ${shortDate(s.date)} (${USED[s.used!]})`).join('; ')}.` : ''}</p>
          {undo === 'confirm' ? (
            <div className="im-acts">
              <button type="button" className="sb-btn" style={{ ...primaryBtn, width: 'auto', minHeight: 48, fontSize: 15 }} onClick={doUndo}>Remove {pl(unused.length, 'show', 'shows')}</button>
              <button type="button" className="sb-btn" style={textAction} onClick={() => setUndo('idle')}>Keep them</button>
            </div>
          ) : (
            <div><button type="button" className="sb-btn" style={{ ...secondaryBtn, width: 'auto', minHeight: 44 }} disabled={undo === 'working' || !unused.length} onClick={() => setUndo('confirm')}>{undo === 'working' ? 'Undoing…' : 'Undo import'}</button></div>
          )}
          {undo === 'error' && <div className="tl-start-err" role="alert">Couldn’t undo. Nothing was removed; try again.</div>}
        </section>
      )}

      <p className="tl-note" style={{ marginTop: 22 }}>Importing {d.file} again later is safe: rows that match a show from this import are marked “Already imported” and left out, unless you choose to import one as another record. A retry after a lost connection is the same import, never a second one.</p>
      {styles}
    </div>
  )
}

const RESULT_CSS = `
  .im-acts { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
  .im-stats { display: grid; border-top: 1px solid var(--sl-line); }
  .im-stat { display: grid; grid-template-columns: 48px minmax(0,1fr); gap: 12px; align-items: first baseline; padding: 14px 2px; border-bottom: 1px solid var(--sl-line); }
  .im-stat .sb-btn { padding-left: 0; }
  .im-num { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: var(--sl-text); font-variant-numeric: tabular-nums; }
  .im-lab { display: block; font-size: 16px; font-weight: 700; color: var(--sl-text); }
  .im-reasons { margin: 8px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--sl-text-2); line-height: 1.6; }
  .im-group { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 48px; margin-top: 18px; padding: 0 2px; background: none; border: 0; border-bottom: 1px solid var(--sl-line); cursor: pointer; font-family: inherit; color: inherit; text-align: left; }
  .im-group-t { flex: 1; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sl-text-3); }
  .im-group-n { font-size: 13px; color: var(--sl-text-2); }
  .im-chev { color: var(--sl-text-3); transition: transform .15s; }
  .im-group[aria-expanded="true"] .im-chev { transform: rotate(180deg); }
  .im-group:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .im-chev { transition: none; } }
`
