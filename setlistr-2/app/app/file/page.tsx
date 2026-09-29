'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle } from 'lucide-react'
import { useActingAs } from '@/components/ActingAsProvider'
import { SetlistrLoader, useLoaderVariant } from '@/components/SetlistrLoader'
import { computeFilingStatus, filingActionPath, type FilingStatusResult, type FilingAction } from '@/lib/filing-status'
import { isCapturedShow } from '@/lib/performance-status'
import { loadFilingProfile, type FilingProfileContext } from '@/lib/load-filing-profile'
import { readClaimInputs } from '@/lib/claim-inputs-storage'
import { loadSubmissionsNavCounts, type SubmissionsNavCounts } from '@/lib/submissions-nav-counts'
import { SubmissionsSwitcher } from '@/components/SubmissionsSwitcher'
import { SubmissionEntryRow } from '@/components/SubmissionEntryRow'
import { filingDeadlineLabel } from '@/lib/filing-deadline-label'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  amber: '#f59e0b', amberDim: 'rgba(245,158,11,0.08)',
}

const CARD = {
  background: 'linear-gradient(180deg, #171512 0%, #121009 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}

type ShowRow = {
  id: string; venue_name: string; city: string | null; started_at: string
  status: FilingStatusResult
  action: FilingAction
  deadline: { label: string; color: string } | null
}

function parseLocalDate(d: string): Date {
  const datePart = d.split('T')[0].split(' ')[0]
  const [y, m, day] = datePart.split('-').map(Number)
  if (y && m && day) return new Date(y, m - 1, day)
  return new Date(d)
}

// Priority order for a queue: what needs action first, then what's ready to
// go — not just reverse-chronological, since the entire point of this list
// is surfacing what still needs the artist's attention. Already-submitted
// shows are excluded from this page entirely (see buildRows below) — this
// is a to-do list, not a record; 'submitted' can't reach this UI, but the
// key stays so this remains a total function over FilingStatusResult['state'].
const STATE_ORDER: Record<FilingStatusResult['state'], number> = { needs_review: 0, ready: 1, submitted: 2 }

function statePill(state: FilingStatusResult['state']) {
  if (state === 'ready') return { label: 'Ready to file', color: C.green, bg: C.greenDim, border: 'rgba(74,222,128,0.2)' }
  return { label: 'Needs review', color: C.amber, bg: C.amberDim, border: 'rgba(245,158,11,0.25)' }
}

export default function FilingQueuePage() {
  const router = useRouter()
  const { actingAs, resolved } = useActingAs()
  const loaderVariant = useLoaderVariant()

  const [rows, setRows] = useState<ShowRow[]>([])
  const [artistName, setArtistName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [navCounts, setNavCounts] = useState<SubmissionsNavCounts | null>(null)

  useEffect(() => {
    if (!resolved) return
    const supabase = createClient()

    async function run() {
      const ctx: FilingProfileContext = await loadFilingProfile(supabase, actingAs)
      setArtistName(ctx.artistName)

      let perfs: any[]
      let songCountMap: Record<string, number>
      if (ctx.delegatePerformances) {
        perfs = ctx.delegatePerformances
        songCountMap = ctx.delegateSongCountMap || {}
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }
        const { data } = await supabase
          .from('performances_visible')
          .select('id, venue_name, city, country, status, submission_status, started_at, data_source, venues ( capacity )')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
        perfs = data || []
        const ids = perfs.map(p => p.id)
        songCountMap = {}
        if (ids.length > 0) {
          const { data: songData } = await supabase
            .from('performance_songs_visible').select('performance_id').in('performance_id', ids)
          songData?.forEach((s: any) => { songCountMap[s.performance_id] = (songCountMap[s.performance_id] || 0) + 1 })
        }
      }

      // isCapturedShow is the same canonical definition app/app/dashboard
      // and app/app/history ("Your Record") use — excludes imported
      // history, live/in-progress/draft rows, and placeholder-venue rows.
      // On top of that, this queue additionally excludes anything already
      // submitted: it's a to-do list of unfinished, actionable shows, not
      // a record of everything — Your Record stays the place to search the
      // full history including submitted shows.
      const captured = perfs.filter(p => isCapturedShow(p) && p.submission_status !== 'submitted')

      const built: ShowRow[] = captured.map(p => {
        const perfFields = {
          status: p.status || null,
          submission_status: p.submission_status || null,
          started_at: p.started_at || null,
          city: p.city || null,
          venue_city: p.venues?.city || null,
          venue_capacity: p.venues?.capacity || p.venue_capacity || null,
        }
        const songCount = songCountMap[p.id] || 0
        const claimInputs = readClaimInputs(p.id)
        const status = computeFilingStatus(perfFields, songCount, ctx.profile, ctx.isDelegate, claimInputs)
        const action = filingActionPath(p.id, p.status, songCount)
        const deadline = p.started_at ? filingDeadlineLabel(ctx.profile.pro_affiliation, parseLocalDate(p.started_at)) : null
        return { id: p.id, venue_name: p.venue_name, city: p.city || null, started_at: p.started_at, status, action, deadline }
      })

      built.sort((a, b) => {
        const stateDiff = STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state]
        if (stateDiff !== 0) return stateDiff
        return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      })

      setRows(built)
    }

    setLoading(true)
    setLoadError(false)
    run().catch(err => { console.error('[FilingQueue] load failed:', err); setLoadError(true) })
      .finally(() => setLoading(false))

    // Independent of the main list load — the switcher renders immediately
    // with its counts filling in separately, never blocking the page on a
    // second network round trip.
    setNavCounts(null)
    loadSubmissionsNavCounts(supabase, actingAs)
      .then(setNavCounts)
      .catch(err => console.error('[FilingQueue] nav counts failed:', err))
  }, [resolved, actingAs])

  if (loading) return (
    <SetlistrLoader variant={loaderVariant} label={actingAs ? `Loading ${actingAs.artist_name}'s shows...` : 'Loading'} />
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />
      <div className="subm-page" style={{ position: 'relative', zIndex: 1, width: '100%', padding: '28px 16px 80px', boxSizing: 'border-box' as const }}>

        <button onClick={() => router.push('/app/dashboard')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 20px', letterSpacing: '0.04em' }}>← Back</button>

        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Submissions</h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 16px' }}>
          {actingAs ? `${artistName || actingAs.artist_name}'s unfiled shows` : 'Your unfiled shows'} — what's ready, what still needs something.
        </p>

        {/* This page only ever shows unfinished, actionable shows —
           submitted ones are excluded outright (see buildRows below). Your
           Record (Full History here) is where the complete log, submitted
           shows included, actually lives — an equally prominent choice,
           not a small link, so it's never a second-class option. */}
        <SubmissionsSwitcher active="file" filingQueueCount={navCounts?.filingQueueCount} fullHistoryCount={navCounts?.fullHistoryCount} />

        {loadError && (
          <div style={{ background: C.amberDim, border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 10 }}>
            <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>Couldn't load your shows. Try again in a moment.</p>
          </div>
        )}

        {!loadError && rows.length === 0 && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '32px 20px', textAlign: 'center', boxShadow: CARD.boxShadow }}>
            <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 16px', lineHeight: 1.5 }}>
              No captured shows yet. Once you've played and reviewed a show, it shows up here.
            </p>
            <button onClick={() => router.push('/app/show/new')}
              style={{ background: C.gold, border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 800, color: '#0a0908', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
              Capture a Show →
            </button>
          </div>
        )}

        {!loadError && rows.length > 0 && (
          <div className="subm-list">
            {rows.map(row => {
              const pill = statePill(row.status.state)
              const d = parseLocalDate(row.started_at)
              return (
                <SubmissionEntryRow
                  key={row.id}
                  onNavigate={() => router.push(row.action.href)}
                  emphasized={row.status.state === 'ready'}
                  dateLabel={d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  venueName={row.venue_name}
                  metaLine={[row.city, row.status.proName || 'No PRO selected'].filter(Boolean).join(' · ')}
                  statusLabel={pill.label}
                  statusColor={pill.color}
                  statusDotFilled={row.status.state === 'ready'}
                  missing={row.status.state === 'needs_review' ? row.status.missing : undefined}
                  deadlineLabel={row.deadline?.label}
                  deadlineColor={row.deadline?.color}
                  actionLabel={row.action.label}
                />
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }

        /* Shared with app/app/history — a phone-width centered column on
           every screen size wasted the available width on desktop. The
           row itself never reflows (its 2-line structure already handles
           any container width via ellipsis truncation); only the page
           column and the list's column count change. */
        .subm-page { max-width: 480px; margin: 0 auto; }
        @media (min-width: 640px) { .subm-page { max-width: 720px; } }
        @media (min-width: 1024px) { .subm-page { max-width: 1100px; } }
        .subm-list { display: flex; flex-direction: column; gap: 10px; }
        @media (min-width: 768px) {
          .subm-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; align-items: start; }
        }
        @media (min-width: 1280px) {
          .subm-list { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  )
}
