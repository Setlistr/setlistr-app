'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, TrendingUp, Mic, Music4, RefreshCw, AlertCircle, Check } from 'lucide-react'
import {
  estimateRoyalties, aggregateUnclaimedEarnings,
  capacityToBand, type ShowEstimateInput,
} from '@/lib/royalty-estimate'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.1)',
}

type Performance = {
  id: string
  venue_name: string
  artist_name: string
  city: string
  country: string
  status: string
  submission_status: string | null
  started_at: string
  created_at: string
  show_type?: string
  venue_capacity?: number | null
}

function getDisplayStatus(p: Performance): { label: string; color: string; bg: string } {
  if (p.submission_status === 'submitted') return { label: 'Submitted', color: C.green, bg: C.greenDim }
  const map: Record<string, { label: string; color: string; bg: string }> = {
    live:      { label: 'Live',         color: C.red,   bg: C.redDim },
    pending:   { label: 'Live',         color: C.red,   bg: C.redDim },
    review:    { label: 'Needs Review', color: C.blue,  bg: C.blueDim },
    complete:  { label: 'Completed',    color: C.green, bg: C.greenDim },
    completed: { label: 'Completed',    color: C.green, bg: C.greenDim },
    exported:  { label: 'Exported',     color: C.green, bg: C.greenDim },
  }
  return map[p.status] || { label: 'Needs Review', color: C.blue, bg: C.blueDim }
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function minutesSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
}

export default function DashboardPage() {
  const router = useRouter()
  const [performances, setPerformances] = useState<Performance[]>([])
  const [loading, setLoading]           = useState(true)
  const [livePerf, setLivePerf]         = useState<Performance | null>(null)
  const [totalSongs, setTotalSongs]     = useState(0)
  const [needsReview, setNeedsReview]   = useState(0)
  const [userId, setUserId]             = useState<string | null>(null)
  const [showEstimates, setShowEstimates] = useState<ShowEstimateInput[]>([])
  const [songCountMap, setSongCountMap] = useState<Record<string, number>>({})

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
      const { data, error } = await supabase
        .from('performances')
        .select(`id, venue_name, artist_name, city, country, status, submission_status, started_at, created_at, shows ( show_type ), venues ( capacity )`)
        .order('created_at', { ascending: false })
      if (error) console.error('Dashboard error:', error)
      if (data) {
        const perfs: Performance[] = data.map((p: any) => ({
          id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
          city: p.city, country: p.country, status: p.status,
          submission_status: p.submission_status || null,
          started_at: p.started_at, created_at: p.created_at,
          show_type: p.shows?.show_type || 'single', venue_capacity: p.venues?.capacity || null,
        }))
        setPerformances(perfs)
        setNeedsReview(perfs.filter(p => (p.status === 'review' || p.status === 'complete' || p.status === 'completed') && p.submission_status !== 'submitted').length)
        // Live perf: status live/pending AND started within last 6 hours
        const live = perfs.find(p =>
          (p.status === 'live' || p.status === 'pending') &&
          minutesSince(p.started_at || p.created_at) < 360
        )
        setLivePerf(live || null)
        const { data: songData } = await supabase.from('performance_songs').select('performance_id').in('performance_id', perfs.map(p => p.id))
        const countMap: Record<string, number> = {}
        songData?.forEach((s: any) => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })
        setSongCountMap(countMap)
        setTotalSongs(Object.values(countMap).reduce((a, b) => a + b, 0))
        const estimates: ShowEstimateInput[] = perfs
          .filter(p => p.status !== 'live' && p.status !== 'pending' && p.submission_status !== 'submitted')
          .map(p => ({ performanceId: p.id, status: p.status, songCount: countMap[p.id] || 0, venueCapacityBand: capacityToBand(p.venue_capacity), showType: (p.show_type as any) || 'single', territory: p.country === 'CA' || p.country === 'Canada' ? 'CA' : 'US' }))
          .filter(e => e.songCount > 0)
        setShowEstimates(estimates)
      }
      setLoading(false)
    }
    load()
  }, [])

  const aggregate      = aggregateUnclaimedEarnings(showEstimates)
  const totalShows     = performances.filter(p => p.status !== 'live' && p.status !== 'pending').length
  const submittedCount = performances.filter(p => p.submission_status === 'submitted').length
  const recentPerfs    = performances.slice(0, 5)

  function navigateToPerformance(p: Performance) {
    if (p.status === 'live' || p.status === 'pending') router.push(`/app/live/${p.id}`)
    else if (p.submission_status === 'submitted') router.push(`/app/submit/${p.id}`)
    else router.push(`/app/review/${p.id}`)
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '45vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0 28px', animation: 'fadeUp 0.3s ease' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music4 size={14} color={C.gold} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {submittedCount > 0 && (
              <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={10} strokeWidth={2.5} />{submittedCount} submitted
              </span>
            )}
            <button onClick={() => router.push('/app/settings')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em', fontFamily: 'inherit' }}>Settings</button>
            <button onClick={() => router.push('/app/history')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em', fontFamily: 'inherit' }}>History →</button>
          </div>
        </div>

        {/* ── RESUME LIVE SESSION — prominent when show is active ── */}
        {livePerf ? (() => {
          const minsSinceStart = minutesSince(livePerf.started_at || livePerf.created_at)
          const mightBeInterrupted = minsSinceStart > 5
          return (
            <div style={{ marginBottom: 24, animation: 'fadeUp 0.3s ease' }}>
              {/* Interrupted warning */}
              {mightBeInterrupted && (
                <div style={{ background: 'rgba(220,38,38,0.07)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '12px 12px 0 0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.red, animation: 'pulse-dot 1.4s ease-in-out infinite', flexShrink: 0 }} />
                  <p style={{ fontSize: 12, color: C.red, margin: 0, fontWeight: 600 }}>
                    Show in progress — capture may have been interrupted
                  </p>
                </div>
              )}
              <button
                onClick={() => navigateToPerformance(livePerf)}
                style={{ width: '100%', background: C.card, border: `2px solid ${C.borderGold}`, borderRadius: mightBeInterrupted ? '0 0 14px 14px' : 14, padding: '18px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.gold, animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: '0 0 3px' }}>
                    {mightBeInterrupted ? 'Resume Capture' : 'Show Active'}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 2px', letterSpacing: '-0.01em' }}>{livePerf.venue_name}</p>
                  <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>
                    {livePerf.artist_name}{livePerf.city ? ` · ${livePerf.city}` : ''} · {minsSinceStart} min ago
                  </p>
                </div>
                <div style={{ background: C.gold, borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 800, color: '#0a0908', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                  {mightBeInterrupted ? 'Resume →' : 'Continue →'}
                </div>
              </button>
            </div>
          )
        })() : (
          /* Hero CTA — only shown when no live show */
          <div style={{ animation: 'fadeUp 0.35s ease', marginBottom: 20 }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Ready to<br /><span style={{ color: C.gold }}>go live?</span>
            </h1>
            <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 22px' }}>Capture your setlist in real time.</p>
            <button onClick={() => router.push('/app/show/new')}
              style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              <Plus size={16} strokeWidth={2.5} />Start New Show
            </button>
            {performances.length > 0 && (
              <button onClick={() => router.push('/app/show/new?reuse=true')}
                style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 14, marginTop: 10, color: C.secondary, fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.borderGold; el.style.color = C.gold }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.color = C.secondary }}>
                <RefreshCw size={14} />Reuse a Previous Setlist
              </button>
            )}
          </div>
        )}

        {/* Unclaimed earnings */}
        {aggregate.unclaimedCount > 0 && (
          <div style={{ marginBottom: 20, animation: 'fadeUp 0.42s ease' }}>
            <button onClick={() => router.push('/app/history')}
              style={{ width: '100%', background: 'rgba(201,168,76,0.08)', border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '16px 20px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.13)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.08)'}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertCircle size={16} color={C.gold} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.gold, margin: '0 0 2px' }}>You're owed ~${aggregate.unclaimedExpected.toLocaleString()}</p>
                <p style={{ fontSize: 11, color: C.secondary, margin: 0 }}>{aggregate.unclaimedCount} unsubmitted show{aggregate.unclaimedCount !== 1 ? 's' : ''} · {totalSongs} songs tracked</p>
              </div>
              <span style={{ fontSize: 12, color: C.gold, flexShrink: 0 }}>Claim →</span>
            </button>
          </div>
        )}

        {/* Royalty Estimator */}
        <div style={{ marginBottom: 20, animation: 'fadeUp 0.45s ease' }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                <TrendingUp size={10} />Royalty Opportunity
              </p>
              <span style={{ fontSize: 9, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '3px 8px' }}>Estimate</span>
            </div>
            {totalSongs === 0 ? (
              <div>
                <p style={{ fontSize: 22, fontWeight: 800, color: C.muted, margin: '0 0 6px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>$— – $—</p>
                <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px', lineHeight: 1.5 }}>Start tracking performances to see your estimated royalty range.</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 32, fontWeight: 800, color: C.gold, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                  ${aggregate.totalLow.toLocaleString()} – ${aggregate.totalHigh.toLocaleString()}
                </p>
                <p style={{ fontSize: 11, color: C.secondary, margin: '0 0 4px' }}>expected ~${aggregate.totalExpected.toLocaleString()}</p>
                <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 16px' }}>
                  Across {totalShows} show{totalShows !== 1 ? 's' : ''} · {totalSongs} songs{submittedCount > 0 ? ` · ${submittedCount} submitted` : ''}
                </p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Shows',       value: totalShows,  color: totalShows > 0 ? C.gold : C.muted },
                { label: 'Songs',       value: totalSongs,  color: totalSongs > 0 ? C.gold : C.muted },
                { label: 'Unsubmitted', value: needsReview, color: needsReview > 0 ? C.gold : C.muted },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: stat.color, margin: 0, fontFamily: '"DM Mono", monospace' }}>{stat.value}</p>
                  <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: C.muted, margin: 0, lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              Weighted by venue size and show type.
              {needsReview > 0
                ? <span style={{ color: C.gold }}> {needsReview} unsubmitted show{needsReview !== 1 ? 's' : ''} — claim your royalties.</span>
                : submittedCount > 0 ? <span style={{ color: C.green }}> All shows submitted. Nice work.</span> : null}
            </p>
          </div>
        </div>

        {/* Recent Shows */}
        <div style={{ animation: 'fadeUp 0.5s ease', paddingBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>Recent Shows</p>
            {performances.length > 5 && <button onClick={() => router.push('/app/history')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>View all →</button>}
          </div>

          {recentPerfs.length === 0 ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Mic size={20} color={C.gold} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>Play a show tonight?</p>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 20px', lineHeight: 1.5 }}>Setlistr listens while you play and builds your setlist automatically.</p>
              <button onClick={() => router.push('/app/show/new')}
                style={{ background: C.gold, border: 'none', borderRadius: 10, padding: '12px 24px', color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>
                Start a Show
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentPerfs.map((perf, i) => {
                const displayStatus = getDisplayStatus(perf)
                const dateStr       = perf.started_at || perf.created_at
                const songCount     = songCountMap[perf.id] || 0
                const isFinished    = perf.status !== 'live' && perf.status !== 'pending'
                const perfEst       = isFinished && songCount > 0 ? estimateRoyalties({ songCount, venueCapacityBand: capacityToBand(perf.venue_capacity), showType: (perf.show_type as any) || 'single', territory: perf.country === 'CA' || perf.country === 'Canada' ? 'CA' : 'US' }) : null
                return (
                  <button key={perf.id} onClick={() => navigateToPerformance(perf)}
                    style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease, border-color 0.15s ease', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', animation: `fadeUp ${0.5 + i * 0.06}s ease` }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = C.cardHover; el.style.borderColor = 'rgba(255,255,255,0.12)' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = C.card; el.style.borderColor = C.border }}>
                    <div style={{ minWidth: 36, textAlign: 'center', flexShrink: 0 }}>
                      <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{new Date(dateStr).getDate()}</p>
                      <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{new Date(dateStr).toLocaleDateString('en-US', { month: 'short' })}</p>
                    </div>
                    <div style={{ width: 1, height: 30, background: C.border, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perf.venue_name}</p>
                      <p style={{ fontSize: 11, color: C.secondary, margin: 0 }}>{perf.artist_name}{perf.city ? ` · ${perf.city}` : ''}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: displayStatus.color, background: displayStatus.bg, border: `1px solid ${displayStatus.color}40`, borderRadius: 20, padding: '3px 8px' }}>{displayStatus.label}</span>
                      {perfEst && perfEst.expected > 0
                        ? <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace' }}>~${perfEst.expected}</span>
                        : <span style={{ fontSize: 10, color: C.muted }}>{timeAgo(perf.created_at)}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {userId && (
          <div style={{ paddingBottom: 48, animation: 'fadeUp 0.55s ease' }}>
            <button onClick={() => router.push(`/app/artist/${userId}`)}
              style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.secondary, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.borderGold; el.style.color = C.gold }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.color = C.secondary }}>
              ✦ View Artist Profile
            </button>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
        @keyframes breathe   { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
