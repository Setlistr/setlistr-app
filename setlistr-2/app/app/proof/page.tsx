'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { PageFrame } from '@/components/ui/PageFrame'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/ui/LoadError'
import { isNativeApp } from '@/lib/appearance'
import { chooseHandoffRoute, isShareCancel, canShareFile } from '@/lib/claim-sheet-handoff'
import { staticMapUrl, type MapView } from '@/lib/proof/map'
import type { ProofSummary } from '@/lib/proof/load'
import type { ProofShow } from '@/lib/proof/summary'
import {
  METHOD, SOURCE_LINE, HOW_MADE, pl, proofDay, shortDate, periodText, importedYears as importedYearsText,
  relationText, coverageText, unplacedText, factsText, evidenceRows,
} from '@/lib/proof/wording'

// Proof of Performance (docs/proof-of-performance-plan.md; approved
// revision 3). Career is where an artist explores their history; this
// packages it into a record someone else can understand quickly. Every
// figure comes from /api/proof/summary, and the PDF (/api/proof/pdf) is
// built from the same summary and the same wording (lib/proof/wording.ts).
// The record photo isn't built yet, so it has no control here.

const MONO = '"DM Mono", monospace'
const DISPLAY = 'var(--sl-font-display)'

const REGISTER_STEP = 25
const PLACES_SHOWN = 8

// The viewer's own zone: the page and the PDF read show days the same way.
function viewerZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

// Browser download of the PDF. The object URL is kept briefly so the
// browser has finished with it before it's released.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// The display name fits its column: Bebas is about 0.43em per character, so
// the longest word sets the size (never below a readable floor).
function longestWord(name: string) { return Math.max(5, ...name.split(/\s+/).map(w => w.length)) }

export default function ProofPage() {
  const router = useRouter()
  const { actingAsArtistId, resolved } = useActingAs()
  const [userId, setUserId] = useState<string | null>(null)
  const [summary, setSummary] = useState<ProofSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'denied'>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const [mapFailed, setMapFailed] = useState(false)
  const [shown, setShown] = useState(REGISTER_STEP)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const request = useRef(0)

  useEffect(() => {
    if (!resolved) return
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/auth/login'); return }
      setUserId(user.id)
    })
  }, [resolved, router])

  const artistId = actingAsArtistId || userId
  useEffect(() => {
    if (!resolved || !artistId) return
    const mine = ++request.current
    setState('loading'); setSummary(null); setImageFailed(false); setMapFailed(false); setShown(REGISTER_STEP); setExportError(null)
    fetch(`/api/proof/summary?artist_id=${encodeURIComponent(artistId)}`, { cache: 'no-store' })
      .then(async res => {
        if (mine !== request.current) return
        if (res.status === 403 || res.status === 401) { setState('denied'); return }
        if (!res.ok) throw new Error(`summary ${res.status}`)
        const data = await res.json() as ProofSummary
        if (mine !== request.current) return
        setSummary(data); setState('ready')
      })
      .catch(e => { if (mine === request.current) { console.error('[Proof] load failed:', e); setState('error') } })
  }, [resolved, artistId, reloadKey])

  const back = <Link href="/app/stats" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 14, color: 'var(--sl-text-2)', textDecoration: 'none' }}>← Career</Link>

  if (state === 'loading' || !summary) {
    return (
      <PageFrame>
        <div aria-busy={state === 'loading'} style={{ paddingTop: 8 }}>
          {back}
          {state === 'error' ? (
            <div style={{ marginTop: 12 }}><LoadError message="The record didn’t load." onRetry={() => setReloadKey(k => k + 1)} /></div>
          ) : state === 'denied' ? (
            <div role="alert" style={{ marginTop: 16 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--sl-text)', margin: 0 }}>This record isn’t available</h1>
              <p style={{ fontSize: 15, color: 'var(--sl-text-2)', margin: '6px 0 0' }}>You don’t have access to this workspace’s record.</p>
            </div>
          ) : (
            <>
              <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Loading the record</span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginTop: 12 }}><Skeleton w={118} h={148} r={4} /><div style={{ flex: 1 }}><Skeleton w="60%" h={14} /><Skeleton w="90%" h={46} mt={10} /><Skeleton w="70%" h={14} mt={10} /></div></div>
              <Skeleton w="70%" h={110} mt={22} />
              <Skeleton h={176} mt={20} r={6} />
            </>
          )}
        </div>
      </PageFrame>
    )
  }

  const s = summary
  const c = s.counts
  const photo = !!s.artist.imageUrl && !imageFailed
  const zone = viewerZone()
  const day = (d: ProofShow['date']) => proofDay(d, zone)
  const period = periodText(s.shows, zone)
  const nl = longestWord(s.artist.name) * 0.43
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const showMap = s.map.mode === 'map' && !!token && !mapFailed && !!s.map.views.phone && !!s.map.views.wide

  const supp = (
    <div className="pf-supp">
      {pl(c.cities, 'city', 'cities')} · {pl(c.countries, 'country', 'countries')}<br />{pl(c.songPerformances, 'song performance', 'song performances')}
    </div>
  )
  const figure = (cls: string) => (
    <div className={cls}>
      <div className="pf-big">{c.confirmed.toLocaleString()}</div>
      <div><div className="pf-big-l">{c.confirmed === 1 ? 'confirmed show' : 'confirmed shows'}</div>{supp}</div>
    </div>
  )

  const mapImage = (v: MapView, cls: string) => (
    <div className={cls} style={{ position: 'relative', aspectRatio: `${v.w} / ${v.h}`, borderRadius: 6, overflow: 'hidden', background: '#0a0908' /* map imagery: dark in both appearances */ }}>
      <img src={staticMapUrl(v, token)} alt={`Map of the places where ${s.artist.name}’s confirmed shows took place`} loading="lazy" onError={() => setMapFailed(true)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {v.dots.map((d, i) => (
        <span key={i} aria-hidden="true" style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, width: `${(d.d / v.w) * 100}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%', background: '#c9a84c', boxShadow: '0 0 0 1.5px #0a0908' /* map imagery: Setlistr gold on the dark map */ }} />
      ))}
    </div>
  )
  let geo: React.ReactNode = null
  if (showMap) {
    geo = (
      <figure className="pf-map">
        {mapImage(s.map.views.phone!, 'pf-map-phone')}
        {mapImage(s.map.views.wide!, 'pf-map-wide')}
        <figcaption className="pf-map-cap">
          <span>{coverageText(s.map.mappedShows, c.confirmed, s.map.coverage)}</span>
          <span style={{ whiteSpace: 'nowrap' }}>© Mapbox © OpenStreetMap</span>
        </figcaption>
      </figure>
    )
  } else if (s.map.placeNames.length > 0) {
    const names = s.map.placeNames.slice(0, PLACES_SHOWN), more = s.map.placeNames.length - names.length
    geo = (
      <div className="pf-places">
        {names.map(p => <div key={p.name} className="pf-pl"><b>{p.name}</b><span>{pl(p.shows, 'show', 'shows')}</span></div>)}
        {more > 0 && <p className="pf-cap">and {pl(more, 'more place', 'more places')}</p>}
        {unplacedText(s.map.coverage) && <p className="pf-cap">{unplacedText(s.map.coverage)}</p>}
        {s.map.mode === 'map' && <p className="pf-cap">The map isn’t available right now.</p>}
      </div>
    )
  }

  const relation = c.confirmed > 0 ? (
    <p className="pf-rel">
      <b>{pl(c.confirmed, 'confirmed show', 'confirmed shows')}.</b>{' '}{relationText(c)}
    </p>
  ) : null

  const sourceLine = c.confirmed > 0 ? (
    <p className="pf-src">Setlists: {SOURCE_LINE.filter(([m]) => s.methods[m] > 0).map(([m, l], i) => <span key={m}>{i > 0 && ' · '}<b>{s.methods[m].toLocaleString()}</b> {l}</span>)}</p>
  ) : null

  const how = (
    <details className="pf-how">
      <summary>How this record is made</summary>
      <dl>{HOW_MADE.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
    </details>
  )

  // Export: only for people who can edit this workspace (the server checks
  // again on every request). Handed off as the claim sheet is: a download in
  // the browser, the share sheet in the installed app, an honest error otherwise.
  async function exportPdf() {
    if (exporting || !s) return
    setExporting(true); setExportError(null)
    try {
      const tz = zone ? `&tz=${encodeURIComponent(zone)}` : ''
      const res = await fetch(`/api/proof/pdf?artist_id=${encodeURIComponent(s.artist.id)}${tz}`, { cache: 'no-store' })
      if (res.status === 401) { setExportError('Your session has ended. Sign in again, then export.'); return }
      if (res.status === 403) { setExportError('You don’t have permission to export this record.'); return }
      if (!res.ok || !(res.headers.get('content-type') || '').includes('application/pdf')) throw new Error(`pdf ${res.status}`)
      const blob = await res.blob()
      if (blob.size === 0) throw new Error('empty pdf')
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'proof-of-performance.pdf'
      let file: File | null = null
      try { file = new File([blob], name, { type: 'application/pdf' }) } catch { file = null }
      const route = chooseHandoffRoute({ native: isNativeApp(window), canShareFile: canShareFile(navigator, file) })
      if (route === 'download') { downloadBlob(blob, name); return }
      if (route === 'share' && file) {
        try { await navigator.share({ files: [file], title: name }) } catch (e) {
          if (isShareCancel(e)) return
          console.error('[Proof] share failed:', e)
          setExportError('The PDF couldn’t be shared from the app. Open setlistr.ai in Safari to download it.')
        }
        return
      }
      setExportError('This app can’t save the PDF yet. Open setlistr.ai in Safari to download it.')
    } catch (e) {
      console.error('[Proof] export failed:', e)
      setExportError('The PDF couldn’t be created. Try again.')
    } finally { setExporting(false) }
  }
  const exportBlock = s.access.canExport && c.confirmed > 0 ? (
    <>
      <button type="button" className="pf-btn" onClick={exportPdf} disabled={exporting} aria-busy={exporting}>{exporting ? 'Preparing PDF…' : 'Export PDF'}</button>
      {exportError && <p role="alert" className="pf-err">{exportError}</p>}
    </>
  ) : null

  // The register: newest first, grouped by year, each show's evidence a tap away.
  const visible = s.shows.slice(0, shown)
  const years: { y: string; shows: ProofShow[] }[] = []
  for (const sh of visible) {
    const d = day(sh.date), y = d ? String(d.y) : 'Date not recorded'
    if (!years.length || years[years.length - 1].y !== y) years.push({ y, shows: [] })
    years[years.length - 1].shows.push(sh)
  }
  const evidence = evidenceRows
  const facts = factsText

  const register = c.confirmed > 0 ? (
    <section className="pf-reg" aria-labelledby="pf-reg-h">
      <div className="pf-reg-h"><h2 id="pf-reg-h">Performance register</h2><span>{pl(c.confirmed, 'show', 'shows')} · newest first</span></div>
      {years.map(g => (
        <div key={g.y}>
          <div className="pf-yr">{g.y}</div>
          {g.shows.map(sh => (
            <details key={sh.id} className="pf-show">
              <summary>
                <span className="pf-dt">{shortDate(day(sh.date))}</span>
                <span className="pf-vc"><span className="pf-vn">{sh.venue}</span><span className="pf-ct">{sh.city || 'No city on file'}</span></span>
                <span className="pf-city-d">{sh.city || 'No city on file'}</span>
                <span className="pf-songs-d">{sh.songs}</span>
                <span className={`pf-hw${sh.method === 'unknown' ? ' pf-unk' : ''}`}>
                  <span className="pf-hw-p">{METHOD[sh.method].short}</span><span className="pf-hw-d">{METHOD[sh.method].label}</span>
                  <small className="pf-hw-p">{pl(sh.songs, 'song', 'songs')}</small>{facts(sh) && <small className="pf-hw-d">{facts(sh)}</small>}
                </span>
              </summary>
              <dl className="pf-ev">{evidence(sh).map(([t, v, n]) => <div key={t}><dt>{t}</dt><dd>{v}<small>{n}</small></dd></div>)}</dl>
            </details>
          ))}
        </div>
      ))}
      {s.shows.length > shown && (
        <button type="button" className="pf-more" onClick={() => setShown(n => n + REGISTER_STEP * 4)}>Show {Math.min(REGISTER_STEP * 4, s.shows.length - shown)} more of {s.shows.length.toLocaleString()}</button>
      )}
    </section>
  ) : null

  const awaiting = s.awaiting.length > 0 ? (
    <section className="pf-sub" aria-labelledby="pf-aw-h">
      <div className="pf-sub-h"><h2 id="pf-aw-h">Awaiting confirmation</h2><span>{pl(s.awaiting.length, 'show', 'shows')} · not counted</span></div>
      {s.awaiting.map(a => (
        <div key={a.id} className="pf-plain">
          <span className="pf-dt">{shortDate(day(a.date))}</span>
          <span className="pf-vc"><span className="pf-vn">{a.venue}</span><span className="pf-ct">{a.city || 'No city on file'}</span></span>
          <span className="pf-city-d">{a.city || 'No city on file'}</span>
          <span className="pf-songs-d" />
          {s.access.canExport ? <Link href={`/app/review/${a.id}`} className="pf-lnk">Review</Link> : <span className="pf-st">In review</span>}
        </div>
      ))}
    </section>
  ) : null

  const importedYears = importedYearsText(s.imported.first, s.imported.last, zone)
  const imported = s.imported.count > 0 ? (
    <section className="pf-sub" aria-labelledby="pf-im-h">
      <div className="pf-sub-h"><h2 id="pf-im-h">Imported history</h2><span>{pl(s.imported.count, 'show', 'shows')} · not counted</span></div>
      <p className="pf-imp">{pl(s.imported.count, 'show', 'shows')}{importedYears}, imported from setlist.fm. Listed for reference; they weren’t recorded or confirmed in Setlistr. <Link href="/app/history" className="pf-lnk">View in History</Link></p>
    </section>
  ) : null

  const empty = c.confirmed === 0 ? (
    <div className="pf-empty">
      <p className="pf-empty-h">No confirmed shows yet</p>
      <p>{s.awaiting.length > 0 ? 'Finish reviewing a show’s setlist and it appears here.' : 'Shows you capture or upload in Setlistr appear here once their setlist is confirmed in review.'}</p>
    </div>
  ) : null

  return (
    <PageFrame>
      <div className="pf" style={{ paddingTop: 8 }}>
        {back}
        <div className={`pf-id${photo ? '' : ' pf-nophoto'}`} style={{ ['--nl' as string]: nl }}>
          {photo && (
            <div className="pf-ph">
              <img src={s.artist.imageUrl!} alt={`${s.artist.name}`} onError={() => setImageFailed(true)} />
            </div>
          )}
          <div className="pf-who">
            <div className="pf-ov">Proof of Performance</div>
            <h1 className="pf-name">{s.artist.name}</h1>
            {period && <p className="pf-period"><span className="pf-d-only">Live performance record · </span>{period}</p>}
          </div>
          {c.confirmed > 0 && figure('pf-fig pf-fig-d')}
        </div>
        {c.confirmed > 0 && figure('pf-fig pf-fig-p')}
        {empty}
        {geo}
        <div className="pf-after">
          <div className="pf-a-rel">{relation}</div>
          <div className="pf-a-src">{sourceLine}{how}</div>
          {exportBlock && <div className="pf-a-exp">{exportBlock}</div>}
        </div>
        {register}
        {awaiting}
        {imported}
      </div>
      <style>{`
        .pf { font-family: "DM Sans", system-ui, sans-serif; color: var(--sl-text); }
        .pf-id { display: grid; grid-template-columns: 118px minmax(0,1fr); gap: 16px; align-items: end; margin-top: 8px; }
        .pf-id.pf-nophoto { grid-template-columns: minmax(0,1fr); }
        .pf-ph { width: 118px; aspect-ratio: 4 / 5; border-radius: 4px; overflow: hidden; background: var(--sl-surface); }
        .pf-ph img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; display: block; }
        .pf-ov { font-size: 13px; font-weight: 600; color: var(--sl-gold-text); margin-bottom: 6px; }
        .pf-name { font-family: ${DISPLAY}; font-weight: 400; line-height: 0.86; letter-spacing: 0.012em; margin: 0 0 0 -2px; color: var(--sl-text); overflow-wrap: anywhere; text-wrap: balance;
          font-size: max(30px, min(54px, calc((min(100cqi, 480px) - 174px) / var(--nl)))); }
        .pf-nophoto .pf-name { font-size: max(34px, min(76px, calc((min(100cqi, 480px) - 40px) / var(--nl)))); }
        .pf-period { margin: 8px 0 0; font-size: 14.5px; color: var(--sl-text-2); }
        .pf-d-only, .pf-fig-d, .pf-map-wide, .pf-city-d, .pf-songs-d, .pf-hw-d { display: none; }
        .pf-fig { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 16px; align-items: end; margin-top: 20px; }
        .pf-big { font-family: ${DISPLAY}; font-weight: 400; font-size: 136px; line-height: 0.76; margin-left: -4px; font-variant-numeric: tabular-nums; color: var(--sl-text); }
        .pf-big-l { font-size: 16px; font-weight: 700; color: var(--sl-text); line-height: 1.25; }
        .pf-fig.pf-fig-d { display: none; }
        .pf-supp { margin-top: 4px; font-size: 13.5px; color: var(--sl-text-2); line-height: 1.45; }
        .pf-map { margin: 20px 0 0; }
        .pf-map-cap { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 2px 12px; margin-top: 7px; font-size: 12px; color: var(--sl-text-3); }
        .pf-places { margin-top: 20px; border-top: 1px solid var(--sl-line); }
        .pf-pl { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--sl-line); }
        .pf-pl b { font-family: ${DISPLAY}; font-weight: 400; font-size: 34px; line-height: 0.95; letter-spacing: 0.01em; color: var(--sl-text); overflow-wrap: anywhere; }
        .pf-pl span { font-family: ${MONO}; font-size: 12.5px; color: var(--sl-text-3); white-space: nowrap; }
        .pf-cap { margin: 8px 0 0; font-size: 12px; color: var(--sl-text-3); }
        .pf-empty { margin-top: 24px; padding: 18px 0; border-top: 1px solid var(--sl-line); border-bottom: 1px solid var(--sl-line); }
        .pf-empty-h { margin: 0; font-size: 17px; font-weight: 700; }
        .pf-empty p:not(.pf-empty-h) { margin: 4px 0 0; font-size: 14.5px; color: var(--sl-text-2); }
        .pf-after { margin-top: 22px; display: flex; flex-direction: column; }
        .pf-a-rel { order: 1; } .pf-a-exp { order: 2; } .pf-a-src { order: 3; }
        .pf-btn { width: 100%; min-height: 52px; margin-top: 16px; border: none; border-radius: 14px; background: var(--sl-accent); color: var(--sl-on-accent); font: 800 16px "DM Sans", system-ui, sans-serif; cursor: pointer; }
        .pf-btn:disabled { opacity: 0.7; cursor: default; }
        .pf-btn:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: 2px; }
        .pf-err { margin: 10px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 14px; line-height: 1.45; color: var(--sl-text); background: color-mix(in srgb, var(--sl-warn) 8%, transparent); border: 1px solid color-mix(in srgb, var(--sl-warn) 28%, transparent); }
        .pf-rel { margin: 0; font-size: 14px; color: var(--sl-text-2); line-height: 1.5; }
        .pf-rel b { color: var(--sl-text); font-weight: 600; }
        .pf-src { margin: 12px 0 0; font-size: 12.5px; color: var(--sl-text-3); line-height: 1.55; }
        .pf-src b { font-family: ${MONO}; font-weight: 500; color: var(--sl-text-2); }
                .pf-how { margin-top: 2px; }
        .pf-how > summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; min-height: 44px; font-size: 14px; font-weight: 700; color: var(--sl-gold-text); }
        .pf-how > summary::-webkit-details-marker { display: none; }
        .pf-how dl { margin: 0 0 6px; font-size: 13.5px; color: var(--sl-text-2); line-height: 1.5; max-width: 60ch; }
        .pf-how dt { font-weight: 700; color: var(--sl-text); margin-top: 10px; }
        .pf-how dd { margin: 2px 0 0; }
        .pf-reg { margin-top: 34px; }
        .pf-reg-h, .pf-sub-h { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding-bottom: 10px; }
        .pf-reg-h { border-bottom: 1px solid var(--sl-text); }
        .pf-sub-h { border-bottom: 1px solid var(--sl-line); margin-top: 30px; padding-bottom: 8px; }
        .pf-reg-h h2 { margin: 0; font-size: 17px; font-weight: 700; }
        .pf-sub-h h2 { margin: 0; font-size: 15px; font-weight: 700; }
        .pf-reg-h span, .pf-sub-h span { font-size: 13px; color: var(--sl-text-3); white-space: nowrap; }
        .pf-yr { font-family: ${DISPLAY}; font-size: 28px; line-height: 1; color: var(--sl-text-3); margin: 20px 0 2px; letter-spacing: 0.02em; }
        .pf-show { border-bottom: 1px solid var(--sl-line); }
        .pf-show > summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 54px minmax(0,1fr) auto; column-gap: 12px; align-items: baseline; padding: 12px 0; min-height: 44px; }
        .pf-show > summary::-webkit-details-marker { display: none; }
        .pf-show[open] .pf-vn { color: var(--sl-gold-text); }
        .pf-dt { font-family: ${MONO}; font-size: 13px; color: var(--sl-text-2); white-space: nowrap; }
        .pf-vc { min-width: 0; }
        .pf-vn { display: block; font-size: 15.5px; font-weight: 600; color: var(--sl-text); line-height: 1.3; overflow-wrap: anywhere; }
        .pf-ct { display: block; font-size: 13px; color: var(--sl-text-3); margin-top: 1px; overflow-wrap: anywhere; }
        .pf-hw { font-size: 12.5px; color: var(--sl-text-2); text-align: right; white-space: nowrap; }
        .pf-hw small { display: block; font-family: ${MONO}; font-size: 12px; color: var(--sl-text-3); margin-top: 1px; }
        .pf-hw small.pf-hw-d { display: none; }
        .pf-unk { color: var(--sl-text-3); font-style: italic; }
        .pf-ev { margin: 0 0 14px 66px; display: grid; gap: 9px; }
        .pf-ev dt { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--sl-text-3); }
        .pf-ev dd { margin: 1px 0 0; font-size: 13.5px; color: var(--sl-text); line-height: 1.45; }
        .pf-ev dd small { display: block; font-size: 12px; color: var(--sl-text-3); }
        .pf-more { margin-top: 6px; min-height: 44px; padding: 0; background: none; border: none; color: var(--sl-gold-text); font: 700 14px "DM Sans", system-ui, sans-serif; cursor: pointer; }
        .pf-plain { display: grid; grid-template-columns: 54px minmax(0,1fr) auto; column-gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--sl-line); align-items: baseline; }
        .pf-plain .pf-vn { font-weight: 500; color: var(--sl-text-2); }
        .pf-st { font-size: 12.5px; color: var(--sl-warn); font-weight: 600; }
        .pf-lnk { color: var(--sl-gold-text); font-weight: 700; font-size: 14px; text-decoration: none; display: inline-flex; align-items: center; min-height: 44px; }
        .pf-imp { margin: 0; padding: 12px 0; font-size: 13.5px; color: var(--sl-text-2); line-height: 1.5; border-bottom: 1px solid var(--sl-line); }
        .pf-imp .pf-lnk { min-height: 0; }
        .pf-how > summary:focus-visible, .pf-show > summary:focus-visible, .pf-more:focus-visible, .pf-lnk:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: 2px; border-radius: 4px; }
        @container sl-frame (min-width: 900px) {
          .pf-id { grid-template-columns: 268px minmax(0,1fr) auto; gap: 36px; margin-top: 12px; }
          .pf-id.pf-nophoto { grid-template-columns: minmax(0,1fr) auto; }
          .pf-ph { width: 268px; }
          .pf-name { font-size: max(48px, min(112px, calc((min(100cqi, 1120px) - 640px) / var(--nl)))); }
          .pf-nophoto .pf-name { font-size: max(56px, min(132px, calc((min(100cqi, 1120px) - 380px) / var(--nl)))); }
          .pf-period { font-size: 16px; margin-top: 12px; }
          .pf-d-only, .pf-map-wide { display: inline; }
          .pf-map-wide { display: block; }
          .pf-map-phone, .pf-fig.pf-fig-p { display: none; }
          .pf-fig.pf-fig-d { display: block; margin: 0; padding-bottom: 2px; }
          .pf-fig-d .pf-big { font-size: 210px; }
          .pf-fig-d .pf-big-l { margin-top: 12px; }
          .pf-map { margin-top: 30px; }
          .pf-after { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) 240px; gap: 40px; align-items: start; }
          .pf-a-rel { grid-column: 1; } .pf-a-src { grid-column: 2; } .pf-a-exp { grid-column: 3; grid-row: 1; }
          .pf-btn { margin-top: 0; }
          .pf-show > summary, .pf-plain { grid-template-columns: 86px minmax(0,1.4fr) minmax(0,1fr) 70px minmax(0,1.3fr); }
          .pf-ct, .pf-hw-p { display: none; }
          .pf-city-d, .pf-songs-d { display: block; font-size: 14px; color: var(--sl-text-2); overflow-wrap: anywhere; }
          .pf-songs-d { font-family: ${MONO}; font-size: 13px; }
          .pf-hw { text-align: left; white-space: normal; font-size: 13.5px; }
          .pf-hw-d { display: block; }
          .pf-hw small.pf-hw-d { display: block; }
          .pf-hw small.pf-hw-p { display: none; }
          .pf-ev { margin-left: 98px; grid-template-columns: repeat(3, minmax(0,1fr)); column-gap: 28px; }
        }
      `}</style>
    </PageFrame>
  )
}
