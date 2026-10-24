'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/ui/LoadError'
import { TIMELINE_CSS } from '../timelineStyles'
import { TimezoneCombobox, zoneAbbreviation } from '../UpcomingShows'
import { C, MONO, primaryBtn, secondaryBtn, textAction, hintStyle, inputStyle, labelStyle, CONTROL_CSS } from '@/components/ui/controls'
import { utcToZonedParts, zonedToday } from '@/lib/scheduleTime'
import { findCandidates, venueKey } from '@/lib/shows/identity'
import { buildSheet, FIELD_LABEL, MAX_ROWS, type Field, type SheetFile, type RawSheet } from '@/lib/shows/import/sheet'
import { analyse, breakdown, detectOrder, needsOrder, readNumeric, question, zoneCandidates, shortDate, weekdayDate, datesText, timeLabel, iso, REASON_TEXT, type Fix, type Order, type Row } from '@/lib/shows/import/review'
import type { ImportContext } from '@/lib/shows/import/server'
import type { ImportRequest } from '@/lib/shows/import/commit'

// Import shows from a spreadsheet (docs/spreadsheet-import-plan.md):
// choose a file → review what Setlistr understood → confirm.
// - Only ready rows are imported. A row that still needs attention is left
//   out and listed in the import's result; only file-level questions (the
//   date order, a missing date or venue column) block importing.
// - Understood rows are grouped and collapsed; "Review next issue" walks the
//   rows that need attention.
// - The batch id is made once per review and reused by every retry, so a
//   double tap or a lost response can never import twice.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthOf = (d: string) => { const [y, m] = d.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const optBtn: React.CSSProperties = { ...secondaryBtn, width: 'auto', minHeight: 44, fontSize: 14.5 }
const zoneName = (z: string) => `${z.split('/').pop()!.replace(/_/g, ' ')} time (${z})`
const ZONE_FROM = { you: 'chosen by you', sheet: 'from the sheet', venue: "from the venue's location", country: 'the country has one time zone' } as const
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-000000000000`)
type Recent = { id: string; file: string; at: string; imported: number; leftOut: number; status: string }

export function ImportFlow({ artistId, artistName, isOwner, actorName }: { artistId: string; artistName: string; isOwner: boolean; actorName: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<'choose' | 'reading' | 'sheet' | 'review' | 'confirm'>('choose')
  const [readError, setReadError] = useState<string | null>(null)
  const [raw, setRaw] = useState<{ name: string; sha256: string; sheets: RawSheet[] } | null>(null)
  const [file, setFile] = useState<SheetFile | null>(null)
  const [map, setMap] = useState<Field[]>([])
  const [chosenOrder, setChosenOrder] = useState<Order | null>(null)
  const [fixes, setFixes] = useState<Record<number, Fix>>({})
  const [open, setOpen] = useState<number | null>(null)
  // A row settled while it's open stays where it is (marked Ready) until the
  // person moves on, so follow-ups like the bulk time-zone choice stay in view.
  const [pinned, setPinned] = useState<number | null>(null)
  const [show, setShow] = useState({ columns: false, order: false, up: false, past: false, out: false, leftOut: false })
  const [ctx, setCtx] = useState<{ status: 'loading' | 'ready' | 'error'; fingerprint: string; context: ImportContext | null }>({ status: 'loading', fingerprint: '', context: null })
  const [recent, setRecent] = useState<Recent[] | null>(null)
  const [batchId, setBatchId] = useState(newId)
  const [commit, setCommit] = useState<{ state: 'idle' | 'importing' | 'error'; message?: string; retry?: boolean }>({ state: 'idle' })
  const [changedNote, setChangedNote] = useState<string | null>(null)
  const committing = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const loadContext = useCallback(async () => {
    setCtx(c => ({ ...c, status: 'loading' }))
    try {
      const res = await fetch(`/api/shows/import/context?artist_id=${artistId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const d = await res.json()
      setCtx({ status: 'ready', fingerprint: d.fingerprint, context: d.context })
    } catch { setCtx({ status: 'error', fingerprint: '', context: null }) }
  }, [artistId])
  useEffect(() => { loadContext() }, [loadContext])
  useEffect(() => {
    let live = true
    fetch(`/api/shows/import?artist_id=${artistId}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : { imports: [] }).then(d => { if (live) setRecent(d.imports || []) }).catch(() => { if (live) setRecent([]) })
    return () => { live = false }
  }, [artistId])

  function pickSheet(r: { name: string; sha256: string; sheets: RawSheet[] }, i: number) {
    const f = buildSheet(r.name, r.sha256, r.sheets[i], r.sheets.map(s => s.name))
    if (f.rows.length > MAX_ROWS) { setReadError(`“${f.sheet}” has more than ${MAX_ROWS} rows. Split it into smaller files, then import each one.`); setPhase('choose'); return }
    if (!f.rows.length) { setReadError(`“${f.sheet}” has no rows under its headings.`); setPhase('choose'); return }
    setFile(f); setMap(f.guess); setChosenOrder(null); setFixes({}); setOpen(null); setBatchId(newId()); setChangedNote(null)
    setShow(s => ({ ...s, columns: !f.guess.includes('date') || !f.guess.includes('venue'), up: false, past: false, out: false }))
    setPhase('review'); window.scrollTo(0, 0)
  }
  async function onFile(fl: File | undefined) {
    if (!fl) return
    setReadError(null); setPhase('reading')
    try {
      const { readSpreadsheet } = await import('@/lib/shows/import/read')
      const r = await readSpreadsheet(fl)
      const value = { name: fl.name, sha256: r.sha256, sheets: r.sheets }
      setRaw(value)
      if (r.sheets.length > 1) setPhase('sheet'); else pickSheet(value, 0)
    } catch (e) {
      setReadError((e as Error).name === 'ReadError' || (e as Error).constructor?.name === 'ReadError' ? (e as Error).message : (e as Error).message || 'This file couldn’t be read.')
      setPhase('choose')
    } finally { if (fileInput.current) fileInput.current.value = '' }
  }

  const detected = useMemo(() => file ? detectOrder(file, map) : { order: null, evidence: null }, [file, map])
  const order = chosenOrder ?? detected.order
  const rows = useMemo(() => file && ctx.context ? analyse(file, map, order, fixes, ctx.context) : [], [file, map, order, fixes, ctx.context])
  const fix = (n: number, patch: Partial<Fix>) => setFixes(f => ({ ...f, [n]: { ...(f[n] || {}), ...patch } }))
  const b = breakdown(rows)
  const missingColumn = (['date', 'venue'] as Field[]).filter(f => !map.includes(f))
  const waiting = rows.filter(r => r.status === 'waiting')
  const fileBlocked = missingColumn.length > 0 || waiting.length > 0
  const decide = rows.filter(r => r.status === 'decide')
  const attention = rows.filter(r => r.status === 'decide' || r.n === pinned)
  const up = b.ready.filter(r => r.upcoming && r.n !== pinned).sort((x, y) => x.dates[0].localeCompare(y.dates[0]))
  const past = b.ready.filter(r => !r.upcoming && r.n !== pinned).sort((x, y) => y.dates[0].localeCompare(x.dates[0]))
  const ordered = file && needsOrder(file, map)

  const styles = <style>{TIMELINE_CSS + CONTROL_CSS + FLOW_CSS}</style>
  const head = (title: string, sub?: React.ReactNode) => (
    <>
      <PageHeader title={title} backHref="/app/schedule" />
      <p style={{ fontSize: 14, color: C.secondary, margin: '-8px 0 16px' }}>{artistName}{sub ? <> · {sub}</> : null}</p>
    </>
  )

  // ── Choose a file ──
  if (phase === 'choose' || phase === 'reading' || phase === 'sheet') return (
    <div className="tl" style={{ maxWidth: 600 }}>
      {head('Import shows')}
      {phase === 'sheet' && raw ? (
        <section aria-labelledby="im-sheet-h">
          <p style={{ fontSize: 15.5, color: C.text, margin: '0 0 12px' }} id="im-sheet-h">{raw.name} has {raw.sheets.length} sheets. Which one lists your shows?</p>
          <div className="tl-rows">{raw.sheets.map((s, i) => (
            <div key={s.name} className="tl-row"><button type="button" className="tl-row-btn im-one" onClick={() => pickSheet(raw, i)}>
              <span className="tl-main"><span className="tl-v">{s.name}</span><span className="tl-sub">{pl(s.rows.length, 'row', 'rows')}</span></span>
            </button></div>))}
          </div>
          <button type="button" className="sb-btn" style={textAction} onClick={() => setPhase('choose')}>Choose another file</button>
        </section>
      ) : (
        <>
          <p style={{ fontSize: 15.5, color: C.text, margin: '0 0 18px', lineHeight: 1.5 }}>Add past and upcoming shows from a spreadsheet. Any layout works, with one show per row, a date and a venue.</p>
          {readError && <div style={{ marginBottom: 14 }}><LoadError compact message="That file couldn’t be imported" detail={readError} onRetry={() => fileInput.current?.click()} /></div>}
          <input ref={fileInput} id="im-file" type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => onFile(e.target.files?.[0])} className="im-hidden" />
          {phase === 'reading'
            ? <div aria-busy="true"><Skeleton h={52} r={14} /><span className="im-hidden">Reading the file</span></div>
            : <label htmlFor="im-file" className="sb-btn im-file" style={primaryBtn}>Choose a spreadsheet</label>}
          <p style={hintStyle}>Excel (.xlsx), CSV or TSV. From Google Sheets or Numbers, download one of those first.</p>
          <p style={hintStyle}>The file is read on this device. Only the shows you confirm are saved, with no other columns.</p>
        </>
      )}
      <section aria-labelledby="im-recent-h" style={{ marginTop: 8 }}>
        <div className="tl-sec"><h3 id="im-recent-h">Recent imports</h3><span>{recent?.length || ''}</span></div>
        {recent === null ? <Skeleton h={52} /> : recent.length === 0 ? <p className="tl-note">Imports you make for {artistName} appear here, with what was left out and Undo.</p> : (
          <div className="tl-rows">{recent.map(r => (
            <div key={r.id} className="tl-row"><Link href={`/app/schedule/import/${r.id}`} className="tl-row-btn im-link">
              <span className="tl-date tl-mono">{shortDate(r.at.slice(0, 10))}</span>
              <span className="tl-main"><span className="tl-v">{r.file}</span><span className="tl-sub">{pl(r.imported, 'show', 'shows')}{r.leftOut ? ` · ${pl(r.leftOut, 'row', 'rows')} left out` : ''}{r.status !== 'imported' ? ` · ${r.status === 'undone' ? 'undone' : 'partly undone'}` : ''}</span></span>
            </Link></div>))}
          </div>
        )}
        <p className="tl-note">Importing the same file again later is safe: a row that matches a show from an earlier import is marked “Already imported” and left out, unless you choose to import it as another record.</p>
      </section>
      {styles}
    </div>
  )

  if (!file) return null
  if (ctx.status !== 'ready') return (
    <div className="tl" style={{ maxWidth: 600 }}>{head('Import shows', file.name)}
      {ctx.status === 'loading' ? <div aria-busy="true"><Skeleton h={20} w="60%" /><Skeleton h={52} mt={18} /><Skeleton h={52} mt={8} /></div>
        : <LoadError message={`${artistName}’s shows didn’t load, so the file can’t be checked yet`} onRetry={loadContext} />}
      {styles}
    </div>
  )

  const ex = file.rows.map(([, v]) => v[map.indexOf('date')]?.text || '').find(v => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v) && +v.split(/[/.-]/)[0] <= 12 && +v.split(/[/.-]/)[1] <= 12) || ''
  const orderText = (o: Order) => { const d = ex && readNumeric(ex, o); return d ? shortDate(d) : '' }
  const ORDER_LABEL: Record<Order, string> = { DMY: 'Day first', MDY: 'Month first', YMD: 'Year first' }
  const orderChoices = (['DMY', 'MDY'] as Order[]).map(o => (
    <button key={o} type="button" className="sb-btn" aria-pressed={order === o} onClick={() => { setChosenOrder(o); setShow(s => ({ ...s, order: false })) }} style={{ ...optBtn, ...(order === o ? { background: C.goldDim } : {}) }}>
      {ORDER_LABEL[o]}{ex ? `: ${ex} is ${orderText(o)}` : ''}
    </button>
  ))

  // ── Confirm ──
  if (phase === 'confirm') {
    const multi = b.multi.map(r => `row ${r.n} becomes ${r.dates.length} dates`)
    const payload = (): ImportRequest => {
      const today = (z: string | null) => z ? zonedToday(new Date(), z) : ''
      const rowsOut = b.ready.flatMap(r => r.dates.map(d => ({
        source_row: r.n, local_date: d, local_time: r.time, timezone: r.zone, instant: (fixes[r.n]?.instant && d === r.dates[0]) ? fixes[r.n].instant! : null,
        expect: (r.zone ? d >= today(r.zone) : false) ? 'scheduled' as const : 'listed' as const,
        venue_id: ctx.context!.venueIds[`${venueKey(r.venue)}|${venueKey(r.city)}`] || null,
        venue_name: r.venue, venue_city: r.city || null, venue_country: r.country || null, name: r.name,
      })))
      // Duplicate questions answered for these rows (all candidates per row).
      const recs = [...ctx.context!.records, ...rowsOut.map(x => ({ key: `r:${x.source_row}:${x.local_date}`, venueId: null, venueName: x.venue_name, city: x.venue_city, country: x.venue_country, localDate: x.local_date, instant: null, dateUncertain: false }))]
      const decided = findCandidates(recs).filter(c => c.a.startsWith('r:') !== c.b.startsWith('r:')).map(c => { const rk = c.a.startsWith('r:') ? c.a : c.b; return `${rk.slice(2)}|${rk === c.a ? c.b : c.a}` })
      return {
        artist_id: artistId, fingerprint: ctx.fingerprint, decided, rows: rowsOut,
        batch: { id: batchId, file_name: file.name.slice(0, 200), sheet_name: file.sheet.slice(0, 200), file_sha256: file.sha256, date_order: ordered ? (order || 'DMY') : 'TEXT', row_count: Math.min(file.rows.length, MAX_ROWS), skipped_rows: b.skippedRows },
      }
    }
    const go = async () => {
      if (committing.current) return                       // a second tap does nothing
      committing.current = true; setCommit({ state: 'importing' })
      try {
        const res = await fetch('/api/shows/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
        const d = await res.json().catch(() => ({}))
        if (res.ok) { router.push(`/app/schedule?import=${d.batch_id}`); return }
        if (res.status === 409 && d.error === 'changed') {
          setChangedNote(`${d.message || 'Schedule changed while you were reviewing.'}${d.rows?.length ? ` ${d.rows.length === 1 ? 'Row' : 'Rows'} ${d.rows.join(', ')} now need${d.rows.length === 1 ? 's' : ''} another look.` : ''}`)
          setBatchId(newId()); await loadContext(); setCommit({ state: 'idle' }); setPhase('review'); window.scrollTo(0, 0)
        } else setCommit({ state: 'error', message: d.message || d.error || 'Could not import. Nothing was saved; try again.' })
      } catch {
        // The reply never arrived. The import may have finished; sending the
        // same batch again returns that result instead of importing twice.
        setCommit({ state: 'error', retry: true, message: 'The connection dropped before Setlistr replied. Try again: the same import is sent, so nothing is added twice.' })
      } finally { committing.current = false }
    }
    const stat = (n: number, label: string, sub: React.ReactNode) => (
      <div className="im-stat"><span className="im-num">{n}</span><span><span className="im-lab">{label}</span><span className="tl-sub">{sub}</span></span></div>
    )
    return (
      <div className="tl" style={{ maxWidth: 600 }}>
        <PageHeader title={`Import into ${artistName}’s Schedule?`} backHref="/app/schedule" />
        <p style={{ fontSize: 14, color: C.secondary, margin: '-8px 0 16px', fontFamily: MONO }}>{file.name}</p>
        <div className="im-stats">
          {stat(b.future, b.future === 1 ? 'future booking' : 'future bookings', <>Added to Upcoming.{b.futureDateOnly ? ` ${pl(b.futureDateOnly, 'has', 'have')} no start time yet; add one before starting capture.` : ''}</>)}
          {stat(b.past, b.past === 1 ? 'past listing' : 'past listings', 'Added to Earlier as “No capture linked”. Not counted as performed.')}
          {stat(b.leftOut.length, b.leftOut.length === 1 ? 'row left out' : 'rows left out', b.leftOut.length ? <button type="button" className="sb-btn" style={{ ...textAction, minHeight: 44 }} aria-expanded={show.leftOut} onClick={() => setShow(s => ({ ...s, leftOut: !s.leftOut }))}>{show.leftOut ? 'Hide reasons' : 'Show rows and reasons'}</button> : 'None')}
        </div>
        {show.leftOut && <ul className="im-reasons">{b.leftOut.map(r => <li key={r.n}>Row {r.n}{r.venue ? ` · ${r.venue}` : ''}: {REASON_TEXT[r.outReason!]}</li>)}</ul>}
        <p className="tl-note" style={{ marginTop: 14 }}>{pl(b.shows.length, 'show', 'shows')} from {pl(b.ready.length, 'ready row', 'ready rows')}{multi.length ? ` (${multi.join('; ')})` : ''}.</p>
        {commit.state === 'error' && <div className="tl-start-err" role="alert" style={{ marginTop: 14 }}>{commit.message}</div>}
        <div style={{ display: 'grid', gap: 4, marginTop: 18 }}>
          <button type="button" className="sb-btn" style={{ ...primaryBtn, opacity: commit.state === 'importing' ? 0.6 : 1 }} disabled={commit.state === 'importing' || !b.shows.length} aria-busy={commit.state === 'importing'} onClick={go}>
            {commit.state === 'importing' ? 'Importing…' : commit.retry ? 'Try again' : `Import ${pl(b.shows.length, 'show', 'shows')}`}
          </button>
          <button type="button" className="sb-btn" style={{ ...textAction, justifySelf: 'center' }} disabled={commit.state === 'importing'} onClick={() => { setCommit({ state: 'idle' }); setPhase('review') }}>Back to review</button>
        </div>
        <p className="tl-note" style={{ marginTop: 14 }}>Added by {isOwner ? 'you' : actorName}. Each show keeps the file name and its row number.</p>
        {styles}
      </div>
    )
  }

  // ── Review ──
  const timeOf = (r: Row) => r.time && r.zone && r.scheduledAt ? `${timeLabel(r.time)} ${zoneAbbreviation(r.scheduledAt, r.zone)}` : r.time ? timeLabel(r.time) : r.dates.length ? 'Date only' : ''
  const openRow = (n: number) => { setOpen(n); setPinned(rows.find(r => r.n === n)?.status === 'decide' ? n : null); setTimeout(() => document.getElementById(`im-row-${n}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30) }
  const nextIssue = () => { const after = decide.find(r => (open === null || r.n > open) && r.n !== open) || decide.find(r => r.n !== open); if (after) openRow(after.n) }

  const rowLine = (r: Row) => {
    const isOpen = open === r.n
    const q = r.status === 'decide' ? question(r) : null
    const isPair = r.status === 'decide' && !r.issues.length && !!r.pair
    const dateText = r.dates.length ? datesText(r.dates) : (r.cells.find(c => c.label === file.headers[map.indexOf('date')])?.value || 'No date').replace(/([/-])/g, '$1​')
    const state = r.status === 'out' ? { t: r.outReason === 'already_imported' ? 'Already imported' : 'Left out', c: 'var(--sl-text-3)' } : q && !isPair ? { t: q, c: 'var(--sl-gold-text)' } : r.n === pinned && r.status === 'ready' ? { t: 'Ready', c: 'var(--sl-ok)' } : r.status === 'ready' && !r.upcoming ? { t: 'No capture linked', c: 'var(--sl-text-3)' } : null
    const sub = [r.city, r.status === 'out' ? REASON_TEXT[r.outReason!] : r.name, r.dates.length > 1 ? `${r.dates.length} dates` : null].filter(Boolean).join(' · ')
    return (
      <div key={r.n} className="tl-row" id={`im-row-${r.n}`}>
        <button type="button" className="tl-row-btn" aria-expanded={isOpen} onClick={() => { if (isOpen) { setOpen(null); setPinned(null) } else { setOpen(r.n); setPinned(r.status === 'decide' ? r.n : null) } }}>
          <span className="tl-date tl-mono">{dateText}</span>
          <span className="tl-main"><span className="tl-v">{r.venue || 'Venue missing'}</span><span className="tl-sub tl-ph">{sub}</span>{isPair && <span className="tl-flag">Possible duplicate</span>}</span>
          <span className="tl-dk tl-city">{r.city || 'No city in the sheet'}{(r.name || r.dates.length > 1) && <span className="tl-sub">{[r.name, r.dates.length > 1 ? `${r.dates.length} dates` : null].filter(Boolean).join(' · ')}</span>}</span>
          <span className="tl-right">{state && <span className="tl-state" style={{ color: state.c }}>{state.t}</span>}<span className="tl-mono tl-time">{timeOf(r)}</span></span>
        </button>
        {isOpen && <div className="tl-detail">{detail(r)}</div>}
      </div>
    )
  }
  const acts = (children: React.ReactNode) => <div className="im-acts">{children}</div>

  function decision(r: Row): React.ReactNode {
    const i = r.issues[0]
    if (!i && r.pair && r.status === 'decide') {
      const other = r.pair.rowNo ? rows.find(o => o.n === r.pair!.rowNo) : null
      const exr = r.pair.rowNo ? null : ctx.context!.summaries[r.pair.key]
      const otherText = exr ? `${exr.venue} on ${shortDate(exr.date)}` : `row ${other?.n}`
      return (
        <div className="tl-pair">
          <p className="tl-why"><strong>{exr ? 'Already in Schedule:' : `Row ${other?.n} of this sheet:`}</strong> {exr ? `${shortDate(exr.date)} · ${exr.venue}${exr.city ? `, ${exr.city}` : ''} · ${exr.line}` : other ? `${datesText(other.dates)} · ${other.venue}, ${other.city}${other.time ? ` · ${timeLabel(other.time)}` : ''}` : ''}</p>
          <p className="tl-why"><strong>This row:</strong> {datesText(r.dates)} · {r.venue}{r.city ? `, ${r.city}` : ''}{r.time ? ` · ${timeOf(r)}` : ''}</p>
          <p className="tl-why">Why: {r.pair.reason}. Setlistr can’t tell whether these are one show or two.</p>
          <div className="im-choice"><button type="button" className="sb-btn" style={optBtn} onClick={() => fix(r.n, { decision: 'skip' })}>Skip this row</button>
            <p className="tl-why">{exr ? `${otherText} stays exactly as it is.` : `Row ${other?.n} is imported as usual.`} Row {r.n} isn’t imported; the result lists it.</p></div>
          <div className="im-choice"><button type="button" className="sb-btn" style={optBtn} onClick={() => fix(r.n, { decision: 'keep' })}>Import as another record</button>
            <p className="tl-why">A second show is added. Both are marked Possible duplicate. Nothing is merged and {exr ? `${otherText} doesn’t change` : 'neither row changes'}.</p></div>
        </div>
      )
    }
    if (!i) return null
    if (i.k === 'year') return <YearPicker r={r} i={i} onUse={y => fix(r.n, { year: y })} />
    if (i.k === 'range') return <RangePicker raw={i.raw} past={i.y < new Date().getFullYear() || iso(i.y, i.mo, i.days[i.days.length - 1]) < new Date().toISOString().slice(0, 10)} days={i.days.map(d => ({ d, label: weekdayDate(iso(i.y, i.mo, d)) }))} onUse={days => fix(r.n, { days })} />
    if (i.k === 'venue') return <VenueField raw={i.raw} n={r.n} onUse={v => fix(r.n, { venue: v })} />
    if (i.k === 'serial') return <><p className="tl-why">The sheet has the number {i.raw} in the date column. As an Excel date that’s {weekdayDate(i.suggestion)}. Is that right?</p>{acts(<button type="button" className="sb-btn" style={optBtn} onClick={() => fix(r.n, { serialOk: true })}>Yes, {shortDate(i.suggestion)}</button>)}</>
    if (i.k === 'invalid') return <><p className="tl-why">“{i.raw}” isn’t a date Setlistr can read{ordered ? ` ${order === 'MDY' ? 'month first' : 'day first'}` : ''}. Fix it in the sheet and import again, or leave the row out.</p>{ordered && acts(<button type="button" className="sb-btn" style={optBtn} onClick={() => { setShow(s => ({ ...s, order: true })); window.scrollTo(0, 0) }}>Change how dates are read</button>)}</>
    if (i.k === 'times') return <><p className="tl-why">“{i.raw}” has more than one time. Which is the start time?</p>{acts(i.options.map(t => <button key={t} type="button" className="sb-btn" style={optBtn} onClick={() => fix(r.n, { time: t })}>{timeLabel(t)}</button>))}</>
    if (i.k === 'zone-up' || i.k === 'zone-time' || i.k === 'zone-bad') return (
      <div className="sb-field" style={{ display: 'grid', gap: 8 }}>
        <p className="tl-why">{i.k === 'zone-bad' ? `“${i.raw}” isn’t a time zone Setlistr can use. Choose the zone for ${r.city || 'this show'}.`
          : i.k === 'zone-up' ? `Upcoming bookings need a time zone so Schedule knows when ${datesText(r.dates)} arrives in ${r.city || 'that place'}${r.time ? ` and when ${timeLabel(r.time)} is` : ''}. ${r.country || 'This country'} has more than one, so Setlistr won’t pick.`
          : `The sheet says ${timeLabel(r.time!)}. ${r.country} has more than one time zone, so Setlistr won’t pick one or convert the time. Choose the zone, or keep ${timeLabel(r.time!)} as written with the time zone not recorded.`}</p>
        <label style={labelStyle}>Time zone for {[r.city, r.region, r.country].filter(Boolean).join(', ') || 'this show'}</label>
        <TimezoneCombobox value={r.zone || ''} onChange={(tz: string) => fix(r.n, { zone: tz })} />
        {i.k === 'zone-time' && acts(<button type="button" className="sb-btn" style={optBtn} onClick={() => fix(r.n, { noZone: true })}>Keep {timeLabel(r.time!)} as written</button>)}
      </div>
    )
    if (i.k === 'dst-overlap') return <><p className="tl-why">{timeLabel(r.time!)} happens twice on {shortDate(r.dates[0])} in {r.city || 'that zone'}, when clocks go back an hour. Which one was it?</p>{acts(i.options.map((o, idx) => <button key={o} type="button" className="sb-btn" style={optBtn} onClick={() => fix(r.n, { instant: o })}>{timeLabel(utcToZonedParts(new Date(o), r.zone!).timeStr)} {zoneAbbreviation(o, r.zone!)} ({idx === 0 ? 'first, before clocks go back' : 'second, after'})</button>))}</>
    if (i.k === 'dst-gap') return <TimeGap r={r} suggestion={i.suggestion} onUse={t => fix(r.n, { time: t })} />
    return null
  }

  function detail(r: Row): React.ReactNode {
    const f = fixes[r.n] || {}
    const readTime = r.timeAsWritten ? `${timeLabel(r.time!)} as written, time zone not recorded` : r.time ? `${timeLabel(r.time)} local time` : r.rawTime ? `“${r.rawTime}”` : 'date only, no start time'
    return (
      <>
        {r.status === 'decide' && decision(r)}
        {fixes[r.n]?.zone && <ZoneBulk rows={rows} r={r} zone={fixes[r.n].zone!} onUse={ns => setFixes(fx => { const n = { ...fx }; for (const x of ns) n[x] = { ...(n[x] || {}), zone: fixes[r.n].zone }; return n })} />}
        {r.status === 'out' && r.outReason === 'already_imported' && r.pair?.alreadyImported && (
          <div className="tl-pair"><p className="tl-why">This booking was already imported from {r.pair.alreadyImported.file}{r.pair.alreadyImported.at ? ` on ${shortDate(r.pair.alreadyImported.at.slice(0, 10))}` : ''}, so it’s left out.</p>
            {acts(<button type="button" className="sb-btn" style={optBtn} onClick={() => fix(r.n, { decision: 'keep' })}>Import as another record</button>)}</div>
        )}
        <dl className="tl-dl">
          <div><dt>In the sheet, row {r.n}</dt><dd style={{ fontFamily: MONO, fontSize: 13 }}>{r.cells.map(c => c.value).join(' · ')}</dd></div>
          {r.dates.length > 0 && <div><dt>Read as</dt><dd>{r.dates.map(weekdayDate).join('; ')}, {readTime}</dd></div>}
          {r.dates.length > 0 && <div><dt>Time zone</dt><dd>{r.zone ? `${zoneName(r.zone)}, ${ZONE_FROM[r.zoneFrom!]}` : r.timeAsWritten ? 'Not recorded; the time is kept as written' : r.upcoming === false && !r.time ? 'Not recorded. The date is kept as written.' : 'Not set'}</dd></div>}
          {r.notes.length > 0 && <div><dt>Note</dt><dd>{r.notes.join('. ')}</dd></div>}
          <div><dt>Becomes</dt><dd>{r.status === 'out' || r.status === 'decide' ? 'Left out unless settled; the result lists it' : r.upcoming ? `${r.dates.length > 1 ? `${r.dates.length} bookings` : 'A booking'} in Upcoming${r.time ? '' : ', with no start time yet'}` : `${r.dates.length > 1 ? `${r.dates.length} listings` : 'A listing'} in Earlier marked “No capture linked”, not counted as performed`}</dd></div>
        </dl>
        {r.repeatedBy && <p className="tl-why">Row {r.repeatedBy} may repeat this show. Decide on that row.</p>}
        {r.outReason !== 'no_date' && r.outReason !== 'already_imported' && (
          <button type="button" className="sb-btn" style={{ ...textAction, justifySelf: 'start', color: 'var(--sl-text-2)' }} onClick={() => fix(r.n, f.exclude || f.decision ? { exclude: false, decision: undefined } : { exclude: true })}>
            {f.exclude || f.decision === 'skip' ? 'Include this row again' : f.decision === 'keep' ? 'Undo this choice' : 'Leave this row out'}
          </button>
        )}
        {r.outReason === 'no_date' && <p className="tl-why">A show needs a date to be imported. Add it later with “+ Add a show”.</p>}
      </>
    )
  }

  const rowsWithMonths = (list: Row[], months: boolean) => {
    const out: React.ReactNode[] = []; let last = ''
    for (const r of list) { if (months && r.dates[0]) { const m = monthOf(r.dates[0]); if (m !== last) { out.push(<div key={'m' + m} className="tl-month">{m}</div>); last = m } } out.push(rowLine(r)) }
    return out
  }
  const group = (key: 'up' | 'past' | 'out', title: string, list: Row[], count: string, note?: string, months = false) => !list.length ? null : (
    <section aria-label={title}>
      <button type="button" className="im-group" aria-expanded={show[key]} onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}>
        <span className="im-group-t">{title}</span><span className="im-group-n">{count}</span><ChevronDown size={16} className="im-chev" aria-hidden="true" />
      </button>
      {show[key] && <>{note && <p className="tl-note" style={{ margin: '0 0 8px' }}>{note}</p>}<div className="tl-rows">{rowsWithMonths(list, months)}</div></>}
    </section>
  )

  return (
    <div className="tl">
      {head('Import shows', <span style={{ fontFamily: MONO, fontSize: 13 }}>{file.name}</span>)}
      {changedNote && <div className="tl-err" role="status" style={{ marginBottom: 14 }}><span>{changedNote}</span></div>}

      <div className="im-summary">
        <p className="im-counts" aria-live="polite"><b>{b.ready.length} ready</b> · {decide.length + waiting.length} need attention · {b.out.length} skipped</p>
        <div className="im-acts">
          {decide.length > 0 && !fileBlocked && <button type="button" className="sb-btn" style={optBtn} onClick={nextIssue}>Review next issue</button>}
          {ordered && order && <button type="button" className="sb-btn" style={textAction} aria-expanded={show.order} onClick={() => setShow(s => ({ ...s, order: !s.order }))}>Date order</button>}
          <button type="button" className="sb-btn" style={textAction} aria-expanded={show.columns || missingColumn.length > 0} onClick={() => setShow(s => ({ ...s, columns: !s.columns }))}>Columns</button>
          <button type="button" className="sb-btn" style={textAction} onClick={() => setPhase('choose')}>Another file</button>
        </div>
        {!fileBlocked && <p className="im-only">Continuing imports only the ready rows{b.shows.length !== b.ready.length ? ` (${pl(b.shows.length, 'show', 'shows')})` : ''}.{decide.length ? ` ${decide.length === 1 ? 'The row that needs' : `The ${decide.length} rows that need`} attention ${decide.length === 1 ? 'is' : 'are'} left out and listed in the result.` : ''}</p>}
        <p className="tl-note" style={{ margin: 0 }}>{pl(file.rows.length, 'row', 'rows')}{file.headerRow && file.headerRow > 1 ? ` from “${file.sheet}”, below the headings on row ${file.headerRow}` : ''}.{order && ordered && ex ? ` Dates are ${ORDER_LABEL[order].toLowerCase()}, so ${ex} is ${orderText(order)}.` : ''}</p>
      </div>

      {ordered && !order && !missingColumn.length && (
        <section aria-labelledby="im-order-h" style={{ marginTop: 14 }}>
          <div className="tl-sec" style={{ marginTop: 0 }}><h3 id="im-order-h">First, how are dates written?</h3><span>{pl(waiting.length, 'row', 'rows')}</span></div>
          <p className="tl-why" style={{ marginBottom: 10 }}>Every date in this file reads two ways, so Setlistr won’t guess. Nothing can be imported until this is chosen.</p>
          <div className="im-acts">{orderChoices}</div>
        </section>
      )}
      {order && show.order && (
        <div style={{ display: 'grid', gap: 8, padding: '10px 0 4px' }}>
          <p className="tl-why">{detected.order && !chosenOrder && detected.evidence ? `Read from the column: “${detected.evidence}” only works ${ORDER_LABEL[detected.order].toLowerCase()}.` : 'Chosen by you.'}</p>
          <div className="im-acts">{orderChoices}</div>
        </div>
      )}
      {(show.columns || missingColumn.length > 0) && (
        <div className="sb-field" style={{ display: 'grid', gap: 12, padding: '12px 0 6px' }}>
          {missingColumn.length > 0 && <p className="tl-why" role="alert" style={{ color: 'var(--sl-warn)' }}>Choose the column that holds the {missingColumn.join(' and the ')}. Nothing can be imported without it.</p>}
          {file.headers.map((h, idx) => (
            <div key={idx} className="im-col">
              <label htmlFor={`im-col-${idx}`} style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: C.text }}>{h}</span>
                <span className="tl-sub" style={{ fontFamily: MONO }}>{file.rows.slice(0, 3).map(([, v]) => v[idx]?.text).filter(Boolean).join(' · ') || 'empty'}</span>
              </label>
              <select id={`im-col-${idx}`} value={map[idx]} onChange={e => setMap(m => m.map((x, j) => j === idx ? e.target.value as Field : x === e.target.value && e.target.value !== 'skip' ? 'skip' : x))} style={inputStyle(map[idx] !== 'skip')}>
                {(Object.keys(FIELD_LABEL) as Field[]).map(k => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}
              </select>
            </div>
          ))}
          <p className="tl-why">Columns set to “Don’t import” aren’t sent or saved anywhere.</p>
        </div>
      )}

      {!missingColumn.length && <>
        {attention.length > 0 && (
          <section aria-labelledby="im-dec-h">
            <div className="tl-sec"><h3 id="im-dec-h">Needs attention</h3><span>{decide.length}</span></div>
            <div className="tl-rows">{attention.map(rowLine)}</div>
          </section>
        )}
        {waiting.length > 0 && order === null && (
          <section aria-labelledby="im-wait-h"><div className="tl-sec"><h3 id="im-wait-h">Waiting for the date order</h3><span>{waiting.length}</span></div><div className="tl-rows">{waiting.map(rowLine)}</div></section>
        )}
        {group('up', 'Upcoming bookings', up, pl(up.reduce((n, r) => n + r.dates.length, 0), 'booking', 'bookings'), 'Added to Schedule.')}
        {group('past', 'Past listings', past, pl(past.reduce((n, r) => n + r.dates.length, 0), 'listing', 'listings'), 'Added to Earlier as “No capture linked”. A date in a spreadsheet doesn’t show the show was performed.', true)}
        {group('out', 'Skipped', b.out.filter(r => r.n !== pinned), pl(b.out.filter(r => r.n !== pinned).length, 'row', 'rows'))}
      </>}

      <div className="im-bar">
        <button type="button" className="sb-btn" disabled={fileBlocked || !b.shows.length} onClick={() => { setPhase('confirm'); window.scrollTo(0, 0) }}
          style={{ ...primaryBtn, opacity: fileBlocked || !b.shows.length ? 0.55 : 1, cursor: fileBlocked || !b.shows.length ? 'default' : 'pointer' }}>
          {waiting.length ? 'Choose how dates are written first' : missingColumn.length ? 'Choose the missing column first' : !b.ready.length ? 'No rows are ready yet' : `Continue with ${pl(b.ready.length, 'ready row', 'ready rows')}`}
        </button>
      </div>
      {styles}
    </div>
  )
}

function ZoneBulk({ rows, r, zone: z, onUse }: { rows: Row[]; r: Row; zone: string; onUse: (rows: number[]) => void }) {
    const cands = zoneCandidates(rows, r)
    const [sel, setSel] = useState<number[]>(() => cands.filter(c => c.samePlace).map(c => c.row.n))
    if (!cands.length) return null
    return (
      <div className="im-bulk" role="group" aria-labelledby={`im-bulk-${r.n}`}>
        <p className="tl-why" id={`im-bulk-${r.n}`}><strong>Other rows that need a time zone.</strong> Tick only the places that use {zoneName(z)}; rows in the same city are ticked for you.</p>
        {cands.map(({ row }) => (
          <label key={row.n} className="im-check"><input type="checkbox" className="sb-check" checked={sel.includes(row.n)} onChange={e => setSel(s => e.target.checked ? [...s, row.n] : s.filter(x => x !== row.n))} />
            <span>Row {row.n} · {row.venue || 'Venue missing'} · {[row.city, row.region, row.country].filter(Boolean).join(', ') || 'no place in the sheet'}</span></label>
        ))}
        <div><button type="button" className="sb-btn" style={{ ...optBtn, opacity: sel.length ? 1 : 0.55 }} disabled={!sel.length} onClick={() => onUse(sel)}>{sel.length ? `Use it for ${pl(sel.length, 'row', 'rows')}` : 'Tick the rows to use it for'}</button></div>
      </div>
    )
  }


function YearPicker({ r, i, onUse }: { r: Row; i: { d: number; mo: number; raw: string }; onUse: (y: number) => void }) {
  const [other, setOther] = useState('')
  const y0 = new Date().getFullYear()
  const valid = /^\d{4}$/.test(other) && +other >= 1950 && +other <= y0 + 5
  return (
    <div className="sb-field" style={{ display: 'grid', gap: 8 }}>
      <p className="tl-why">The sheet says “{i.raw}” with no year. Setlistr won’t guess it.</p>
      <div className="im-acts">{[y0 - 1, y0, y0 + 1].map(y => <button key={y} type="button" className="sb-btn" style={optBtn} onClick={() => onUse(y)}>{weekdayDate(iso(y, i.mo, i.d))}</button>)}</div>
      <label htmlFor={`im-year-${r.n}`} style={labelStyle}>Another year</label>
      <div className="im-acts">
        <input id={`im-year-${r.n}`} inputMode="numeric" maxLength={4} placeholder="e.g. 2019" value={other} onChange={e => setOther(e.target.value.replace(/\D/g, ''))} style={{ ...inputStyle(!!other), width: 140 }} />
        <button type="button" className="sb-btn" style={{ ...optBtn, opacity: valid ? 1 : 0.55 }} disabled={!valid} onClick={() => onUse(+other)}>Use {valid ? weekdayDate(iso(+other, i.mo, i.d)) : 'this year'}</button>
      </div>
    </div>
  )
}

function RangePicker({ raw, past, days, onUse }: { raw: string; past: boolean; days: { d: number; label: string }[]; onUse: (days: number[]) => void }) {
  const [sel, setSel] = useState<number[]>([])
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p className="tl-why">“{raw}” covers {days.length} days. Choose the dates to add; each becomes its own {past ? 'listing' : 'booking'}.{past ? ' Past dates are added as unconfirmed listings, not as performed shows.' : ''}</p>
      <div className="im-acts" role="group" aria-label="Dates to add">
        {days.map(({ d, label }) => (
          <button key={d} type="button" className="sb-btn" aria-pressed={sel.includes(d)} onClick={() => setSel(s => s.includes(d) ? s.filter(x => x !== d) : [...s, d])} style={{ ...optBtn, ...(sel.includes(d) ? { background: C.goldDim } : {}) }}>{sel.includes(d) ? '✓ ' : ''}{label}</button>
        ))}
      </div>
      <div><button type="button" className="sb-btn" style={{ ...primaryBtn, width: 'auto', minHeight: 48, fontSize: 15, opacity: sel.length ? 1 : 0.55 }} disabled={!sel.length} onClick={() => onUse(sel)}>{sel.length ? `Add ${sel.length === 1 ? 'this date' : `these ${sel.length} dates`}` : 'Choose at least one date'}</button></div>
    </div>
  )
}

function TimeGap({ r, suggestion, onUse }: { r: Row; suggestion: string | null; onUse: (t: string) => void }) {
  const [t, setT] = useState('')
  return (
    <div className="sb-field" style={{ display: 'grid', gap: 8 }}>
      <p className="tl-why">{timeLabel(r.time!)} didn’t exist on {shortDate(r.dates[0])} in {r.city || 'that zone'}: clocks went forward an hour that night. What time did the show start?</p>
      <label htmlFor={`im-time-${r.n}`} style={labelStyle}>Start time</label>
      <div className="im-acts">
        <input id={`im-time-${r.n}`} type="time" value={t} onChange={e => setT(e.target.value)} style={{ ...inputStyle(!!t), width: 170, colorScheme: 'var(--sl-scheme)' as any }} />
        <button type="button" className="sb-btn" style={{ ...optBtn, opacity: t ? 1 : 0.55 }} disabled={!t} onClick={() => onUse(t)}>Use this time</button>
      </div>
      {suggestion && <p className="tl-why">Suggestion, if the sheet used the old clock: <button type="button" className="sb-btn" style={{ ...textAction, display: 'inline-flex' }} onClick={() => setT(suggestion)}>{timeLabel(suggestion)}</button>. Check before using it.</p>}
    </div>
  )
}

function VenueField({ raw, n, onUse }: { raw: string; n: number; onUse: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="sb-field" style={{ display: 'grid', gap: 8 }}>
      <p className="tl-why">The venue cell is {raw ? `“${raw}”` : 'empty'}. Every show needs a venue so it can be told apart from others that night.</p>
      <label htmlFor={`im-venue-${n}`} style={labelStyle}>Venue</label>
      <input id={`im-venue-${n}`} value={v} onChange={e => setV(e.target.value)} placeholder="Venue name" style={inputStyle(!!v.trim())} />
      <div><button type="button" className="sb-btn" style={{ ...optBtn, opacity: v.trim() ? 1 : 0.55 }} disabled={!v.trim()} onClick={() => onUse(v.trim())}>Use this venue</button></div>
    </div>
  )
}

// Import-page layout only; rows, fields and buttons are the shared ones.
// The Continue bar sticks above the phone tab bar and its capture disc
// (AppShell: 65px + the home-indicator inset, disc raised 13px).
const FLOW_CSS = `
  .im-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .im-file { cursor: pointer; }
  .im-file:focus-within, #im-file:focus-visible + .im-file { outline: 2px solid var(--sl-accent); outline-offset: 2px; }
  .im-acts { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
  .im-summary { display: grid; gap: 6px; }
  .im-counts { margin: 0; font-size: 15px; color: var(--sl-text-2); }
  .im-counts b { color: var(--sl-text); }
  .im-choice { display: grid; gap: 4px; padding-top: 6px; }
  .im-col { display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, 210px); gap: 12px; align-items: center; }
  .im-group { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 48px; margin-top: 18px; padding: 0 2px; background: none; border: 0; border-bottom: 1px solid var(--sl-line); cursor: pointer; font-family: inherit; color: inherit; text-align: left; }
  .im-group-t { flex: 1; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sl-text-3); }
  .im-group-n { font-size: 13px; color: var(--sl-text-2); }
  .im-chev { color: var(--sl-text-3); transition: transform .15s; }
  .im-group[aria-expanded="true"] .im-chev { transform: rotate(180deg); }
  .im-group:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: 2px; }
  .im-one, .im-link { grid-template-columns: minmax(0,1fr); text-decoration: none; color: inherit; }
  .im-link { grid-template-columns: 70px minmax(0,1fr); }
  .im-bulk { border: 1px solid var(--sl-line); border-radius: 12px; padding: 10px 12px; margin: 0; display: grid; gap: 2px; }
  .im-check { display: flex; align-items: center; gap: 12px; min-height: 44px; font-size: 14px; color: var(--sl-text); cursor: pointer; }
  .im-stats { display: grid; gap: 0; border-top: 1px solid var(--sl-line); }
  .im-stat { display: grid; grid-template-columns: 48px minmax(0,1fr); gap: 12px; align-items: first baseline; padding: 14px 2px; border-bottom: 1px solid var(--sl-line); }
  .im-stat .sb-btn { padding-left: 0; }
  .im-only { margin: 0; font-size: 14px; color: var(--sl-text-2); }
  .im-num { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; color: var(--sl-text); font-variant-numeric: tabular-nums; }
  .im-lab { display: block; font-size: 16px; font-weight: 700; color: var(--sl-text); }
  .im-reasons { margin: 8px 0 0; padding-left: 18px; font-size: 13.5px; color: var(--sl-text-2); line-height: 1.6; }
  .im-bar { position: sticky; bottom: calc(82px + env(safe-area-inset-bottom, 0px)); z-index: 5; margin-top: 22px; padding: 10px 0; background: var(--sl-bg); }
  @media (min-width: 900px) { .im-bar { bottom: 0; padding-bottom: 16px; } }
  @media (prefers-reduced-motion: reduce) { .im-chev { transition: none; } }
`
