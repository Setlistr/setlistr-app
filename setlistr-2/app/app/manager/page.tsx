'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Users, ChevronRight, RefreshCw, Calendar, Send, FileSearch, Mail } from 'lucide-react'
import {
  dateRangeFor, countCapturedShows, recentActivityFeed, countNotYetSubmitted,
  countAwaitingReview, awaitingReviewFeed,
  type ManagerDateRangeKey, type ManagerPerformanceRow,
} from '@/lib/managerOverview'
import { fetchCapturedShowsInRange } from '@/lib/managerFetch'

const C = {
  bg: '#0a0908', card: '#141210', card2: '#1a1814', border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)', green: '#4ade80', red: '#f87171',
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
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(145deg, rgba(201,168,76,0.18), rgba(201,168,76,0.06))', border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {url
        ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.34, fontWeight: 800, color: C.gold }}>{initialsFor(name)}</span>}
    </div>
  )
}

type MyRequest = { id: string; artist_name: string; invited_email: string; invited_at: string; status: 'pending' | 'accepted' | 'declined' | 'revoked' }

// The manager's own empty-roster entry point: request access by the
// artist's email. Never grants anything itself — POST /api/team/request
// only ever creates a pending row the artist must explicitly approve
// (app/app/settings's Team section). The response text is intentionally
// generic on first contact with any given email (see that route's own
// comment on why) — only a request this SAME manager has already made
// before gets a more specific status, which is their own history, not
// new information about an email they haven't reached before.
function RequestArtistAccess() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [resultOk, setResultOk] = useState(true)
  const [requests, setRequests] = useState<MyRequest[]>([])
  const [requestsLoaded, setRequestsLoaded] = useState(false)

  const loadRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/team/requests')
      const data = await res.json()
      setRequests(data.requests || [])
    } finally {
      setRequestsLoaded(true)
    }
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  async function submit() {
    if (!email.trim() || submitting) return
    setSubmitting(true); setResultMessage(null)
    try {
      const res = await fetch('/api/team/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_email: email.trim() }),
      })
      const data = await res.json()
      setResultOk(res.ok)
      setResultMessage(data.message || data.error || 'Something went wrong.')
      if (res.ok) { setEmail(''); loadRequests() }
    } catch {
      setResultOk(false); setResultMessage('Network error — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const statusLabel: Record<MyRequest['status'], { text: string; color: string }> = {
    pending: { text: 'Pending', color: C.gold },
    accepted: { text: 'Approved', color: C.green },
    declined: { text: 'Declined', color: C.red },
    revoked: { text: 'Access removed', color: C.muted },
  }

  return (
    <div style={{ padding: '60px 24px 40px', maxWidth: 420, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' as const, marginBottom: 28 }}>
        <Users size={32} color={C.muted} style={{ marginBottom: 16 }} />
        <p style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>No connected artists yet</p>
        <p style={{ color: C.secondary, fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          Request access using an artist's email — they'll need to approve it before anything connects. You can also be invited directly from an artist's own Settings.
        </p>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>Request Artist Access</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="artist@email.com" type="email"
            style={{ flex: 1, background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 12px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
          <button onClick={submit} disabled={submitting || !email.trim()}
            style={{ padding: '11px 16px', background: email.trim() ? C.gold : 'rgba(255,255,255,0.04)', border: 'none', borderRadius: 10, color: email.trim() ? '#0a0908' : C.muted, fontSize: 13, fontWeight: 700, cursor: submitting || !email.trim() ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? '...' : 'Request'}
          </button>
        </div>
        {resultMessage && (
          <p style={{ fontSize: 12, color: resultOk ? C.secondary : C.red, margin: '10px 0 0', lineHeight: 1.5 }}>{resultMessage}</p>
        )}
      </div>

      {requestsLoaded && requests.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Your Requests</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {requests.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <Mail size={13} color={C.muted} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: C.text, textAlign: 'left' as const, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.artist_name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusLabel[r.status].color, flexShrink: 0 }}>{statusLabel[r.status].text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// A plain shimmer block standing in for a number/line that genuinely isn't
// known yet — never a stale number left dimmed in place. Reused for the
// stat row during both the initial roster load and every range switch.
function SkeletonBlock({ width, height = 26 }: { width: number | string; height?: number }) {
  return <div className="mgr-skeleton" style={{ width, height, borderRadius: 6 }} />
}

function StatCard({ icon: Icon, label, value, loading, error, tone, href }: {
  icon: React.ElementType; label: string; value: number; loading: boolean; error?: boolean; tone?: 'gold' | 'default'; href?: string
}) {
  const content = (
    <div className="mgr-stat-card" style={{ background: `linear-gradient(165deg, ${C.card2}, ${C.card})`, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={14} color={C.muted} strokeWidth={2} />
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>{label}</p>
      </div>
      {loading
        ? <SkeletonBlock width={48} />
        : error
        // Never a bare "0" when the fetch actually failed — that reads as
        // a real, confirmed zero, which this explicitly is not.
        ? <p style={{ fontSize: 28, fontWeight: 800, color: C.muted, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>—</p>
        : <p style={{ fontSize: 28, fontWeight: 800, color: tone === 'gold' && value > 0 ? C.gold : C.text, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{value}</p>}
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{content}</Link> : content
}

export default function ManagerOverviewPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [managed, setManaged] = useState<ManagedArtist[]>([])
  const [range, setRange] = useState<ManagerDateRangeKey>('30d')
  const [rows, setRows] = useState<ManagerPerformanceRow[]>([])
  // Starts true: the data effect below always kicks off a fetch on a
  // fresh mount (as long as there's a managed artist), so a false initial
  // value let the very first render show a genuine "0 shows" empty state
  // for one frame before the effect could flip it — same bug confirmed on
  // the Analytics page via DOM sampling, same fix.
  const [rangeLoading, setRangeLoading] = useState(true)
  // Distinct from a genuine zero: a failed fetch must never present the
  // same all-zero StatCards and "no shows" copy as a workspace that
  // truly has no recorded activity in this range.
  const [rangeError, setRangeError] = useState(false)
  const [rangeRetryTick, setRangeRetryTick] = useState(0)
  const [showReviewList, setShowReviewList] = useState(false)
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
    if (managed.length === 0) { setRows([]); setRangeError(false); setRangeLoading(false); return }
    let cancelled = false
    setRangeLoading(true); setRangeError(false)
    setRows([]) // never leave a different range's rows visible under a fresh "Loading…" label
    const supabase = createClient()
    const { fromISO } = dateRangeFor(range)
    fetchCapturedShowsInRange(supabase, managed.map(a => a.artist_id), fromISO)
      .then(r => { if (!cancelled) setRows(r) })
      .catch(() => { if (!cancelled) { setRows([]); setRangeError(true) } })
      .finally(() => { if (!cancelled) setRangeLoading(false) })
    return () => { cancelled = true }
  }, [managed, range, rangeRetryTick])

  const rangeInfo = useMemo(() => dateRangeFor(range), [range])
  const capturedCount = countCapturedShows(rows)
  const notSubmittedCount = countNotYetSubmitted(rows)
  const awaitingReviewCount = countAwaitingReview(rows)
  const needsReview = awaitingReviewFeed(rows, 6)
  const recent = recentActivityFeed(rows, 8)

  if (loading) {
    return (
      <div style={{ padding: '24px 20px 40px', maxWidth: 880, margin: '0 auto' }} className="mgr-page">
        <SkeletonBlock width={160} height={30} />
        <div style={{ marginTop: 10, marginBottom: 28 }}><SkeletonBlock width={140} height={16} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}><SkeletonBlock width={60} height={14} /><div style={{ marginTop: 10 }}><SkeletonBlock width={40} /></div></div>)}
        </div>
        <style>{`@keyframes mgrShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } } .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer 1.4s ease infinite; } @media (prefers-reduced-motion: reduce) { .mgr-skeleton { animation: none; opacity: 0.5; } }`}</style>
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
    return <RequestArtistAccess />
  }

  return (
    <div style={{ padding: '24px 20px 40px', maxWidth: 880, margin: '0 auto' }} className="mgr-page">
      <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 5px', letterSpacing: '-0.025em' }}>Overview</h1>
      <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 26px' }}>
        {managed.length} connected artist{managed.length === 1 ? '' : 's'}
      </p>

      {/* ── Stat row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard icon={Users} label="Roster" value={managed.length} loading={false} href="/app/manager/artists" />
        <StatCard icon={Calendar} label={`Recorded · ${rangeInfo.label}`} value={capturedCount} loading={rangeLoading} error={rangeError} />
        <StatCard icon={FileSearch} label={`Awaiting review · ${rangeInfo.label}`} value={awaitingReviewCount} loading={rangeLoading} error={rangeError} tone="gold" />
        <StatCard icon={Send} label={`Not submitted · ${rangeInfo.label}`} value={notSubmittedCount} loading={rangeLoading} error={rangeError} tone="gold" />
      </div>

      {/* ── Date range ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {RANGE_OPTIONS.map(opt => (
          <button key={opt.key} onClick={() => setRange(opt.key)} style={{
            padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            background: range === opt.key ? 'rgba(201,168,76,0.14)' : 'transparent',
            border: `1px solid ${range === opt.key ? 'rgba(201,168,76,0.35)' : C.border}`,
            color: range === opt.key ? C.gold : C.secondary,
            transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
          }}>
            {opt.label}
          </button>
        ))}
      </div>

      {rangeError && !rangeLoading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, padding: '12px 16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 12 }}>
          <span style={{ fontSize: 13, color: C.red }}>Couldn't load activity for this range — the counts above aren't shown rather than risk showing zero when that isn't actually true.</span>
          <button onClick={() => setRangeRetryTick(t => t + 1)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'transparent', border: `1px solid rgba(248,113,113,0.4)`, borderRadius: 8, color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* ── Awaiting review — a real observation: states its period, opens
          the exact shows it's counting ── */}
      {awaitingReviewCount > 0 && (
        <div style={{ marginBottom: 24, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 14, overflow: 'hidden' }}>
          <button onClick={() => setShowReviewList(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
            <FileSearch size={15} color={C.gold} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>
              {awaitingReviewCount} show{awaitingReviewCount === 1 ? '' : 's'} awaiting review this period — not yet finalized by the artist
            </span>
            <ChevronRight size={14} color={C.gold} style={{ flexShrink: 0, transform: showReviewList ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
          {showReviewList && (
            <div style={{ borderTop: `1px solid ${C.borderGold}` }}>
              {needsReview.map(r => {
                const artistName = artistNameById.get(r.user_id) || 'Artist'
                const dateStr = (r.started_at || r.performance_date || '').slice(0, 10)
                // 'processing' is still mid-pipeline — not yet handed to the
                // artist to review — so it gets no Review Setlist link here;
                // only 'review'-stage shows are actually ready for that.
                const stillProcessing = r.status === 'processing'
                const rowContent = (
                  <>
                    <Avatar name={artistName} url={artistAvatarById.get(r.user_id)} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artistName} · {r.venue_name || 'Unknown venue'}</span>
                      <span style={{ fontSize: 11, color: stillProcessing ? C.muted : C.gold, fontWeight: 700 }}>{stillProcessing ? 'Still processing' : 'Ready for review'}</span>
                    </div>
                    <span style={{ fontSize: 11, color: C.muted, flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{dateStr}</span>
                    {!stillProcessing && <ChevronRight size={13} color={C.muted} style={{ flexShrink: 0 }} />}
                  </>
                )
                return stillProcessing ? (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid rgba(201,168,76,0.12)` }}>
                    {rowContent}
                  </div>
                ) : (
                  <Link key={r.id} href={`/app/review/${r.id}`} className="mgr-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', textDecoration: 'none', borderBottom: `1px solid rgba(201,168,76,0.12)` }}>
                    {rowContent}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Recent activity ── */}
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
        Recent recorded activity
      </p>
      {recent.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '28px 20px', textAlign: 'center' as const }}>
          <p style={{ color: C.secondary, fontSize: 14, margin: rangeLoading || rangeError ? 0 : '0 0 12px' }}>
            {rangeLoading ? 'Loading…' : rangeError ? "Not shown — couldn't load." : `No recorded shows in the ${rangeInfo.label.toLowerCase()}.`}
          </p>
          {!rangeLoading && !rangeError && (
            <Link href="/app/manager/schedule" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: C.gold, textDecoration: 'none' }}>
              <Calendar size={13} /> Select an artist and add their first scheduled show
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {recent.map(row => {
            const artistName = artistNameById.get(row.user_id) || 'Artist'
            const submitted = row.submission_status === 'submitted'
            const dateStr = (row.started_at || row.performance_date || '').slice(0, 10)
            return (
              <Link key={row.id} href={`/app/manager/artists/${row.user_id}`} className="mgr-row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: C.card, textDecoration: 'none' }}>
                <Avatar name={artistName} url={artistAvatarById.get(row.user_id)} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, overflowWrap: 'anywhere' as const }}>{artistName}</p>
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

      <style>{`
        @media (min-width: 900px) { .mgr-page { padding: 40px 32px 60px; } }
        .mgr-stat-card { transition: transform 0.15s ease, border-color 0.15s ease; }
        a:has(.mgr-stat-card):hover .mgr-stat-card { transform: translateY(-2px); border-color: ${C.borderGold}; }
        .mgr-row-hover { transition: background 0.12s ease; }
        .mgr-row-hover:hover { background: ${C.card2} !important; }
        @keyframes mgrShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } }
        .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer 1.4s ease infinite; border-radius: 6px; }
        @media (prefers-reduced-motion: reduce) {
          .mgr-stat-card, .mgr-row-hover, .mgr-skeleton { transition: none !important; animation: none !important; }
          a:has(.mgr-stat-card):hover .mgr-stat-card { transform: none; }
          .mgr-skeleton { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
