'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, ChevronRight, RefreshCw } from 'lucide-react'
import {
  dateRangeFor, countCapturedShows, recentActivityFeed, countNotYetSubmitted,
  type ManagerDateRangeKey, type ManagerPerformanceRow,
} from '@/lib/managerOverview'
import { fetchCapturedShowsInRange } from '@/lib/managerFetch'

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

function initialsFor(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.34, fontWeight: 800, color: C.gold }}>{initialsFor(name)}</span>}
    </div>
  )
}

export default function ManagerOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [managed, setManaged] = useState<ManagedArtist[]>([])
  const [range, setRange] = useState<ManagerDateRangeKey>('30d')
  const [rows, setRows] = useState<ManagerPerformanceRow[]>([])
  const [rangeLoading, setRangeLoading] = useState(false)
  const artistNameById = new Map(managed.map(a => [a.artist_id, a.artist_name]))
  const artistAvatarById = new Map(managed.map(a => [a.artist_id, a.avatar_url || null]))

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

  useEffect(() => {
    if (managed.length === 0) { setRows([]); return }
    let cancelled = false
    setRangeLoading(true)
    const supabase = createClient()
    const { fromISO } = dateRangeFor(range)
    fetchCapturedShowsInRange(supabase, managed.map(a => a.artist_id), fromISO)
      .then(r => { if (!cancelled) setRows(r) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setRangeLoading(false) })
    return () => { cancelled = true }
  }, [managed, range])

  const rangeInfo = dateRangeFor(range)
  const capturedCount = countCapturedShows(rows)
  const notSubmittedCount = countNotYetSubmitted(rows)
  const recent = recentActivityFeed(rows, 8)

  if (loading) {
    return (
      <div style={{ minHeight: '60svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${C.gold}`, borderTopColor: 'transparent', animation: 'mgrSpin 0.8s linear infinite' }} />
        <style>{`@keyframes mgrSpin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' as const }}>
        <p style={{ color: C.text, fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Couldn't load your roster</p>
        <p style={{ color: C.secondary, fontSize: 14, margin: '0 0 20px' }}>Nothing has been loaded. Try again.</p>
        <button onClick={loadRoster} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    )
  }

  if (managed.length === 0) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' as const, maxWidth: 380, margin: '0 auto' }}>
        <Users size={32} color={C.muted} style={{ marginBottom: 16 }} />
        <p style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>No connected artists yet</p>
        <p style={{ color: C.secondary, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          When an artist invites you as a delegate and you accept, they'll show up here. Invitations are sent from an artist's own Settings.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px 40px', maxWidth: 880, margin: '0 auto' }} className="mgr-page">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Overview</h1>
      <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 24px' }}>
        {managed.length} connected artist{managed.length === 1 ? '' : 's'}
      </p>

      {/* ── Stat row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <Link href="/app/manager/artists" style={{ textDecoration: 'none' }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Roster</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>{managed.length}</p>
          </div>
        </Link>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Recorded shows · {rangeInfo.label}</p>
          <p style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', opacity: rangeLoading ? 0.4 : 1 }}>{capturedCount}</p>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Not yet submitted · {rangeInfo.label}</p>
          <p style={{ fontSize: 26, fontWeight: 800, color: notSubmittedCount > 0 ? C.gold : C.text, margin: 0, fontFamily: '"DM Mono", monospace', opacity: rangeLoading ? 0.4 : 1 }}>{notSubmittedCount}</p>
        </div>
      </div>

      {/* ── Date range ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {RANGE_OPTIONS.map(opt => (
          <button key={opt.key} onClick={() => setRange(opt.key)} style={{
            padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            background: range === opt.key ? 'rgba(201,168,76,0.14)' : 'transparent',
            border: `1px solid ${range === opt.key ? 'rgba(201,168,76,0.35)' : C.border}`,
            color: range === opt.key ? C.gold : C.secondary,
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Recent activity ── */}
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
        Recent recorded activity
      </p>
      {recent.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 20px', textAlign: 'center' as const }}>
          <p style={{ color: C.secondary, fontSize: 14, margin: 0 }}>
            {rangeLoading ? 'Loading…' : `No recorded shows in the ${rangeInfo.label.toLowerCase()}.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {recent.map(row => {
            const artistName = artistNameById.get(row.user_id) || 'Artist'
            const submitted = row.submission_status === 'submitted'
            const dateStr = (row.started_at || row.performance_date || '').slice(0, 10)
            return (
              <Link key={row.id} href={`/app/manager/artists/${row.user_id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.card, textDecoration: 'none' }}>
                <Avatar name={artistName} url={artistAvatarById.get(row.user_id)} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artistName}</p>
                  <p style={{ fontSize: 12, color: C.secondary, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.venue_name || 'Unknown venue'}{dateStr ? ` · ${dateStr}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: submitted ? C.green : C.gold, opacity: submitted ? 1 : 0.4 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: submitted ? C.green : C.muted, whiteSpace: 'nowrap' as const }}>
                    {submitted ? 'Marked Submitted' : 'Not submitted'}
                  </span>
                  <ChevronRight size={14} color={C.muted} />
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <style>{`@media (min-width: 900px) { .mgr-page { padding: 40px 32px 60px; } }`}</style>
    </div>
  )
}
