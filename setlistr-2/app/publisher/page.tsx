'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Check, Copy, UserPlus, ExternalLink } from 'lucide-react'

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

// ── Types ─────────────────────────────────────────────────────────────────────

type ArtistStatus = 'active' | 'inactive' | 'invited' | 'not_activated'

type RecentShow = {
  id: string; venue_name: string; city: string; country: string
  started_at: string; status: string; submission_status: string | null
  song_count: number; show_type: string; estimated_value: number
  days_until_deadline: number
}

type RecoveryItem = RecentShow & {
  artist_name: string; artist_user_id: string
  urgency: 'critical' | 'warning' | 'monitor'
}

type Artist = {
  user_id: string; artist_name: string; totalShows: number
  totalSongs: number; unsubmitted: number; estimatedUnclaimed: number
  lastShow: { venue_name: string; city: string; started_at: string; submission_status: string | null } | null
  recentShows: RecentShow[]
}

type Summary = {
  totalShows: number; totalSongs: number; unsubmittedShows: number
  estimatedUnclaimed: number; projectedAnnual: number
}

type Publisher = {
  name: string; contact_name: string; plan: string; trial_ends_at: string
}

type SearchResult = {
  found_in_setlistr: boolean
  status: ArtistStatus
  user_id: string | null
  artist_name: string
  pro_affiliation: string | null
  total_shows: number
  submission_rate: number
  last_active: string | null
  days_since_active: number | null
  already_on_roster: boolean
  already_invited: boolean
  upcoming_shows: { count: number; nextVenue: string; nextDate: string }
  estimated_annual_royalties: number
  tour_size: string
}

type InviteResult = {
  invite_url: string
  email_subject: string
  email_body: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function artistStatus(artist: Artist): ArtistStatus {
  if (!artist.lastShow) return 'inactive'
  const days = (Date.now() - new Date(artist.lastShow.started_at).getTime()) / 86400000
  return days <= 30 ? 'active' : 'inactive'
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ArtistStatus }) {
  const cfg = {
    active:        { label: '● Active',        color: C.green, bg: C.greenDim,             border: 'rgba(74,222,128,0.25)' },
    inactive:      { label: '● Inactive',       color: C.amber, bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)' },
    invited:       { label: '✉ Invited',        color: C.gold,  bg: C.goldDim,              border: C.borderGold },
    not_activated: { label: '✕ Not Activated',  color: C.red,   bg: C.redDim,               border: 'rgba(248,113,113,0.25)' },
  }[status]

  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' as const, flexShrink: 0,
    }}>
      {cfg.label}
    </span>
  )
}

function UrgencyBadge({ days }: { days: number }) {
  const color  = days <= 30 ? C.red   : days <= 90 ? C.amber : C.gold
  const bg     = days <= 30 ? 'rgba(248,113,113,0.1)' : days <= 90 ? 'rgba(245,158,11,0.1)' : C.goldDim
  const border = days <= 30 ? 'rgba(248,113,113,0.3)' : days <= 90 ? 'rgba(245,158,11,0.3)' : C.borderGold
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color, background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: '3px 9px', whiteSpace: 'nowrap' as const, fontFamily: '"DM Mono", monospace' }}>
      {days}d left
    </span>
  )
}

function SubmissionBadge({ submissionStatus }: { submissionStatus: string | null }) {
  if (submissionStatus === 'submitted') return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' as const }}>Submitted</span>
  )
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' as const }}>Unsubmitted</span>
  )
}

// ── Artist Card ───────────────────────────────────────────────────────────────

function ArtistCard({ artist, expanded, onToggle }: { artist: Artist; expanded: boolean; onToggle: () => void }) {
  const status = artistStatus(artist)
  const submissionRate = artist.totalShows > 0
    ? Math.round(((artist.totalShows - artist.unsubmitted) / artist.totalShows) * 100)
    : 0
  const atRisk = artist.recentShows.filter(s =>
    s.submission_status !== 'submitted' && s.days_until_deadline < 90 && s.days_until_deadline > 0
  )

  return (
    <div style={{ background: C.card, border: `1px solid ${expanded ? C.borderGold : C.border}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s ease', animation: 'fadeUp 0.4s ease' }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>

        {/* Avatar */}
        <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: status === 'active' ? C.greenDim : C.goldDim, border: `1px solid ${status === 'active' ? 'rgba(74,222,128,0.25)' : C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: status === 'active' ? C.green : C.gold }}>
            {artist.artist_name.charAt(0).toUpperCase()}
          </span>
        </div>

        {/* Name + status + progress */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' as const }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist.artist_name}</p>
            <StatusBadge status={status} />
            {atRisk.length > 0 && (
              <span style={{ fontSize: 9, fontWeight: 700, color: C.amber, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '2px 7px', letterSpacing: '0.08em', textTransform: 'uppercase' as const, flexShrink: 0 }}>
                ⚠ {atRisk.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, background: submissionRate === 100 ? C.green : submissionRate > 50 ? C.gold : C.red, width: `${submissionRate}%`, transition: 'width 0.6s ease' }} />
            </div>
            <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{submissionRate}%</span>
          </div>
        </div>

        {/* Unclaimed value */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          {artist.unsubmitted > 0 ? (
            <>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace' }}>~${artist.estimatedUnclaimed}</span>
              <span style={{ fontSize: 10, color: C.muted }}>{artist.unsubmitted} unsubmitted</span>
            </>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>✓ Clear</span>
          )}
        </div>

        <span style={{ color: C.muted, fontSize: 10, flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
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
              <div key={stat.label} style={{ padding: '12px 10px', textAlign: 'center', borderRight: i < 3 ? `1px solid ${C.border}` : 'none' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {atRisk.length > 0 && (
            <div style={{ padding: '10px 18px', background: 'rgba(245,158,11,0.04)', borderBottom: `1px solid ${C.border}` }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: C.amber, margin: '0 0 7px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>⚠ Deadline Risk</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {atRisk.map(show => (
                  <div key={show.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 12, color: C.text, flex: 1, minWidth: 0, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.venue_name} · {show.city}</span>
                    <span style={{ fontSize: 11, color: C.amber, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{show.days_until_deadline}d left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '12px 18px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 8px' }}>Recent Shows</p>
            {artist.recentShows.length === 0 ? (
              <p style={{ fontSize: 12, color: C.muted, margin: 0, fontStyle: 'italic' }}>No shows tracked yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {artist.recentShows.map(show => (
                  <div key={show.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                    <div style={{ minWidth: 28, textAlign: 'center', flexShrink: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{new Date(show.started_at).getDate()}</p>
                      <p style={{ fontSize: 9, color: C.muted, margin: '1px 0 0', textTransform: 'uppercase' as const }}>{new Date(show.started_at).toLocaleDateString('en-US', { month: 'short' })}</p>
                    </div>
                    <div style={{ width: 1, height: 24, background: C.border, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.venue_name}</p>
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

// ── Search Result Card ────────────────────────────────────────────────────────

function SearchResultCard({
  result, publisherName, onInvite, onAddToRoster, inviting,
}: {
  result: SearchResult
  publisherName: string
  onInvite: () => void
  onAddToRoster: () => void
  inviting: boolean
}) {
  const statusCfg = {
    active:        { color: C.green, bg: C.greenDim,              border: 'rgba(74,222,128,0.3)',  label: '● Active on Setlistr' },
    inactive:      { color: C.amber, bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)',  label: '● Inactive — may be missing shows' },
    invited:       { color: C.gold,  bg: C.goldDim,               border: C.borderGold,             label: '✉ Invite sent — awaiting signup' },
    not_activated: { color: C.red,   bg: C.redDim,                border: 'rgba(248,113,113,0.3)', label: '✕ Not on Setlistr — royalties at risk' },
  }[result.status]

  return (
    <div style={{ background: C.card, border: `1px solid ${statusCfg.border}`, borderRadius: 16, overflow: 'hidden', animation: 'fadeUp 0.3s ease', marginBottom: 16 }}>
      {/* Status banner */}
      <div style={{ padding: '10px 18px', background: statusCfg.bg, borderBottom: `1px solid ${statusCfg.border}` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: statusCfg.color, letterSpacing: '0.06em' }}>{statusCfg.label}</span>
      </div>

      <div style={{ padding: '18px 20px' }}>
        {/* Artist name + tour size */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{result.artist_name}</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {result.pro_affiliation && <span style={{ fontSize: 11, color: C.muted }}>PRO: <span style={{ color: C.secondary }}>{result.pro_affiliation}</span></span>}
              {result.tour_size && <span style={{ fontSize: 11, color: C.muted }}>Scale: <span style={{ color: C.secondary }}>{result.tour_size}</span></span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 26, fontWeight: 800, color: C.gold, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
              ~${result.estimated_annual_royalties.toLocaleString()}
            </p>
            <p style={{ fontSize: 10, color: C.muted, margin: 0 }}>est. annual royalties</p>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            {
              label: result.found_in_setlistr ? 'Tracked Shows' : 'Upcoming Shows',
              value: result.found_in_setlistr ? result.total_shows : result.upcoming_shows.count,
              color: C.gold,
            },
            {
              label: 'Submission Rate',
              value: result.found_in_setlistr ? `${result.submission_rate}%` : '—',
              color: result.found_in_setlistr
                ? result.submission_rate > 70 ? C.green : result.submission_rate > 40 ? C.gold : C.red
                : C.muted,
            },
            {
              label: 'Status',
              value: result.found_in_setlistr
                ? result.days_since_active != null ? `${result.days_since_active}d ago` : 'No shows'
                : 'Not signed up',
              color: C.muted,
            },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace' }}>{stat.value}</p>
              <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Next show if from Ticketmaster */}
        {!result.found_in_setlistr && result.upcoming_shows.nextVenue && (
          <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14 }}>
            <p style={{ fontSize: 10, color: C.muted, margin: '0 0 3px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Next show</p>
            <p style={{ fontSize: 13, color: C.text, margin: 0, fontWeight: 600 }}>
              {result.upcoming_shows.nextVenue}
              {result.upcoming_shows.nextDate && <span style={{ color: C.muted, fontWeight: 400 }}> · {formatDate(result.upcoming_shows.nextDate)}</span>}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {result.already_on_roster ? (
            <div style={{ flex: 1, padding: '12px', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>✓ Already on your roster</span>
            </div>
          ) : result.found_in_setlistr ? (
            <button onClick={onAddToRoster}
              style={{ flex: 1, padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em' }}>
              Add to Roster
            </button>
          ) : result.already_invited ? (
            <div style={{ flex: 1, padding: '12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, textAlign: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>✉ Invite already sent</span>
            </div>
          ) : (
            <button onClick={onInvite} disabled={inviting}
              style={{ flex: 1, padding: '13px', background: C.red, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 800, cursor: inviting ? 'default' : 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', opacity: inviting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <UserPlus size={14} strokeWidth={2.5} />
              {inviting ? 'Generating invite...' : 'Invite Artist'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Invite Modal ──────────────────────────────────────────────────────────────

function InviteModal({ invite, artistName, publisherId, publisherName, onClose }: { invite: InviteResult; artistName: string; publisherId: string; publisherName: string; onClose: () => void }) {
  const [copied, setCopied] = useState<'subject' | 'body' | 'all' | null>(null)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  function copy(text: string, key: 'subject' | 'body' | 'all') {
    try { navigator.clipboard.writeText(text) } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  async function sendEmail() {
    if (!recipientEmail.trim()) return
    setSending(true)
    try {
      await fetch('/api/publisher/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publisher_id: publisherId,
          publisher_name: publisherName,
          artist_name: artistName,
          artist_email: recipientEmail.trim(),
        }),
      })
      setEmailSent(true)
    } catch { /* silently fail */ } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
      <div style={{ width: '100%', maxWidth: 520, background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 20, overflow: 'hidden', animation: 'fadeUp 0.3s ease' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 3px' }}>Invite Ready</p>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>{artistName}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Send via Resend */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 8px' }}>Send Email Directly</p>
            {emailSent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10 }}>
                <Check size={13} color={C.green} strokeWidth={2.5} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Email sent to {recipientEmail}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={recipientEmail}
                  onChange={e => setRecipientEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendEmail()}
                  placeholder="artist@email.com"
                  type="email"
                  style={{ flex: 1, padding: '10px 12px', background: '#0a0908', border: `1px solid rgba(255,255,255,0.09)`, borderRadius: 8, color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                />
                <button onClick={sendEmail} disabled={sending || !recipientEmail.trim()}
                  style={{ padding: '10px 16px', background: recipientEmail.trim() ? C.gold : 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 8, color: recipientEmail.trim() ? '#0a0908' : C.muted, fontSize: 12, fontWeight: 700, cursor: sending || !recipientEmail.trim() ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            )}
          </div>

          <p style={{ fontSize: 11, color: C.muted, margin: '0 0 14px' }}>Or copy and send manually:</p>

          {/* Subject */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: 0 }}>Subject</p>
              <button onClick={() => copy(invite.email_subject, 'subject')}
                style={{ background: 'none', border: 'none', color: copied === 'subject' ? C.green : C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                {copied === 'subject' ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>
            <div style={{ background: '#0a0908', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <p style={{ fontSize: 12, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace' }}>{invite.email_subject}</p>
            </div>
          </div>

          {/* Body */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: 0 }}>Email Body</p>
              <button onClick={() => copy(invite.email_body, 'body')}
                style={{ background: 'none', border: 'none', color: copied === 'body' ? C.green : C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                {copied === 'body' ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>
            <div style={{ background: '#0a0908', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', maxHeight: 200, overflowY: 'auto' as const }}>
              <pre style={{ fontSize: 12, color: C.secondary, margin: 0, fontFamily: '"DM Sans", system-ui', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>{invite.email_body}</pre>
            </div>
          </div>

          {/* CTA */}
          <button onClick={() => copy(`Subject: ${invite.email_subject}\n\n${invite.email_body}`, 'all')}
            style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {copied === 'all' ? <><Check size={14} strokeWidth={2.5} /> Full Email Copied</> : <><Copy size={14} strokeWidth={2.5} /> Copy Full Email</>}
          </button>

          <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <p style={{ fontSize: 10, color: C.muted, margin: 0, lineHeight: 1.5 }}>
              Invite link: <span style={{ color: C.secondary, fontFamily: '"DM Mono", monospace', wordBreak: 'break-all' as const }}>{invite.invite_url}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Recovery Queue ────────────────────────────────────────────────────────────

function RecoveryQueue({ items }: { items: RecoveryItem[] }) {
  if (items.length === 0) return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '28px 18px', textAlign: 'center' }}>
      <p style={{ fontSize: 20, margin: '0 0 5px' }}>✓</p>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.green, margin: '0 0 3px' }}>Queue clear</p>
      <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>No shows approaching deadlines.</p>
    </div>
  )

  const critical = items.filter(i => i.urgency === 'critical')
  const warning  = items.filter(i => i.urgency === 'warning')
  const monitor  = items.filter(i => i.urgency === 'monitor')

  function Section({ title, color, bg, sItems }: { title: string; color: string; bg: string; sItems: RecoveryItem[] }) {
    if (!sItems.length) return null
    return (
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color, margin: '0 0 5px', opacity: 0.85 }}>{title}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sItems.map(item => (
            <div key={item.id} style={{ background: bg, border: `1px solid ${color}30`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3, gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.artist_name}</span>
                <UrgencyBadge days={item.days_until_deadline} />
              </div>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: '0 0 3px', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.venue_name}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span style={{ fontSize: 11, color: C.secondary, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
      <Section title={`Critical · ${critical.length}`} color={C.red}   bg="rgba(248,113,113,0.05)" sItems={critical} />
      <Section title={`At Risk · ${warning.length}`}   color={C.amber} bg="rgba(245,158,11,0.05)"  sItems={warning} />
      <Section title={`Monitor · ${monitor.length}`}   color={C.gold}  bg="rgba(201,168,76,0.04)"  sItems={monitor} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IndustryTerminal() {
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading]             = useState(true)
  const [publisher, setPublisher]         = useState<Publisher | null>(null)
  const [artists, setArtists]             = useState<Artist[]>([])
  const [summary, setSummary]             = useState<Summary | null>(null)
  const [recoveryQueue, setRecoveryQueue] = useState<RecoveryItem[]>([])
  const [expanded, setExpanded]           = useState<string | null>(null)
  const [error, setError]                 = useState('')

  // Search state
  const [searchQuery, setSearchQuery]     = useState('')
  const [searching, setSearching]         = useState(false)
  const [searchResult, setSearchResult]   = useState<SearchResult | null>(null)

  // Invite state
  const [inviting, setInviting]           = useState(false)
  const [inviteResult, setInviteResult]   = useState<InviteResult | null>(null)
  const [inviteArtistName, setInviteArtistName] = useState('')

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

  async function handleSearch() {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResult(null)
    try {
      const res = await fetch(`/api/publisher/artist-search?artist=${encodeURIComponent(searchQuery)}&publisher_id=${PUBLISHER_ID}`)
      const data = await res.json()
      setSearchResult(data)
    } catch {
      // silently fail — show nothing
    } finally {
      setSearching(false)
    }
  }

  async function handleInvite() {
    if (!searchResult) return
    setInviting(true)
    try {
      const res = await fetch('/api/publisher/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publisher_id: PUBLISHER_ID,
          publisher_name: publisher?.name || 'Your publisher',
          artist_name: searchResult.artist_name,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setInviteArtistName(searchResult.artist_name)
        setInviteResult({ invite_url: data.invite_url, email_subject: data.email_subject, email_body: data.email_body })
        // Mark as invited in the search result
        setSearchResult(prev => prev ? { ...prev, already_invited: true, status: 'invited' } : prev)
      }
    } catch {
      // silently fail
    } finally {
      setInviting(false)
    }
  }

  async function handleAddToRoster() {
    if (!searchResult?.user_id) return
    try {
      await fetch('/api/publisher/roster/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publisher_id: PUBLISHER_ID, artist_user_id: searchResult.user_id, artist_name: searchResult.artist_name }),
      })
      setSearchResult(prev => prev ? { ...prev, already_on_roster: true } : prev)
    } catch { /* silently fail */ }
  }

  function clearSearch() {
    setSearchQuery('')
    setSearchResult(null)
    searchRef.current?.focus()
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>Loading</span>
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
      {/* Invite modal */}
      {inviteResult && (
        <InviteModal invite={inviteResult} artistName={inviteArtistName} publisherId={PUBLISHER_ID} publisherName={publisher?.name || ''} onClose={() => setInviteResult(null)} />
      )}

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 20px 60px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: '28px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
          <div style={{ padding: '5px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10 }}>✦</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.gold }}>Industry Terminal</span>
          </div>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, color: C.secondary, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 12px' }}>
            Artist View →
          </button>
        </div>

        {/* Publisher identity */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 2px', letterSpacing: '-0.025em' }}>{publisher?.name}</h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>{publisher?.contact_name}</p>
        </div>

        {/* Hero — Unclaimed pipeline */}
        {summary && (
          <div style={{ background: 'rgba(201,168,76,0.07)', border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: '24px 28px', marginBottom: 16, position: 'relative', overflow: 'hidden', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%', background: 'radial-gradient(ellipse at 100% 50%, rgba(201,168,76,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 8px', opacity: 0.8 }}>Unclaimed Royalty Pipeline</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 16, marginBottom: summary.totalShows > 0 ? 18 : 0 }}>
              <div>
                <p style={{ fontSize: 48, fontWeight: 800, color: C.gold, margin: '0 0 5px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  ~${summary.estimatedUnclaimed.toLocaleString()}
                </p>
                <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>
                  {summary.unsubmittedShows} unsubmitted · {artists.length} artist{artists.length !== 1 ? 's' : ''}
                </p>
              </div>
              {summary.projectedAnnual > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 10, color: C.muted, margin: '0 0 3px', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Projected annual miss</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: C.red, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                    ~${summary.projectedAnnual.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0' }}>at current submission rate</p>
                </div>
              )}
            </div>
            {summary.totalShows > 0 && (
              <div style={{ paddingTop: 14, borderTop: '1px solid rgba(201,168,76,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.secondary }}>Roster submission rate</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: submissionRate > 70 ? C.green : submissionRate > 40 ? C.gold : C.red, fontFamily: '"DM Mono", monospace' }}>{submissionRate}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: submissionRate > 70 ? C.green : submissionRate > 40 ? C.gold : C.red, width: `${submissionRate}%`, transition: 'width 0.8s ease' }} />
                </div>
                <p style={{ fontSize: 10, color: C.muted, margin: '5px 0 0' }}>{summary.totalShows - summary.unsubmittedShows} of {summary.totalShows} shows submitted</p>
              </div>
            )}
          </div>
        )}

        {/* Stat pills */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
            {[
              { label: 'Artists',     value: artists.length,           color: C.text },
              { label: 'Total Shows', value: summary.totalShows,       color: C.gold },
              { label: 'Songs',       value: summary.totalSongs,       color: C.gold },
              { label: 'Unsubmitted', value: summary.unsubmittedShows, color: summary.unsubmittedShows > 0 ? C.red : C.green },
            ].map(stat => (
              <div key={stat.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── ARTIST SEARCH ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 10px' }}>
            Find an Artist
          </p>

          {/* Search bar */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} color={C.muted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search by artist name..."
                style={{
                  width: '100%', padding: '12px 36px 12px 36px',
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, color: C.text, fontSize: 13,
                  fontFamily: '"DM Sans", system-ui', outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
              />
              {searchQuery && (
                <button onClick={clearSearch} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
              style={{ padding: '12px 20px', background: searchQuery.trim() ? C.gold : 'rgba(255,255,255,0.04)', border: `1px solid ${searchQuery.trim() ? C.gold : C.border}`, borderRadius: 10, color: searchQuery.trim() ? '#0a0908' : C.muted, fontSize: 13, fontWeight: 700, cursor: searching || !searchQuery.trim() ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease', whiteSpace: 'nowrap' as const }}>
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Search result */}
          {searchResult && (
            <div style={{ marginTop: 12 }}>
              <SearchResultCard
                result={searchResult}
                publisherName={publisher?.name || ''}
                onInvite={handleInvite}
                onAddToRoster={handleAddToRoster}
                inviting={inviting}
              />
            </div>
          )}
        </div>

        {/* ── TWO-COLUMN LAYOUT ─────────────────────────────────────────────── */}
        <div className="terminal-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 18, alignItems: 'start' }}>

          {/* Left — Roster */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 10px' }}>
              Roster · {artists.length} artist{artists.length !== 1 ? 's' : ''}
            </p>
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
              {artists.length === 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '36px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 8px' }}>No artists on roster yet.</p>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Search for an artist above to add them.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right — Recovery Queue */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              Recovery Queue
              {recoveryQueue.length > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: C.red, background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, padding: '2px 6px' }}>
                  {recoveryQueue.length}
                </span>
              )}
            </p>
            <RecoveryQueue items={recoveryQueue} />
          </div>
        </div>

        <div style={{ marginTop: 36, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: C.muted, margin: 0, letterSpacing: '0.06em' }}>Setlistr · Live performance intelligence</p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #8a7a68; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; }
        @media (max-width: 640px) { .terminal-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  )
}
