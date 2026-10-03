'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, History, Send } from 'lucide-react'
import { useActingAs } from '@/components/ActingAsProvider'
import { MANAGER_RETURN_KEY } from '@/components/layout/AppShell'
import { isCapturedShow } from '@/lib/performance-status'
import { isWriteCapableRole } from '@/lib/writeCapableRoles'
import { UpcomingShows } from '@/components/scheduling/UpcomingShows'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', green: '#4ade80', red: '#f87171',
}

type ContextPerformance = {
  id: string; venue_name: string; artist_name: string; city: string; country: string
  status: string; submission_status: string | null
  started_at: string | null; ended_at: string | null; created_at: string
  data_source: string | null; performance_date: string | null
  show_type: string; venue_capacity: number | null
}

type ContextData = {
  artist_id: string
  artist_name: string
  pro_affiliation: string | null
  role: string
  performances: ContextPerformance[]
  songCountMap: Record<string, number>
}

function initialsFor(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

// Every destination is an EXISTING artist-facing route, unmodified —
// Artist Detail only decides how to get there safely, never reimplements
// what's on the other side.
function flowFor(p: ContextPerformance, songCount: number): { href: string; label: string } {
  if (songCount === 0 || !isCapturedShow({ status: p.status, data_source: p.data_source, venue_name: p.venue_name })) {
    return { href: `/app/review/${p.id}`, label: 'Review' }
  }
  if (p.submission_status === 'submitted') return { href: `/app/history`, label: 'View in Your Record' }
  return { href: `/app/submit/${p.id}`, label: 'Open Submit' }
}

export default function ManagerArtistDetailPage({ params }: { params: { artistId: string } }) {
  const router = useRouter()
  const { selectManagedArtist } = useActingAs()
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState(false)
  const [data, setData] = useState<ContextData | null>(null)
  // Distinct from the initial page load's own auth check — this guards the
  // SEPARATE, fresh re-verification made right before handing off into an
  // existing flow (see openFlow), so a revocation that happens after this
  // page has already loaded is still caught, and a failed re-check can
  // never navigate anywhere.
  const [selecting, setSelecting] = useState(false)
  const [selectError, setSelectError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setForbidden(false); setError(false); setSelectError(false)
    try {
      const res = await fetch(`/api/team/context-data?artist_id=${params.artistId}`)
      if (res.status === 403) { setForbidden(true); setLoading(false); return }
      if (!res.ok) throw new Error('failed')
      const json = await res.json()
      if (json.error) { setForbidden(true); setLoading(false); return }
      setData(json)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [params.artistId])

  useEffect(() => { load() }, [load])

  // Re-verifies fresh (never trusts the page's own initial load, which may
  // be stale by the time someone actually taps through) before selecting
  // the managed workspace and navigating — and only on a confirmed
  // success. A failed re-check shows an inline error and returns without
  // calling selectManagedArtist or navigating anywhere, so it can never
  // land on — or even briefly select — a workspace this exact check just
  // failed to confirm, and never leaves whatever workspace was already
  // selected before this ran.
  async function openFlow(href: string) {
    if (!data) return
    setSelecting(true); setSelectError(false)
    try {
      const res = await fetch(`/api/team/context-data?artist_id=${params.artistId}`)
      const json = await res.json()
      if (!res.ok || json.error) { setSelectError(true); setSelecting(false); return }
      try { sessionStorage.setItem(MANAGER_RETURN_KEY, params.artistId) } catch {}
      selectManagedArtist({ artist_id: params.artistId, artist_name: json.artist_name })
      router.push(href)
    } catch {
      setSelectError(true); setSelecting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '20px 20px 40px', maxWidth: 640, margin: '0 auto' }} className="mgr-page">
        <div className="mgr-skeleton" style={{ width: 80, height: 14, borderRadius: 4, marginBottom: 18 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div className="mgr-skeleton" style={{ width: 52, height: 52, borderRadius: '50%' }} />
          <div className="mgr-skeleton" style={{ width: 160, height: 22, borderRadius: 4 }} />
        </div>
        <div className="mgr-skeleton" style={{ width: 120, height: 13, borderRadius: 4, marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ padding: '14px 16px', background: C.card }}>
              <div className="mgr-skeleton" style={{ width: '50%', height: 14, borderRadius: 4, marginBottom: 6 }} />
              <div className="mgr-skeleton" style={{ width: '70%', height: 12, borderRadius: 4 }} />
            </div>
          ))}
        </div>
        <style>{`@keyframes mgrShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } } .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer 1.4s ease infinite; } @media (prefers-reduced-motion: reduce) { .mgr-skeleton { animation: none; opacity: 0.5; } }`}</style>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' as const, maxWidth: 380, margin: '0 auto' }}>
        <p style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>Access ended</p>
        <p style={{ color: C.secondary, fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>
          You no longer have access to this artist's workspace. This may be because the delegation was removed.
        </p>
        <Link href="/app/manager/artists" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          <ChevronLeft size={14} /> Back to Artists
        </Link>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center' as const }}>
        <p style={{ color: C.text, fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Couldn't load this artist</p>
        <button onClick={load} style={{ padding: '10px 18px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          Retry
        </button>
      </div>
    )
  }

  const shows = data.performances
    .filter(p => isCapturedShow({ status: p.status, data_source: p.data_source, venue_name: p.venue_name }))
    .slice(0, 20)

  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 640, margin: '0 auto' }} className="mgr-page">
      <Link href="/app/manager/artists" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.secondary, fontSize: 13, fontWeight: 700, textDecoration: 'none', marginBottom: 18 }}>
        <ChevronLeft size={14} /> Artists
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(145deg, rgba(201,168,76,0.2), rgba(201,168,76,0.06))', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>{initialsFor(data.artist_name)}</span>
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{data.artist_name}</h1>
          {data.pro_affiliation && <p style={{ fontSize: 13, color: C.secondary, margin: '3px 0 0' }}>{data.pro_affiliation}</p>}
        </div>
      </div>

      {selectError && (
        <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: C.red, margin: 0 }}>Couldn't confirm your access to this artist right now. Nothing was opened — try again.</p>
        </div>
      )}

      <UpcomingShows
        artistId={params.artistId}
        canManage={isWriteCapableRole(data.role)}
        onBeforeStart={() => {
          try { sessionStorage.setItem(MANAGER_RETURN_KEY, params.artistId) } catch {}
          selectManagedArtist({ artist_id: params.artistId, artist_name: data.artist_name })
        }}
      />

      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
        Recorded shows
      </p>

      {shows.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 20px', textAlign: 'center' as const }}>
          <p style={{ color: C.secondary, fontSize: 14, margin: 0 }}>No recorded shows yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {shows.map(p => {
            const songCount = data.songCountMap[p.id] || 0
            const submitted = p.submission_status === 'submitted'
            const flow = flowFor(p, songCount)
            const dateStr = (p.started_at || p.created_at || '').slice(0, 10)
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.card }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.venue_name || 'Unknown venue'}</p>
                  <p style={{ fontSize: 12, color: C.secondary, margin: '2px 0 0' }}>
                    {dateStr}{p.city ? ` · ${p.city}` : ''} · {songCount} song{songCount === 1 ? '' : 's'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: submitted ? C.green : C.gold, opacity: submitted ? 1 : 0.4 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: submitted ? C.green : C.muted }}>{submitted ? 'Marked Submitted' : 'Not submitted'}</span>
                  <button onClick={() => openFlow(flow.href)} disabled={selecting} className="mgr-flow-btn" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 8, color: C.gold, fontSize: 11, fontWeight: 700, cursor: selecting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: selecting ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                    {flow.label} <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '28px 0 10px' }}>
        Full history
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => openFlow('/app/history')} disabled={selecting} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 13, fontWeight: 700, cursor: selecting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: selecting ? 0.6 : 1 }}>
          <History size={15} /> Your Record
        </button>
        <button onClick={() => openFlow('/app/file')} disabled={selecting} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 13, fontWeight: 700, cursor: selecting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: selecting ? 0.6 : 1 }}>
          <Send size={15} /> Filing Queue
        </button>
      </div>

      <style>{`
        @media (min-width: 900px) { .mgr-page { padding: 32px; } }
        .mgr-flow-btn { transition: background 0.15s ease, transform 0.1s ease; }
        .mgr-flow-btn:hover:not(:disabled) { background: rgba(201,168,76,0.18); }
        .mgr-flow-btn:active:not(:disabled) { transform: scale(0.97); }
        @keyframes mgrShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } }
        .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer 1.4s ease infinite; }
        @media (prefers-reduced-motion: reduce) { .mgr-flow-btn, .mgr-skeleton { transition: none !important; animation: none !important; } .mgr-flow-btn:active:not(:disabled) { transform: none; } .mgr-skeleton { opacity: 0.5; } }
      `}</style>
    </div>
  )
}
