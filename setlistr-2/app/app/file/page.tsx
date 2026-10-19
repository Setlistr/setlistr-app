'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft } from 'lucide-react'
import { useActingAs } from '@/components/ActingAsProvider'
import { computeFilingStatus, filingActionPath, type FilingStatusResult, type FilingAction } from '@/lib/filing-status'
import { isCapturedShow } from '@/lib/performance-status'
import { loadFilingProfile, type FilingProfileContext } from '@/lib/load-filing-profile'
import { readClaimInputs } from '@/lib/claim-inputs-storage'
import { countsFromRows, type SubmissionsNavCounts } from '@/lib/submissions-nav-counts'
import { SubmissionsSwitcher } from '@/components/SubmissionsSwitcher'
import { SubmissionEntryRow, SubmissionRowsSkeleton, CountChipPlaceholder, SubmissionsDesktopStyles } from '@/components/SubmissionEntryRow'
import { LoadError } from '@/components/ui/LoadError'
import { filingDeadlineLabel, deadlineNeedsAttention, type DeadlineLabel } from '@/lib/filing-deadline-label'
import { showDay } from '@/lib/show-date'

const C = {
  bg: 'var(--sl-bg)', card: 'var(--sl-surface)',
  border: 'color-mix(in srgb, var(--sl-text) 7%, transparent)', borderGold: 'color-mix(in srgb, var(--sl-accent) 30%, transparent)',
  text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)',
  gold: 'var(--sl-accent)', goldDim: 'color-mix(in srgb, var(--sl-accent) 10%, transparent)',
  amber: 'var(--sl-warn)', amberDim: 'color-mix(in srgb, var(--sl-warn) 8%, transparent)',
}

const CARD = {
  background: 'var(--sl-card-bg)',
  boxShadow: 'var(--sl-card-inset)',
}

type ShowRow = {
  id: string; venue_name: string; city: string | null; started_at: string
  // The show's own day (lib/show-date.ts), for the row date and the deadline.
  day: Date
  status: FilingStatusResult
  action: FilingAction
  songCount: number
  // Only ever set when the deadline itself decided it needs attention
  // (see deadlineNeedsAttention below) — a comfortably-open deadline is
  // simply not carried here at all, not merely hidden at render time.
  deadline: DeadlineLabel | null
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

// Text stays one calm, consistent color for both states here — the dot
// (always gold, filled only when ready — see SubmissionEntryRow) is what
// actually distinguishes them, so status text isn't one more competing
// color on the row.
function statusLabelFor(state: FilingStatusResult['state']): string {
  return state === 'ready' ? 'Ready to submit' : 'Needs review'
}

const NO_ROWS: ShowRow[] = []
const SR_ONLY: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

export default function FilingQueuePage() {
  const router = useRouter()
  const { actingAs, resolved } = useActingAs()

  // Every result is tagged with the workspace it was loaded for and shown
  // only while that workspace is still the active one — so switching
  // artists never shows the previous artist's rows (or counts), and a slow
  // response for an old workspace is simply ignored.
  const workspaceKey = actingAs?.artist_id || 'own'
  type Loaded =
    | { key: string; status: 'ok'; rows: ShowRow[]; navCounts: SubmissionsNavCounts; artistName: string | null }
    | { key: string; status: 'error' }
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const current = loaded && loaded.key === workspaceKey ? loaded : null
  const ready = current?.status === 'ok' ? current : null
  const failed = current?.status === 'error'
  const rows = ready ? ready.rows : NO_ROWS
  const navCounts = ready ? ready.navCounts : null
  const artistName = ready ? ready.artistName : null

  useEffect(() => {
    if (!resolved) return
    const supabase = createClient()
    const key = workspaceKey
    let cancelled = false

    async function run() {
      let ctx: FilingProfileContext
      let perfs: any[]
      let songCountMap: Record<string, number> = {}
      if (actingAs) {
        // One request returns the artist's PRO, shows and song counts.
        ctx = await loadFilingProfile(supabase, actingAs)
        perfs = ctx.delegatePerformances || []
        songCountMap = ctx.delegateSongCountMap || {}
      } else {
        // One sign-in check, then the profile and the show list together;
        // song counts need the show ids, so they follow.
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }
        const [profileCtx, perfRes] = await Promise.all([
          loadFilingProfile(supabase, null, user.id),
          supabase
            .from('performances_visible')
            .select('id, venue_name, city, country, status, submission_status, started_at, performance_date, created_at, data_source, shows ( timezone ), venues ( capacity )')
            .eq('user_id', user.id)
            .order('started_at', { ascending: false }),
        ])
        if (perfRes.error) throw perfRes.error
        ctx = profileCtx
        perfs = perfRes.data || []
        const ids = perfs.map(p => p.id)
        if (ids.length > 0) {
          const { data: songData, error: songError } = await supabase
            .from('performance_songs_visible').select('performance_id').in('performance_id', ids)
          if (songError) throw songError
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
        const day = showDay(p, p.shows?.timezone) || parseLocalDate(p.started_at)
        const computedDeadline = p.started_at ? filingDeadlineLabel(ctx.profile.pro_affiliation, day) : null
        const deadline = computedDeadline && deadlineNeedsAttention(computedDeadline.urgency) ? computedDeadline : null
        return { id: p.id, venue_name: p.venue_name, city: p.city || null, started_at: p.started_at, day, status, action, songCount, deadline }
      })

      built.sort((a, b) => {
        const stateDiff = STATE_ORDER[a.status.state] - STATE_ORDER[b.status.state]
        if (stateDiff !== 0) return stateDiff
        return new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      })

      if (cancelled) return
      // The switcher's counts come from this same show list (the same
      // definitions lib/submissions-nav-counts applies) rather than a
      // second fetch of it.
      setLoaded({ key, status: 'ok', rows: built, navCounts: countsFromRows(perfs), artistName: ctx.artistName })
    }

    run().catch(err => {
      console.error('[FilingQueue] load failed:', err)
      if (!cancelled) setLoaded({ key, status: 'error' })
    })
    return () => { cancelled = true }
  }, [resolved, actingAs, reloadToken])

  function retry() { setLoaded(null); setReloadToken(t => t + 1) }

  return (
    <div style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'var(--sl-page-glow)' }} />
      <div className="subm-cq">
      <div className="subm-page" style={{ position: 'relative', zIndex: 1, width: '100%', padding: '0 16px 80px', boxSizing: 'border-box' as const }}>

        {/* Header — same structure, spacing, and back-button style as
           app/app/history's, so the two Submissions screens read as one
           navigation, not two differently-built pages. */}
        {/* Wraps the count chip under the title when the row can't fit it
           (larger text sizes, narrow phones) instead of overflowing. */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 12, rowGap: 8, padding: '20px 0 24px' }}>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.secondary, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', flex: '1 1 auto', minWidth: 0 }}>
            Submissions
          </h1>
          <div style={{ fontSize: 13, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '5px 10px', whiteSpace: 'nowrap' as const }}>
            {ready ? `${rows.length} to file` : <CountChipPlaceholder />}
          </div>
        </div>

        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 16px' }}>
          {actingAs ? `${artistName || actingAs.artist_name}'s unfiled shows` : 'Your unfiled shows'} — what's ready, what still needs something.
        </p>

        {/* This page only ever shows unfinished, actionable shows —
           submitted ones are excluded outright (see buildRows below). Your
           Record (Full History here) is where the complete log, submitted
           shows included, actually lives — an equally prominent choice,
           not a small link, so it's never a second-class option. */}
        <SubmissionsSwitcher active="file" filingQueueCount={navCounts?.filingQueueCount} fullHistoryCount={navCounts?.fullHistoryCount} />

        {!ready && !failed && (
          <div aria-busy="true">
            <span role="status" style={SR_ONLY}>{actingAs ? `Loading ${actingAs.artist_name}'s shows` : 'Loading your shows'}</span>
            <SubmissionRowsSkeleton variant="queue" />
          </div>
        )}

        {failed && (
          <LoadError message={actingAs ? `Couldn't load ${actingAs.artist_name}'s shows.` : "Couldn't load your shows."} onRetry={retry} />
        )}

        {ready && rows.length === 0 && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '32px 20px', textAlign: 'center', boxShadow: CARD.boxShadow }}>
            <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 16px', lineHeight: 1.5 }}>
              No captured shows yet. Once you've played and reviewed a show, it shows up here.
            </p>
            <button onClick={() => router.push('/app/show/new')}
              style={{ background: C.gold, border: 'none', borderRadius: 10, padding: '12px 20px', fontSize: 13, fontWeight: 800, color: 'var(--sl-on-accent)', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
              Capture a Show →
            </button>
          </div>
        )}

        {ready && rows.length > 0 && (
          <div className="subm-list">
            {rows.map(row => {
              const d = row.day
              // The single most important reason this show isn't ready —
              // computeFilingStatus already orders `missing` by importance
              // (review-stage, then PRO, then songs, then identity, then
              // per-field), so its first entry is that reason. The rest
              // lives on the show's own page, one tap away via the action
              // below, not repeated here. When that reason is "the setlist
              // hasn't been reviewed yet," it's dropped entirely — the
              // status label ("Needs review") and the action ("Review
              // Setlist") already say exactly that between them; showing
              // it a third time added no new information, just repetition.
              const topReason = row.status.state === 'needs_review' ? row.status.missing[0] : undefined
              const blocker = topReason && topReason !== 'setlist not yet reviewed'
                ? `Needs: ${topReason}`
                : undefined
              return (
                <SubmissionEntryRow
                  key={row.id}
                  variant="queue"
                  onNavigate={() => router.push(row.action.href)}
                  day={String(d.getDate())}
                  month={d.toLocaleDateString('en-US', { month: 'short' })}
                  task={row.action.label}
                  venueName={row.venue_name}
                  city={row.city}
                  statusLabel={statusLabelFor(row.status.state)}
                  statusTextColor={row.status.state === 'ready' ? 'var(--sl-gold-text)' : C.secondary}
                  dotFilled={row.status.state === 'ready'}
                  statusNote={blocker || [`${row.songCount} song${row.songCount === 1 ? '' : 's'}`, row.status.proName || 'No PRO selected'].join(' · ')}
                  deadlineLabel={row.deadline?.label}
                  deadlineColor={row.deadline?.color}
                />
              )
            })}
          </div>
        )}
      </div>
      </div>

      <SubmissionsDesktopStyles />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }

        /* Shared with app/app/history — one calm, readable column at every
           width, not a card grid. A phone-width column stayed narrow on
           purpose; on larger screens it grows only as far as a comfortable
           reading measure, not to fill the whole viewport. */
        .subm-page { max-width: 480px; margin: 0 auto; }
        .subm-list { display: flex; flex-direction: column; }
      `}</style>
    </div>
  )
}
