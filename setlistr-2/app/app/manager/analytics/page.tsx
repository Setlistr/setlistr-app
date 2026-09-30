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
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
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

  if (loading) {
    return (
      <div style={{ minHeight: '60svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${C.gold}`, borderTopColor: 'transparent', animation: 'mgrSpin4 0.8s linear infinite' }} />
        <style>{`@keyframes mgrSpin4 { to { transform: rotate(360deg) } }`}</style>
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
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 18px', display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
            {buckets.map(b => {
              const count = monthCounts.get(b.key) || 0
              const heightPct = Math.max(4, (count / maxMonthCount) * 100)
              return (
                <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace' }}>{count}</span>
                  <div style={{ width: '100%', maxWidth: 34, height: `${heightPct}%`, background: b.isPartial ? 'rgba(201,168,76,0.35)' : C.gold, borderRadius: '4px 4px 0 0', minHeight: 3 }} />
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
      <section style={{ marginBottom: 36 }}>
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
            {songRotation.slice(0, 12).map((s, i) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: C.card }}>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: '"DM Mono", monospace', width: 18, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</p>
                  {s.artist && <p style={{ fontSize: 12, color: C.secondary, margin: '2px 0 0' }}>{s.artist}</p>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{s.distinctShowCount} show{s.distinctShowCount === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 3. City / venue history ── */}
      <section>
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

      <style>{`@media (min-width: 900px) { .mgr-page { padding: 40px 32px 60px; } }`}</style>
    </div>
  )
}
