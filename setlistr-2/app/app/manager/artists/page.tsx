'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, ChevronRight, RefreshCw } from 'lucide-react'
import { latestShowPerArtist, type ManagerPerformanceRow } from '@/lib/managerOverview'
import { fetchLatestShowPerArtist } from '@/lib/managerFetch'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', green: '#4ade80',
}

type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

function initialsFor(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function Avatar({ name, url, size = 44 }: { name: string; url?: string | null; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.34, fontWeight: 800, color: C.gold }}>{initialsFor(name)}</span>}
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
      <div style={{ minHeight: '60svh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${C.gold}`, borderTopColor: 'transparent', animation: 'mgrSpin2 0.8s linear infinite' }} />
        <style>{`@keyframes mgrSpin2 { to { transform: rotate(360deg) } }`}</style>
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
    <div style={{ padding: '24px 20px 40px', maxWidth: 720, margin: '0 auto' }} className="mgr-page">
      <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Artists</h1>
      <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 24px' }}>
        {managed.length} connected artist{managed.length === 1 ? '' : 's'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {managed.map(artist => {
          const latest = latestByArtist.get(artist.artist_id)
          const dateStr = latest ? (latest.started_at || latest.performance_date || '').slice(0, 10) : null
          return (
            <Link key={artist.artist_id} href={`/app/manager/artists/${artist.artist_id}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: C.card, textDecoration: 'none' }}>
              <Avatar name={artist.artist_name} url={artist.avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist.artist_name}</p>
                <p style={{ fontSize: 12, color: C.secondary, margin: '3px 0 0' }}>
                  {latest
                    ? `Last show ${dateStr}${latest.venue_name ? ` · ${latest.venue_name}` : ''}`
                    : 'No recorded shows yet'}
                </p>
              </div>
              <ChevronRight size={16} color={C.muted} style={{ flexShrink: 0 }} />
            </Link>
          )
        })}
      </div>

      <style>{`@media (min-width: 900px) { .mgr-page { padding: 40px 32px 60px; } }`}</style>
    </div>
  )
}
