'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, Mic } from 'lucide-react'
import { useActingAs } from '@/components/ActingAsProvider'
import { openAccountMenu } from '@/components/layout/AccountMenu'
import { useWorkspaceRole } from '@/components/layout/WorkspaceRole'
import { NextShowSummary } from '@/components/scheduling/UpcomingShows'
import { isCapturedShow, isRealVenue } from '@/lib/performance-status'
import { summarizeRecord, showDate, lastShowLabel } from '@/lib/record-summary'
import { showDay } from '@/lib/show-date'
import { hasEverBeenConnected } from '@/lib/teamConnectionHistory'
import {
  estimateRoyalties, aggregateUnclaimedEarnings,
  capacityToBand, type ShowEstimateInput,
} from '@/lib/royalty-estimate'
import { Skeleton } from '@/components/ui/Skeleton'
import { NextMilestoneRow } from '@/components/record/NextMilestone'

// Direction B ("Editorial"): one Bebas Neue number, one sentence, one ruled
// ledger. Colours come from the --sl-* tokens in app/globals.css so this
// page follows the app's appearance; nothing here hardcodes a palette.
const SANS = '"DM Sans", system-ui, sans-serif'

type Performance = {
  id: string; venue_name: string; artist_name: string
  city: string; country: string; status: string
  submission_status: string | null; started_at: string
  created_at: string; ended_at?: string
  show_type?: string; venue_capacity?: number | null
  data_source?: string | null
  performance_date?: string | null
  show_timezone?: string | null
}

type BitEvent = {
  id: string; datetime: string; venueName: string
  venueCity: string; venueRegion: string; venueCountry: string; url: string
}

type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

// Deliberately no 'draft' case: capturedPerfs (this file's only source for
// anything rendered via this function) excludes status='draft' at the
// filter level, so a draft performance never reaches here.
function getDisplayStatus(p: Performance): { label: string; color: string } {
  if (p.data_source === 'setlistfm_imported') return { label: 'Imported', color: 'var(--sl-text-3)' }
  // Purely the artist's own self-reported action (see markSubmitted() in
  // app/app/submit/[id]/page.tsx) — Setlistr never files with a PRO or
  // verifies receipt. "Marked submitted" says that; "Submitted" alone
  // reads as a confirmed fact.
  if (p.submission_status === 'submitted') return { label: 'Marked submitted', color: 'var(--sl-ok)' }
  const map: Record<string, { label: string; color: string }> = {
    live:      { label: 'Live',         color: 'var(--sl-live)' },
    pending:   { label: 'Live',         color: 'var(--sl-live)' },
    review:    { label: 'Needs review', color: 'var(--sl-gold-text)' },
    complete:  { label: 'Completed',    color: 'var(--sl-text-2)' },
    completed: { label: 'Completed',    color: 'var(--sl-text-2)' },
    exported:  { label: 'Exported',     color: 'var(--sl-text-2)' },
  }
  return map[p.status] || { label: 'Needs review', color: 'var(--sl-gold-text)' }
}

function minutesSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 60000) }
function hoursSince(d: string)   { return (Date.now() - new Date(d).getTime()) / 3600000 }

function isToday(d: string) {
  const a = new Date(d), b = new Date()
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isTomorrow(d: string) {
  const a = new Date(d), b = new Date(); b.setDate(b.getDate() + 1)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function formatShowTime(d: string) { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function formatShowDate(d: string) { return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
function formatElapsed(fromIso: string) {
  const mins = Math.max(0, minutesSince(fromIso))
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`
}
function possessive(name: string) { return /s$/i.test(name) ? `${name}’` : `${name}’s` }
function money(n: number) { return `~$${Math.round(n).toLocaleString('en-US')}` }
function isCanadian(country?: string | null, city?: string | null) {
  return ['CA','Canada','ca'].includes(country || '') ||
    ['toronto','vancouver','montreal','calgary','edmonton','ottawa','winnipeg'].some(c => (city || '').toLowerCase().includes(c)) ||
    (country || '').toLowerCase().includes('canada')
}

// ── Shared pieces (styles only; each is used in more than one place) ──
const bandButton: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--d-band, 64px)', padding: '10px 12px',
  borderRadius: 18, border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: SANS,
  background: 'var(--sl-band-bg)', boxShadow: 'var(--sl-band-ring)', color: 'var(--sl-text)',
}
const bandTitle: React.CSSProperties = { display: 'block', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const bandSub: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--sl-text-2)', marginTop: 2 }
// Sizes read --d-* so the wider layouts (see the container rules at the
// bottom of the page) can use the approved desktop measurements; phones get
// the fallbacks, unchanged.
const rowBase: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 'var(--d-row, 56px)', padding: '12px 0', borderBottom: '1px solid var(--sl-line)' }
const rowLabel: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 'var(--d-label, 14px)', color: 'var(--sl-text-2)', lineHeight: 1.35 }
const rowSmall: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--sl-text-3)', marginTop: 1 }
const rowValue: React.CSSProperties = { textAlign: 'right', fontSize: 'var(--d-value, 16px)', fontWeight: 600, color: 'var(--sl-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const unit: React.CSSProperties = { fontWeight: 400, color: 'var(--sl-text-3)' }
const sectionHeading: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--sl-text-2)', margin: '40px 0 4px' }
const primaryButton: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: '0 20px', borderRadius: 14, border: 'none', fontFamily: SANS, fontSize: 16, fontWeight: 700, cursor: 'pointer', background: 'var(--sl-gold)', color: 'var(--sl-on-gold)' }
const secondaryButton: React.CSSProperties = { ...primaryButton, background: 'var(--sl-surface)', color: 'var(--sl-text)' }
const chevron = <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--sl-text-3)', flexShrink: 0 }} />

function StatusLine({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color, marginBottom: 1 }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {children}
    </span>
  )
}


export default function DashboardPage() {
  const router = useRouter()
  const { actingAs, setActingAs, resolved } = useActingAs()

  const [performances, setPerformances]         = useState<Performance[]>([])
  const [loading, setLoading]                   = useState(true)
  // Stale-response guard (docs/ui-standard.md → Loading). Every load takes
  // a generation number; only the newest one may write results, errors or
  // the loading flag, so a slow response for a workspace the user has
  // already left is dropped. `dataFor` records which workspace the data on
  // screen belongs to; until it matches the current one the page shows the
  // skeleton, never the previous workspace's record under the new header.
  const loadGenRef = useRef(0)
  const [dataFor, setDataFor]                   = useState<string | null>(null)
  const [livePerf, setLivePerf]                 = useState<Performance | null>(null)
  const [morningAfterPerf, setMorningAfterPerf] = useState<Performance | null>(null)
  const [totalSongs, setTotalSongs]             = useState(0)
  const [userId, setUserId]                     = useState<string | null>(null)
  const [ownArtistName, setOwnArtistName]       = useState<string | null>(null)
  const [ownAvatarUrl, setOwnAvatarUrl]         = useState<string | null>(null)
  const [artistName, setArtistName]             = useState<string | null>(null)
  // Set only when loadDelegateContext's own re-verification of the
  // acting-as artist fails — previously a silent `if (data.error) return`
  // that left whatever the PREVIOUS render had (another artist's name,
  // another artist's shows) on screen with no indication anything had
  // gone wrong. Cleared on every successful load.
  const [contextLoadError, setContextLoadError] = useState(false)
  // The own-workspace equivalent: the performances query itself failed.
  // Previously ignored, which rendered a real artist's record as empty
  // ("Your first show starts your record") — wrong, and alarming.
  const [ownLoadError, setOwnLoadError]         = useState(false)
  const [estimatesUnavailable, setEstimatesUnavailable] = useState(false)
  const [showEstimates, setShowEstimates]       = useState<ShowEstimateInput[]>([])
  const [submittedEstimates, setSubmittedEstimates] = useState<ShowEstimateInput[]>([])
  const [songCountMap, setSongCountMap]         = useState<Record<string, number>>({})
  const [lookupName, setLookupName]             = useState<string | null>(null)
  const [upcomingShows, setUpcomingShows]       = useState<BitEvent[]>([])
  const [todayShow, setTodayShow]               = useState<BitEvent | null>(null)
  const [managedArtists, setManagedArtists]     = useState<ManagedArtist[]>([])
  const [careerTotalShows, setCareerTotalShows] = useState<number>(0)
  const [careerStartYear, setCareerStartYear]   = useState<number>(0)

  // Gated on `resolved` (not just present-but-still-validating `actingAs`) so
  // this never runs before the provider has finished checking a saved value
  // against /api/team/managed-artists — restores the original single-path
  // shape (either load delegate data and return, or load own data), since
  // `actingAs` is now guaranteed settled by the time this fires.
  useEffect(() => {
    if (!resolved) return
    const supabase = createClient()
    const gen = ++loadGenRef.current
    const current = () => gen === loadGenRef.current
    async function load() {
      try { await loadInner() } catch (err) {
        if (!current()) return
        // Any failed read lands on the error state with Try again — never an
        // endless skeleton, and never a guess (an unread profile looks like
        // "no artist name", which would wrongly route to onboarding).
        console.error('[Dashboard] load failed:', err)
        setPerformances([]); setLivePerf(null); setMorningAfterPerf(null)
        if (actingAs) setContextLoadError(true); else setOwnLoadError(true)
        setDataFor(actingAs ? actingAs.artist_id : 'own')
        setLoading(false)
      }
    }
    async function loadInner() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      if (user) {
        const [{ data: profile, error: profileError }, managedRes, { data: betaInvite }] = await Promise.all([
          supabase.from('profiles').select('bandsintown_artist_name, artist_name, full_name, avatar_url').eq('id', user.id).single(),
          fetch('/api/team/managed-artists'),
          // RLS (users_read_own_invite: email = auth.jwt()->>'email') is
          // the authorization boundary here — this can only ever read the
          // signed-in user's own row, never another email's. Read-only,
          // selects workspace routing below; never consulted by
          // can_act_for/can_write_for or any other grant of real access.
          user.email
            ? supabase.from('beta_invites').select('invited_role').eq('email', user.email).maybeSingle()
            : Promise.resolve({ data: null }),
        ])
        if (profileError) throw profileError
        // The team list only decides routing for someone with no artist
        // name of their own; for them a failed read must not be taken as
        // "no connections".
        if (!managedRes.ok && !profile?.artist_name?.trim()) throw new Error(`managed-artists ${managedRes.status}`)
        const managedData = managedRes.ok ? await managedRes.json() : { managed: [] }
        const managed: ManagedArtist[] = managedData.managed || []
        const recruitedAsManager = betaInvite?.invited_role === 'manager'

        // Onboarding sets up an ARTIST identity — never required of someone
        // who only ever manages other artists and has no artist_name of
        // their own to invent. A pure manager (no artist_name, but at least
        // one accepted delegation, OR recruited as a manager with none yet)
        // goes straight to their actual workspace instead. Only a genuinely
        // new user with no artist identity AND no history as a team member
        // still goes through onboarding, preserving that check exactly as
        // before.
        //
        // recruitedAsManager only ever matters inside this same outer
        // !artist_name branch — an established artist (real artist_name
        // already set) never reaches this block regardless of what they
        // were originally recruited as, so this can never redirect someone
        // who has already built a real artist identity, including a real
        // artist who also happens to manage other artists.
        //
        // Scoped to !actingAs: a manager-only account's own artist_name is
        // STILL empty while they're acting as one of their managed artists —
        // that's expected and fine, since this page is about to render that
        // ARTIST's dashboard, not the viewer's own. Without this guard, a
        // pure-manager delegate landing here while acting-as (e.g. via the
        // workspace switcher, or navigating back from live capture) was
        // bounced straight back to /app/manager on every load, discarding
        // the acting-as selection and making the whole flow unusable for
        // exactly this account type — confirmed as the real cause behind
        // "can't find how to enter/use the acting-as dashboard."
        if (!profile?.artist_name?.trim() && !actingAs) {
          if (managed.length > 0 || recruitedAsManager) { router.replace('/app/manager'); return }
          // A team-only user whose LAST connection was just removed has
          // managed.length === 0 and, since Grant access defaults
          // beta_invites.invited_role to 'artist' whenever no role is
          // explicitly passed (see app/api/admin/beta-invite/route.ts),
          // recruitedAsManager is also false even though they were never
          // an artist either — that default is not proof of an established
          // artist workspace. Without this check they fell straight into
          // onboarding and were asked to invent an artist identity.
          // hasEverBeenConnected tells them apart from a genuinely new
          // user (who has NO delegation history at all, accepted or not)
          // by whether they were EVER a real, accepted team member for
          // some artist — revoked or not. Routes to Team, which already
          // renders its own disconnected-workspace recovery state for
          // exactly this case.
          if (await hasEverBeenConnected(supabase, user.id)) { router.replace('/app/team'); return }
          router.replace('/app/onboarding'); return
        }

        const name = profile?.artist_name || profile?.full_name || null
        setOwnArtistName(name)
        setOwnAvatarUrl(profile?.avatar_url ?? null)
        if (profile?.bandsintown_artist_name) setLookupName(profile.bandsintown_artist_name)

        setManagedArtists(managed)

        if (actingAs) {
          await loadDelegateContext(actingAs.artist_id, actingAs.artist_name, gen)
          if (current()) setLoading(false)
          return
        }

        setArtistName(name)
      }

      await loadOwnPerformances(supabase, gen)
      if (current()) setLoading(false)
    }
    load()
  }, [resolved])

  async function loadOwnPerformances(supabase: any, gen: number) {
    // Deliberately session-user-only, never actingAsArtistId — this is only
    // ever called from the !actingAs branch of the load effect and from
    // switchToOwn(), both meant to show just the logged-in user's own data.
    // switchToOwn() in particular calls setActingAs(null) then this in the
    // same tick; actingAsArtistId wouldn't reflect that until the next
    // render, so consulting it here would still resolve to the artist being
    // exited, not the user's own account.
    const { data: { user } } = await supabase.auth.getUser()
    const targetUserId = user?.id || ''
    const [{ data, error }, { data: profileCareer }] = await Promise.all([
      supabase
        .from('performances_visible')
        .select(`id, venue_name, artist_name, city, country, status, submission_status, started_at, ended_at, created_at, data_source, performance_date, shows ( show_type, timezone ), venues ( capacity )`)
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('career_total_shows, career_start_year')
        .eq('id', targetUserId)
        .single()
    ])
    if (gen !== loadGenRef.current) return
    if (profileCareer?.career_total_shows) setCareerTotalShows(profileCareer.career_total_shows)
    if (profileCareer?.career_start_year) setCareerStartYear(profileCareer.career_start_year)
    setDataFor('own')
    if (error) { setPerformances([]); setLivePerf(null); setMorningAfterPerf(null); setOwnLoadError(true); return }
    setOwnLoadError(false)
    if (data) processPerformances(data, undefined, false, gen)
  }

  async function loadDelegateContext(artistId: string, artistDisplayName: string, gen: number) {
    let data: any
    try {
      const res = await fetch(`/api/team/context-data?artist_id=${artistId}`)
      data = await res.json()
      if (!res.ok && !data?.error) data = { error: `context-data ${res.status}` }
    } catch (err) {
      // Network failure or a non-JSON response: same outcome as a refused
      // re-check — cleared, and said so.
      data = { error: String(err) }
    }
    if (gen !== loadGenRef.current) return
    setDataFor(artistId)
    if (data.error) {
      // This route independently re-verifies the accepted/non-revoked
      // delegation on every call (app/api/team/context-data/route.ts) —
      // an error here means that re-check just failed, not a transient
      // fetch hiccup. Clearing rather than leaving whatever a PREVIOUS
      // successful load (this artist, or a different one) left behind is
      // what makes the failure visible instead of silently showing
      // stale/wrong-context data under a page that still looks normal.
      setArtistName(null); setPerformances([]); setLookupName(null)
      setCareerTotalShows(0); setCareerStartYear(0)
      setContextLoadError(true)
      return
    }
    setContextLoadError(false)
    setArtistName(data.artist_name)
    if (data.bandsintown_artist_name) setLookupName(data.bandsintown_artist_name)
    if (data.career_total_shows) setCareerTotalShows(data.career_total_shows)
    if (data.career_start_year) setCareerStartYear(data.career_start_year)
    processPerformances(data.performances, data.songCountMap, !!data.song_counts_unavailable, gen)
  }

  function processPerformances(rawPerfs: any[], existingSongCountMap?: Record<string, number>, songCountsUnavailable = false, gen?: number) {
    const perfs: Performance[] = rawPerfs.map((p: any) => ({
      id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
      city: p.city, country: p.country, status: p.status,
      submission_status: p.submission_status || null,
      started_at: p.started_at, ended_at: p.ended_at || null, created_at: p.created_at,
      show_type: p.shows?.show_type || p.show_type || 'single',
      venue_capacity: p.venues?.capacity || p.venue_capacity || null,
      data_source: p.data_source || 'captured',
      performance_date: p.performance_date || null,
      show_timezone: p.shows?.timezone || null,
    }))
    setPerformances(perfs)

    // Only captured shows feed operational flows. Also excludes 'draft' —
    // an Upload Performance draft row created the instant a file is picked
    // (app/api/upload-performance's POST), before any metadata/songs exist.
    // It only becomes a real, presentable record at status 'review' (the
    // Continue-to-Review PATCH). An abandoned draft must never be treated
    // as a real/captured show anywhere below (live/morningAfter/estimates
    // all derive from this list).
    const capturedPerfs = perfs.filter(p => p.data_source !== 'setlistfm_imported' && p.status !== 'draft')

    const live = capturedPerfs.find(p =>
      (p.status === 'live' || p.status === 'pending') &&
      minutesSince(p.started_at || p.created_at) < 360
    )
    setLivePerf(live || null)

    const morningAfter = capturedPerfs.find(p => {
      const hoursAgo = hoursSince(p.ended_at || p.started_at)
      return hoursAgo > 0 && hoursAgo <= 18 &&
        p.status !== 'live' && p.status !== 'pending' &&
        p.submission_status !== 'submitted'
    })
    setMorningAfterPerf(morningAfter || null)

    const buildEstimates = (countMap: Record<string, number>) => {
      const unclaimed: ShowEstimateInput[] = capturedPerfs
        .filter(p => p.status !== 'live' && p.status !== 'pending' && p.submission_status !== 'submitted')
        .map(p => ({
          performanceId: p.id, status: p.status,
          songCount: countMap[p.id] || 0,
          venueCapacityBand: capacityToBand(p.venue_capacity),
          showType: (p.show_type as any) || 'single',
          territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
        })).filter(e => e.songCount > 0)

      const submitted: ShowEstimateInput[] = capturedPerfs
        .filter(p => p.submission_status === 'submitted')
        .map(p => ({
          performanceId: p.id, status: 'complete',
          songCount: countMap[p.id] || 0,
          venueCapacityBand: capacityToBand(p.venue_capacity),
          showType: (p.show_type as any) || 'single',
          territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
        })).filter(e => e.songCount > 0)

      setShowEstimates(unclaimed)
      setSubmittedEstimates(submitted)
      setSongCountMap(countMap)
      setTotalSongs(Object.values(countMap).reduce((a, b) => a + b, 0))
    }

    // Song counts only feed the estimates. When they can't be read the
    // estimate rows say so instead of silently disappearing.
    if (existingSongCountMap) {
      setEstimatesUnavailable(songCountsUnavailable)
      buildEstimates(existingSongCountMap)
    } else {
      const supabase = createClient()
      supabase.from('performance_songs_visible').select('performance_id')
        .in('performance_id', capturedPerfs.map(p => p.id))
        .then(({ data: songData, error: songError }) => {
          if (gen !== undefined && gen !== loadGenRef.current) return
          setEstimatesUnavailable(!!songError)
          const countMap: Record<string, number> = {}
          songData?.forEach((s: any) => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })
          buildEstimates(countMap)
        }, () => { if (gen !== undefined && gen !== loadGenRef.current) return; setEstimatesUnavailable(true); buildEstimates({}) })
    }
  }

  async function switchToOwn() {
    const gen = ++loadGenRef.current
    setLoading(true)
    setActingAs(null)
    setLookupName(null); setUpcomingShows([]); setTodayShow(null)
    setArtistName(ownArtistName)
    const supabase = createClient()
    const { data: profile } = await supabase.from('profiles').select('bandsintown_artist_name').eq('id', userId!).single()
    if (gen !== loadGenRef.current) return
    if (profile?.bandsintown_artist_name) setLookupName(profile.bandsintown_artist_name)
    await loadOwnPerformances(supabase, gen)
    if (gen === loadGenRef.current) setLoading(false)
  }

  // Workspace switching now also happens from AccountMenu (the shared
  // AppShell header), outside this page entirely — the main load effect
  // above only reads `actingAs` once, at initial resolve, to pick the
  // right FIRST load path; it does not react to `actingAs` changing
  // later. Without this, switching via AccountMenu would update the
  // shared provider state but leave this page showing the PREVIOUS
  // context's stale artistName/performances/lookupName under a new,
  // mismatched banner. Tracks the previously-observed artist id so the
  // very first observation (already handled by the main load effect,
  // including a page load that restores an existing selection) is never
  // double-fetched — only a genuine, later change clears stale state and
  // reloads, exactly as switchToOwn above already does for its own
  // button, just reactively instead of only from a local handler.
  const prevActingAsIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!resolved) return
    const currentId = actingAs?.artist_id ?? null
    if (prevActingAsIdRef.current === undefined) { prevActingAsIdRef.current = currentId; return }
    if (prevActingAsIdRef.current === currentId) return
    prevActingAsIdRef.current = currentId

    const gen = ++loadGenRef.current
    const current = () => gen === loadGenRef.current
    setLoading(true)
    setLookupName(null); setUpcomingShows([]); setTodayShow(null)
    const fail = () => { if (!current()) return; setPerformances([]); setDataFor(actingAs ? actingAs.artist_id : 'own'); if (actingAs) setContextLoadError(true); else setOwnLoadError(true) }
    if (actingAs) {
      loadDelegateContext(actingAs.artist_id, actingAs.artist_name, gen).catch(fail).finally(() => { if (current()) setLoading(false) })
    } else {
      setArtistName(ownArtistName)
      const supabase = createClient()
      loadOwnPerformances(supabase, gen).catch(fail).finally(() => { if (current()) setLoading(false) })
    }
  }, [resolved, actingAs])

  useEffect(() => {
    if (!lookupName) return
    async function fetchUpcoming() {
      try {
        let events: BitEvent[] = []
        const bitRes  = await fetch(`/api/bandsintown/upcoming?artist=${encodeURIComponent(lookupName!)}`)
        const bitData = await bitRes.json()
        events = bitData.events || []
        if (events.length === 0) {
          const tmRes  = await fetch(`/api/ticketmaster/upcoming?artist=${encodeURIComponent(lookupName!)}`)
          const tmData = await tmRes.json()
          events = tmData.events || []
        }
        setUpcomingShows(events.filter(e => new Date(e.datetime) > new Date()).slice(0, 3))
        setTodayShow(events.find(e => isToday(e.datetime)) || null)
      } catch {}
    }
    fetchUpcoming()
  }, [lookupName])


  // Elapsed time on the live-session row: re-rendered each 30s while a
  // show is in progress, nothing otherwise.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!livePerf) return
    const t = setInterval(() => setTick(v => v + 1), 30000)
    return () => clearInterval(t)
  }, [livePerf])

  // ── DERIVED RECORD DATA ──
  // Hero, milestone, "of N shows" and "Last show" all come from one
  // isCapturedShow() set — see lib/record-summary.ts.
  const record             = summarizeRecord(performances)
  const recordShows        = performances.filter(isCapturedShow)
  const aggregate          = aggregateUnclaimedEarnings(showEstimates)
  const submittedAggregate = aggregateUnclaimedEarnings(submittedEstimates)
  const lifetimeTotal      = aggregate.totalExpected + submittedAggregate.totalExpected

  const importedPerfs = performances.filter(p => p.data_source === 'setlistfm_imported')
  // The same shows the record counts (no placeholder or in-progress rows —
  // a live show is already the row at the top), newest by the show's own
  // date: an upload filed today for a gig last month is not the newest.
  const recentPerfs = [...recordShows]
    .sort((a, b) => (showDate(b)?.getTime() ?? 0) - (showDate(a)?.getTime() ?? 0))
    .slice(0, 5)

  const recordCities = new Set(recordShows.map(p => p.city?.trim().toLowerCase()).filter(Boolean)).size

  const careerStartDate = performances.length > 0
    ? performances.reduce((earliest, p) => {
        const d = p.performance_date || p.started_at || p.created_at
        return d < earliest ? d : earliest
      }, performances[0].performance_date || performances[0].started_at || performances[0].created_at)
    : null

  const careerYears = careerStartYear > 0
    ? new Date().getFullYear() - careerStartYear
    : careerStartDate
    ? Math.max(1, new Date().getFullYear() - new Date(careerStartDate).getFullYear())
    : 0

  function navigateToPerformance(p: Performance) {
    if (p.data_source === 'setlistfm_imported') return
    if (p.status === 'live' || p.status === 'pending') router.push(`/app/live/${p.id}`)
    else if (p.submission_status === 'submitted') router.push(`/app/submit/${p.id}`)
    else router.push(`/app/review/${p.id}`)
  }

  function startShowFromBIT(event: BitEvent) {
    const params = new URLSearchParams({ venue: event.venueName, city: event.venueCity, country: event.venueCountry })
    router.push(`/app/show/new?${params.toString()}`)
  }

  async function retryLoad() {
    const gen = ++loadGenRef.current
    setLoading(true)
    try {
      if (actingAs) await loadDelegateContext(actingAs.artist_id, actingAs.artist_name, gen)
      else await loadOwnPerformances(createClient(), gen)
    } catch {
      if (gen !== loadGenRef.current) return
      setPerformances([]); setDataFor(actingAs ? actingAs.artist_id : 'own'); if (actingAs) setContextLoadError(true); else setOwnLoadError(true)
    }
    if (gen === loadGenRef.current) setLoading(false)
  }

  // Capture-adjacent actions (the "Tonight" row, starting from a listing,
  // the empty state's capture hint) follow the app frame's role answer —
  // never offered to a Viewer, nor before a team role is known.
  const { canWrite: canCapture } = useWorkspaceRole()
  const overline      = actingAs ? `${possessive(actingAs.artist_name)} live record` : 'Your live record'
  const loadFailed    = (contextLoadError && !!actingAs) || (ownLoadError && !actingAs)
  const showLoading   = loading || dataFor !== (actingAs ? actingAs.artist_id : 'own')
  const linkRow: React.CSSProperties = { ...rowBase, width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--sl-line)', cursor: 'pointer', fontFamily: SANS, textAlign: 'left' }

  // ── "What's happening now" rows: compact, above the record, never
  //    instead of it. Same destinations and actions as before. ──
  const liveBand = livePerf && (() => {
    const mightBeInterrupted = minutesSince(livePerf.started_at || livePerf.created_at) > 5
    return (
      <button onClick={() => navigateToPerformance(livePerf)} aria-label={`${mightBeInterrupted ? 'Resume capture' : 'Continue capture'} at ${livePerf.venue_name || 'this show'}`} style={bandButton}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 40% 35%, #dcc06a, #c9a84c 55%, #8a6520)', color: '#0a0908' }}>
          <Mic size={16} strokeWidth={2.4} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          {mightBeInterrupted
            ? <StatusLine color="var(--sl-live)">Capture may have been interrupted</StatusLine>
            : <StatusLine color="var(--sl-ok)">Show in progress</StatusLine>}
          <span style={bandTitle}>{livePerf.venue_name || 'Untitled show'}</span>
          <span style={bandSub}>{mightBeInterrupted ? 'Tap to resume capture' : 'Tap to continue capture'}</span>
        </span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 18, color: 'var(--sl-text-2)', fontVariantNumeric: 'tabular-nums' }}>{formatElapsed(livePerf.started_at || livePerf.created_at)}</span>
        {chevron}
      </button>
    )
  })()

  const reviewBand = morningAfterPerf && !livePerf && (
    <button onClick={() => navigateToPerformance(morningAfterPerf)} style={bandButton}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <StatusLine color="var(--sl-gold-text)">
          {actingAs ? `${possessive(actingAs.artist_name)} set is in` : `Good night at ${morningAfterPerf.venue_name}`}
        </StatusLine>
        <span style={bandTitle}>{morningAfterPerf.status === 'review' ? 'Give the setlist a quick look' : 'Ready to mark submitted'}</span>
        <span style={bandSub}>
          {actingAs ? `${morningAfterPerf.venue_name}` : ''}
          {actingAs && songCountMap[morningAfterPerf.id] ? ' · ' : ''}
          {songCountMap[morningAfterPerf.id] ? `${songCountMap[morningAfterPerf.id]} songs on the setlist` : (!actingAs ? (morningAfterPerf.city || 'Last night') : '')}
        </span>
      </span>
      {chevron}
    </button>
  )

  const todayBand = todayShow && !livePerf && canCapture && (
    <button onClick={() => startShowFromBIT(todayShow)} aria-label={`Start capture at ${todayShow.venueName}`} style={bandButton}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <StatusLine color="var(--sl-ok)">{actingAs ? `${actingAs.artist_name} plays tonight` : 'Tonight'}</StatusLine>
        <span style={bandTitle}>{todayShow.venueName}</span>
        <span style={bandSub}>{formatShowTime(todayShow.datetime)}{todayShow.venueCity ? ` · ${todayShow.venueCity}` : ''}</span>
      </span>
      {chevron}
    </button>
  )

  const hasBand = !showLoading && (!!(liveBand || reviewBand || todayBand))
  const bands = hasBand && (
    <div style={{ display: 'grid', gap: 8, paddingTop: 8 }}>{liveBand}{reviewBand}{todayBand}</div>
  )

  // The one sentence under the number.
  let caption: React.ReactNode
  if (livePerf && isRealVenue(livePerf.venue_name)) {
    caption = <>When the show ends, it joins the record as <b style={{ color: 'var(--sl-text)', fontWeight: 600 }}>show {record.count + 1}</b>.</>
  } else if (!livePerf && morningAfterPerf && record.lastShow?.id === morningAfterPerf.id) {
    caption = <>{morningAfterPerf.venue_name} is on the record as <b style={{ color: 'var(--sl-text)', fontWeight: 600 }}>show {record.count}</b>.</>
  } else {
    const where = recordCities > 0 ? ` across ${recordCities} ${recordCities === 1 ? 'city' : 'cities'}` : ''
    const when = careerYears > 0 ? `${where ? ',' : ''} in ${careerYears} ${careerYears === 1 ? 'year' : 'years'} on stage` : ''
    caption = <><b style={{ color: 'var(--sl-text)', fontWeight: 600 }}>Shows on the record</b>{where}{when}.</>
  }

  // Hero size: phones as reviewed (200, or 168 under a session row, capped
  // by width); the wider layouts set --d-hero / --d-hero-band from the
  // space the content actually has (container units, not the window).
  const heroSize = hasBand ? 'var(--d-hero-band, min(168px, 48cqw))' : 'var(--d-hero, min(200px, 56cqw))'
  const overlineEl = <p style={{ fontSize: 'var(--d-ov, 14px)', fontWeight: 600, color: 'var(--sl-gold-text)', margin: '20px 0 0' }}>{overline}</p>
  const heroStyle: React.CSSProperties = { fontFamily: 'var(--sl-font-display)', fontWeight: 400, fontSize: heroSize, lineHeight: 0.8, letterSpacing: '0.005em', margin: '14px 0 0 -5px', color: 'var(--sl-text)', fontVariantNumeric: 'tabular-nums' }
  const captionStyle: React.CSSProperties = { fontSize: 'var(--d-cap, 16px)', color: 'var(--sl-text-2)', margin: '16px 0 0', lineHeight: 1.45, maxWidth: '22em' }
  const scopeNote = (lead: string) => importedPerfs.length > 0 && (
    // Says what the number counts, in the same words History uses.
    <p style={{ fontSize: 13, color: 'var(--sl-text-3)', margin: '10px 0 0', lineHeight: 1.45, maxWidth: '30em' }}>
      {lead} {importedPerfs.length} imported {importedPerfs.length === 1 ? 'show is' : 'shows are'} listed in History but not counted here.
    </p>
  )

  // Each state fills the same three areas: the poster (number + sentence),
  // the ledger, and "more" (coming up, recent shows). On phones they stack
  // in that order; with room for two columns the ledger sits beside the
  // poster, as in the approved desktop design.
  let poster: React.ReactNode = null
  let ledger: React.ReactNode = null
  if (showLoading) {
    poster = (
      <div aria-busy="true" aria-label={actingAs ? `Loading ${possessive(actingAs.artist_name)} record` : 'Loading your record'} style={{ paddingTop: 20 }}>
        <Skeleton w="40%" h={16} />
        <Skeleton w="62%" h={150} mt={16} r={14} />
        <Skeleton w="85%" h={18} mt={20} />
        <Skeleton w="60%" h={18} mt={8} />
      </div>
    )
    ledger = <div aria-hidden="true" style={{ paddingTop: 6 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={44} mt={14} />)}</div>
  } else if (loadFailed) {
    // Never the previous workspace's figures in its place — the load paths
    // above clear them before this renders.
    poster = (
      <div role="alert" style={{ paddingTop: 40, maxWidth: 560 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 8px', color: 'var(--sl-text)' }}>{actingAs ? `${possessive(actingAs.artist_name)} record didn’t load` : 'Your record didn’t load'}</h1>
        <p style={{ fontSize: 16, color: 'var(--sl-text-2)', lineHeight: 1.45, margin: '0 0 18px' }}>
          {actingAs
            ? 'Your access may have changed, or the connection dropped. Nothing from another workspace is shown in its place.'
            : 'The connection dropped before the record arrived. Your shows are safe.'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button onClick={retryLoad} style={primaryButton}>Try again</button>
          {actingAs && <button onClick={openAccountMenu} style={secondaryButton}>Switch workspace</button>}
        </div>
      </div>
    )
  } else if (record.count === 0) {
    poster = (
      <>
        {overlineEl}
        <p style={{ ...heroStyle, fontSize: 'var(--d-hero, min(200px, 56cqw))', color: 'var(--sl-text-3)' }}>0</p>
        <p style={captionStyle}>
          <b style={{ color: 'var(--sl-text)', fontWeight: 600 }}>
            {actingAs ? `The record starts with ${possessive(actingAs.artist_name)} first show.` : 'Your record starts with your first show.'}
          </b>
          {canCapture && <> Tap the gold button when the set starts. Played already? You can <Link href="/app/upload/new" style={{ color: 'var(--sl-gold-text)', fontWeight: 600 }}>upload a recording</Link>.</>}
        </p>
        {scopeNote('The live record counts shows captured or uploaded in Setlistr.')}
      </>
    )
  } else {
    poster = (
      <>
        {overlineEl}
        <p style={heroStyle}>{record.count}</p>
        <p style={captionStyle}>{caption}</p>
        {scopeNote('Counts shows captured or uploaded in Setlistr.')}
      </>
    )
    ledger = (
      <>
        <div style={{ marginTop: 'var(--d-ledger-mt, 22px)', borderTop: '1.5px solid var(--sl-text)' }}>
          {/* One dot per show, filled through the SAME count the hero shows
              (components/record/NextMilestone, shared with the celebration). */}
          <NextMilestoneRow count={record.count} />
          {!hasBand && record.lastShow && (
            <div style={rowBase}>
              <span style={rowLabel}>Last show</span>
              <span style={rowValue}>{lastShowLabel(record.lastShow.date)}</span>
            </div>
          )}
          <div style={rowBase}>
            <span style={rowLabel}>Marked submitted</span>
            <span style={rowValue}>{record.submitted} <span style={unit}>of {record.count} {record.count === 1 ? 'show' : 'shows'}</span></span>
          </div>
          {estimatesUnavailable && (
            <div style={rowBase}>
              <span style={rowLabel}>Estimated royalties<small style={rowSmall}>Song counts didn{'’'}t load, so estimates aren{'’'}t shown</small></span>
              <button onClick={retryLoad} style={{ ...secondaryButton, minHeight: 44, padding: '0 14px', fontSize: 14 }}>Try again</button>
            </div>
          )}
          {!estimatesUnavailable && lifetimeTotal > 0 && (
            <div style={rowBase}>
              <span style={rowLabel}>Estimated royalties<small style={rowSmall}>All shows with setlists</small></span>
              <span style={rowValue}>{money(lifetimeTotal)} <span style={unit}>est.</span></span>
            </div>
          )}
          {!estimatesUnavailable && aggregate.unclaimedCount > 0 && (
            // Routes to the Filing Queue — reviewing and marking these is
            // what that page is for.
            <button onClick={() => router.push('/app/file')} className="sl-hoverable" style={linkRow}>
              <span style={rowLabel}>Not yet marked submitted<small style={rowSmall}>Estimated royalties · review in Submissions</small></span>
              <span style={rowValue}>{money(aggregate.unclaimedExpected)} <span style={unit}>est.</span></span>
              {chevron}
            </button>
          )}
        </div>
        {!estimatesUnavailable && (lifetimeTotal > 0 || aggregate.unclaimedCount > 0) && (
          <p style={{ fontSize: 13, color: 'var(--sl-text-3)', margin: '12px 0 0', lineHeight: 1.45 }}>Estimates only, not guaranteed. Payouts vary by PRO.</p>
        )}
      </>
    )
  }

  const more = !showLoading && !loadFailed && (
    <>
      {/* ── Coming up: the next scheduled show, plus external listings ── */}
      {userId && (
        <>
          <h2 style={sectionHeading}>Coming up</h2>
          <div style={{ marginTop: 8 }}>
            <NextShowSummary artistId={actingAs?.artist_id || userId} />
          </div>
        </>
      )}
      {upcomingShows.length > 0 && (
        <div>
          {upcomingShows.map(event => {
            const isEventToday = isToday(event.datetime)
            const dateLabel = isEventToday ? 'Tonight' : isTomorrow(event.datetime) ? 'Tomorrow' : formatShowDate(event.datetime)
            const inner = (
              <>
                <span style={{ width: 88, flexShrink: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: isEventToday ? 'var(--sl-gold-text)' : 'var(--sl-text)' }}>{dateLabel}</span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--sl-text-3)' }}>{formatShowTime(event.datetime)}</span>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--sl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.venueName}</span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--sl-text-3)' }}>{event.venueCity}{event.venueRegion ? `, ${event.venueRegion}` : ''}</span>
                </span>
              </>
            )
            // Tapping a listing starts capture there, as before — not
            // offered to a read-only Viewer.
            return canCapture ? (
              <button key={event.id} onClick={() => startShowFromBIT(event)} aria-label={`Start capture at ${event.venueName}, ${dateLabel}`} className="sl-hoverable" style={linkRow}>
                {inner}{chevron}
              </button>
            ) : (
              <div key={event.id} style={rowBase}>{inner}</div>
            )
          })}
        </div>
      )}

      {/* ── Recent shows ── */}
      {recentPerfs.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={sectionHeading}>Recent shows</h2>
            {recordShows.length > 5 && (
              <Link href="/app/history" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 28, fontSize: 14, fontWeight: 600, color: 'var(--sl-gold-text)', textDecoration: 'none' }}>All shows</Link>
            )}
          </div>
          <div style={{ borderTop: '1px solid var(--sl-line)', marginTop: 4 }}>
            {recentPerfs.map(perf => {
              const displayStatus = getDisplayStatus(perf)
              const d = showDay(perf, perf.show_timezone)
              const songCount = songCountMap[perf.id] || 0
              const isFinished = perf.status !== 'live' && perf.status !== 'pending'
              const perfEst = isFinished && songCount > 0
                ? estimateRoyalties({ songCount, venueCapacityBand: capacityToBand(perf.venue_capacity), showType: (perf.show_type as any) || 'single', territory: isCanadian(perf.country, perf.city) ? 'CA' : 'US' })
                : null
              return (
                <button key={perf.id} onClick={() => navigateToPerformance(perf)} className="sl-hoverable" style={linkRow}>
                  <span style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: 18, fontWeight: 600, color: 'var(--sl-text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{d ? d.getDate() : '–'}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--sl-text-3)' }}>{d ? d.toLocaleDateString('en-US', { month: 'short' }) : ''}</span>
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--sl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perf.venue_name || 'Untitled show'}</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--sl-text-3)' }}>{[perf.city, songCount > 0 ? `${songCount} songs` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: displayStatus.color }}>{displayStatus.label}</span>
                    {perfEst && perfEst.expected > 0 && <span style={{ fontSize: 13, color: 'var(--sl-text-3)' }}>{money(perfEst.expected)} est.</span>}
                  </span>
                  {chevron}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )

  return (
    <div className="sl-dash" style={{ position: 'relative', minHeight: 'var(--sl-page-min-height, 100svh)', background: 'var(--sl-bg)', color: 'var(--sl-text)', fontFamily: SANS, overflow: 'hidden' }}>
      <div className="sl-dash-inner" style={{ maxWidth: 'var(--d-max, 480px)', margin: '0 auto', padding: 'var(--d-pad, 0 20px 40px)', position: 'relative' } as React.CSSProperties}>
        {/* One soft glow behind the number (Dark only; the Light token is none). */}
        <div aria-hidden="true" style={{ position: 'absolute', top: 40, left: 'var(--d-glow-left, -110px)', width: 'var(--d-glow, 440px)', height: 'var(--d-glow, 440px)', borderRadius: '50%', pointerEvents: 'none', background: 'var(--sl-hero-glow)' } as React.CSSProperties} />
        <div className="sl-dash-grid" style={{ position: 'relative' }}>
          {bands && <div className="sl-a-band">{bands}</div>}
          <div className="sl-a-poster">{poster}</div>
          {ledger && <div className="sl-a-ledger">{ledger}</div>}
          {more && <div className="sl-a-more">{more}</div>}
        </div>
      </div>

      <style>{`
        /* Layout follows the width this page actually has (the content area
           beside the desktop sidebar, or the phone screen), not the window. */
        .sl-dash { container-type: inline-size; container-name: sl-dash; }
        /* Wider single column (tablets, narrow laptop windows): desktop
           type sizes, everything still stacked. */
        @container sl-dash (min-width: 600px) {
          .sl-dash-inner {
            --d-max: 640px; --d-pad: 0 32px 56px;
            --d-label: 15px; --d-value: 17px; --d-row: 60px; --d-cap: 18px; --d-ov: 15px; --d-band: 76px;
            --d-dot: 10px; --d-dot-gap: 5px;
            --d-hero: clamp(160px, 40cqw, 260px); --d-hero-band: clamp(160px, 40cqw, 260px);
          }
        }
        /* Room for the approved two-column composition: poster | ledger. */
        @container sl-dash (min-width: 900px) {
          .sl-dash-inner {
            --d-max: 1120px; --d-pad: 0 48px 64px; --d-ledger-mt: 6px;
            --d-hero: clamp(160px, 26cqw, 300px); --d-hero-band: clamp(160px, 26cqw, 300px);
            --d-glow: 760px; --d-glow-left: 120px;
          }
          .sl-dash-grid {
            display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 440px); column-gap: 72px;
            grid-template-areas: "band band" "poster ledger" "more ledger"; grid-template-rows: auto auto 1fr;
            align-items: start; padding-top: 8px;
          }
          .sl-a-band { grid-area: band; margin-bottom: 12px; }
          .sl-a-poster { grid-area: poster; }
          .sl-a-ledger { grid-area: ledger; padding-top: 20px; }
          .sl-a-more { grid-area: more; }
        }
      `}</style>
    </div>
  )
}
