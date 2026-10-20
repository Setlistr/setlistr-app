'use client'
import { useEffect, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { computeFilingStatus, filingActionPath, type FilingStatusResult, type FilingAction } from '@/lib/filing-status'
import { isCapturedShow } from '@/lib/performance-status'
import { loadFilingProfile, type FilingProfileContext } from '@/lib/load-filing-profile'
import { readClaimInputs } from '@/lib/claim-inputs-storage'
import { countsFromRows, type SubmissionsNavCounts } from '@/lib/submissions-nav-counts'
import { SubmissionsSwitcher } from '@/components/SubmissionsSwitcher'
import { SubmissionEntryRow, SubmissionRowsSkeleton, SubmissionsDesktopStyles } from '@/components/SubmissionEntryRow'
import { LoadError } from '@/components/ui/LoadError'
import { filingDeadlineLabel, deadlineNeedsAttention, type DeadlineLabel } from '@/lib/filing-deadline-label'
import { showDay } from '@/lib/show-date'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'
import { ESTIMATE_DISCLAIMER, formatEstimate, ESTIMATE_UNIT } from '@/lib/estimate-copy'

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
  // Estimated royalties, only for a show ready to submit (computed as History computes it).
  estimate: number | null
}

// The same territory rule app/app/history applies to the same estimate.
function getTerritory(country?: string | null, city?: string | null): string {
  const t = ((country || '') + ' ' + (city || '')).toLowerCase()
  if (t.includes('canada') || t.includes('ontario') || t.includes('british columbia') || t.includes('alberta') || t.includes('quebec') || t.includes('toronto') || t.includes('vancouver') || t.includes('montreal') || t.trim() === 'ca') return 'CA'
  return 'US'
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

// Details that belong to the account, not the show: said once, above the list.
const PROFILE_FIELDS = new Set(['No PRO selected', 'legal name', 'IPI number'])
const STEP_FIELD: Record<string, string> = { city: 'Add the city', 'venue capacity': 'Add the venue capacity', 'start time': 'Add the start time', 'ticket price': 'Add the ticket price', promoter: 'Add the promoter', attendance: 'Add the attendance' }

// The one next step for a show, in the status line's words. computeFilingStatus
// orders `missing` by importance, so the first show-level entry is the step.
function nextStepFor(status: FilingStatusResult): string {
  if (status.state === 'ready') return 'Ready to submit'
  const showOnly = status.missing.filter(m => !PROFILE_FIELDS.has(m))
  if (showOnly[0] === 'setlist not yet reviewed' || showOnly[0] === 'no songs added') return 'Review the setlist'
  if (showOnly.length > 0) return STEP_FIELD[showOnly[0]] || `Add the ${showOnly[0]}`
  return 'Waiting on your details'
}
function joinFields(fields: string[]): string {
  const f = fields.map(x => x === 'No PRO selected' ? 'PRO' : x)
  return f.length <= 1 ? f.join('') : `${f.slice(0, -1).join(', ')} and ${f[f.length - 1]}`
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
      // Show details typed on the claim sheet are kept per signed-in account.
      let viewerId: string | null = null
      if (actingAs) {
        // The session is already local; no extra request for the account id.
        viewerId = (await supabase.auth.getSession()).data.session?.user.id ?? null
        // One request returns the artist's PRO, shows and song counts.
        ctx = await loadFilingProfile(supabase, actingAs)
        perfs = ctx.delegatePerformances || []
        songCountMap = ctx.delegateSongCountMap || {}
      } else {
        // One sign-in check, then the profile and the show list together;
        // song counts need the show ids, so they follow.
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/auth/login'); return }
        viewerId = user.id
        const [profileCtx, perfRes] = await Promise.all([
          loadFilingProfile(supabase, null, user.id),
          supabase
            .from('performances_visible')
            .select('id, venue_name, city, country, status, submission_status, started_at, performance_date, created_at, data_source, shows ( show_type, timezone ), venues ( capacity )')
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
        const claimInputs = viewerId ? readClaimInputs(viewerId, p.id) : {}
        const status = computeFilingStatus(perfFields, songCount, ctx.profile, ctx.isDelegate, claimInputs)
        const action = filingActionPath(p.id, p.status, songCount)
        const day = showDay(p, p.shows?.timezone) || parseLocalDate(p.started_at)
        const computedDeadline = p.started_at ? filingDeadlineLabel(ctx.profile.pro_affiliation, day) : null
        const deadline = computedDeadline && deadlineNeedsAttention(computedDeadline.urgency) ? computedDeadline : null
        const estimate = status.state === 'ready' && songCount > 0
          ? estimateRoyalties({ songCount, venueCapacityBand: capacityToBand(perfFields.venue_capacity), showType: (p.shows?.show_type || p.show_type || 'single') as any, territory: getTerritory(p.country, p.city) }).expected
          : null
        return { id: p.id, venue_name: p.venue_name, city: p.city || null, started_at: p.started_at, day, status, action, songCount, deadline, estimate }
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

        {/* Submissions is a tab in the navigation, so no Back; the switcher carries the count. */}
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', padding: '20px 0 16px', overflowWrap: 'break-word' as const }}>
          {actingAs ? `${artistName || actingAs.artist_name}’s submissions` : 'Submissions'}
        </h1>

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

        {/* Account details several shows wait on, said once. */}
        {ready && (() => {
          const fields = Array.from(new Set(rows.flatMap(r => r.status.missing.filter(m => PROFILE_FIELDS.has(m)))))
          const affected = rows.filter(r => r.status.missing.some(m => PROFILE_FIELDS.has(m))).length
          if (fields.length === 0 || affected === 0) return null
          return (
            <div role="note" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: '4px 12px', padding: '10px 14px', margin: '0 0 8px', borderRadius: 12, background: 'color-mix(in srgb, var(--sl-accent) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-accent) 22%, transparent)' }}>
              <span style={{ flex: '1 1 220px', fontSize: 14.5, color: C.text, lineHeight: 1.45 }}>
                {actingAs
                  ? `${affected} ${affected === 1 ? 'show waits' : 'shows wait'} on ${artistName || actingAs.artist_name}’s ${joinFields(fields)}.`
                  : `Add your ${joinFields(fields)} to file ${affected} ${affected === 1 ? 'show' : 'shows'}.`}
              </span>
              {!actingAs && (
                <button onClick={() => router.push('/app/settings#pro-section')}
                  style={{ minHeight: 44, padding: 0, background: 'none', border: 'none', color: 'var(--sl-gold-text)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Open Settings
                </button>
              )}
            </div>
          )
        })()}

        {ready && rows.length > 0 && (
          <div className="subm-list">
            {rows.map((row, i) => {
              const d = row.day
              // The ready group opens with what it adds up to (the estimate History used to promote).
              const startsReady = row.status.state === 'ready' && (i === 0 || rows[i - 1].status.state !== 'ready')
              const readyRows = startsReady ? rows.filter(r => r.status.state === 'ready') : []
              const readyTotal = readyRows.reduce((sum, r) => sum + (r.estimate || 0), 0)
              const step = nextStepFor(row.status)
              return (
                <Fragment key={row.id}>
                  {startsReady && (
                    <div style={{ padding: '22px 4px 8px', borderBottom: `1px solid ${C.border}` }}>
                      <h2 style={{ fontSize: 14.5, fontWeight: 400, color: C.text, margin: 0 }}>
                        <b style={{ fontWeight: 700 }}>Ready to submit</b> <span style={{ color: C.secondary }}>· {readyRows.length} {readyRows.length === 1 ? 'show' : 'shows'}{readyTotal > 0 && <> · {formatEstimate(readyTotal)} {ESTIMATE_UNIT}</>}</span>
                      </h2>
                      {readyTotal > 0 && <p style={{ fontSize: 12.5, color: C.muted, margin: '2px 0 0' }}>{ESTIMATE_DISCLAIMER}</p>}
                    </div>
                  )}
                  <SubmissionEntryRow
                    variant="queue"
                    onNavigate={() => router.push(row.action.href)}
                    day={String(d.getDate())}
                    month={d.toLocaleDateString('en-US', { month: 'short' })}
                    task={step}
                    venueName={row.venue_name}
                    city={row.city}
                    statusLabel={step}
                    statusTextColor={row.status.state === 'ready' ? 'var(--sl-gold-text)' : C.secondary}
                    dotFilled={row.status.state === 'ready'}
                    statusNote={`${row.songCount} song${row.songCount === 1 ? '' : 's'}`}
                    deadlineLabel={row.deadline?.label}
                    deadlineColor={row.deadline?.color}
                  />
                </Fragment>
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
