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
  estimated_value: number
  days_until_deadline: number
}

type RecoveryItem = RecentShow & {
  artist_name: string
  artist_user_id: string
  urgency: 'critical' | 'warning' | 'monitor'
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
  projectedAnnual: number
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
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SubmissionBadge({ submissionStatus }: { submissionStatus: string | null }) {
  if (submissionStatus === 'submitted') return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>Submitted</span>
  )
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>Unsubmitted</span>
  )
}

function UrgencyBadge({ days }: { days: number }) {
  const color  = days <= 30 ? C.red   : days <= 90 ? C.amber : C.gold
  const bg     = days <= 30 ? 'rgba(248,113,113,0.1)' : days <= 90 ? 'rgba(245,158,11,0.1)' : C.goldDim
  const border = days <= 30 ? 'rgba(248,113,113,0.3)' : days <= 90 ? 'rgba(245,158,11,0.3)' : C.borderGold
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap', fontFamily: '"DM Mono", monospace' }}>
      {days}d left
    </span>
  )
}

function ArtistCard({ artist, expanded, onToggle }: { artist: Artist; expanded: boolean; onToggle: () => void }) {
  const submissionRate = artist.totalShows > 0
    ? Math.round(((artist.totalShows - artist.unsubmitted) / artist.totalShows) * 100)
    : 0

  const atRisk = artist.recentShows.filter(s =>
    s.submission_status !== 'submitted' && s.days_until_deadline < 90 && s.days_until_deadline > 0
  )

  return (
    <div style={{ background: C.card, border: `1px solid ${expanded ? C.borderGold : C.border}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s ease', animation: 'fadeUp 0.4s ease' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '18px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: artist.unsubmitted > 0 ? C.goldDim : C.greenDim, border: `1px solid ${artist.unsubmitted > 0 ? C.borderGold : 'rgba(74,222,128,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: artist.unsubmitted > 0 ? C.gold : C.green }}>
            {artist.artist_name.charAt(0).toUpperCase()}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist.artist_name}</p>
            {atRisk.length > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, color: C.amber, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '2px 7px', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                ⚠ {atRisk.length} at risk
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: submissionRate === 100 ? C.green : submissionRate > 50 ? C.gold : C.red, width: `${submissionRate}%`, transition: 'width 0.6s ease' }} />
            </div>
            <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{submissionRate}%</span>
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

        <span style={{ color: C.muted, fontSize: 10, flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, borderBottom: `1px solid ${C.border}` }}>
            {[
              { label: 'Shows',       value: artist.totalShows },
              { label: 'Songs',       value: artist.totalSongs },
              { label: 'Unsubmitted', value: artist.unsubmitted },
              { label: 'Unclaimed',   value: `~$${artist.estimatedUnclaimed}` },
            ].map((stat, i) => (
              <div key={stat.label} style={{ padding: '14px 12px', textAlign: 'center', borderRight: i < 3 ? `1px solid ${C.border}` : 'none' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {atRisk.length > 0 && (
            <div style={{ padding: '12px 20px', background: 'rgba(245,158,11,0.05)', borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: C.amber, margin: '0 0 8px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚠ Deadline Risk</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {atRisk.map(show => (
                  <div key={show.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.text, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.venue_name} · {show.city}</span>
                    <span style={{ fontSize: 11, color: C.amber, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{show.days_until_deadline}d left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '14px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Recent Shows</p>
            {artist.recentShows.length === 0 ? (
              <p style={{ fontSize: 13, color: C.muted, margin: 0, fontStyle: 'italic' }}>No shows tracked yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {artist.recentShows.map(show => (
                  <div key={show.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <div style={{ minWidth: 30, textAlign: 'center', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{new Date(show.started_at).getDate()}</p>
                      <p style={{ fontSize: 9, color: C.muted, margin: '1px 0 0', textTransform: 'uppercase' }}>{new Date(show.started_at).toLocaleDateString('en-US', { month: 'short' })}</p>
                    </div>
                    <div style={{ width: 1, height: 26, background: C.border, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.venue_name}</p>
                      <p style={{ fontSize: 11, color: C.secondary, margin: '1px 0 0' }}>{show.city} · {show.song_count} songs</p>
                    </div>
                    {show.estimated_value > 0 && (
                      <span style={{ fontSize: 11, color: C.muted, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>~${show.estimated_value}</span>
                    )}
                    <SubmissionBadge submissionStatus={show.submission_status} />
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

function RecoveryQueue({ items }: { items: RecoveryItem[] }) {
  if (items.length === 0) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
      <p style={{ fontSize: 22, margin: '0 0 6px' }}>✓</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.green, margin: '0 0 4px' }}>Queue clear</p>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>No shows approaching deadlines.</p>
    </div>
  )

  const critical = items.filter(i => i.urgency === 'critical')
  const warning  = items.filter(i => i.urgency === 'warning')
  const monitor  = items.filter(i => i.urgency === 'monitor')

  function Section({ title, color, bg, sItems }: { title: string; color: string; bg: string; sItems: RecoveryItem[] }) {
    if (!sItems.length) return null
    return (
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color, margin: '0 0 6px', opacity: 0.85 }}>{title}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sItems.map(item => (
            <div key={item.id} style={{ background: bg, border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '11px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.artist_name}</span>
                <UrgencyBadge days={item.days_until_deadline} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.venue_name}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, color: C.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.city} · {formatDate(item.started_at)} · {item.song_count} songs
                </span>
                {item.estimated_value > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>~${item.estimated_value}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Section title={`Critical · ${critical.length} show${critical.length !== 1 ? 's' : ''}`} color={C.red}   bg="rgba(248,113,113,0.05)" sItems={critical} />
      <Section title={`At Risk · ${warning.length} show${warning.length !== 1 ? 's' : ''}`}   color={C.amber} bg="rgba(245,158,11,0.05)"  sItems={warning} />
      <Section title={`Monitor · ${monitor.length} show${monitor.length !== 1 ? 's' : ''}`}   color={C.gold}  bg="rgba(201,168,76,0.04)"  sItems={monitor} />
    </div>
  )
}

export default function IndustryTerminal() {
  const router = useRouter()
  const [loading, setLoading]             = useState(true)
  const [publisher, setPublisher]         = useState<Publisher | null>(null)
  const [artists, setArtists]             = useState<Artist[]>([])
  const [summary, setSummary]             = useState<Summary | null>(null)
  const [recoveryQueue, setRecoveryQueue] = useState<RecoveryItem[]>([])
  const [expanded, setExpanded]           = useState<string | null>(null)
  const [error, setError]                 = useState('')

  useEffect(() => {
    fetch(`/api/publisher/dashboard?publisher_id=${PUBLISHER_ID}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setPublisher(data.publisher)
        setArtists(data.artists)
        setSummary(data.summary)
        setRecoveryQueue(data.recoveryQueue || [])
        if (data.artists?.[0]) setExpanded(data.artists[0].user_id)
      })
      .catch(() => setError('Failed to load terminal'))
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

  const submissionRate = summary && summary.totalShows > 0
    ? Math.round(((summary.totalShows - summary.unsubmittedShows) / summary.totalShows) * 100)
    : 0

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px 60px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: '32px 0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: '5px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10 }}>✦</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold }}>Industry Terminal</span>
            </div>
          </div>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.secondary, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 12px' }}>
            Artist View →
          </button>
        </div>

        {/* Publisher identity */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 3px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>{publisher?.name}</h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>{publisher?.contact_name}</p>
        </div>

        {/* ── HERO — Unclaimed + projected annual ── */}
        {summary && (
          <div style={{ background: 'rgba(201,168,76,0.07)', border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: '28px 32px', marginBottom: 20, position: 'relative', overflow: 'hidden', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%', background: 'radial-gradient(ellipse at 100% 50%, rgba(201,168,76,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 10px', opacity: 0.8 }}>Unclaimed Royalty Pipeline</p>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, marginBottom: summary.totalShows > 0 ? 20 : 0 }}>
              <div>
                <p style={{ fontSize: 52, fontWeight: 800, color: C.gold, margin: '0 0 6px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  ~${summary.estimatedUnclaimed.toLocaleString()}
                </p>
                <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>
                  {summary.unsubmittedShows} unsubmitted show{summary.unsubmittedShows !== 1 ? 's' : ''} · {artists.length} artist{artists.length !== 1 ? 's' : ''}
                </p>
              </div>

              {summary.projectedAnnual > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 10, color: C.muted, margin: '0 0 4px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Projected annual miss</p>
                  <p style={{ fontSize: 32, fontWeight: 800, color: C.red, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                    ~${summary.projectedAnnual.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, color: C.muted, margin: '3px 0 0' }}>at current submission rate</p>
                </div>
              )}
            </div>

            {summary.totalShows > 0 && (
              <div style={{ paddingTop: 16, borderTop: '1px solid rgba(201,168,76,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.secondary }}>Roster submission rate</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: submissionRate > 70 ? C.green : submissionRate > 40 ? C.gold : C.red, fontFamily: '"DM Mono", monospace' }}>{submissionRate}%</span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: submissionRate > 70 ? C.green : submissionRate > 40 ? C.gold : C.red, width: `${submissionRate}%`, transition: 'width 0.8s ease' }} />
                </div>
                <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>
                  {summary.totalShows - summary.unsubmittedShows} of {summary.totalShows} shows submitted
                </p>
              </div>
            )}
          </div>
        )}

        {/* Summary stat pills */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
            {[
              { label: 'Artists',     value: artists.length,           color: C.text },
              { label: 'Total Shows', value: summary.totalShows,       color: C.gold },
              { label: 'Songs',       value: summary.totalSongs,       color: C.gold },
              { label: 'Unsubmitted', value: summary.unsubmittedShows, color: summary.unsubmittedShows > 0 ? C.red : C.green },
            ].map(stat => (
              <div key={stat.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 12px', textAlign: 'center', animation: 'fadeUp 0.4s ease' }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '3px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.4 }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── TWO COLUMN LAYOUT ── */}
        <div className="terminal-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>

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
              {artists.length === 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No artists on roster yet.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right — Recovery Queue */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              Recovery Queue
              {recoveryQueue.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: C.red, background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, padding: '2px 7px' }}>
                  {recoveryQueue.length}
                </span>
              )}
            </p>
            <RecoveryQueue items={recoveryQueue} />
          </div>
        </div>

        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, letterSpacing: '0.06em' }}>Setlistr · Live performance intelligence · Real time</p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @media (max-width: 640px) {
          .terminal-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
