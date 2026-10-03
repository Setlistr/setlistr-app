'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, ChevronRight, RefreshCw, MapPin } from 'lucide-react'
import { latestShowPerArtist, type ManagerPerformanceRow } from '@/lib/managerOverview'
import { fetchLatestShowPerArtist } from '@/lib/managerFetch'

const C = {
  bg: '#0a0908', card: '#141210', card2: '#1a1814', border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', green: '#4ade80',
}

type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

function initialsFor(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(145deg, rgba(201,168,76,0.2), rgba(201,168,76,0.06))', border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.36, fontWeight: 800, color: C.gold }}>{initialsFor(name)}</span>}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div className="mgr-skeleton" style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div className="mgr-skeleton" style={{ width: '60%', height: 16, borderRadius: 4, marginBottom: 8 }} />
        <div className="mgr-skeleton" style={{ width: '80%', height: 12, borderRadius: 4 }} />
      </div>
    </div>
  )
}

export default function ManagerArtistsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [managed, setManaged] = useState<ManagedArtist[]>([])
  const [rows, setRows] = useState<ManagerPerformanceRow[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res = await fetch('/api/team/managed-artists')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      const list: ManagedArtist[] = data.managed || []
      setManaged(list)
      if (list.length > 0) {
        const supabase = createClient()
        const r = await fetchLatestShowPerArtist(supabase, list.map(a => a.artist_id))
        setRows(r)
      } else {
        setRows([])
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ padding: '24px 20px 40px', maxWidth: 880, margin: '0 auto' }} className="mgr-page">
        <div className="mgr-skeleton" style={{ width: 140, height: 28, borderRadius: 6, marginBottom: 10 }} />
        <div className="mgr-skeleton" style={{ width: 120, height: 14, borderRadius: 4, marginBottom: 26 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <style>{`@keyframes mgrShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } } .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer 1.4s ease infinite; } @media (prefers-reduced-motion: reduce) { .mgr-skeleton { animation: none; opacity: 0.5; } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' as const }}>
        <p style={{ color: C.text, fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Couldn't load your roster</p>
        <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 }}>
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

  // Deliberately no numeric "shows" count here — fetchLatestShowPerArtist
  // only pulls each artist's most recent ~20 rows (see its own comment),
  // which is enough to reliably find their true latest CAPTURED show but
  // is NOT a complete total. Showing a count derived from a capped fetch
  // would be exactly the silently-capped-total this build was told to
  // avoid. The Overview page carries the one accurate, fully-paginated
  // aggregate total instead.
  const latestByArtist = rows ? latestShowPerArtist(rows) : new Map<string, ManagerPerformanceRow>()

  return (
    <div style={{ padding: '24px 20px 40px', maxWidth: 880, margin: '0 auto' }} className="mgr-page">
      <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 5px', letterSpacing: '-0.025em' }}>Artists</h1>
      <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 26px' }}>
        {managed.length} connected artist{managed.length === 1 ? '' : 's'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {managed.map(artist => {
          const latest = latestByArtist.get(artist.artist_id)
          const dateStr = latest ? (latest.started_at || latest.performance_date || '').slice(0, 10) : null
          const submitted = latest?.submission_status === 'submitted'
          return (
            <Link key={artist.artist_id} href={`/app/manager/artists/${artist.artist_id}`} className="mgr-artist-card" style={{
              display: 'flex', flexDirection: 'column', gap: 14, padding: 20,
              background: `linear-gradient(165deg, ${C.card2}, ${C.card})`, border: `1px solid ${C.border}`, borderRadius: 16, textDecoration: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar name={artist.artist_name} url={artist.avatar_url} size={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.01em', overflowWrap: 'anywhere' as const }}>{artist.artist_name}</p>
                  {latest && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: submitted ? C.green : C.gold, opacity: submitted ? 1 : 0.5, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: submitted ? C.green : C.muted }}>Latest show: {submitted ? 'Marked Submitted' : 'Not submitted'}</span>
                    </div>
                  )}
                </div>
                <ChevronRight size={16} color={C.muted} style={{ flexShrink: 0 }} />
              </div>
              <div style={{ paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                {latest ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.secondary, fontSize: 12.5 }}>
                    <MapPin size={12} color={C.muted} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{latest.venue_name || 'Unknown venue'}</span>
                    <span style={{ color: C.muted, flexShrink: 0, marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: 11 }}>{dateStr}</span>
                  </div>
                ) : (
                  <p style={{ fontSize: 12.5, color: C.muted, margin: 0, fontStyle: 'italic' as const }}>No recorded shows yet</p>
                )}
              </div>
            </Link>
          )
        })}
      </div>

      <style>{`
        @media (min-width: 900px) { .mgr-page { padding: 40px 32px 60px; } }
        .mgr-artist-card { transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease; }
        .mgr-artist-card:hover { transform: translateY(-3px); border-color: ${C.borderGold}; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
        @media (prefers-reduced-motion: reduce) { .mgr-artist-card { transition: none !important; } .mgr-artist-card:hover { transform: none; } }
      `}</style>
    </div>
  )
}
