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
  amber: '#f59e0b',
}

const PUBLISHER_ID = process.env.NEXT_PUBLIC_PUBLISHER_DEMO_ID || ''

type RecentShow = {
  id: string
  venue_name: string
  city: string
  country: string
  started_at: string
  status: string
  submission_status: string | null
  song_count: number
  show_type: string
}

type Artist = {
  user_id: string
  artist_name: string
  totalShows: number
  totalSongs: number
  unsubmitted: number
  estimatedUnclaimed: number
  lastShow: { venue_name: string; city: string; started_at: string; submission_status: string | null } | null
  recentShows: RecentShow[]
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

function daysUntilDeadline(startedAt: string): number {
  const showDate = new Date(startedAt)
  const deadline = new Date(showDate)
  deadline.setFullYear(deadline.getFullYear() + 1)
  return Math.ceil((deadline.getTime() - Date.now()) / 86400000)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SubmissionBadge({ status, submissionStatus }: { status: string; submissionStatus: string | null }) {
  if (submissionStatus === 'submitted') return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>Submitted</span>
  )
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>Needs Review</span>
  )
}

function ArtistCard({ artist, expanded, onToggle }: { artist: Artist; expanded: boolean; onToggle: () => void }) {
  const submissionRate = artist.totalShows > 0
    ? Math.round(((artist.totalShows - artist.unsubmitted) / artist.totalShows) * 100)
    : 0

  // Shows approaching deadline (>270 days old, not submitted)
  const atRisk = artist.recentShows.filter(s => {
    if (s.submission_status === 'submitted') return false
    const days = daysUntilDeadline(s.started_at)
    return days < 90 && days > 0
  })

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${expanded ? C.borderGold : C.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      transition: 'border-color 0.2s ease',
      animation: 'fadeUp 0.4s ease',
    }}>
      {/* Card header */}
      <button onClick={onToggle} style={{
        width: '100%', padding: '18px 20px', background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: artist.unsubmitted > 0 ? C.goldDim : C.greenDim,
          border: `1px solid ${artist.unsubmitted > 0 ? C.borderGold : 'rgba(74,222,128,0.25)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: artist.unsubmitted > 0 ? C.gold : C.green }}>
            {artist.artist_name.charAt(0).toUpperCase()}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{artist.artist_name}</p>
            {atRisk.length > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, color: C.amber, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '2px 7px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ⚠ {atRisk.length} at risk
              </span>
            )}
          </div>
          {/* Submission progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: submissionRate === 100 ? C.green : submissionRate > 50 ? C.gold : C.red,
                width: `${submissionRate}%`,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{submissionRate}% submitted</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          {artist.unsubmitted > 0 ? (
            <>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace' }}>~${artist.estimatedUnclaimed}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{artist.unsubmitted} unsubmitted</span>
            </>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>✓ All clear</span>
          )}
        </div>

        <span style={{
          color: C.muted, fontSize: 10, flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s ease', display: 'inline-block',
        }}>▼</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, borderBottom: `1px solid ${C.border}` }}>
            {[
              { label: 'Shows', value: artist.totalShows },
              { label: 'Songs', value: artist.totalSongs },
              { label: 'Unsubmitted', value: artist.unsubmitted },
              { label: 'Unclaimed', value: `~$${artist.estimatedUnclaimed}` },
            ].map((stat, i) => (
              <div key={stat.label} style={{
                padding: '14px 16px', textAlign: 'center',
                borderRight: i < 3 ? `1px solid ${C.border}` : 'none',
              }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* At-risk deadline alerts */}
          {atRisk.length > 0 && (
            <div style={{ padding: '12px 20px', background: 'rgba(245,158,11,0.06)', borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.amber, margin: '0 0 8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚠ Deadline Risk</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {atRisk.map(show => (
                  <div key={show.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: C.text }}>{show.venue_name} · {show.city}</span>
                    <span style={{ fontSize: 11, color: C.amber, fontFamily: '"DM Mono", monospace' }}>
                      {daysUntilDeadline(show.started_at)}d left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent shows */}
          <div style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>Recent Shows</p>
            {artist.recentShows.length === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0, fontStyle: 'italic' }}>No shows tracked yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {artist.recentShows.map(show => (
                  <div key={show.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${C.border}`, borderRadius: 10,
                  }}>
                    <div style={{ minWidth: 34, textAlign: 'center' }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>
                        {new Date(show.started_at).getDate()}
                      </p>
                      <p style={{ fontSize: 9, color: C.muted, margin: '1px 0 0', textTransform: 'uppercase' }}>
                        {new Date(show.started_at).toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                    </div>
                    <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.venue_name}</p>
                      <p style={{ fontSize: 11, color: C.secondary, margin: '1px 0 0' }}>{show.city} · {show.song_count} songs</p>
                    </div>
                    <SubmissionBadge status={show.status} submissionStatus={show.submission_status} />
                  </div>
                ))}
              </div>
            )}
          </div>
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
        // Auto-expand first artist
        if (data.artists?.[0]) setExpanded(data.artists[0].user_id)
      })
      .catch(() => setError('Failed to load dashboard'))
      .finally(() => setLoading(false))
  }, [])

  // Build activity feed — all shows across roster sorted by date
  const activityFeed = artists
    .flatMap(a => a.recentShows.map(s => ({ ...s, artist_name: a.artist_name })))
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 8)

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
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 60px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: '32px 0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: '5px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10 }}>✦</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold }}>Industry Dashboard</span>
            </div>
          </div>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.secondary, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 12px' }}>
            Artist View →
          </button>
        </div>

        {/* Publisher identity */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>{publisher?.name}</h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>{publisher?.contact_name}</p>
        </div>

        {/* Unclaimed pipeline — the hero number */}
        {summary && summary.estimatedUnclaimed > 0 && (
          <div style={{
            background: 'rgba(201,168,76,0.07)',
            border: `1px solid ${C.borderGold}`,
            borderRadius: 18,
            padding: '28px 32px',
            marginBottom: 24,
            animation: 'fadeUp 0.4s ease',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%', background: 'radial-gradient(ellipse at 100% 50%, rgba(201,168,76,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 8px', opacity: 0.8 }}>Unclaimed Royalty Pipeline</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <p style={{ fontSize: 52, fontWeight: 800, color: C.gold, margin: '0 0 6px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  ~${summary.estimatedUnclaimed.toLocaleString()}
                </p>
                <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>
                  Across {summary.unsubmittedShows} unsubmitted show{summary.unsubmittedShows !== 1 ? 's' : ''} · {artists.length} artist{artists.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 10, color: C.muted, margin: '0 0 4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Avg per artist</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>
                  ~${artists.length > 0 ? Math.round(summary.estimatedUnclaimed / artists.length).toLocaleString() : 0}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Summary stat pills */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 32 }}>
            {[
              { label: 'Artists', value: artists.length, color: C.text },
              { label: 'Total Shows', value: summary.totalShows, color: C.gold },
              { label: 'Songs Tracked', value: summary.totalSongs, color: C.gold },
              { label: 'Unsubmitted', value: summary.unsubmittedShows, color: summary.unsubmittedShows > 0 ? C.red : C.green },
            ].map(stat => (
              <div key={stat.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', textAlign: 'center', animation: 'fadeUp 0.4s ease' }}>
                <p style={{ fontSize: 26, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '4px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.4 }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Two-column layout on wide screens */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

          {/* Left — Roster */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>
              Roster · {artists.length} artist{artists.length !== 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          </div>

          {/* Right — Activity feed */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>
              Recent Activity
            </p>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              {activityFeed.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No activity yet.</p>
                </div>
              ) : (
                activityFeed.map((show, i) => (
                  <div key={show.id} style={{
                    padding: '12px 16px',
                    borderBottom: i < activityFeed.length - 1 ? `1px solid ${C.border}` : 'none',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.gold, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(show as any).artist_name}
                      </p>
                      <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{timeAgo(show.started_at)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 11, color: C.secondary, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {show.venue_name} · {show.city}
                      </p>
                      <SubmissionBadge status={show.status} submissionStatus={show.submission_status} />
                    </div>
                    <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>{show.song_count} songs</p>
                  </div>
                ))
              )}
            </div>

            {/* Submission rate across roster */}
            {summary && summary.totalShows > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px', marginTop: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>Roster Submission Rate</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: C.gold,
                      width: `${Math.round(((summary.totalShows - summary.unsubmittedShows) / summary.totalShows) * 100)}%`,
                      transition: 'width 0.8s ease',
                    }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>
                    {Math.round(((summary.totalShows - summary.unsubmittedShows) / summary.totalShows) * 100)}%
                  </span>
                </div>
                <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>
                  {summary.totalShows - summary.unsubmittedShows} of {summary.totalShows} shows submitted
                </p>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Setlistr · Live performance data updates in real time</p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @media (max-width: 600px) {
          .publisher-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
