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
import { loadSubmissionsNavCounts, type SubmissionsNavCounts } from '@/lib/submissions-nav-counts'
import { SubmissionsSwitcher } from '@/components/SubmissionsSwitcher'
import { SubmissionEntryRow } from '@/components/SubmissionEntryRow'

const CARD = {
  background: 'linear-gradient(180deg, #171512 0%, #121009 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.1)',
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
  // The actual filing-readiness result — the SAME computeFilingStatus()
  // app/app/file (Filing Queue) uses, so "Ready to Claim" here and "Ready
  // to file" there are never two different rules wearing two different
  // names. A show whose setlist still needs review, or whose PRO/identity/
  // required details aren't filled in, is 'needs_review' here exactly like
  // it is on the Filing Queue — not "Ready to Claim" merely because its
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
  if (p.filing.state === 'ready') return { label: 'Ready to Claim', color: C.gold }
  return { label: 'Needs Review', color: C.gold }
}

function getTerritory(country?: string, city?: string): string {
  const s = ((country || '') + ' ' + (city || '')).toLowerCase()
  if (s.includes('canada') || s.includes('ontario') || s.includes('british columbia')
    || s.includes('alberta') || s.includes('quebec') || s.includes('toronto')
    || s.includes('vancouver') || s.includes('montreal') || s.trim() === 'ca') return 'CA'
  return 'US'
}

export default function HistoryPage() {
  const router = useRouter()
  const { actingAs, actingAsArtistId, resolved } = useActingAs()
  const [performances, setPerformances] = useState<Performance[]>([])
  const [filtered, setFiltered]         = useState<Performance[]>([])
  const [loading, setLoading]           = useState(true)
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
  const [navCounts, setNavCounts]         = useState<SubmissionsNavCounts | null>(null)

  async function loadPerformances() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Same profile fetch (and the same owner/delegate identity-privacy
    // boundary) app/app/file (Filing Queue) uses — see
    // lib/load-filing-profile.ts. Fails closed to "no PRO selected" rather
    // than crashing the page if the delegate-context lookup errors, since
    // that's the same as any other case computeFilingStatus already
    // treats as not-yet-ready.
    let filingCtx
    try {
      filingCtx = await loadFilingProfile(supabase, actingAs)
    } catch (e) {
      console.error('History: filing profile load failed:', e)
      filingCtx = { profile: { pro_affiliation: null, legal_name: null, ipi_number: null }, isDelegate: !!actingAsArtistId }
    }

    const { data, error } = await supabase
      .from('performances_visible')
      .select('id, venue_name, venue_id, artist_name, city, country, status, submission_status, started_at, created_at, captured_by_name, photo_url, shows(show_type), venues(capacity)')
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

    if (error) console.error('History error:', error)

    if (data) {
      const perfIds = data.map((p: any) => p.id)
      const { data: songData } = await supabase
        .from('performance_songs_visible')
        .select('performance_id')
        .in('performance_id', perfIds)

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
            filing,
          }
        })

      setPerformances(clean)
      setFiltered(clean)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!resolved) return
    loadPerformances()
  }, [resolved, actingAsArtistId])

  // Independent of the main list load, for the Filing Queue / Full History
  // switcher at the top — never blocks the page's own content on a second
  // round trip; renders with a placeholder until this resolves.
  useEffect(() => {
    if (!resolved) return
    setNavCounts(null)
    loadSubmissionsNavCounts(createClient(), actingAs)
      .then(setNavCounts)
      .catch(err => console.error('[History] nav counts failed:', err))
  }, [resolved, actingAsArtistId])

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
      await loadPerformances()
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

  // counts, the banner below, and the "File them" action all key off the
  // exact same p.filing.state computeFilingStatus() produced — the same
  // rule the Filing Queue uses. A show still needing its setlist reviewed
  // or a required filing detail filled in is 'needs_review' here too, not
  // "Ready to Claim" just because its raw status says complete.
  const counts = {
    all:       performances.length,
    review:    performances.filter(p => p.filing.state === 'needs_review').length,
    complete:  performances.filter(p => p.filing.state === 'ready').length,
    submitted: performances.filter(p => p.filing.state === 'submitted').length,
  }

  // Same population as the "Ready to Claim" tab above — computeFilingStatus
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

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>Loading</span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />

      <div className="subm-page" style={{ padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 0 24px' }}>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.secondary, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', flex: 1 }}>
            Your Record
          </h1>
          <div style={{ fontSize: 13, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '5px 10px' }}>
            {performances.length} shows
          </div>
        </div>

        <SubmissionsSwitcher active="history" filingQueueCount={navCounts?.filingQueueCount} fullHistoryCount={navCounts?.fullHistoryCount} />

        {/* ── Undo banner ── */}
        {undoBanner && (
          <div style={{ marginBottom: 16, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <div style={{ marginBottom: 16, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <DollarSign size={18} color={C.gold} />
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
              style={{ flexShrink: 0, padding: '10px 16px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'opacity 0.15s ease' }}
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
              style={{ width: '100%', background: C.card, border: `1px solid ${search ? C.borderGold : C.border}`, borderRadius: 12, padding: '13px 16px 13px 44px', color: C.text, fontSize: 16, fontFamily: 'inherit', transition: 'border-color 0.15s ease', boxSizing: 'border-box' as const }} />
          </div>

          {/* Status tabs — paddingRight (not just gap) so the last chip
             gets real breathing room at the scrolled-end edge instead of
             sitting flush against it, which read as "cut off" even though
             the row was already scrollable. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' as const, paddingRight: 16, WebkitOverflowScrolling: 'touch' as const }}>
            {([
              { key: 'all',       label: 'All',             color: C.muted,  count: counts.all },
              { key: 'review',    label: 'Needs Review',    color: C.gold,   count: counts.review },
              { key: 'complete',  label: 'Ready to Claim',  color: C.gold,   count: counts.complete },
              { key: 'submitted', label: 'Marked Submitted', color: C.green,  count: counts.submitted },
            ] as const).map(tab => {
              const active = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 20, border: `1px solid ${active ? tab.color + '60' : C.border}`, background: active ? tab.color + '15' : 'transparent', color: active ? tab.color : C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s ease', letterSpacing: '0.04em' }}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ fontSize: 12, background: active ? tab.color + '25' : 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 5px', color: active ? tab.color : C.muted }}>
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
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {showFilters && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              {[{ label: 'From', value: dateFrom, set: setDateFrom }, { label: 'To', value: dateTo, set: setDateTo }].map(({ label, value, set }) => (
                <div key={label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: C.muted, display: 'block', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 700 }}>{label}</label>
                  <input type="date" value={value} onChange={e => set(e.target.value)}
                    style={{ width: '100%', background: C.input, border: `1px solid ${value ? C.borderGold : C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', colorScheme: 'dark' as const, boxSizing: 'border-box' as const }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ paddingBottom: 48 }}>
          {filtered.length === 0 ? (
            <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '52px 20px', textAlign: 'center', boxShadow: CARD.boxShadow }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <Music2 size={20} color={C.gold} />
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
                    {/* Shared with app/app/file's Filing Queue rows — same
                       date+venue line, same city/songs+status line. Your
                       Record's own purpose (the $ estimate, and statuses
                       that include Marked Submitted) stays visible via the
                       component's optional slots rather than a different
                       row shape. */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SubmissionEntryRow
                        onNavigate={() => navigateTo(perf)}
                        disabled={isPendingDel || isDeleting}
                        emphasized={isClaimable}
                        photoUrl={perf.photo_url}
                        dateLabel={date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        venueName={perf.venue_name}
                        metaLine={isPendingDel ? 'Tap ✕ again to delete' : [perf.city, (perf.song_count || 0) > 0 ? `${perf.song_count} songs` : null].filter(Boolean).join(' · ')}
                        estimate={est?.expected}
                        statusLabel={displayStatus.label}
                        statusColor={displayStatus.color}
                        statusDotFilled={displayStatus.color === C.green || perf.filing.state === 'ready'}
                      />
                    </div>

                    {/* Delete control — sibling, not nested; small and
                        quiet at rest (a full bordered pill sitting fully
                        exposed on every row read as clutter), still a
                        visible tap target, red pill only once armed — the
                        tap-to-arm/confirm safety is unchanged. */}
                    <button onClick={e => handleDeleteTap(e, perf.id)} disabled={isDeleting}
                        style={{
                          flexShrink: 0,
                          alignSelf: 'center',
                          background: isPendingDel ? 'rgba(220,38,38,0.15)' : 'transparent',
                          border: isPendingDel ? '1px solid rgba(220,38,38,0.35)' : 'none',
                          borderRadius: 6,
                          color: isPendingDel ? '#f87171' : 'rgba(160,144,112,0.55)',
                          cursor: isDeleting ? 'not-allowed' : 'pointer',
                          padding: isPendingDel ? '4px 8px' : '4px 6px',
                          fontSize: isPendingDel ? 11 : 14,
                          lineHeight: 1,
                          opacity: isDeleting ? 0.4 : 1,
                          fontWeight: isPendingDel ? 700 : 400,
                          transition: 'all 0.15s ease',
                          fontFamily: 'inherit',
                          WebkitTapHighlightColor: 'transparent',
                          whiteSpace: 'nowrap' as const,
                        }}>
                        {isPendingDel ? '✕ Delete?' : '✕'}
                      </button>
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
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }

        /* Shared with app/app/file — see that page's own copy of this
           block for why: a phone-width centered column wasted the
           available width on desktop, and the row itself never needs to
           reflow internally to fix that. */
        .subm-page { max-width: 480px; margin: 0 auto; }
        @media (min-width: 640px) { .subm-page { max-width: 720px; } }
        @media (min-width: 1024px) { .subm-page { max-width: 1100px; } }
        .subm-list { display: flex; flex-direction: column; gap: 6px; }
        @media (min-width: 768px) {
          .subm-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; align-items: start; }
        }
        @media (min-width: 1280px) {
          .subm-list { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>
    </div>
  )
}
