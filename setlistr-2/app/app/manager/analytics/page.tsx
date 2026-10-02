'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, MapPin, Music2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { dateRangeFor, type ManagerDateRangeKey } from '@/lib/managerOverview'
import { fetchCapturedShowsInRange, fetchSongsForPerformances } from '@/lib/managerFetch'
import {
  monthBucketsInRange, groupCapturedShowsByMonth, equalPeriodComparison, comparePeriods,
  aggregateSongRotation, aggregateByCity, aggregateByVenue,
  type AnalyticsPerformanceRow, type SongRotationEntry, type LocationEntry,
} from '@/lib/managerAnalytics'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', green: '#4ade80', red: '#f87171',
}

type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

const RANGE_OPTIONS: { key: ManagerDateRangeKey; label: string }[] = [
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'ytd', label: 'This year' },
]

function dstr(v: string): string {
  return v.slice(0, 10)
}

export default function ManagerAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [managed, setManaged] = useState<ManagedArtist[]>([])
  const [artistFilter, setArtistFilter] = useState<string>('all')
  const [range, setRange] = useState<ManagerDateRangeKey>('90d')
  const [rows, setRows] = useState<AnalyticsPerformanceRow[]>([])
  const [prevRows, setPrevRows] = useState<AnalyticsPerformanceRow[]>([])
  const [songRows, setSongRows] = useState<{ performance_id: string; title: string; artist: string | null }[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null)

  const artistNameById = useMemo(() => new Map(managed.map(a => [a.artist_id, a.artist_name])), [managed])

  const loadRoster = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res = await fetch('/api/team/managed-artists')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setManaged(data.managed || [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRoster() }, [loadRoster])

  const scopedArtistIds = useMemo(() => {
    if (artistFilter === 'all') return managed.map(a => a.artist_id)
    return managed.some(a => a.artist_id === artistFilter) ? [artistFilter] : []
  }, [artistFilter, managed])

  const rangeInfo = dateRangeFor(range)
  const periodPair = useMemo(() => equalPeriodComparison(rangeInfo.fromISO), [rangeInfo.fromISO])

  useEffect(() => {
    if (managed.length === 0 || scopedArtistIds.length === 0) { setRows([]); setPrevRows([]); setSongRows([]); return }
    let cancelled = false
    setDataLoading(true)
    const supabase = createClient()
    Promise.all([
      fetchCapturedShowsInRange(supabase, scopedArtistIds, periodPair.current.fromISO),
      fetchCapturedShowsInRange(supabase, scopedArtistIds, periodPair.previous.fromISO),
    ]).then(async ([current, previousFull]) => {
      if (cancelled) return
      // previousFull runs from the previous period's start through NOW (the
      // shared fetch helper has no upper bound) — trim to the previous
      // period's own end so it doesn't overlap into the current period.
      const previous = previousFull.filter(r => {
        const d = r.started_at || r.performance_date || ''
        return d && d < periodPair.previous.toISO
      })
      setRows(current)
      setPrevRows(previous)
      const ids = current.map(r => r.id)
      const songs = await fetchSongsForPerformances(supabase, ids)
      if (!cancelled) setSongRows(songs)
    }).catch(() => { if (!cancelled) { setRows([]); setPrevRows([]); setSongRows([]) } })
      .finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [scopedArtistIds, managed.length, periodPair])

  const buckets = useMemo(() => monthBucketsInRange(periodPair.current.fromISO, periodPair.current.toISO), [periodPair])
  const monthCounts = useMemo(() => groupCapturedShowsByMonth(rows, buckets), [rows, buckets])
  const maxMonthCount = Math.max(1, ...Array.from(monthCounts.values()))
  // Distinct-show totals for the comparison line — reuses the same rows
  // already fetched for the chart above rather than a separate count call.
  const currentTotal = useMemo(() => new Set(rows.map(r => r.id)).size, [rows])
  const previousTotal = useMemo(() => new Set(prevRows.map(r => r.id)).size, [prevRows])
  const periodComparison = useMemo(() => comparePeriods(currentTotal, previousTotal), [currentTotal, previousTotal])

  const songRotation: SongRotationEntry[] = useMemo(() => aggregateSongRotation(songRows), [songRows])
  const byCity: LocationEntry[] = useMemo(() => aggregateByCity(rows), [rows])
  const byVenue: LocationEntry[] = useMemo(() => aggregateByVenue(rows), [rows])
  const rowsById = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows])
  const [expandedSong, setExpandedSong] = useState<string | null>(null)

  // Top-of-period highlights — omitted entirely when there's nothing
  // evidence-backed to say, never a placeholder or a zero dressed up as a
  // finding. The top city excludes the "Unknown city" bucket: an unnamed
  // location isn't a real observation to headline, even if it happens to
  // have the most rows.
  const topSong = songRotation[0] || null
  const topCity = byCity.find(c => !c.isUnknown) || null

  if (loading) {
    return (
      <div style={{ padding: '24px 20px 48px', maxWidth: 880, margin: '0 auto' }} className="mgr-page">
        <div className="mgr-skeleton" style={{ width: 140, height: 28, borderRadius: 6, marginBottom: 10 }} />
        <div className="mgr-skeleton" style={{ width: 280, height: 14, borderRadius: 4, marginBottom: 24 }} />
        <div className="mgr-skeleton" style={{ width: '100%', maxWidth: 420, height: 36, borderRadius: 10, marginBottom: 24 }} />
        <div className="mgr-skeleton" style={{ width: '100%', height: 180, borderRadius: 14 }} />
        <style>{`@keyframes mgrShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } } .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer 1.4s ease infinite; } @media (prefers-reduced-motion: reduce) { .mgr-skeleton { animation: none; opacity: 0.5; } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' as const }}>
        <p style={{ color: C.text, fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Couldn't load your roster</p>
        <button onClick={loadRoster} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  if (managed.length === 0) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' as const, maxWidth: 380, margin: '0 auto' }}>
        <BarChart3 size={32} color={C.muted} style={{ marginBottom: 16 }} />
        <p style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>No connected artists yet</p>
        <p style={{ color: C.secondary, fontSize: 14, lineHeight: 1.5, margin: 0 }}>Analytics will appear here once you have at least one connected artist.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px 48px', maxWidth: 880, margin: '0 auto' }} className="mgr-page">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Analytics</h1>
      <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 20px' }}>
        Recorded Setlistr activity — not a complete touring history. Every figure below reflects only what's been captured or logged in the app.
      </p>

      {/* ── Controls: artist + shared date range ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginBottom: 24 }}>
        <select value={artistFilter} onChange={e => setArtistFilter(e.target.value)} style={{
          padding: '8px 12px', borderRadius: 10, background: C.card, border: `1px solid ${C.border}`,
          color: C.text, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}>
          <option value="all">All artists</option>
          {managed.map(a => <option key={a.artist_id} value={a.artist_id}>{a.artist_name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGE_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setRange(opt.key)} style={{
              padding: '8px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: range === opt.key ? 'rgba(201,168,76,0.14)' : 'transparent',
              border: `1px solid ${range === opt.key ? 'rgba(201,168,76,0.35)' : C.border}`,
              color: range === opt.key ? C.gold : C.secondary,
            }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Highlights — evidence-backed, each states its period and links
          straight to the supporting records below. Omitted (not shown as
          zero or a placeholder) when there's nothing to say yet. ── */}
      {(topSong || topCity) && !dataLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
          {topSong && (
            <a href="#song-rotation" style={{ textDecoration: 'none' }}>
              <div className="mgr-highlight-card" style={{ background: 'linear-gradient(165deg, #1a1814, #141210)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Music2 size={11} /> Most-performed song · {rangeInfo.label}
                </p>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topSong.title}</p>
                <p style={{ fontSize: 12, color: C.gold, margin: '4px 0 0', fontWeight: 700 }}>{topSong.distinctShowCount} distinct show{topSong.distinctShowCount === 1 ? '' : 's'}{topSong.artist ? ` · ${topSong.artist}` : ''}</p>
              </div>
            </a>
          )}
          {topCity && (
            <a href="#cities-venues" style={{ textDecoration: 'none' }}>
              <div className="mgr-highlight-card" style={{ background: 'linear-gradient(165deg, #1a1814, #141210)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={11} /> Most-recorded city · {rangeInfo.label}
                </p>
                <p style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topCity.label}</p>
                <p style={{ fontSize: 12, color: C.gold, margin: '4px 0 0', fontWeight: 700 }}>{topCity.showCount} recorded show{topCity.showCount === 1 ? '' : 's'}</p>
              </div>
            </a>
          )}
        </div>
      )}

      {/* ── 1. Live activity ── */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>
            Live activity · {rangeInfo.label}
          </p>
        </div>
        <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px' }}>
          {dataLoading ? 'Loading…' : (
            periodComparison.percentChange === null
              ? `${periodComparison.current} recorded show${periodComparison.current === 1 ? '' : 's'} this period — no comparable activity in the prior period, so no trend is shown.`
              : `${periodComparison.current} recorded shows this period, ${periodComparison.previous} in the period before (${periodComparison.percentChange > 0 ? '+' : ''}${periodComparison.percentChange}%).`
          )}
        </p>

        {buckets.length === 0 || currentTotal === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 20px', textAlign: 'center' as const }}>
            <p style={{ color: C.secondary, fontSize: 14, margin: 0 }}>{dataLoading ? 'Loading…' : 'No recorded shows in this period.'}</p>
          </div>
        ) : (
          <div className="mgr-chart" style={{ background: `linear-gradient(180deg, ${C.card}, #100f0d)`, border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 20px 20px', display: 'flex', alignItems: 'flex-end', gap: 12, height: 200, opacity: dataLoading ? 0.5 : 1 }}>
            {buckets.map(b => {
              const count = monthCounts.get(b.key) || 0
              const heightPct = Math.max(3, (count / maxMonthCount) * 100)
              return (
                <div key={b.key} className="mgr-bar-col" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace' }}>{count}</span>
                  <div className="mgr-bar" style={{ width: '100%', maxWidth: 40, height: `${heightPct}%`, background: b.isPartial ? 'rgba(201,168,76,0.35)' : 'linear-gradient(180deg, #e0bf6e, #c9a84c)', borderRadius: '6px 6px 0 0', minHeight: 3 }} />
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' as const }}>{b.label.split(' ')[0]}{b.isPartial ? '*' : ''}</span>
                </div>
              )
            })}
          </div>
        )}
        {buckets.some(b => b.isPartial) && (
          <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>* Current month is still in progress — its count will keep rising.</p>
        )}
      </section>

      {/* ── 2. Song rotation ── */}
      <section id="song-rotation" style={{ marginBottom: 36, scrollMarginTop: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Music2 size={13} /> Song rotation · {rangeInfo.label}
        </p>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px' }}>Most-performed songs, by number of distinct shows.</p>
        {songRotation.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 20px', textAlign: 'center' as const }}>
            <p style={{ color: C.secondary, fontSize: 14, margin: 0 }}>{dataLoading ? 'Loading…' : 'No songs recorded in this period.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {songRotation.slice(0, 12).map((s, i) => {
              const expanded = expandedSong === s.key
              return (
                <div key={s.key} style={{ background: C.card }}>
                  <button onClick={() => setExpandedSong(expanded ? null : s.key)} className="mgr-row-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
                    <span style={{ fontSize: 11, color: C.muted, fontFamily: '"DM Mono", monospace', width: 18, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</p>
                      {s.artist && <p style={{ fontSize: 12, color: C.secondary, margin: '2px 0 0' }}>{s.artist}</p>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{s.distinctShowCount} show{s.distinctShowCount === 1 ? '' : 's'}</span>
                    {expanded ? <ChevronUp size={14} color={C.muted} style={{ flexShrink: 0 }} /> : <ChevronDown size={14} color={C.muted} style={{ flexShrink: 0 }} />}
                  </button>
                  {expanded && (
                    <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {s.performanceIds.map(pid => {
                        const r = rowsById.get(pid)
                        if (!r) return null
                        return (
                          <div key={pid} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: C.secondary, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                            <span>{artistNameById.get(r.user_id) || 'Artist'}{r.venue_name ? ` · ${r.venue_name}` : ''}</span>
                            <span style={{ flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{dstr(r.started_at || r.performance_date || '')}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 3. City / venue history ── */}
      <section id="cities-venues" style={{ scrollMarginTop: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={13} /> Cities &amp; venues · {rangeInfo.label}
        </p>
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 12px' }}>Recorded show counts by location — tap to see the shows behind a number.</p>

        {byCity.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '24px 20px', textAlign: 'center' as const }}>
            <p style={{ color: C.secondary, fontSize: 14, margin: 0 }}>{dataLoading ? 'Loading…' : 'No recorded shows in this period.'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {[{ title: 'By city', list: byCity }, { title: 'By venue', list: byVenue }].map(group => (
              <div key={group.title}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.secondary, margin: '0 0 8px' }}>{group.title}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                  {group.list.slice(0, 8).map(loc => {
                    const locKey = `${group.title}:${loc.label}`
                    const expanded = expandedLocation === locKey
                    return (
                      <div key={locKey} style={{ background: C.card }}>
                        <button onClick={() => setExpandedLocation(expanded ? null : locKey)} style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
                        }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: loc.isUnknown ? C.muted : C.text, fontStyle: loc.isUnknown ? 'italic' as const : 'normal' as const }}>{loc.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{loc.showCount}</span>
                          {expanded ? <ChevronUp size={14} color={C.muted} /> : <ChevronDown size={14} color={C.muted} />}
                        </button>
                        {expanded && (
                          <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {loc.rows.map(r => (
                              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: C.secondary, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                                <span>{artistNameById.get(r.user_id) || 'Artist'}{r.venue_name ? ` · ${r.venue_name}` : ''}</span>
                                <span style={{ flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{dstr(r.started_at || r.performance_date || '')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`
        @media (min-width: 900px) { .mgr-page { padding: 40px 32px 60px; } }
        .mgr-chart { transition: opacity 0.2s ease; }
        .mgr-bar { transition: height 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
        .mgr-bar-col:hover .mgr-bar { filter: brightness(1.15); }
        .mgr-highlight-card { transition: transform 0.15s ease, border-color 0.15s ease; }
        a:hover .mgr-highlight-card { transform: translateY(-2px); border-color: ${C.borderGold}; }
        .mgr-row-hover { transition: background 0.12s ease; }
        .mgr-row-hover:hover { background: rgba(255,255,255,0.03); }
        @keyframes mgrShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } }
        .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer 1.4s ease infinite; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .mgr-chart, .mgr-bar, .mgr-highlight-card, .mgr-row-hover, .mgr-skeleton { transition: none !important; animation: none !important; }
          a:hover .mgr-highlight-card { transform: none; }
          .mgr-skeleton { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
