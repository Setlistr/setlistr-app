'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, ChevronLeft, Music2, DollarSign } from 'lucide-react'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'
import { useActingAs } from '@/components/ActingAsProvider'
import { isRealVenue } from '@/lib/performance-status'
import { computeFilingStatus, type FilingStatusResult } from '@/lib/filing-status'
import { loadFilingProfile } from '@/lib/load-filing-profile'
import { readClaimInputs } from '@/lib/claim-inputs-storage'
import { countsFromRows } from '@/lib/submissions-nav-counts'
import { SubmissionsSwitcher } from '@/components/SubmissionsSwitcher'
import { SubmissionEntryRow, SubmissionRowsSkeleton, SubmissionListError, CountChipPlaceholder } from '@/components/SubmissionEntryRow'
import { useWorkspaceRole } from '@/components/layout/WorkspaceRole'

const CARD = {
  background: 'var(--sl-card-bg)',
  boxShadow: 'var(--sl-card-inset)',
}

const C = {
  bg: 'var(--sl-bg)', card: 'var(--sl-surface)', cardHover: 'var(--sl-surface-2)',
  border: 'color-mix(in srgb, var(--sl-text) 7%, transparent)', borderGold: 'color-mix(in srgb, var(--sl-accent) 30%, transparent)',
  // secondary/muted match app/app/file and SubmissionEntryRow's own
  // tokens — previously darker here specifically, which meant lower
  // text contrast on this page than its Submissions sibling for no
  // reason tied to this page's own content.
  input: 'var(--sl-input-bg)', text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)',
  gold: 'var(--sl-accent)', goldDim: 'color-mix(in srgb, var(--sl-accent) 10%, transparent)',
  green: 'var(--sl-ok)', greenDim: 'color-mix(in srgb, var(--sl-ok) 8%, transparent)',
  red: 'var(--sl-danger)', redDim: 'color-mix(in srgb, var(--sl-danger) 8%, transparent)',
  blue: 'var(--sl-info)', blueDim: 'color-mix(in srgb, var(--sl-info) 10%, transparent)',
}

type Performance = {
  id:                string
  venue_name:        string
  artist_name:       string
  city:              string
  country:           string
  status:            string
  submission_status: string | null
  started_at:        string
  created_at:        string
  venue_capacity?:   number | null
  show_type?:        string | null
  song_count?:       number
  captured_by_name?: string | null
  venue_id?:         string | null
  photo_url?:        string | null
  data_source?:      string | null
  // The actual filing-readiness result — the SAME computeFilingStatus()
  // app/app/file (Filing Queue) uses, so "Ready to submit" means the same rule on
  // both screens. A show whose setlist still needs review, or whose PRO/identity/
  // required details aren't filled in, is 'needs_review' here exactly like
  // it is on the Filing Queue — not "Ready to submit" merely because its
  // raw `status` says complete/completed/exported.
  filing: FilingStatusResult
}

function getDisplayStatus(p: Performance): { label: string; color: string } {
  // 'submitted' is purely the artist's own self-reported action — Setlistr
  // never files with a PRO or verifies receipt (see markSubmitted() in
  // app/app/submit/[id]/page.tsx). "Marked Submitted" says exactly that;
  // "Submitted" on its own reads as if someone/something confirmed it.
  if (p.submission_status === 'submitted') return { label: 'Marked Submitted', color: C.green }
  if (p.status === 'live' || p.status === 'pending') return { label: 'Live', color: C.red }
  if (p.filing.state === 'ready') return { label: 'Ready to submit', color: 'var(--sl-gold-text)' }
  // Same quiet text colour the Filing Queue uses for this state, so it
  // reads differently from Ready to submit (gold) at a glance.
  return { label: 'Needs Review', color: C.secondary }
}

function getTerritory(country?: string, city?: string): string {
  const s = ((country || '') + ' ' + (city || '')).toLowerCase()
  if (s.includes('canada') || s.includes('ontario') || s.includes('british columbia')
    || s.includes('alberta') || s.includes('quebec') || s.includes('toronto')
    || s.includes('vancouver') || s.includes('montreal') || s.trim() === 'ca') return 'CA'
  return 'US'
}

const NO_PERFORMANCES: Performance[] = []
const SR_ONLY: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

export default function HistoryPage() {
  const router = useRouter()
  const { actingAs, actingAsArtistId, resolved } = useActingAs()
  const [loadedPerformances, setPerformances] = useState<Performance[]>([])
  const [filtered, setFiltered]         = useState<Performance[]>([])
  // The list is shown only while the workspace it was loaded for is still
  // the active one — switching artists never shows the previous artist's
  // shows or counts, and a slow response for an old workspace is ignored.
  const workspaceKey = actingAsArtistId || 'own'
  const [loaded, setLoaded] = useState<{ key: string; status: 'ok' | 'error' } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const ready  = loaded?.key === workspaceKey && loaded.status === 'ok'
  const failed = loaded?.key === workspaceKey && loaded.status === 'error'
  const performances = ready ? loadedPerformances : NO_PERFORMANCES
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [showFilters, setShowFilters]   = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [deletePending, setDeletePending] = useState<string | null>(null)
  const deletePendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deletingIds, setDeletingIds]     = useState<Record<string, boolean>>({})
  const [deleteErrors, setDeleteErrors]   = useState<Record<string, string>>({})
  const [undoBanner, setUndoBanner]       = useState<{ id: string; venueName: string } | null>(null)
  const undoBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [undoing, setUndoing]             = useState(false)
  const [undoError, setUndoError]         = useState('')
  // Delete controls live behind Edit, which only accounts that can write in
  // this workspace see (Viewers and unknown roles never do — the delete
  // route already refuses them; this just stops offering a dead end).
  const { canWrite } = useWorkspaceRole()
  const [editing, setEditing]             = useState(false)

  async function loadPerformances(isCancelled: () => boolean) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const key = actingAsArtistId || 'own'

    // Same profile fetch (and the same owner/delegate identity-privacy
    // boundary) app/app/file (Filing Queue) uses — see
    // lib/load-filing-profile.ts. Fails closed to "no PRO selected" rather
    // than crashing the page if the delegate-context lookup errors, since
    // that's the same as any other case computeFilingStatus already
    // treats as not-yet-ready.
    // The profile and the show list are fetched together (neither needs
    // the other), after the single sign-in check above.
    const filingCtxPromise = loadFilingProfile(supabase, actingAs, user.id).catch(e => {
      console.error('History: filing profile load failed:', e)
      return { profile: { pro_affiliation: null, legal_name: null, ipi_number: null }, isDelegate: !!actingAsArtistId }
    })

    const perfQuery = supabase
      .from('performances_visible')
      .select('id, venue_name, venue_id, artist_name, city, country, status, submission_status, started_at, created_at, captured_by_name, photo_url, data_source, shows(show_type), venues(capacity)')
      .eq('user_id', actingAsArtistId || user.id)
      .not('status', 'in', '("live","pending")')
      // Excludes Upload Performance drafts (status='draft', created the
      // instant a file is picked, before any metadata/songs exist — see
      // app/api/upload-performance's POST). Today these are only kept off
      // this page by the isRealVenue(venue_name) filter below, since a
      // draft's venue_name is always '' — that's an incidental side effect
      // of a filter meant for something else, not a designed guarantee.
      // Excluding by status directly closes the actual gap at the source.
      .neq('status', 'draft')
      .order('started_at', { ascending: false })

    const [filingCtx, { data, error }] = await Promise.all([filingCtxPromise, perfQuery])
    // A failed request shows the error with Try again — never an empty
    // "Your record starts tonight".
    if (error) throw error

    if (data) {
      const perfIds = data.map((p: any) => p.id)
      const { data: songData, error: songError } = perfIds.length > 0
        ? await supabase
          .from('performance_songs_visible')
          .select('performance_id')
          .in('performance_id', perfIds)
        : { data: [], error: null }
      if (songError) throw songError

      const countMap: Record<string, number> = {}
      songData?.forEach((s: any) => { countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1 })

      const clean: Performance[] = data
        .filter((p: any) => isRealVenue(p.venue_name))
        .map((p: any) => {
          const songCount = countMap[p.id] || 0
          const claimInputs = readClaimInputs(p.id)
          const filing = computeFilingStatus(
            {
              status: p.status,
              submission_status: p.submission_status || null,
              started_at: p.started_at,
              city: p.city || null,
              venue_city: null,
              venue_capacity: p.venues?.capacity || null,
            },
            songCount, filingCtx.profile, filingCtx.isDelegate, claimInputs,
          )
          return {
            id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
            city: p.city, country: p.country, status: p.status,
            submission_status: p.submission_status || null,
            started_at: p.started_at, created_at: p.created_at,
            venue_capacity: p.venues?.capacity || null,
            show_type: p.shows?.show_type || 'single',
            song_count: songCount,
            captured_by_name: p.captured_by_name || null,
            venue_id: p.venue_id || null,
            photo_url: p.photo_url || null,
            data_source: p.data_source || null,
            filing,
          }
        })

      if (isCancelled()) return
      setPerformances(clean)
      setFiltered(clean)
      setLoaded({ key, status: 'ok' })
    }
  }

  useEffect(() => {
    if (!resolved) return
    let cancelled = false
    const key = actingAsArtistId || 'own'
    loadPerformances(() => cancelled).catch(err => {
      console.error('History load failed:', err)
      if (!cancelled) setLoaded({ key, status: 'error' })
    })
    return () => { cancelled = true }
  }, [resolved, actingAsArtistId, reloadToken])

  // Nothing armed or pending carries over to another artist's workspace.
  useEffect(() => {
    setEditing(false)
    setDeletePending(null)
    setDeleteErrors({})
    setUndoBanner(null)
  }, [workspaceKey])

  function retry() { setLoaded(null); setReloadToken(t => t + 1) }

  // The switcher's counts come from this page's own show list (the same
  // definitions lib/submissions-nav-counts applies — this list already
  // excludes only rows neither count includes), so they need no second
  // fetch and stay current after a delete.
  const navCounts = ready ? countsFromRows(loadedPerformances) : null

  function handleDeleteTap(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (deletePending === id) {
      if (deletePendingTimerRef.current) clearTimeout(deletePendingTimerRef.current)
      setDeletePending(null)
      deletePerformance(id)
    } else {
      if (deletePendingTimerRef.current) clearTimeout(deletePendingTimerRef.current)
      setDeletePending(id)
      deletePendingTimerRef.current = setTimeout(() => setDeletePending(null), 2500)
    }
  }

  async function deletePerformance(id: string) {
    const target = performances.find(p => p.id === id)
    setDeletingIds(prev => ({ ...prev, [id]: true }))
    setDeleteErrors(prev => ({ ...prev, [id]: '' }))
    try {
      const res = await fetch(`/api/performances/${id}/delete`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setDeleteErrors(prev => ({ ...prev, [id]: data.error || 'Failed to delete' }))
        setDeletingIds(prev => ({ ...prev, [id]: false }))
        return
      }
      setPerformances(prev => prev.filter(p => p.id !== id))
      setDeletingIds(prev => ({ ...prev, [id]: false }))
      if (undoBannerTimerRef.current) clearTimeout(undoBannerTimerRef.current)
      setUndoError('')
      setUndoBanner({ id, venueName: target?.venue_name || 'Show' })
      undoBannerTimerRef.current = setTimeout(() => setUndoBanner(null), 8000)
    } catch {
      setDeleteErrors(prev => ({ ...prev, [id]: 'Network error — try again' }))
      setDeletingIds(prev => ({ ...prev, [id]: false }))
    }
  }

  async function undoDelete() {
    if (!undoBanner) return
    setUndoing(true)
    setUndoError('')
    try {
      const res = await fetch(`/api/performances/${undoBanner.id}/delete/undo`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setUndoError(data.error || 'Failed to undo')
        setUndoing(false)
        return
      }
      if (undoBannerTimerRef.current) clearTimeout(undoBannerTimerRef.current)
      setUndoBanner(null)
      setUndoing(false)
      // Refresh in place: the current list stays until the new one arrives.
      setReloadToken(t => t + 1)
    } catch {
      setUndoError('Network error — try again')
      setUndoing(false)
    }
  }

  useEffect(() => {
    let result = [...performances]
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.venue_name?.toLowerCase().includes(q) ||
        p.artist_name?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter(p => {
        if (statusFilter === 'submitted') return p.filing.state === 'submitted'
        if (statusFilter === 'review')    return p.filing.state === 'needs_review'
        if (statusFilter === 'complete')  return p.filing.state === 'ready'
        return true
      })
    }
    if (dateFrom) result = result.filter(p => (p.started_at || p.created_at) >= dateFrom)
    if (dateTo)   result = result.filter(p => (p.started_at || p.created_at) <= dateTo + 'T23:59:59')
    setFiltered(result)
  }, [search, dateFrom, dateTo, statusFilter, performances])

  function clearFilters() { setSearch(''); setDateFrom(''); setDateTo(''); setStatusFilter('all') }

  function navigateTo(p: Performance) {
    if (p.submission_status === 'submitted') router.push(`/app/submit/${p.id}`)
    else if (p.status === 'live' || p.status === 'pending') router.push(`/app/live/${p.id}`)
    else router.push(`/app/review/${p.id}`)
  }

  const hasFilters = search || dateFrom || dateTo || statusFilter !== 'all'

  // This list's scope is unchanged: it includes imported (setlist.fm)
  // history. The dashboard's live record does not — so say how the "N
  // shows" here splits, in the same words the dashboard uses.
  const importedCount = performances.filter(p => p.data_source === 'setlistfm_imported').length

  // counts, the banner below, and the "File them" action all key off the
  // exact same p.filing.state computeFilingStatus() produced — the same
  // rule the Filing Queue uses. A show still needing its setlist reviewed
  // or a required filing detail filled in is 'needs_review' here too, not
  // "Ready to submit" just because its raw status says complete.
  const counts = {
    all:       performances.length,
    review:    performances.filter(p => p.filing.state === 'needs_review').length,
    complete:  performances.filter(p => p.filing.state === 'ready').length,
    submitted: performances.filter(p => p.filing.state === 'submitted').length,
  }

  // Same population as the "Ready to submit" tab above — computeFilingStatus
  // already requires songs > 0 for 'ready', so no separate song_count check
  // is needed here to keep this in lockstep with that count.
  const unclaimedShows = performances.filter(p => p.filing.state === 'ready')

  const totalUnclaimed = unclaimedShows.reduce((sum, p) => {
    const est = estimateRoyalties({
      songCount: p.song_count || 0,
      venueCapacityBand: capacityToBand(p.venue_capacity),
      showType: (p.show_type as any) || 'single',
      territory: getTerritory(p.country, p.city),
    })
    return sum + est.expected
  }, 0)

  return (
    <div style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'var(--sl-page-glow)' }} />

      <div className="subm-page" style={{ padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        {/* Wraps the count chip under the title when the row can't fit it
           (larger text sizes, narrow phones) instead of overflowing. */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 12, rowGap: 8, padding: '20px 0 24px' }}>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.secondary, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', flex: '1 1 auto', minWidth: 0 }}>
            Your Record
          </h1>
          <div style={{ fontSize: 13, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '5px 10px', whiteSpace: 'nowrap' as const }}>
            {ready ? `${performances.length} shows` : <CountChipPlaceholder />}
          </div>
        </div>

        {importedCount > 0 && (
          <p style={{ fontSize: 13, color: C.secondary, margin: '-12px 0 16px', lineHeight: 1.5 }}>
            {performances.length - importedCount} on your live record · {importedCount} imported (not counted on the dashboard)
          </p>
        )}

        <SubmissionsSwitcher active="history" filingQueueCount={navCounts?.filingQueueCount} fullHistoryCount={navCounts?.fullHistoryCount} />

        {/* ── Undo banner ── */}
        {undoBanner && (
          <div style={{ marginBottom: 16, background: 'color-mix(in srgb, var(--sl-info) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-info) 20%, transparent)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <p style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.secondary, margin: 0 }}>
              {undoBanner.venueName} deleted
            </p>
            {undoError && <span style={{ fontSize: 12, color: C.red, flexShrink: 0 }}>{undoError}</span>}
            <button onClick={undoDelete} disabled={undoing}
              style={{ flexShrink: 0, background: 'none', border: 'none', color: C.blue, fontSize: 13, fontWeight: 700, cursor: undoing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: undoing ? 0.6 : 1, padding: 0 }}>
              {undoing ? 'Undoing…' : 'Undo'}
            </button>
          </div>
        )}

        {/* ── Unclaimed earnings banner ── */}
        {unclaimedShows.length > 0 && (
          <div style={{ marginBottom: 16, background: 'color-mix(in srgb, var(--sl-accent) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-accent) 15%, transparent)', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DollarSign size={18} style={{ color: C.gold }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: '0 0 2px' }}>
                ~${totalUnclaimed.toLocaleString()} unclaimed
              </p>
              <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>
                {unclaimedShows.length} show{unclaimedShows.length !== 1 ? 's' : ''} ready to submit to your PRO
              </p>
              <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>Estimate only, not guaranteed — actual payouts vary by PRO.</p>
            </div>
            <button
              onClick={() => setStatusFilter('complete')}
              style={{ flexShrink: 0, padding: '10px 16px', background: C.gold, border: 'none', borderRadius: 10, color: 'var(--sl-on-accent)', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'opacity 0.15s ease' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
              File them →
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search venue, artist, or city..."
              style={{ width: '100%', background: C.card, border: `1px solid ${search ? 'var(--sl-input-line-active)' : 'var(--sl-input-line)'}`, borderRadius: 12, padding: '13px 16px 13px 44px', color: C.text, fontSize: 16, fontFamily: 'inherit', transition: 'border-color 0.15s ease', boxSizing: 'border-box' as const }} />
          </div>

          {/* Status tabs — paddingRight (not just gap) so the last chip
             gets real breathing room at the scrolled-end edge instead of
             sitting flush against it, which read as "cut off" even though
             the row was already scrollable. className hides the native
             horizontal scrollbar (globals.css's ::-webkit-scrollbar rule
             is sized for a thin vertical thumb — width:4px, no height —
             so a horizontal track here rendered at the browser's default,
             much thicker height, all in the same gold thumb color: a
             heavy gold bar sitting right under the filters). Touch/trackpad
             scrolling and every filter stay reachable — only the visible
             track/thumb is hidden, not the scroll behavior itself. */}
          <div className="subm-filter-scroll" style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' as const, paddingRight: 16, WebkitOverflowScrolling: 'touch' as const }}>
            {([
              { key: 'all',       label: 'All',             color: C.muted,  count: counts.all },
              { key: 'review',    label: 'Needs Review',    color: C.gold,   count: counts.review },
              { key: 'complete',  label: 'Ready to submit', color: C.gold,   count: counts.complete },
              { key: 'submitted', label: 'Marked Submitted', color: C.green,  count: counts.submitted },
            ] as const).map(tab => {
              const active = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 20, border: `1px solid ${active ? `color-mix(in srgb, ${tab.color} 38%, transparent)` : C.border}`, background: active ? `color-mix(in srgb, ${tab.color} 8%, transparent)` : 'transparent', color: active ? tab.color : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s ease', letterSpacing: '0.04em' }}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ fontSize: 12, background: active ? `color-mix(in srgb, ${tab.color} 15%, transparent)` : 'color-mix(in srgb, var(--sl-text) 6%, transparent)', borderRadius: 10, padding: '1px 5px', color: active ? tab.color : C.muted }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setShowFilters(!showFilters)}
              style={{ background: showFilters ? C.goldDim : 'transparent', border: `1px solid ${showFilters ? C.borderGold : C.border}`, borderRadius: 8, padding: '7px 12px', color: showFilters ? C.gold : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: 'inherit' }}>
              Date Range {showFilters ? '▲' : '▼'}
            </button>
            {hasFilters && <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Clear ×</button>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{ready ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : ''}</span>
            {canWrite && performances.length > 0 && (
              <button onClick={() => { setEditing(v => !v); setDeletePending(null) }} aria-pressed={editing}
                style={{ minHeight: 36, background: 'none', border: 'none', padding: '0 0 0 6px', color: editing ? 'var(--sl-gold-text)' : C.secondary, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {editing ? 'Done' : 'Edit'}
              </button>
            )}
          </div>

          {showFilters && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {[{ label: 'From', value: dateFrom, set: setDateFrom }, { label: 'To', value: dateTo, set: setDateTo }].map(({ label, value, set }) => (
                <div key={label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 700 }}>{label}</label>
                  <input type="date" value={value} onChange={e => set(e.target.value)}
                    style={{ width: '100%', background: C.input, border: `1px solid ${value ? 'var(--sl-input-line-active)' : 'var(--sl-input-line)'}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', colorScheme: 'var(--sl-scheme)', boxSizing: 'border-box' as const }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ paddingBottom: 48 }}>
          {!ready && !failed ? (
            <div aria-busy="true">
              <span role="status" style={SR_ONLY}>{actingAs ? `Loading ${actingAs.artist_name}'s shows` : 'Loading your shows'}</span>
              <SubmissionRowsSkeleton variant="history" />
            </div>
          ) : failed ? (
            <SubmissionListError message={actingAs ? `Couldn't load ${actingAs.artist_name}'s shows.` : "Couldn't load your shows."} onRetry={retry} />
          ) : filtered.length === 0 ? (
            <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '52px 20px', textAlign: 'center', boxShadow: CARD.boxShadow }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Music2 size={20} style={{ color: C.gold }} />
              </div>
              <p style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
                {hasFilters ? 'No shows match your filters' : 'Your record starts tonight.'}
              </p>
              <p style={{ fontSize: 15, color: C.muted, margin: '0 0 18px' }}>
                {hasFilters ? 'Try adjusting your search or filters' : 'Every show you capture lands here — reviewed, filed, and building your record.'}
              </p>
              {!hasFilters && (
                <button onClick={() => router.push('/app/show/new')}
                  style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '13px 24px', color: C.gold, fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: 'inherit', transition: 'opacity 0.15s ease' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
                  Start First Show →
                </button>
              )}
            </div>
          ) : (
            <div className="subm-list">
              {filtered.map((perf) => {
                const displayStatus  = getDisplayStatus(perf)
                const dateStr        = perf.started_at || perf.created_at
                const date           = new Date(dateStr)
                const isClaimable    = perf.filing.state === 'ready'
                const est            = isClaimable ? estimateRoyalties({
                  songCount: perf.song_count || 0,
                  venueCapacityBand: capacityToBand(perf.venue_capacity),
                  showType: (perf.show_type as any) || 'single',
                  territory: getTerritory(perf.country, perf.city),
                }) : null

                const isPendingDel = deletePending === perf.id
                const isDeleting   = !!deletingIds[perf.id]

                return (
                  <div key={perf.id}>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
                    {/* Shared row (history variant): the show leads, then
                       city and songs, then status with any estimate. The
                       dot is filled only for Marked Submitted (green). */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SubmissionEntryRow
                        variant="history"
                        onNavigate={() => navigateTo(perf)}
                        disabled={isPendingDel || isDeleting}
                        photoUrl={perf.photo_url}
                        day={date.toLocaleDateString('en-US', { day: 'numeric' })}
                        month={date.toLocaleDateString('en-US', { month: 'short' })}
                        venueName={perf.venue_name}
                        metaLine={isPendingDel ? 'Tap Delete again to remove this show' : [perf.city, (perf.song_count || 0) > 0 ? `${perf.song_count} songs` : null].filter(Boolean).join(' · ')}
                        estimate={est?.expected}
                        statusLabel={displayStatus.label}
                        statusTextColor={displayStatus.color}
                        dotFilled={displayStatus.color === C.green}
                      />
                    </div>

                    {/* Delete — only while editing, and never for a Viewer
                        (Edit isn't offered to them). A sibling of the row,
                        never nested in it. Tap once to arm, again to delete;
                        the undo banner above is unchanged. */}
                    {editing && canWrite && (
                      <button onClick={e => handleDeleteTap(e, perf.id)} disabled={isDeleting}
                        aria-label={isPendingDel ? `Confirm delete ${perf.venue_name}` : `Delete ${perf.venue_name}`}
                        style={{
                          flexShrink: 0, alignSelf: 'center',
                          minWidth: 44, minHeight: 44,
                          background: isPendingDel ? 'color-mix(in srgb, var(--sl-danger) 15%, transparent)' : 'transparent',
                          border: isPendingDel ? '1px solid color-mix(in srgb, var(--sl-danger) 35%, transparent)' : 'none',
                          borderRadius: 8,
                          color: isPendingDel ? 'var(--sl-danger)' : C.secondary,
                          cursor: isDeleting ? 'not-allowed' : 'pointer',
                          padding: isPendingDel ? '0 10px' : 0,
                          fontSize: isPendingDel ? 12 : 16, fontWeight: isPendingDel ? 700 : 400,
                          opacity: isDeleting ? 0.4 : 1, transition: 'all 0.15s ease',
                          fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent', whiteSpace: 'nowrap' as const,
                        }}>
                        {isPendingDel ? 'Delete?' : '✕'}
                      </button>
                    )}
                  </div>
                    {deleteErrors[perf.id] && (
                      <p style={{ fontSize: 11, color: C.red, margin: '4px 0 0 14px' }}>{deleteErrors[perf.id]}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: var(--sl-text-3); }
        input:focus { border-color: var(--sl-input-line-active) !important; outline: none; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }

        /* Shared with app/app/file — one calm, readable column at every
           width, not a card grid. Grows only to a comfortable reading
           measure on larger screens, not to fill the viewport. */
        .subm-page { max-width: 480px; margin: 0 auto; }
        @media (min-width: 768px) { .subm-page { max-width: 700px; } }
        .subm-list { display: flex; flex-direction: column; }

        /* Hides only the visible scrollbar track/thumb on the status-tab
           row — scroll behavior and reachability of every filter are
           untouched, this is purely cosmetic. */
        .subm-filter-scroll::-webkit-scrollbar { display: none; }
        .subm-filter-scroll { scrollbar-width: none; }
      `}</style>
    </div>
  )
}
