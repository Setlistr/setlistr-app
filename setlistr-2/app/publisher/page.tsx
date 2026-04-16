'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.08)',
}

// Hardcoded for now — will be dynamic when publisher auth is added
const PUBLISHER_ID = process.env.NEXT_PUBLIC_PUBLISHER_DEMO_ID || ''
type Artist = {
  user_id: string
  artist_name: string
  totalShows: number
  totalSongs: number
  unsubmitted: number
  estimatedUnclaimed: number
  lastShow: {
    venue_name: string
    city: string
    started_at: string
    submission_status: string | null
  } | null
  recentShows: {
    id: string
    venue_name: string
    city: string
    country: string
    started_at: string
    status: string
    submission_status: string | null
    song_count: number
  }[]
}

type Summary = {
  totalShows: number
  totalSongs: number
  unsubmittedShows: number
  estimatedUnclaimed: number
}

type Publisher = {
  name: string
  contact_name: string
  plan: string
  trial_ends_at: string
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusPill({ status, submissionStatus }: { status: string; submissionStatus: string | null }) {
  if (submissionStatus === 'submitted') return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 8px' }}>Submitted</span>
  )
  if (status === 'completed' || status === 'complete') return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '3px 8px' }}>Needs Review</span>
  )
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 8px' }}>{status}</span>
  )
}

function ArtistCard({ artist, expanded, onToggle }: {
  artist: Artist
  expanded: boolean
  onToggle: () => void
}) {
  const hasUnclaimed = artist.unsubmitted > 0

  return (
    <div style={{ background: C.card, border: `1px solid ${expanded ? C.borderGold : C.border}`, borderRadius: 14, overflow: 'hidden', transition: 'border-color 0.2s ease' }}>
      <button onClick={onToggle}
        style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>

        {/* Avatar */}
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: hasUnclaimed ? C.goldDim : 'rgba(255,255,255,0.05)', border: `1px solid ${hasUnclaimed ? C.borderGold : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: hasUnclaimed ? C.gold : C.muted }}>
            {artist.artist_name.charAt(0).toUpperCase()}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist.artist_name}</p>
          <p style={{ fontSize: 11, color: C.secondary, margin: 0 }}>
            {artist.totalShows} show{artist.totalShows !== 1 ? 's' : ''} · {artist.totalSongs} songs
            {artist.lastShow ? ` · Last: ${timeAgo(artist.lastShow.started_at)}` : ''}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {hasUnclaimed ? (
            <span style={{ fontSize: 12, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace' }}>
              ~${artist.estimatedUnclaimed}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>✓ All submitted</span>
          )}
          {hasUnclaimed && (
            <span style={{ fontSize: 10, color: C.muted }}>{artist.unsubmitted} unsubmitted</span>
          )}
        </div>

        <span style={{ color: C.muted, fontSize: 12, flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}>▼</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 20px 18px' }}>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Shows', value: artist.totalShows, color: C.gold },
              { label: 'Songs', value: artist.totalSongs, color: C.gold },
              { label: 'Unsubmitted', value: artist.unsubmitted, color: artist.unsubmitted > 0 ? C.gold : C.green },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Unclaimed earnings */}
          {artist.estimatedUnclaimed > 0 && (
            <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, margin: '0 0 2px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Estimated Unclaimed</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>~${artist.estimatedUnclaimed}</p>
              <p style={{ fontSize: 11, color: C.secondary, margin: '3px 0 0' }}>Across {artist.unsubmitted} unsubmitted show{artist.unsubmitted !== 1 ? 's' : ''}</p>
            </div>
          )}

          {/* Recent shows */}
          {artist.recentShows.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Recent Shows</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {artist.recentShows.map(show => (
                  <div key={show.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.venue_name}</p>
                      <p style={{ fontSize: 11, color: C.secondary, margin: '1px 0 0' }}>{show.city} · {timeAgo(show.started_at)} · {show.song_count} songs</p>
                    </div>
                    <StatusPill status={show.status} submissionStatus={show.submission_status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {artist.recentShows.length === 0 && (
            <p style={{ fontSize: 13, color: C.muted, margin: 0, fontStyle: 'italic' }}>No shows tracked yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function PublisherDashboard() {
  const router = useRouter()
  const [loading, setLoading]     = useState(true)
  const [publisher, setPublisher] = useState<Publisher | null>(null)
  const [artists, setArtists]     = useState<Artist[]>([])
  const [summary, setSummary]     = useState<Summary | null>(null)
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [error, setError]         = useState('')

  useEffect(() => {
    fetch(`/api/publisher/dashboard?publisher_id=${PUBLISHER_ID}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setPublisher(data.publisher)
        setArtists(data.artists)
        setSummary(data.summary)
      })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <p style={{ color: C.red, fontSize: 14 }}>{error}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 20px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: '32px 0 28px', borderBottom: `1px solid ${C.border}`, marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13 }}>✦</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold }}>Publisher Dashboard</span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{publisher?.name}</h1>
            <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>
              {publisher?.contact_name} · {publisher?.plan === 'trial' ? `Trial · expires ${formatDate(publisher?.trial_ends_at || '')}` : publisher?.plan}
            </p>
          </div>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>
            Artist View →
          </button>
        </div>

        {/* Summary stats */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 28 }}>
            {[
              { label: 'Artists', value: artists.length, color: C.text },
              { label: 'Shows', value: summary.totalShows, color: C.gold },
              { label: 'Songs', value: summary.totalSongs, color: C.gold },
              { label: 'Unsubmitted', value: summary.unsubmittedShows, color: summary.unsubmittedShows > 0 ? C.red : C.green },
            ].map(stat => (
              <div key={stat.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{stat.value}</p>
                <p style={{ fontSize: 10, color: C.muted, margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Unclaimed pipeline */}
        {summary && summary.estimatedUnclaimed > 0 && (
          <div style={{ background: 'rgba(201,168,76,0.07)', border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '18px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: '0 0 4px' }}>Unclaimed Royalty Pipeline</p>
              <p style={{ fontSize: 32, fontWeight: 800, color: C.gold, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>~${summary.estimatedUnclaimed.toLocaleString()}</p>
              <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>Across {summary.unsubmittedShows} unsubmitted show{summary.unsubmittedShows !== 1 ? 's' : ''} · {artists.length} artist{artists.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 10, color: C.muted, margin: '0 0 4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Avg per artist</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>
                ~${artists.length > 0 ? Math.round(summary.estimatedUnclaimed / artists.length).toLocaleString() : 0}
              </p>
            </div>
          </div>
        )}

        {/* Roster */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>
              Roster · {artists.length} artist{artists.length !== 1 ? 's' : ''}
            </p>
          </div>

          {artists.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>No artists on roster yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {artists
                .sort((a, b) => b.estimatedUnclaimed - a.estimatedUnclaimed)
                .map(artist => (
                  <ArtistCard
                    key={artist.user_id}
                    artist={artist}
                    expanded={expanded === artist.user_id}
                    onToggle={() => setExpanded(expanded === artist.user_id ? null : artist.user_id)}
                  />
                ))}
            </div>
          )}
        </div>

        <div style={{ paddingBottom: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
            Setlistr Publisher Dashboard · Data updates in real time
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
