'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Calendar, X, Pencil, Play, RefreshCw, AlertCircle, MoreVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { zonedLocalTimeToUtc, utcToZonedParts } from '@/lib/scheduleTime'
import { getTimezoneOptions, labelForZone } from '@/lib/timezoneLabels'
import tzLookup from 'tz-lookup'

const C = {
  bg: '#0a0908', card: '#141210', card2: '#1a1814', border: 'rgba(255,255,255,0.08)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80', red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

type ScheduledShow = {
  id: string; name: string | null; show_type: string; scheduled_at: string; timezone: string
  status: string; created_by: string; updated_at: string; venue_id: string | null
  scheduled_by: string | null; scheduled_by_name: string | null
  venues: { name: string; city: string | null; country: string | null } | null
}
type Venue = { id: string; name: string; city: string | null; country: string | null; latitude?: number | null; longitude?: number | null }

function dayLabel(dateStr: string): string {
  const today = new Date(); const d = new Date(dateStr + 'T00:00:00')
  const diffDays = Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function timeLabel(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

// The real abbreviation for THIS show's specific date/zone (e.g. "MDT" vs
// "MST") — computed from the actual UTC instant, not the zone's current
// offset "right now", so a show scheduled across a DST boundary still
// shows the correct one.
function zoneAbbreviation(utcIso: string, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(new Date(utcIso))
    return parts.find(p => p.type === 'timeZoneName')?.value || ''
  } catch { return '' }
}

// Compact, info-only card for the dashboard — the single next scheduled
// show (if any) plus a link to the full /app/schedule experience. No
// add/edit/cancel/start actions here at all, so there is exactly one
// place those live — avoids a second, competing form.
export function NextShowSummary({ artistId }: { artistId: string }) {
  const [loading, setLoading] = useState(true)
  const [next, setNext] = useState<ScheduledShow | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/shows/schedule?artist_id=${artistId}`)
      .then(res => res.ok ? res.json() : { shows: [] })
      .then(data => { if (!cancelled) { setNext((data.shows || [])[0] || null); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [artistId])

  if (loading) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div className="sched-skeleton" style={{ width: '100%', height: 56, borderRadius: 14 }} />
        <style>{`@keyframes schedShimmer2 { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } } .sched-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: schedShimmer2 1.4s ease infinite; } @media (prefers-reduced-motion: reduce) { .sched-skeleton { animation: none; opacity: 0.5; } }`}</style>
      </div>
    )
  }

  return (
    <a href="/app/schedule" style={{ display: 'block', textDecoration: 'none', marginBottom: 20 }}>
      <div style={{
        background: next ? `linear-gradient(165deg, ${C.card2}, ${C.card})` : C.card,
        border: `1px solid ${next ? C.borderGold : C.border}`, borderRadius: 16, padding: '16px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        {next ? (() => {
          const { dateStr, timeStr } = utcToZonedParts(new Date(next.scheduled_at), next.timezone)
          return (
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, margin: '0 0 4px' }}>Next show · {dayLabel(dateStr)}, {timeLabel(timeStr)}</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{next.venues?.name || 'Venue TBD'}</p>
            </div>
          )
        })() : (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Schedule</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>No shows scheduled yet — plan your next one</p>
          </div>
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, flexShrink: 0 }}>View Schedule →</span>
      </div>
    </a>
  )
}

export function UpcomingShows({ artistId, artistName, canManage, onBeforeStart }: { artistId: string; artistName?: string | null; canManage: boolean; onBeforeStart?: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [shows, setShows] = useState<ScheduledShow[]>([])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledShow | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const [startError, setStartError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try {
      const res = await fetch(`/api/shows/schedule?artist_id=${artistId}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setShows(data.shows || [])
    } catch { setError(true) } finally { setLoading(false) }
  }, [artistId])

  useEffect(() => { load() }, [load])

  async function handleCancel(show: ScheduledShow) {
    if (!confirm('Cancel this scheduled show? It will be removed from the upcoming list.')) return
    const res = await fetch(`/api/shows/schedule/${show.id}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expected_updated_at: show.updated_at }),
    })
    if (res.ok) load()
    else { const j = await res.json().catch(() => ({})); alert(j.error || 'Could not cancel — reload and try again.') }
  }

  function confirmAndStart(show: ScheduledShow) {
    const { dateStr, timeStr } = utcToZonedParts(new Date(show.scheduled_at), show.timezone)
    const who = artistName ? `${artistName} — ` : ''
    const venue = show.venues?.name || 'this venue'
    const when = `${dayLabel(dateStr)}, ${timeLabel(timeStr)} ${zoneAbbreviation(show.scheduled_at, show.timezone)}`.trim()
    // Only ever call it "early" when it actually is — a show whose
    // scheduled time has already arrived or passed is just being started,
    // not started ahead of schedule.
    const isFuture = new Date(show.scheduled_at).getTime() > Date.now()
    const note = isFuture ? 'This starts the show early, ahead of its scheduled time.' : 'This starts the show now.'
    const ok = confirm(`Start capture now for ${who}${venue}, scheduled for ${when}?\n\n${note}`)
    if (ok) handleStart(show)
  }

  async function handleStart(show: ScheduledShow) {
    setStarting(show.id); setStartError('')
    try {
      const res = await fetch(`/api/shows/schedule/${show.id}/start`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setStartError(json.error || 'Could not start this show.'); setStarting(null); return }
      onBeforeStart?.()
      router.push(`/app/live/${json.performance_id}?autostart=1`)
    } catch {
      setStartError('Network error — try again.'); setStarting(null)
    }
  }

  if (loading) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div className="sched-skeleton" style={{ width: 140, height: 14, borderRadius: 4, marginBottom: 10 }} />
        <div className="sched-skeleton" style={{ width: '100%', height: 64, borderRadius: 14 }} />
        <style>{`@keyframes schedShimmer { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } } .sched-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: schedShimmer 1.4s ease infinite; } @media (prefers-reduced-motion: reduce) { .sched-skeleton { animation: none; opacity: 0.5; } }`}</style>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ marginBottom: 20, padding: '14px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: C.secondary }}>Couldn't load upcoming shows.</span>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.gold, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>Upcoming</p>
        {canManage && (
          <button onClick={() => { setEditing(null); setFormOpen(true) }} style={{ fontSize: 12, fontWeight: 700, color: C.gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            + Add a show
          </button>
        )}
      </div>

      {startError && (
        <div style={{ marginBottom: 10, padding: '10px 14px', background: C.redDim, border: `1px solid rgba(248,113,113,0.25)`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} color={C.red} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: C.red }}>{startError}</span>
        </div>
      )}

      {shows.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px', textAlign: 'center' as const }}>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No shows scheduled yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shows.map((show, i) => {
            const { dateStr, timeStr } = utcToZonedParts(new Date(show.scheduled_at), show.timezone)
            const isNext = i === 0
            const scheduledByOther = show.scheduled_by && show.scheduled_by !== show.created_by
            return (
              <div key={show.id} className="sched-card" style={{
                background: isNext ? `linear-gradient(165deg, ${C.card2}, ${C.card})` : C.card,
                border: `1px solid ${isNext ? C.borderGold : C.border}`, borderRadius: 16,
                padding: isNext ? '20px 20px' : '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: isNext ? 13 : 12, fontWeight: 800, color: C.gold, letterSpacing: '0.02em' }}>{dayLabel(dateStr)}</span>
                      <span style={{ fontSize: isNext ? 13 : 12, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>
                        {timeLabel(timeStr)} <span style={{ color: C.secondary }}>{zoneAbbreviation(show.scheduled_at, show.timezone)}</span>
                      </span>
                    </div>
                    <p style={{ fontSize: isNext ? 18 : 15, fontWeight: 800, color: C.text, margin: '0 0 2px', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {show.venues?.name || 'Venue TBD'}
                    </p>
                    {show.venues?.city && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.secondary, fontSize: 12 }}>
                        <MapPin size={11} color={C.muted} /> {show.venues.city}{show.venues.country ? `, ${show.venues.country}` : ''}
                      </div>
                    )}
                    {scheduledByOther && (
                      <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0', fontStyle: 'italic' as const }}>
                        Added by {show.scheduled_by_name || 'a teammate'}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {isNext && canManage && (() => {
                      const isFuture = new Date(show.scheduled_at).getTime() > Date.now()
                      return (
                        <button onClick={() => confirmAndStart(show)} disabled={starting === show.id} style={{
                          padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 5,
                          background: 'transparent', border: `1px solid ${C.borderGold}`, borderRadius: 8, color: C.gold, fontSize: 11, fontWeight: 700,
                          cursor: starting === show.id ? 'default' : 'pointer', fontFamily: 'inherit', opacity: starting === show.id ? 0.7 : 1, whiteSpace: 'nowrap' as const,
                        }}>
                          <Play size={11} /> {starting === show.id ? 'Starting…' : isFuture ? 'Start early' : 'Start Capture'}
                        </button>
                      )
                    })()}
                    {canManage && <ShowActionsMenu show={show} onEdit={() => { setEditing(show); setFormOpen(true) }} onCancel={() => handleCancel(show)} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {formOpen && (
        <ScheduleForm
          artistId={artistId}
          existing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load() }}
        />
      )}

      <style>{`
        .sched-card { transition: border-color 0.15s ease; }
        @media (prefers-reduced-motion: reduce) { .sched-card { transition: none !important; } }
      `}</style>
    </div>
  )
}

function ScheduleForm({ artistId, existing, onClose, onSaved }: {
  artistId: string; existing: ScheduledShow | null; onClose: () => void; onSaved: () => void
}) {
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [venueQuery, setVenueQuery] = useState(existing?.venues?.name || '')
  const [venueId, setVenueId] = useState<string | null>(existing?.venue_id || null)
  const [venueCity, setVenueCity] = useState(existing?.venues?.city || '')
  const [venueCountry, setVenueCountry] = useState(existing?.venues?.country || '')
  const [venueResults, setVenueResults] = useState<Venue[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [localDate, setLocalDate] = useState(() => {
    if (!existing) return ''
    return utcToZonedParts(new Date(existing.scheduled_at), existing.timezone).dateStr
  })
  const [localTime, setLocalTime] = useState(() => {
    if (!existing) return ''
    return utcToZonedParts(new Date(existing.scheduled_at), existing.timezone).timeStr
  })
  const localDateTime = localDate && localTime ? `${localDate}T${localTime}` : ''
  const [timezone, setTimezone] = useState(existing?.timezone || deviceTz)
  // Set only when a real coordinate-derived suggestion was just applied —
  // shown as a dismissible "detected from venue location" note, never a
  // silent override. Cleared the moment the picker is touched directly.
  const [tzSuggested, setTzSuggested] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ambiguousOptions, setAmbiguousOptions] = useState<string[] | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null)
  const [pendingSubmit, setPendingSubmit] = useState(false)

  async function searchVenues(q: string) {
    if (!q.trim()) { setVenueResults([]); return }
    const supabase = createClient()
    const { data } = await supabase.from('venues').select('id, name, city, country, latitude, longitude').ilike('name', `%${q.trim()}%`).limit(8)
    setVenueResults((data as Venue[]) || [])
    setShowDropdown(true)
  }

  function selectVenue(v: Venue) {
    setVenueQuery(v.name); setVenueId(v.id); setVenueCity(v.city || ''); setVenueCountry(v.country || '')
    setShowDropdown(false); setVenueResults([])
    // Best-effort only: most venues (including every one created through
    // this form) have no stored coordinates at all, confirmed by reading
    // app/app/show/new's own venue-insert, which never sets them either.
    // When one happens to have real coordinates, suggest — never assume —
    // the matching IANA zone; the picker stays fully editable either way.
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number') {
      try {
        const detected = tzLookup(v.latitude, v.longitude)
        setTimezone(detected); setTzSuggested(true)
      } catch { /* out-of-range coordinates — no suggestion, picker keeps its current value */ }
    }
  }

  async function submit(confirmDuplicate = false, resolvedUtc?: string) {
    setError(''); setAmbiguousOptions(null)
    if (!venueQuery.trim()) { setError('A venue is required.'); return }
    if (!venueId && !venueCity.trim()) { setError("Add a city for this venue so it can be told apart from others with the same name — never guessed."); return }
    if (!localDate) { setError('A date is required.'); return }
    if (!localTime) { setError('A time is required.'); return }
    if (!timezone) { setError('A timezone is required.'); return }
    setSaving(true)
    try {
      const path = existing ? `/api/shows/schedule/${existing.id}` : '/api/shows/schedule'
      const body: any = existing
        ? { expected_updated_at: existing.updated_at, venue_id: venueId || undefined, venue_name: venueId ? undefined : venueQuery.trim(), venue_city: venueCity, venue_country: venueCountry, local_date_time: localDateTime, timezone, resolved_utc: resolvedUtc }
        : { artist_id: artistId, venue_id: venueId || undefined, venue_name: venueId ? undefined : venueQuery.trim(), venue_city: venueCity, venue_country: venueCountry, local_date_time: localDateTime, timezone, confirm_duplicate: confirmDuplicate, resolved_utc: resolvedUtc }
      const res = await fetch(path, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (res.status === 409 && json.warning === 'likely_duplicate') {
        setDuplicateWarning(json.message); setPendingSubmit(true); setSaving(false); return
      }
      if (res.status === 422 && json.reason === 'ambiguous') {
        setAmbiguousOptions(json.options); setError(json.error); setSaving(false); return
      }
      if (!res.ok) { setError(json.error || 'Something went wrong.'); setSaving(false); return }
      onSaved()
    } catch {
      setError('Network error — try again.'); setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 420, maxHeight: '90vh', overflowY: 'auto' as const }}>
        <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 16px' }}>{existing ? 'Edit show' : 'Schedule a show'}</h3>

        <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>Venue</label>
        <div style={{ position: 'relative', marginBottom: venueId ? 14 : 8 }}>
          <input value={venueQuery} onChange={e => { setVenueQuery(e.target.value); setVenueId(null); setVenueCity(''); setVenueCountry(''); searchVenues(e.target.value) }} placeholder="Search or enter a new venue"
            style={{ width: '100%', background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 12px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
          {showDropdown && venueResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 4, zIndex: 10, maxHeight: 160, overflowY: 'auto' as const }}>
              {venueResults.map(v => {
                const location = [v.city, v.country].filter(Boolean).join(', ')
                return (
                  <button key={v.id} onClick={() => selectVenue(v)} style={{ width: '100%', textAlign: 'left' as const, padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>{v.name}</p>
                    <p style={{ fontSize: 11, color: location ? C.secondary : C.muted, margin: '2px 0 0', fontStyle: location ? 'normal' as const : 'italic' as const }}>
                      {location || 'No location on file — add city/country below so this venue can be told apart from others with the same name'}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Visible only for a brand-new venue (no existing row selected) —
            the identifying location search/geocoding can't resolve a venue
            that doesn't exist yet in the venues table, so this collects the
            minimum needed to tell it apart from a same-named venue
            elsewhere. Never used to invent coordinates — just city/country
            text, stored as-is. */}
        {!venueId && venueQuery.trim() && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={venueCity} onChange={e => setVenueCity(e.target.value)} placeholder="City"
              style={{ flex: 1, background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
            <input value={venueCountry} onChange={e => setVenueCountry(e.target.value)} placeholder="Country"
              style={{ flex: 1, background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }} />
          </div>
        )}

        <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>Date &amp; time (venue-local)</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input type="date" value={localDate} onChange={e => setLocalDate(e.target.value)} aria-label="Date"
            style={{ flex: '1 1 55%', minWidth: 0, background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 10px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, colorScheme: 'dark' as const }} />
          <input type="time" value={localTime} onChange={e => setLocalTime(e.target.value)} aria-label="Time"
            style={{ flex: '1 1 45%', minWidth: 0, background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 10px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const, colorScheme: 'dark' as const }} />
        </div>

        <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: 'block', marginBottom: 6 }}>Timezone</label>
        <TimezoneCombobox value={timezone} onChange={tz => { setTimezone(tz); setTzSuggested(false) }} />
        {tzSuggested ? (
          <p style={{ fontSize: 11, color: C.gold, margin: '6px 0 0' }}>Detected from the venue's location — change it if that's wrong.</p>
        ) : (
          <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>Defaults to your own device's timezone — this won't always match the venue, so confirm it.</p>
        )}
        {localDateTime && (
          <p style={{ fontSize: 12, color: C.secondary, margin: '8px 0 0' }}>
            That's <strong style={{ color: C.text }}>{new Date(localDateTime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date(localDateTime).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}</strong> venue-local time ({labelForZone(timezone)}).
          </p>
        )}
        <div style={{ marginBottom: 16 }} />

        {ambiguousOptions && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10 }}>
            <p style={{ fontSize: 12, color: C.text, margin: '0 0 8px' }}>This time is ambiguous — which one did you mean?</p>
            {ambiguousOptions.map((iso, i) => (
              <button key={iso} onClick={() => submit(false, iso)} style={{ display: 'block', width: '100%', textAlign: 'left' as const, padding: '8px 10px', marginBottom: 4, background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                {i === 0 ? 'Earlier' : 'Later'} — {new Date(iso).toLocaleString()}
              </button>
            ))}
          </div>
        )}

        {duplicateWarning && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10 }}>
            <p style={{ fontSize: 12, color: C.text, margin: '0 0 8px' }}>{duplicateWarning}</p>
            <button onClick={() => submit(true)} style={{ padding: '8px 12px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Schedule it anyway
            </button>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', marginBottom: 14, background: C.redDim, border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10 }}>
            <AlertCircle size={14} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{error}</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={() => submit(false)} disabled={saving} style={{ flex: 2, padding: '12px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Schedule show'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Searchable replacement for a raw few-hundred-entry native <select> of
// IANA strings — type a city, region, or offset ("chicago", "central",
// "-05") to filter; selecting one is the only way to change the value, so
// a typo never silently becomes an unintended real timezone.
// Replaces the previous unlabeled, icon-only red X — a destructive action
// with no explanation of what it does or why it's red. Edit stays
// secondary (plain text label, no emphasis); Cancel is clearly labeled
// and still requires the existing confirm() before anything happens.
function ShowActionsMenu({ show, onEdit, onCancel }: { show: ScheduledShow; onEdit: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu" aria-expanded={open} aria-label={`Actions for ${show.venues?.name || 'this show'}`}
        style={{ padding: 7, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.secondary, cursor: 'pointer' }}>
        <MoreVertical size={15} />
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 180, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', zIndex: 30, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <button role="menuitem" onClick={() => { onEdit(); setOpen(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
            <Pencil size={13} color={C.secondary} /> Edit show
          </button>
          <button role="menuitem" onClick={() => { onCancel(); setOpen(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', color: C.red, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
            <X size={13} /> Cancel show
          </button>
        </div>
      )}
    </div>
  )
}

function TimezoneCombobox({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const options = getTimezoneOptions()
  const filtered = query.trim()
    ? options.filter(o => o.search.includes(query.trim().toLowerCase())).slice(0, 30)
    : options.filter(o => o.value === value)

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={open ? query : labelForZone(value)}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search city or region…"
        style={{ width: '100%', background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.card2, border: `1px solid ${C.border}`, borderRadius: 10, marginTop: 4, zIndex: 20, maxHeight: 220, overflowY: 'auto' as const }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '10px 12px', fontSize: 12, color: C.muted, margin: 0 }}>No match — try a different city or region.</p>
          ) : filtered.map(o => (
            <button key={o.value} onMouseDown={() => { onChange(o.value); setOpen(false) }} style={{ width: '100%', textAlign: 'left' as const, padding: '9px 12px', background: o.value === value ? C.goldDim : 'none', border: 'none', color: o.value === value ? C.gold : C.text, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
