'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, ExternalLink, Copy, ChevronDown, ChevronUp, FileText, AlertTriangle, Clock } from 'lucide-react'
import {
  getProRule, daysUntil, urgencyFor, formatClaimDate, formatClaimTime, detectTerritory,
  INPUT_FIELDS,
  type ProRule, type ClaimFieldKey, type DeadlineResult, type Territory,
} from '@/lib/pro-rules'
import { isWriteCapableRole } from '@/lib/writeCapableRoles'
import { missingIdentityFields } from '@/lib/submission-identity'
import { parseLocalDate } from '@/lib/date-format'
import { showDay, isRealTimeZone } from '@/lib/show-date'
import { LoadError } from '@/components/ui/LoadError'
import { PageFrame } from '@/components/ui/PageFrame'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { useActingAs } from '@/components/ActingAsProvider'
import { isNativeApp } from '@/lib/appearance'
import { chooseHandoffRoute, isShareCancel, claimSheetFile, canShareFile, downloadTextFile } from '@/lib/claim-sheet-handoff'
import {
  claimInputsKey, legacyClaimInputsKey, preflightKey, legacyPreflightKey, progressKey, scrollKey,
  markCopied, isCopied as hasCopyMark, songCopied, allSongsCopied as everySongCopied, ALL_SONGS_KEY, allTitles, parseProgress,
  judgeWrite, judgeReadBack, type CopyMarks, type ReadBack,
} from '@/lib/claim-progress'

const CARD = {
  background: 'var(--sl-card-bg)',
  boxShadow: 'var(--sl-card-inset)',
}

const C = {
  bg: 'var(--sl-bg)', card: 'var(--sl-surface)',
  border: 'color-mix(in srgb, var(--sl-text) 7%, transparent)', borderGold: 'color-mix(in srgb, var(--sl-accent) 30%, transparent)',
  text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)',
  gold: 'var(--sl-accent)', goldDim: 'color-mix(in srgb, var(--sl-accent) 10%, transparent)',
  green: 'var(--sl-ok)', greenDim: 'color-mix(in srgb, var(--sl-ok) 8%, transparent)',
  red: 'var(--sl-danger)', redDim: 'color-mix(in srgb, var(--sl-danger) 8%, transparent)',
  amber: 'var(--sl-warn)', amberDim: 'color-mix(in srgb, var(--sl-warn) 8%, transparent)',
}

const MONO = '"DM Mono", monospace'

const TERRITORY_LABEL: Record<Territory, string> = {
  US: 'the U.S.', CA: 'Canada', GB: 'the UK', AU: 'Australia / NZ',
}

type VenueSizePick = 'small' | 'medium' | 'large' | 'arena'
const VENUE_SIZE_OPTIONS: { key: VenueSizePick; label: string; sub: string; capacity: number }[] = [
  { key: 'small',  label: 'Small',  sub: '< 300',  capacity: 200 },
  { key: 'medium', label: 'Medium', sub: '300–2k', capacity: 600 },
  { key: 'large',  label: 'Large',  sub: '2k–10k', capacity: 5000 },
  { key: 'arena',  label: 'Arena',  sub: '10k+',   capacity: 20000 },
]

// Metadata quality is truthful, not a rights claim: 'full' means Setlistr has
// an ISRC and a writer credit for this song, not that a composition/work has
// been matched against a PRO catalog. No real work-matching exists yet.
type Song = {
  title: string; artist: string; isrc?: string; composer?: string
  publisher?: string
  matchConfidence: 'full' | 'partial' | 'none'
}
type Performance = {
  id: string; user_id: string; venue_name: string; city: string; country: string
  started_at: string; start_time?: string | null; artist_name: string; show_type?: string | null
  venue_capacity?: number | null; submission_status?: string | null
  submitted_at?: string | null; setlist_id?: string | null
  venue_city?: string | null; venue_country?: string | null
  performance_date?: string | null; created_at?: string | null
  // The linked show's IANA zone; 'UTC' is its unset placeholder.
  show_timezone?: string | null
}
type Profile = {
  pro_affiliation: string | null; legal_name: string | null
  ipi_number: string | null; publisher_name: string | null; artist_name: string | null
}
type ClaimInputs = { promoter: string; ticketPrice: string; attendance: string; startTime: string; city: string }

// ─── Local persistence (per-device convenience only — not synced across
// devices or to other users; a fresh device/browser starts with nothing) ────

function readLocal<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}
function writeLocal(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}
function removeLocal(key: string) {
  try { window.localStorage.removeItem(key) } catch { /* storage unavailable */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveConfidence(song: { isrc?: string; composer?: string }): Song['matchConfidence'] {
  if (song.isrc && song.composer) return 'full'
  if (song.isrc || song.composer) return 'partial'
  return 'none'
}

// The capture's start, read in the show's own zone when the show has a real
// one. Without one (unscheduled captures store no venue zone) it falls back
// to this device's zone, and the field says so.
function defaultStartTime(perf: Performance): string {
  if (perf.started_at) {
    const d = new Date(perf.started_at)
    if (!isNaN(d.getTime())) {
      if (isRealTimeZone(perf.show_timezone)) {
        const parts = new Intl.DateTimeFormat('en-GB', { timeZone: perf.show_timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
        const hh = parts.find(x => x.type === 'hour')?.value, mm = parts.find(x => x.type === 'minute')?.value
        if (hh && mm) return `${hh}:${mm}`
      }
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
  }
  if (perf.start_time) return perf.start_time.slice(0, 5)
  return ''
}

// The claim sheet as text, with its file name. Getting it off the page is
// handOff's job (lib/claim-sheet-handoff.ts).
function buildSubmissionBrief({
  performance, songs, profile, rule, deadline, suggestedTitle,
  effectiveCapacity, inputs,
}: {
  performance: Performance; songs: Song[]; profile: Profile | null
  rule: ProRule | null; deadline: DeadlineResult | null
  suggestedTitle: string; effectiveCapacity: number | null; inputs: ClaimInputs
}): { text: string; filename: string } {
  const showDate = showDay(performance, performance.show_timezone) || parseLocalDate(performance.started_at)
  const showDateLong = showDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const resolvedCity = performance.city || performance.venue_city || inputs.city.trim() || ''
  const line = (char = '─', n = 52) => char.repeat(n)
  const songLines = songs.map((s, i) => {
    const parts = [`${String(i + 1).padStart(2, ' ')}. ${s.title}`]
    if (s.composer) parts.push(`    Writer: ${s.composer}`)
    if (s.isrc) parts.push(`    ISRC: ${s.isrc}`)
    return parts.join('\n')
  }).join('\n\n')
  const steps = rule
    ? rule.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
    : '  Set your PRO in Setlistr Settings to see submission steps.'
  const time = rule && inputs.startTime ? formatClaimTime(inputs.startTime, rule.homeTerritory) : ''

  const notes = rule && rule.notes.length
    ? ['RULES THAT AFFECT PAYMENT', line('─', 30), ...rule.notes.map(n => `  • ${n}`), '']
    : []

  const deadlineLine = deadline
    ? `Deadline:      ${deadline.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} (${deadline.rule})`
    : null
  const earlyLine = deadline?.earlyCutoff
    ? `Early cutoff:  ${deadline.earlyCutoff.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} (${deadline.earlyCutoffNote || 'earlier distribution'})`
    : null

  const brief = [
    `SETLISTR CLAIM SHEET`,
    `Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    line(),
    '',
    `SHOW`,
    line('─', 30),
    `Artist:     ${profile?.artist_name || performance.artist_name}`,
    `Venue:      ${performance.venue_name}${resolvedCity ? `, ${resolvedCity}` : ''}`,
    `Date:       ${showDateLong}`,
    time ? `Start time: ${time}` : null,
    effectiveCapacity ? `Capacity:   ~${effectiveCapacity.toLocaleString()}` : null,
    inputs.promoter ? `Promoter:   ${inputs.promoter}` : null,
    inputs.ticketPrice ? `Ticket:     ${inputs.ticketPrice}` : null,
    inputs.attendance ? `Attendance: ~${inputs.attendance}` : null,
    '',
    `CLAIM`,
    line('─', 30),
    `PRO:           ${rule?.name || profile?.pro_affiliation || 'Not set'}`,
    rule ? `Program:       ${rule.program}` : null,
    profile?.legal_name ? `Legal Name:    ${profile.legal_name}` : null,
    profile?.ipi_number ? `IPI Number:    ${profile.ipi_number}` : null,
    profile?.publisher_name ? `Publisher:     ${profile.publisher_name}` : null,
    `Setlist Title: ${suggestedTitle}`,
    rule ? `Portal:        ${rule.portalUrl}` : null,
    earlyLine,
    deadlineLine,
    rule?.supportUrl ? `Support:       ${rule.supportUrl}` : null,
    rule?.phone ? `Phone:         ${rule.phone}` : null,
    '',
    `SETLIST (${songs.length} songs)`,
    line('─', 30),
    songLines,
    '',
    ...notes,
    `STEPS — ${rule?.name || 'Your PRO'}`,
    line('─', 30),
    steps,
    '',
    line(),
    `Claim status is tracked by you — Setlistr can't see your PRO account.`,
    `Questions? info@setlistr.ai`,
  ].filter((l): l is string => l !== null).join('\n')

  const safeVenue = performance.venue_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const safeDate = showDate.toISOString().slice(0, 10)
  return { text: brief, filename: `setlistr-claim-${safeVenue}-${safeDate}.txt` }
}

export default function SubmitPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { actingAs, selectManagedArtist, returnToOwnWorkspace } = useActingAs()
  const [performance, setPerformance]     = useState<Performance | null>(null)
  const [songs, setSongs]                 = useState<Song[]>([])
  const [profile, setProfile]             = useState<Profile | null>(null)
  const [isDelegate, setIsDelegate]       = useState(false)
  // Whether the current caller is actually allowed to write performances
  // (owner, or a delegate with an accepted, non-revoked, write-capable
  // role). Defaults true — the owner path never needs this checked, and a
  // delegate's real value is set once their artist_delegates row loads.
  // Never the sole guard: markSubmitted() re-verifies the write itself.
  const [canWriteSubmission, setCanWriteSubmission] = useState(true)
  const [submitError, setSubmitError]     = useState<string | null>(null)
  const [loading, setLoading]             = useState(true)
  const [copied, setCopied]               = useState<string | null>(null)
  // What was copied, per field, as a fingerprint of the copied value: a
  // mark lasts only while the field still holds that value.
  const [copyMarks, setCopyMarks]         = useState<CopyMarks>({})
  const [stepsOpen, setStepsOpen]         = useState(false)
  const [submitted, setSubmitted]         = useState(false)
  const [submittedAt, setSubmittedAt]     = useState<string | null>(null)
  const [markingDone, setMarkingDone]     = useState(false)
  const [filedPulse, setFiledPulse]       = useState(false)
  const [stepsDone, setStepsDone]         = useState<boolean[]>([])
  const [venueSizePick, setVenueSizePick] = useState<VenueSizePick | null>(null)
  const [portalOpened, setPortalOpened]   = useState(false)
  const [preflightDone, setPreflightDone] = useState<string[]>([])
  // Complete details fold to their values with Edit; missing ones never fold.
  const [detailsOpen, setDetailsOpen]     = useState(false)
  // A team member's "record that the artist submitted it" asks once, in the page.
  const [confirmingRecord, setConfirmingRecord] = useState(false)
  const [inputsReady, setInputsReady]     = useState(false)
  // A failed load is an error with Try again — never "Performance not
  // found", a false "No PRO selected" or an empty setlist.
  const [loadFailed, setLoadFailed]       = useState(false)
  const [songsFailed, setSongsFailed]     = useState(false)
  const [reloadKey, setReloadKey]         = useState(0)
  // The field whose clipboard write just failed; "Copied" only follows a
  // write the browser confirmed.
  const [copyFailed, setCopyFailed]       = useState<string | null>(null)
  // Getting the sheet file off the page: an explicit failure, or the sheet's
  // text to copy when the installed app can't hand over a file.
  const [sheetError, setSheetError]       = useState<string | null>(null)
  const [sheetText, setSheetText]         = useState<string | null>(null)
  // The signed-in account this sheet was loaded for. Saved preparation is
  // kept per account (lib/claim-progress.ts).
  const [viewerId, setViewerId]           = useState<string | null>(null)
  const viewerRef                         = useRef<string | null>(null)
  // The storage key the restored show details belong to; edits are saved
  // only there, never under an account or show loaded later.
  const [inputsKey, setInputsKey]         = useState<string | null>(null)
  // The tab-progress key whose copied marks and portal flag are restored.
  const [progressFor, setProgressFor]     = useState<string | null>(null)
  // A recording write whose outcome couldn't be confirmed either way.
  const [submitUncertain, setSubmitUncertain] = useState(false)
  const markInFlight                      = useRef(false)

  // Show details the PRO asks for
  const [promoter, setPromoter]       = useState('')
  const [ticketPrice, setTicketPrice] = useState('')
  const [attendance, setAttendance]   = useState('')
  const [startTime, setStartTime]     = useState('')
  // Only used when performance.city is missing and the PRO needs it — see
  // needsCityInput below. Never overrides a real performance.city.
  const [manualCity, setManualCity]   = useState('')

  useEffect(() => {
    const supabase = createClient()
    // A response for an earlier show or attempt is dropped, never applied.
    let cancelled = false
    const fail = () => { if (!cancelled) { setLoadFailed(true); setLoading(false) } }
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { router.push('/auth/login'); return }
      viewerRef.current = user.id
      setViewerId(user.id)

      const { data: perf, error: perfErr } = await supabase
        .from('performances_visible').select('*, shows(show_type, timezone), venues(capacity, city, country)')
        .eq('id', params.id).maybeSingle()
      if (cancelled) return
      if (perfErr) { fail(); return }
      if (!perf) { setPerformance(null); setLoading(false); return }

      const ownerId = perf.user_id as string
      const delegateView = user.id !== ownerId
      setIsDelegate(delegateView)

      const perfRecord: Performance = {
        ...perf,
        show_type:         perf.shows?.show_type || null,
        show_timezone:     perf.shows?.timezone || null,
        venue_capacity:    perf.venues?.capacity || null,
        submission_status: perf.submission_status || null,
        submitted_at:      perf.submitted_at || null,
        setlist_id:        perf.setlist_id || null,
        venue_city:        perf.venues?.city || null,
        venue_country:     perf.venues?.country || null,
      }
      setPerformance(perfRecord)
      setSubmitted(perf.submission_status === 'submitted')
      setSubmittedAt(perf.submitted_at || null)

      // PRO identity always belongs to the performance owner, never the
      // acting-as UI state. `profiles` RLS is self-only, so a delegate
      // (allowed onto the performance itself via can_act_for) can't read
      // the owner's profiles row directly — that used to surface as a
      // false "No PRO selected". Use the delegation-aware context-data
      // route instead, which verifies the accepted-delegate relationship
      // server-side and returns just enough to build the claim: PRO
      // affiliation and artist name, deliberately not legal_name/
      // ipi_number/publisher_name, preserving the existing privacy
      // boundary that keeps those off a delegate's screen.
      let profileData: Profile | null = null
      if (delegateView) {
        // A failed read is a load error, not an artist without a PRO.
        try {
          const ctxRes = await fetch(`/api/team/context-data?artist_id=${ownerId}`)
          const ctx = await ctxRes.json()
          if (!ctxRes.ok || ctx.error) throw new Error(ctx.error || `context-data ${ctxRes.status}`)
          profileData = {
            pro_affiliation: ctx.pro_affiliation || null,
            artist_name:     ctx.artist_name || null,
            legal_name:      null,
            ipi_number:      null,
            publisher_name:  null,
          }
        } catch (e) { console.error('[SubmitPage] context-data fetch failed:', e); fail(); return }

        // Whether THIS delegate can actually write to performances —
        // artist_delegates_select's RLS lets a delegate read their own row
        // (auth.uid() = delegate_id), same table/columns performances_
        // write's RLS check (can_write_for) itself keys on. A failed read
        // is treated as "cannot write" (fail closed), not "assume yes".
        try {
          const { data: delegation, error: delegationErr } = await supabase
            .from('artist_delegates')
            .select('role, accepted_at, revoked_at')
            .eq('artist_id', ownerId)
            .eq('delegate_id', user.id)
            .maybeSingle()
          const writeCapable = !delegationErr && !!delegation
            && !!delegation.accepted_at && !delegation.revoked_at
            && isWriteCapableRole(delegation.role)
          setCanWriteSubmission(writeCapable)
        } catch (e) {
          console.error('[SubmitPage] delegation role fetch failed:', e)
          setCanWriteSubmission(false)
        }
      } else {
        const { data, error: profileErr } = await supabase
          .from('profiles').select('pro_affiliation, legal_name, ipi_number, publisher_name, artist_name')
          .eq('id', ownerId).single()
        if (profileErr) { console.error('[SubmitPage] profile load failed:', profileErr); fail(); return }
        profileData = data
      }
      if (cancelled) return
      setProfile(profileData)

      // The songs failing leaves the rest of the sheet usable; recording a
      // submission waits until they load.
      let songData: any[] = []
      let songsOk = true
      try {
        const songsRes = await fetch(`/api/performance-songs?performanceId=${params.id}`)
        const songsJson = await songsRes.json()
        if (!songsRes.ok || songsJson.error) throw new Error(songsJson.error || `songs ${songsRes.status}`)
        songData = songsJson.songs || []
      } catch (e) { console.error('[SubmitPage] songs fetch failed:', e); songsOk = false }
      if (cancelled) return
      setSongsFailed(!songsOk)

      const mapped: Song[] = songData.map(s => ({
        title: s.title, artist: s.artist || '',
        isrc: s.isrc || '', composer: s.composer || '',
        publisher: s.publisher || '',
        matchConfidence: deriveConfidence(s),
      }))
      setSongs(mapped)

      const rule = getProRule(profileData?.pro_affiliation)
      if (rule) {
        setStepsDone(new Array(rule.steps.length).fill(false))
        // Acknowledgements are this account's own notes. The released key
        // (per artist only) is honoured for the artist's own account.
        const pf = readLocal<string[]>(preflightKey(user.id, ownerId, rule.code))
          ?? (user.id === ownerId ? readLocal<string[]>(legacyPreflightKey(ownerId, rule.code)) : null)
          ?? []
        setPreflightDone(pf)
      }

      // Restore any show details typed on this device for this show
      // The released key had no account in it: move it under this one.
      const ownKey = claimInputsKey(user.id, params.id)
      let saved = readLocal<ClaimInputs>(ownKey)
      if (!saved) {
        const legacy = readLocal<ClaimInputs>(legacyClaimInputsKey(params.id))
        if (legacy) { saved = legacy; writeLocal(ownKey, legacy); removeLocal(legacyClaimInputsKey(params.id)) }
      }
      setPromoter(saved?.promoter || '')
      setTicketPrice(saved?.ticketPrice || '')
      setAttendance(saved?.attendance || '')
      setStartTime(saved?.startTime || defaultStartTime(perfRecord))
      setManualCity(saved?.city || '')
      setInputsKey(ownKey)
      setInputsReady(true)

      setLoading(false)
    }
    setLoading(true); setLoadFailed(false); setInputsReady(false); setInputsKey(null); setProgressFor(null)
    load().catch(e => { console.error('[SubmitPage] load failed:', e); fail() })
    return () => { cancelled = true }
  }, [params.id, reloadKey])

  useEffect(() => {
    if (!inputsReady || !inputsKey) return
    writeLocal(inputsKey, { promoter, ticketPrice, attendance, startTime, city: manualCity })
  }, [inputsReady, inputsKey, promoter, ticketPrice, attendance, startTime, manualCity])

  // Signing in as someone else in another tab reloads this sheet for that
  // account rather than leaving the previous account's sheet on screen.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id ?? null
      if (viewerRef.current && next !== viewerRef.current) {
        viewerRef.current = null
        if (next) setReloadKey(k => k + 1)
        else router.push('/auth/login')
      }
    })
    return () => { subscription.unsubscribe() }
  }, [])

  // Copied marks and "portal opened" last for this tab, so the browser
  // reloading it while you're in the portal loses nothing. Keyed by
  // account, show and PRO.
  const loadedProCode = getProRule(profile?.pro_affiliation)?.code ?? 'none'
  const tabKey = !loading && viewerId ? progressKey(viewerId, params.id, loadedProCode) : null
  useEffect(() => {
    if (!tabKey) return
    let raw: string | null = null
    try { raw = window.sessionStorage.getItem(tabKey) } catch { /* storage unavailable */ }
    const p = parseProgress(raw)
    setCopyMarks(p.marks); setPortalOpened(p.portalOpened); setProgressFor(tabKey)
  }, [tabKey])
  useEffect(() => {
    if (!tabKey || progressFor !== tabKey) return
    try { window.sessionStorage.setItem(tabKey, JSON.stringify({ marks: copyMarks, portalOpened })) } catch { /* storage unavailable */ }
  }, [tabKey, progressFor, copyMarks, portalOpened])

  // Returning from the portal: if the browser reloaded the tab, go back to
  // where you were on the sheet.
  useEffect(() => {
    if (loading || loadFailed || !viewerId) return
    const key = scrollKey(viewerId, params.id)
    try {
      const y = Number(window.sessionStorage.getItem(key))
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y))
    } catch { /* storage unavailable */ }
    let t: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      if (t) return
      t = setTimeout(() => { t = null; try { window.sessionStorage.setItem(key, String(Math.round(window.scrollY))) } catch { /* storage unavailable */ } }, 150)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (t) clearTimeout(t) }
  }, [loading, loadFailed, viewerId, params.id])

  async function copyText(text: string, key: string) {
    let ok = false
    try { await navigator.clipboard.writeText(text); ok = true } catch {
      try {
        const el = document.createElement('textarea')
        el.value = text; el.setAttribute('readonly', ''); el.style.position = 'fixed'; el.style.opacity = '0'
        document.body.appendChild(el); el.select()
        ok = document.execCommand('copy'); document.body.removeChild(el)
      } catch { ok = false }
    }
    if (!ok) {
      setCopied(null); setCopyFailed(key)
      setTimeout(() => setCopyFailed(k => k === key ? null : k), 6000)
      return
    }
    setCopyFailed(null)
    setCopied(key)
    setCopyMarks(prev => markCopied(prev, key, text))
    setTimeout(() => setCopied(null), 2000)
  }

  function togglePreflight(rule: ProRule, id: string) {
    if (!performance) return
    setPreflightDone(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (viewerId) writeLocal(preflightKey(viewerId, performance.user_id, rule.code), next)
      return next
    })
  }

  function handleOpenPortal(url: string) {
    window.open(url, '_blank')
    setPortalOpened(true)
  }

  // The stored status, read back when a write's own answer can't be trusted.
  async function readBackStatus(): Promise<ReadBack> {
    try {
      const { data, error } = await createClient()
        .from('performances_visible').select('submission_status, submitted_at')
        .eq('id', params.id).maybeSingle()
      if (error || !data) return { ok: false }
      return { ok: true, submissionStatus: data.submission_status ?? null, submittedAt: data.submitted_at ?? null }
    } catch { return { ok: false } }
  }

  async function showRecorded(at: string) {
    setSubmittedAt(at)
    setFiledPulse(true)
    await new Promise(r => setTimeout(r, 400))
    setSubmitted(true)
    // The confirmation starts at its top, not at the old scroll position.
    window.scrollTo(0, 0)
  }

  const NOT_SAVED = 'This wasn’t recorded. Your claim sheet and details are still here. Try again.'
  const UNCERTAIN = 'The connection dropped before Setlistr could confirm this was recorded. Your claim sheet and details are still here. Check again before trying a second time.'

  // Records that the caller manually submitted this performance to their
  // PRO — Setlistr never files with a PRO itself and has no way to verify
  // a PRO actually received or accepted anything. This function only ever
  // flips a self-attested flag; the wording throughout this page reflects
  // that deliberately. The database is the record: the screen says
  // "recorded" only when the stored status does.
  async function markSubmitted() {
    // One write at a time: a second tap while one is in flight does nothing.
    if (markInFlight.current || songsFailed) return
    // Defense in depth — the CTAs below already don't render a working
    // control for a non-write-capable delegate, but this function must
    // never silently proceed to a false success even if reached some
    // other way.
    if (isDelegate && !canWriteSubmission) {
      setSubmitError(`You don't have permission to mark this as submitted. Send this claim to ${artistDisplayName || 'the artist'} instead.`)
      return
    }
    markInFlight.current = true
    setMarkingDone(true)
    setSubmitError(null); setSubmitUncertain(false)
    const now = new Date().toISOString()
    // RLS can return HTTP 200 with zero rows updated (a denied or
    // otherwise-unmatched write is not an error) — .select('id') is what
    // makes that visible. Only a show not yet submitted is changed, so a
    // repeat after a lost response matches nothing instead of moving
    // submitted_at. Anything but exactly one row is checked against the
    // stored status (lib/claim-progress.ts judgeReadBack).
    let update = { error: true, rows: 0 }
    try {
      const { data, error } = await createClient().from('performances').update({
        submission_status: 'submitted', submitted_at: now,
      }).eq('id', params.id).or('submission_status.is.null,submission_status.neq.submitted').select('id')
      update = { error: !!error, rows: data?.length ?? 0 }
      if (error) console.error('[SubmitPage] markSubmitted write error:', error)
    } catch (e) { console.error('[SubmitPage] markSubmitted request failed:', e) }

    if (judgeWrite(update) === 'saved') {
      markInFlight.current = false; setMarkingDone(false)
      await showRecorded(now)
      return
    }
    const back = await readBackStatus()
    const outcome = judgeReadBack(update, back)
    markInFlight.current = false; setMarkingDone(false)
    if (outcome === 'saved' || outcome === 'already') {
      await showRecorded((back.ok && back.submittedAt) || now)
      return
    }
    console.error('[SubmitPage] markSubmitted not confirmed:', { ...update, outcome })
    if (outcome === 'uncertain') { setSubmitUncertain(true); setSubmitError(UNCERTAIN) }
    else setSubmitError(NOT_SAVED)
  }

  // After an unconfirmed write: read the stored status again, write nothing.
  async function checkRecordedAgain() {
    if (markInFlight.current) return
    markInFlight.current = true; setMarkingDone(true)
    const back = await readBackStatus()
    markInFlight.current = false; setMarkingDone(false)
    if (back.ok && back.submissionStatus === 'submitted') { setSubmitError(null); setSubmitUncertain(false); await showRecorded(back.submittedAt || new Date().toISOString()); return }
    if (back.ok) { setSubmitUncertain(false); setSubmitError('It isn’t recorded yet. Your claim sheet and details are still here. Try again.'); return }
    setSubmitError(UNCERTAIN)
  }

  // Delegate handoff: copies a link back to this same claim sheet so the
  // artist can open it themselves (their own account sees their full
  // identity fields). No new backend, no email — Setlistr doesn't have the
  // artist's email address exposed to a delegate to send to in Phase 0.
  function handleSendToArtist() {
    if (typeof window === 'undefined') return
    copyText(`${window.location.origin}/app/submit/${params.id}`, 'send-link')
  }

  // Delegate-only completion path. This still only sets the same
  // self-attested submission_status flag markSubmitted() always has — the
  // in-page confirmation exists so a delegate can't tap through and imply
  // Setlistr (or the delegate) verified a filing the artist made.
  async function handleArtistFiledIt() {
    if (!performance) return
    if (!confirmingRecord) { setConfirmingRecord(true); return }
    await markSubmitted()
    setConfirmingRecord(false)
  }

  // Back to Submissions in the workspace this show belongs to: the
  // artist's for a team member, your own for the artist.
  function backToSubmissions() {
    if (performance) {
      if (isDelegate) {
        if (actingAs?.artist_id !== performance.user_id) selectManagedArtist({ artist_id: performance.user_id, artist_name: artistDisplayName })
      } else if (actingAs) {
        returnToOwnWorkspace()
      }
    }
    router.push('/app/file')
  }

  // ── Shared pieces ────────────────────────────────────────────────────────────
  const SR_ONLY: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
  const SECTION: React.CSSProperties = { background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: CARD.boxShadow, overflow: 'hidden' }
  const SECTION_HEAD: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '16px 18px 12px' }
  const H2: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }
  const SUB: React.CSSProperties = { fontSize: 14, color: C.secondary, margin: '3px 0 0', lineHeight: 1.45 }
  const primaryBtn: React.CSSProperties = { width: '100%', minHeight: 52, padding: '0 18px', background: C.gold, border: 'none', borderRadius: 14, color: 'var(--sl-on-accent)', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', textAlign: 'center' }
  const secondaryBtn: React.CSSProperties = { width: '100%', minHeight: 48, padding: '0 16px', background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-accent) 45%, transparent)', borderRadius: 14, color: 'var(--sl-gold-text)', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', textAlign: 'center' }
  const textAction: React.CSSProperties = { minHeight: 44, padding: '0 4px', background: 'none', border: 'none', color: 'var(--sl-gold-text)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }
  const hintStyle: React.CSSProperties = { fontSize: 13.5, color: C.muted, margin: '5px 0 0', lineHeight: 1.45 }
  const pageStyles = (
    <style>{`
      .sb-grid { display: flex; flex-direction: column; gap: 16px; }
      /* Desktop: the sheet on the left, actions on the right. The DOM keeps the
         phone's reading order (details, actions, sheet, recording, help), so
         focus order matches what's on screen at every width. */
      @container sl-frame (min-width: 900px) {
        .sb-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 380px); grid-template-rows: auto auto auto auto 1fr auto; column-gap: 40px; row-gap: 16px; align-items: start; }
        .sb-details { grid-column: 1; grid-row: 1; }
        .sb-portal { grid-column: 2; grid-row: 1 / span 2; }
        .sb-sheet { grid-column: 1; grid-row: 2 / span 4; }
        .sb-notes { grid-column: 1; grid-row: 6; }
        .sb-mark { grid-column: 2; grid-row: 3; }
        .sb-help { grid-column: 2; grid-row: 4; }
      }
      .sb-row:hover:not(:disabled) { background: color-mix(in srgb, var(--sl-text) 3%, transparent) !important; }
      .sb-row:focus-visible, .sb-btn:focus-visible, .sb-check:focus-visible, .sb-more > summary:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: -2px; }
      .sb-more > summary { list-style: none; cursor: pointer; } .sb-more > summary::-webkit-details-marker { display: none; }
      .sb-more[open] > summary .sb-chev { transform: rotate(180deg); }
      .sb-field input:focus { border-color: var(--sl-input-line-active) !important; outline: none; }
      .sb-check { width: 22px; height: 22px; margin: 0; flex-shrink: 0; accent-color: var(--sl-accent); cursor: pointer; }
      input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      input::placeholder { color: var(--sl-text-3); }
    `}</style>
  )
  const frame = (children: React.ReactNode) => (
    <div style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'var(--sl-page-glow)' }} />
      <PageFrame style={{ position: 'relative', zIndex: 1 }}>{children}</PageFrame>
      {pageStyles}
    </div>
  )
  const backBtn = <button className="sb-btn" onClick={() => router.back()} style={{ minHeight: 44, background: 'none', border: 'none', color: C.secondary, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>← Back</button>

  // Loading holds the page's own geometry, so nothing jumps when it arrives.
  if (loading) return frame(
    <div aria-busy="true" style={{ paddingTop: 16 }}>
      <span role="status" style={SR_ONLY}>Loading the claim sheet</span>
      <Skeleton w={60} h={22} r={6} mt={11} />
      <Skeleton w="62%" h={30} mt={14} />
      <Skeleton w="50%" h={16} mt={10} />
      <Skeleton w="44%" h={14} mt={14} />
      <Skeleton w="100%" h={64} mt={26} r={16} />
      <Skeleton w="100%" h={150} mt={16} r={16} />
      <Skeleton w="100%" h={300} mt={16} r={16} />
    </div>
  )

  if (loadFailed) return frame(
    <div style={{ paddingTop: 16 }}>{backBtn}<div style={{ marginTop: 8 }}><LoadError message="The claim sheet didn’t load." onRetry={() => setReloadKey(k => k + 1)} /></div></div>
  )

  if (!performance) return frame(
    <div style={{ paddingTop: 40 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>This show isn’t available</h1>
      <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 16px' }}>It may have been deleted, or it belongs to a workspace you can’t open.</p>
      <button className="sb-btn" onClick={() => router.push('/app/file')} style={{ ...secondaryBtn, width: 'auto' }}>Back to Submissions</button>
    </div>
  )

  const pro            = profile?.pro_affiliation
  const rule           = getProRule(pro)
  const hasPRO         = !!rule
  const proName        = rule?.name || pro || 'your PRO'
  const stepsCompleted = stepsDone.filter(Boolean).length
  const totalSteps     = stepsDone.length
  const showDate       = showDay(performance, performance.show_timezone) || parseLocalDate(performance.started_at)
  const artistDisplayName = profile?.artist_name || performance.artist_name
  const suggestedTitle = `${artistDisplayName} - ${performance.venue_name}`
  const fullCount    = songs.filter(s => s.matchConfidence === 'full').length
  const partialCount = songs.filter(s => s.matchConfidence === 'partial').length
  const noneCount     = songs.filter(s => s.matchConfidence === 'none').length

  const deadline  = rule ? rule.deadline(showDate) : null
  const daysLeft  = deadline ? daysUntil(deadline.date) : null
  const urgency   = daysLeft !== null ? urgencyFor(daysLeft) : null
  const earlyStillOpen = !!(deadline?.earlyCutoff && daysUntil(deadline.earlyCutoff) > 0)

  const venueTerritory    = detectTerritory(performance.country, performance.city)
  const territoryMismatch = !!(rule && venueTerritory && venueTerritory !== rule.homeTerritory)

  const effectiveCapacity = performance.venue_capacity
    || (venueSizePick ? VENUE_SIZE_OPTIONS.find(o => o.key === venueSizePick)?.capacity : null)
  const needsVenuePick = !performance.venue_capacity
  const capacityMatters = !!rule?.fields.some(f => f.key === 'capacity')

  const inputs: ClaimInputs = { promoter, ticketPrice, attendance, startTime, city: manualCity }
  const inputFields = rule ? rule.fields.filter(f => INPUT_FIELDS.includes(f.key)) : []

  // City is normally derived from the performance record and never shown as
  // an input. It only becomes an editable field when the performance has no
  // city on file AND the current PRO's claim actually asks for one.
  const needsCityInput = !performance.city && !performance.venue_city && !!rule?.fields.some(f => f.key === 'venue_city')
  const cityMissing = needsCityInput && !manualCity.trim()
  const startFromDevice = !isRealTimeZone(performance.show_timezone)

  function fieldValue(key: ClaimFieldKey): string {
    if (!rule || !performance) return ''
    switch (key) {
      case 'setlist_title':    return suggestedTitle
      case 'venue_name':       return performance.venue_name || ''
      case 'venue_city':       return performance.city || performance.venue_city || manualCity.trim() || ''
      case 'performance_date': return formatClaimDate(showDate, rule.dateFormat)
      case 'start_time':       return startTime ? formatClaimTime(startTime, rule.homeTerritory) : ''
      case 'ticket_price':     return ticketPrice.trim()
      case 'promoter':         return promoter.trim()
      case 'attendance':       return attendance.trim()
      case 'capacity':         return effectiveCapacity ? String(effectiveCapacity) : ''
      case 'legal_name':       return profile?.legal_name || ''
      case 'ipi_number':       return profile?.ipi_number || ''
      case 'publisher_name':   return profile?.publisher_name || ''
      default:                 return ''
    }
  }

  const songTitles = songs.map(s => s.title)
  const allSongsCopied = everySongCopied(copyMarks, songTitles)
  const sheetFields  = rule ? rule.fields : []
  const missingRequired = inputFields.filter(f => f.required && !fieldValue(f.key))
  const detailsReady = missingRequired.length === 0 && !cityMissing
  const missingCount = missingRequired.length + (cityMissing ? 1 : 0)

  // Identity fields the claim sheet carries when present (legal name, IPI).
  // One shared check (lib/submission-identity.ts): for the owner, "these
  // are missing from your own account"; a delegate's profile never carries
  // them (the privacy boundary in load()), so it's never shown to one.
  const missingFields = missingIdentityFields(profile)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const hasDetails = inputFields.length > 0 || needsCityInput || (capacityMatters && needsVenuePick)
  // A missing requirement is never folded away, and details that were
  // incomplete stay open until Done, so finishing one doesn't fold the
  // field away mid-typing.
  if (!detailsReady && !detailsOpen) setDetailsOpen(true)
  const showDetailFields = !detailsReady || detailsOpen
  const canRecord = !isDelegate || canWriteSubmission
  const selfServe = !!rule?.selfServe
  // Whose action submits it. A team member hands over where the PRO says
  // the songwriter enters the show; elsewhere both routes stay open.
  const handoffFirst = isDelegate && !!rule?.writerSubmits
  const preflightPending = rule ? rule.preflight.length > 0 : false

  // Readiness, kept apart: is the information complete; is the route in
  // question. Submission itself is only ever what someone records here.
  const infoComplete = hasPRO && detailsReady && songs.length > 0 && !songsFailed
  const statusText = !hasPRO ? 'No PRO set'
    : songsFailed ? null
    : songs.length === 0 ? 'Needs review'
    : !detailsReady ? `${missingCount} ${missingCount === 1 ? 'detail' : 'details'} needed`
    : territoryMismatch ? 'Details complete'
    : 'Ready to submit'

  // Deadline wording follows its basis: only an official PRO deadline reads
  // "Due". Urgency and the basis's uncertainty stay on the line; the rule
  // itself is one tap away.
  const daysText = daysLeft !== null && daysLeft >= 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : null
  const deadlineLine = deadline && daysLeft !== null ? (
    urgency === 'expired' ? `${deadline.confidence === 'official' ? 'Deadline passed' : deadline.confidence === 'unverified' ? 'Working window passed' : 'Reminder date passed'} ${fmt(deadline.date)}`
    : deadline.confidence === 'official' ? `Due ${fmt(deadline.date)} · ${daysText}`
    : deadline.confidence === 'unverified' ? `Working window to ${fmt(deadline.date)}${urgency !== 'open' ? ` · ${daysText}` : ''}`
    : `Reminder ${fmt(deadline.date)}${urgency !== 'open' ? ` · ${daysText}` : ''}`
  ) : null
  // The disclosure's own label carries the basis, so the uncertainty stays
  // visible while the rule behind it folds away.
  const deadlineQualifier = deadline?.confidence === 'unverified' ? 'Setlistr default, not a published deadline'
    : deadline?.confidence === 'reminder' ? 'No published deadline'
    : `From ${proName}’s published rule`

  const inputStyle = (filled: boolean): React.CSSProperties => ({
    width: '100%', minHeight: 48, background: 'var(--sl-input-bg, var(--sl-bg))', border: `1px solid ${filled ? 'var(--sl-input-line-active)' : 'var(--sl-input-line)'}`,
    borderRadius: 12, padding: '0 14px', color: C.text, fontSize: 16, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  })
  const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: C.text, display: 'block', marginBottom: 6 }

  // ── Marked submitted ────────────────────────────────────────────────────────
  if (submitted) {
    const recordedOn = fmt(submittedAt ? new Date(submittedAt) : new Date())
    return frame(
      <div style={{ maxWidth: 560, paddingTop: 28 }}>
        <StatusLabel label="Marked submitted" color="var(--sl-ok)" filled />
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '12px 0 6px', letterSpacing: '-0.02em', lineHeight: 1.15, overflowWrap: 'anywhere' }}>{performance.venue_name}</h1>
        <p style={{ fontSize: 15.5, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
          {[performance.city, fmt(showDate), `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`, proName].filter(Boolean).join(' · ')}
        </p>
        <p style={{ fontSize: 15, color: C.text, margin: '18px 0 0', lineHeight: 1.55 }}>
          {isDelegate ? `Recorded on ${recordedOn} that ${artistDisplayName} submitted it.` : `Recorded on ${recordedOn}.`}{' '}
          Setlistr can’t see {isDelegate ? `${artistDisplayName}’s` : 'your'} {proName} account, so it can’t confirm {proName} received or accepted it.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 24 }}>
          <button className="sb-btn" onClick={backToSubmissions} style={primaryBtn}>Back to Submissions</button>
          <button className="sb-btn" onClick={() => setSubmitted(false)} style={{ ...textAction, alignSelf: 'center' }}>View claim sheet</button>
        </div>
        <details className="sb-more" style={{ marginTop: 18, borderTop: `1px solid ${C.border}` }}>
          <summary style={{ minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, fontWeight: 600, color: C.text }}>What happens next <ChevronDown className="sb-chev" size={16} aria-hidden="true" /></summary>
          <ol style={{ margin: '0 0 8px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14.5, color: C.secondary, lineHeight: 1.5 }}>
            <li>{proName} reviews it under its own process.</li>
            <li>Its status shows in {isDelegate ? `${artistDisplayName}’s` : 'your'} {proName} account{rule ? <> (<a href={rule.portalUrl} target="_blank" rel="noreferrer" style={{ color: C.secondary }}>{rule.portalUrl.replace(/^https?:\/\//, '')}</a>)</> : null}.</li>
            <li>If it’s accepted, it’s paid in a future {proName} distribution.</li>
          </ol>
        </details>
      </div>
    )
  }

  // ── Claim sheet: songs, at their position in the PRO's field order ─────────
  const copyMark = (key: string, wasCopied: boolean) => copyFailed === key
    ? <span style={{ fontSize: 13, color: C.red, fontWeight: 700, whiteSpace: 'nowrap' }}>Didn’t copy</span>
    : copied === key ? <span style={{ fontSize: 13, color: 'var(--sl-gold-text)', fontWeight: 700 }}>Copied</span>
    : wasCopied ? <Check size={16} strokeWidth={3} style={{ color: C.green }} aria-label="Copied" />
    : <Copy size={16} style={{ color: C.muted }} aria-hidden="true" />
  const songsBlock = (
    <div key="songs" style={{ borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 18px' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.secondary, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {allSongsCopied ? <Check size={15} strokeWidth={3} style={{ color: C.green }} aria-label="All copied" /> : null}
          Songs · {songsFailed ? '–' : songs.length}
        </span>
        {songs.length > 0 && !songsFailed && (
          <button className="sb-btn" onClick={() => copyText(allTitles(songTitles), ALL_SONGS_KEY)} style={{ ...textAction, fontSize: 14, color: copyFailed === ALL_SONGS_KEY ? C.red : 'var(--sl-gold-text)' }}>
            {copyFailed === ALL_SONGS_KEY ? 'Didn’t copy · try again' : copied === ALL_SONGS_KEY ? <><Check size={14} strokeWidth={3} />All {songs.length} titles copied</> : <><Copy size={14} aria-hidden="true" />Copy all titles</>}
          </button>
        )}
      </div>
      {songsFailed ? (
        <div style={{ padding: '0 18px 16px' }}><LoadError compact message="The songs didn’t load. Recording a submission waits until they do." onRetry={() => setReloadKey(k => k + 1)} /></div>
      ) : songs.length === 0 ? (
        <div style={{ padding: '0 18px 18px' }}>
          <p style={{ fontSize: 14.5, color: C.secondary, margin: '0 0 6px' }}>No songs saved yet. Finish reviewing the setlist first.</p>
          <button className="sb-btn" onClick={() => router.push(`/app/review/${params.id}`)} style={textAction}>Review the setlist →</button>
        </div>
      ) : (
        <>
          {songs.map((song, i) => {
            const key = `song-${i}`, wasCopied = songCopied(copyMarks, songTitles, i)
            const meta = [song.composer ? `Writer ${song.composer}` : null, song.isrc ? `ISRC ${song.isrc}` : null].filter(Boolean).join(' · ')
            return (
              <button key={key} className="sb-row" onClick={() => copyText(song.title, key)} aria-label={`Copy ${song.title}`}
                style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 18px', width: '100%', background: copied === key ? 'color-mix(in srgb, var(--sl-accent) 6%, transparent)' : 'transparent', border: 'none', borderTop: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                <span style={{ fontSize: 13, color: C.muted, minWidth: 18, textAlign: 'right', fontFamily: MONO }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600, color: C.text, overflowWrap: 'anywhere' }}>{song.title}</span>
                  <span style={{ display: 'block', fontSize: 13, color: C.muted, marginTop: 1, overflowWrap: 'anywhere' }}>{meta || 'Title only · search by title in the portal'}</span>
                </span>
                {copyMark(key, wasCopied)}
              </button>
            )
          })}
          <p style={{ fontSize: 13, color: C.muted, margin: 0, padding: '10px 18px', borderTop: `1px solid ${C.border}` }}>
            {[fullCount && `${fullCount} with writer and ISRC`, partialCount && `${partialCount} partial`, noneCount && `${noneCount} title only`].filter(Boolean).join(' · ')}
          </p>
        </>
      )}
    </div>
  )

  const detailFields = (
    <div className="sb-field" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 18px 18px' }}>
      {needsCityInput && (
        <div>
          <label htmlFor="sb-city" style={labelStyle}>City <span style={{ color: cityMissing ? C.amber : C.muted, fontWeight: 500 }}>· required</span></label>
          <input id="sb-city" type="text" value={manualCity} onChange={e => setManualCity(e.target.value)} placeholder="e.g. Austin, TX" aria-invalid={cityMissing} aria-describedby="sb-city-h" style={inputStyle(!!manualCity.trim())} />
          <p id="sb-city-h" style={hintStyle}>Not on file for this show.</p>
        </div>
      )}
      {inputFields.map(f => {
        const empty = f.required && !fieldValue(f.key)
        const hint = f.key === 'start_time' && startFromDevice ? 'From your capture, in this device’s time zone. Check it against the venue’s local time.' : f.hint
        const describedBy = hint ? `sb-${f.key}-h` : undefined
        return (
          <div key={f.key}>
            <label htmlFor={`sb-${f.key}`} style={labelStyle}>{f.label} <span style={{ color: empty ? C.amber : C.muted, fontWeight: 500 }}>· {f.required ? 'required' : 'optional'}</span></label>
            {f.key === 'start_time' && <input id={`sb-${f.key}`} type="time" value={startTime} onChange={e => setStartTime(e.target.value)} aria-invalid={empty} aria-describedby={describedBy} style={{ ...inputStyle(!!startTime), colorScheme: 'var(--sl-scheme)' } as React.CSSProperties} />}
            {f.key === 'ticket_price' && <input id={`sb-${f.key}`} type="number" inputMode="decimal" min="0" step="0.01" value={ticketPrice} onChange={e => setTicketPrice(e.target.value)} placeholder="0.00" aria-invalid={empty} aria-describedby={describedBy} style={inputStyle(!!ticketPrice)} />}
            {f.key === 'promoter' && <input id={`sb-${f.key}`} type="text" value={promoter} onChange={e => setPromoter(e.target.value)} placeholder="e.g. Live Nation, the venue, your name" aria-invalid={empty} aria-describedby={describedBy} style={inputStyle(!!promoter)} />}
            {f.key === 'attendance' && <input id={`sb-${f.key}`} type="number" inputMode="numeric" min="0" value={attendance} onChange={e => setAttendance(e.target.value)} placeholder="e.g. 150" aria-describedby={describedBy} style={inputStyle(!!attendance)} />}
            {hint && <p id={describedBy} style={hintStyle}>{hint}</p>}
          </div>
        )
      })}
      {capacityMatters && needsVenuePick && (
        <div role="group" aria-labelledby="sb-size-l">
          <span id="sb-size-l" style={labelStyle}>Venue size <span style={{ color: C.muted, fontWeight: 500 }}>· optional</span></span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))', gap: 6 }}>
            {VENUE_SIZE_OPTIONS.map(opt => (
              <button key={opt.key} className="sb-btn" aria-pressed={venueSizePick === opt.key} onClick={() => setVenueSizePick(venueSizePick === opt.key ? null : opt.key)}
                style={{ minHeight: 52, background: venueSizePick === opt.key ? C.goldDim : 'transparent', border: `1px solid ${venueSizePick === opt.key ? C.borderGold : C.border}`, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{opt.label}</span>
                <span style={{ fontSize: 12, color: C.muted }}>{opt.sub}</span>
              </button>
            ))}
          </div>
          <p style={hintStyle}>Used for the capacity field {proName} asks for.</p>
        </div>
      )}
      {detailsReady && <button className="sb-btn" onClick={() => setDetailsOpen(false)} aria-controls="sb-details-body" style={{ ...textAction, alignSelf: 'flex-start' }}>Done</button>}
    </div>
  )
  // The collapsed summary shows the values themselves, not a status.
  const detailSummary = [
    needsCityInput && manualCity.trim() ? `City ${manualCity.trim()}` : null,
    ...inputFields.map(f => fieldValue(f.key) ? `${f.label} ${fieldValue(f.key)}` : null),
    capacityMatters && needsVenuePick && effectiveCapacity ? `Capacity ~${effectiveCapacity.toLocaleString()}` : null,
  ].filter(Boolean).join(' · ')

  // ── Recording the submission (never triggered by copying or the portal) ────
  const recordLabel = isDelegate ? `Record that ${artistDisplayName} submitted it` : selfServe ? 'Mark as submitted' : 'Mark as submitted by your rep'
  const recordProminent = portalOpened && infoComplete && !isDelegate
  const markBlock = hasPRO && rule ? (
    <section className="sb-mark" aria-labelledby="sb-mark-h" style={{ ...SECTION, padding: '16px 18px 14px' }}>
      <h2 id="sb-mark-h" style={H2}>{isDelegate ? `When ${artistDisplayName} has submitted it` : selfServe ? 'After you’ve submitted' : 'After your rep has filed it'}</h2>
      <p style={SUB}>
        {isDelegate && !canWriteSubmission
          ? `Only ${artistDisplayName} or a teammate with submission access can record it here.`
          : `This records ${isDelegate ? 'what they tell you' : 'your report'}. Setlistr doesn’t file with ${proName} or see whether it arrived.`}
      </p>
      {submitError && (
        <div role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: C.redDim, border: '1px solid color-mix(in srgb, var(--sl-danger) 30%, transparent)', fontSize: 14.5, color: C.text, lineHeight: 1.5 }}>
          {submitError}
          {submitUncertain && <div><button className="sb-btn" onClick={checkRecordedAgain} disabled={markingDone} style={textAction}>{markingDone ? 'Checking…' : 'Check again'}</button></div>}
        </div>
      )}
      {canRecord && (confirmingRecord ? (
        <div role="group" aria-labelledby="sb-confirm-q" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p id="sb-confirm-q" style={{ margin: 0, fontSize: 14.5, color: C.text, lineHeight: 1.5 }}>Has {artistDisplayName} told you it’s submitted in {rule.program}?</p>
          <button className="sb-btn" onClick={handleArtistFiledIt} disabled={markingDone} style={primaryBtn}><Check size={16} strokeWidth={2.5} aria-hidden="true" />{markingDone ? 'Recording…' : 'Yes, record it'}</button>
          <button className="sb-btn" onClick={() => setConfirmingRecord(false)} style={{ ...textAction, alignSelf: 'center' }}>Cancel</button>
        </div>
      ) : (
        <button className="sb-btn" onClick={isDelegate ? handleArtistFiledIt : markSubmitted} disabled={markingDone || songsFailed}
          style={{ ...(recordProminent ? primaryBtn : secondaryBtn), marginTop: 14, opacity: markingDone || songsFailed ? 0.55 : 1, cursor: markingDone || songsFailed ? 'default' : 'pointer' }}>
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />{markingDone ? 'Recording…' : recordLabel}
        </button>
      ))}
    </section>
  ) : null

  // ── Actions: who does what next ─────────────────────────────────────────────
  // Never writes anything: the sheet is built from what's on screen.
  async function download() {
    if (songs.length === 0 || !performance) return
    setSheetError(null)
    let sheet: { text: string; filename: string }
    try {
      sheet = buildSubmissionBrief({ performance, songs, profile, rule, deadline, suggestedTitle, effectiveCapacity: effectiveCapacity ?? null, inputs })
    } catch (e) {
      console.error('[SubmitPage] claim sheet build failed:', e)
      setSheetError('The claim sheet couldn’t be created. Try again.')
      return
    }
    const file = claimSheetFile(sheet.text, sheet.filename)
    const route = chooseHandoffRoute({ native: isNativeApp(window), canShareFile: canShareFile(navigator, file) })
    if (route === 'download') {
      try { downloadTextFile(sheet.text, sheet.filename) } catch (e) {
        console.error('[SubmitPage] claim sheet download failed:', e)
        setSheetError('The claim sheet couldn’t be saved from this browser.')
        setSheetText(sheet.text)
      }
      return
    }
    if (route === 'share' && file) {
      try { await navigator.share({ files: [file], title: sheet.filename }); setSheetText(null) } catch (e) {
        if (isShareCancel(e)) return
        console.error('[SubmitPage] claim sheet share failed:', e)
        setSheetError('The claim sheet couldn’t be shared from the app. Copy it below instead.')
        setSheetText(sheet.text)
      }
      return
    }
    setSheetError('This app can’t save files yet. Copy the claim sheet below and paste it into Notes or an email.')
    setSheetText(sheet.text)
  }
  const sheetPanel = (sheetError || sheetText) ? (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sheetError && <p role="alert" style={{ margin: 0, padding: '12px 14px', borderRadius: 12, fontSize: 14.5, color: C.text, lineHeight: 1.5, background: C.amberDim, border: '1px solid color-mix(in srgb, var(--sl-warn) 28%, transparent)' }}>{sheetError}</p>}
      {sheetText && (
        <>
          <label htmlFor="sb-sheet-text" style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Claim sheet text</label>
          <textarea id="sb-sheet-text" readOnly value={sheetText} rows={10}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--sl-input-line)', background: 'var(--sl-input-bg, var(--sl-bg))', color: C.text, fontFamily: MONO, fontSize: 13, lineHeight: 1.45, resize: 'vertical' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px' }}>
            <button className="sb-btn" onClick={() => copyText(sheetText, 'sheet-text')} style={textAction}>
              {copyFailed === 'sheet-text' ? 'Didn’t copy · try again' : copied === 'sheet-text' ? <><Check size={15} strokeWidth={2.5} aria-hidden="true" />Copied</> : <><Copy size={15} aria-hidden="true" />Copy the sheet</>}
            </button>
            <button className="sb-btn" onClick={() => { setSheetText(null); setSheetError(null) }} style={{ ...textAction, color: C.secondary }}>Close</button>
          </div>
        </>
      )}
    </div>
  ) : null
  const linkBtn = (prominent: boolean) => (
    <button className="sb-btn" onClick={handleSendToArtist} style={prominent ? primaryBtn : secondaryBtn}>
      {copyFailed === 'send-link' ? 'Didn’t copy · try again'
        : copied === 'send-link' ? <><Check size={16} strokeWidth={2.5} aria-hidden="true" />Link copied. Paste it to {artistDisplayName}</>
        : `Copy a link for ${artistDisplayName}`}
    </button>
  )
  const handoffNote = isDelegate ? (
    <p style={{ ...hintStyle, margin: '2px 0 0' }}>
      Nothing is sent automatically. The link opens this sheet in {artistDisplayName}’s account; details typed on this device don’t go with it. The downloaded sheet includes them.
    </p>
  ) : null
  const portalBtn = (prominent: boolean) => (
    <button className="sb-btn" onClick={() => rule && handleOpenPortal(rule.portalUrl)} style={prominent ? primaryBtn : secondaryBtn}>
      <ExternalLink size={16} strokeWidth={2.5} aria-hidden="true" />{portalOpened ? `Open ${rule?.program} again` : rule?.portalLabel}
    </button>
  )
  // A route in question is checked before the portal leads.
  const portalProminent = infoComplete && !portalOpened && !territoryMismatch
  const downloadAction = songs.length > 0 && (
    <button className="sb-btn" onClick={download} style={{ ...textAction, alignSelf: 'center' }}>
      <FileText size={15} aria-hidden="true" />Download claim sheet{!isDelegate && missingFields.length > 0 ? ' (incomplete)' : ''}
    </button>
  )

  let actionsHeading = ''
  let actionsSub = ''
  let actions: React.ReactNode = null
  if (rule && !selfServe) {
    // Representative route (GMR): no portal to fill in.
    actionsHeading = `${proName} takes submissions through ${isDelegate ? `${artistDisplayName}’s` : 'your'} rep`
    actionsSub = `There’s no ${proName} portal to fill in. Send this sheet to the rep.`
    actions = <>
      <button className="sb-btn" onClick={download} disabled={songs.length === 0} style={{ ...(infoComplete ? primaryBtn : secondaryBtn), opacity: songs.length === 0 ? 0.55 : 1 }}><FileText size={16} aria-hidden="true" />Download sheet for the {proName} rep</button>
      <a href={rule.portalUrl} target="_blank" rel="noreferrer" style={{ ...textAction, alignSelf: 'center' }}>{rule.portalLabel} <ExternalLink size={14} aria-hidden="true" /></a>
      {isDelegate && <>{linkBtn(false)}{handoffNote}</>}
    </>
  } else if (rule && handoffFirst) {
    // The PRO says the songwriter enters the show: hand it over.
    actionsHeading = `${artistDisplayName} submits this in ${rule.program}`
    actionsSub = `${proName} asks the songwriter to enter the show. Copy a link for them to open this sheet.`
    actions = <>
      {linkBtn(infoComplete)}
      {handoffNote}
      {downloadAction}
      <a href={rule.portalUrl} target="_blank" rel="noreferrer" onClick={() => setPortalOpened(true)} style={{ ...textAction, alignSelf: 'center' }}>{rule.portalLabel} <ExternalLink size={14} aria-hidden="true" /></a>
    </>
  } else if (rule) {
    actionsHeading = `Submit in ${rule.program}`
    actionsSub = isDelegate
      ? `Use the access ${proName} gives you, or copy a link for ${artistDisplayName}. Setlistr never asks for portal logins.`
      : 'It opens in a new tab. Come back here to copy each field.'
    actions = <>
      {portalBtn(portalProminent)}
      {downloadAction}
      {isDelegate && <>{linkBtn(false)}{handoffNote}</>}
    </>
  }

  // Each prerequisite is its own optional, self-reported note.
  const submitterIsArtist = isDelegate
  const prereqLabel = (label: string) => {
    const l = label.charAt(0).toLowerCase() + label.slice(1)
    if (!submitterIsArtist) return label
    return l.replace(/^you’re /, `${artistDisplayName} is `).replace(/\byour\b/g, 'their').replace(/^./, c => c.toUpperCase())
  }
  const prerequisites = rule && preflightPending ? (
    <div role="group" aria-labelledby="sb-pre-h" style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
      <p id="sb-pre-h" style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: C.text }}>{handoffFirst ? `Before ${artistDisplayName} submits` : isDelegate ? 'Before submitting' : 'Before you submit'}</p>
      {rule.preflight.map(item => {
        const done = preflightDone.includes(item.id)
        return (
          <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, fontSize: 14.5, color: C.text, lineHeight: 1.4, cursor: 'pointer' }}>
            <input type="checkbox" className="sb-check" checked={done} onChange={() => togglePreflight(rule, item.id)} />
            <span>{prereqLabel(item.label)}</span>
          </label>
        )
      })}
      <details className="sb-more">
        <summary style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: C.secondary }}>Why these matter <ChevronDown className="sb-chev" size={15} aria-hidden="true" /></summary>
        <div style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5, paddingBottom: 4 }}>
          {rule.preflight.map(p => <p key={p.id} style={{ margin: '0 0 6px' }}>{p.detail}</p>)}
          <p style={{ margin: 0 }}>Setlistr can’t see {isDelegate ? `${artistDisplayName}’s` : 'your'} {proName} account. A tick is your own note, kept on this device; it’s optional.</p>
        </div>
      </details>
    </div>
  ) : null

  return frame(
    <>
      {/* Header: the show; one status line (information completeness) and the deadline in its own terms. */}
      <div style={{ padding: '16px 0 18px' }}>
        {backBtn}
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '4px 0 6px', letterSpacing: '-0.02em', lineHeight: 1.15, overflowWrap: 'anywhere' }}>{performance.venue_name}</h1>
        <p style={{ fontSize: 15, color: C.secondary, margin: 0 }}>
          {[performance.city, showDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), songsFailed ? null : `${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`, rule ? proName : null].filter(Boolean).join(' · ')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 14px', marginTop: 10 }}>
          {statusText && <StatusLabel label={statusText} color={statusText === 'Ready to submit' ? 'var(--sl-gold-text)' : statusText.includes('needed') ? C.amber : C.secondary} />}
          {deadlineLine && (
            <span style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: urgency === 'open' ? 500 : 700, color: urgency === 'expired' || urgency === 'urgent' ? C.red : urgency === 'soon' ? C.amber : C.secondary }}>
              <Clock size={14} aria-hidden="true" />{deadlineLine}
            </span>
          )}
        </div>
        {deadline && (
          <details className="sb-more" style={{ marginTop: 2 }}>
            <summary style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: C.muted }}>
              {deadlineQualifier}<span style={SR_ONLY}>: how this date is set</span> <ChevronDown className="sb-chev" size={14} aria-hidden="true" />
            </summary>
            <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 4px', lineHeight: 1.5, maxWidth: 640 }}>
              {deadline.confidence === 'official'
                ? <>{deadline.rule}{deadline.sourceUrl && <> (<a href={deadline.sourceUrl} target="_blank" rel="noreferrer" style={{ color: C.secondary }}>{deadline.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}</a>)</>}.</>
                : deadline.confidence === 'unverified'
                ? <>Setlistr uses 12 months from the show as a working window. {proName} hasn’t published a deadline Setlistr has confirmed, so check it in the portal.</>
                : <>{proName} doesn’t publish a deadline. This is a Setlistr reminder at six months; confirm timing with {selfServe ? proName : 'the rep'}.</>}
              {earlyStillOpen && deadline.earlyCutoff && <> Submit by {fmt(deadline.earlyCutoff)} for an earlier distribution; the final date stays open after that.</>}
              {urgency === 'expired' && rule?.supportUrl && <> <a href={rule.supportUrl} target="_blank" rel="noreferrer" style={{ color: C.secondary }}>Ask {proName} support</a> if this looks wrong.</>}
            </p>
          </details>
        )}
      </div>

      {isDelegate && (
        <p role="note" style={{ margin: '0 0 16px', fontSize: 14.5, color: C.secondary, lineHeight: 1.5 }}>
          You’re preparing this for <b style={{ fontWeight: 600, color: C.text }}>{artistDisplayName}</b>. Their legal name and IPI aren’t shown to you.
        </p>
      )}

      {!hasPRO ? (
        <section aria-labelledby="sb-nopro" style={{ ...SECTION, padding: '18px' }}>
          <h2 id="sb-nopro" style={H2}>{isDelegate ? `${artistDisplayName} hasn’t set a PRO yet` : 'Set your PRO to get a claim sheet'}</h2>
          <p style={SUB}>{isDelegate ? 'Once they choose one in Settings, this sheet follows that PRO’s portal.' : 'The sheet follows your PRO’s portal, field by field.'}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px', marginTop: 12 }}>
            {!isDelegate && <button className="sb-btn" onClick={() => router.push('/app/settings')} style={{ ...primaryBtn, width: 'auto', minHeight: 48 }}>Go to Settings</button>}
            <a href="https://www.alltrack.org" target="_blank" rel="noreferrer" style={textAction}>Not in a PRO? Try AllTrack <ExternalLink size={14} aria-hidden="true" /></a>
          </div>
          <p style={hintStyle}>AllTrack is recommended by SOCAN for tech-forward global submission. Free to join.</p>
          {submitError && <p role="alert" style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: C.redDim, fontSize: 14.5, color: C.text, lineHeight: 1.5 }}>{submitError}</p>}
          {canRecord
            ? <button className="sb-btn" onClick={markSubmitted} disabled={markingDone || songsFailed} style={{ ...secondaryBtn, marginTop: 16, opacity: markingDone || songsFailed ? 0.55 : 1 }}><Check size={15} strokeWidth={2.5} aria-hidden="true" />{markingDone ? 'Recording…' : 'Mark as submitted'}</button>
            : <div style={{ marginTop: 16 }}>{linkBtn(false)}</div>}
        </section>
      ) : rule && (
        <div className="sb-grid">
            {/* Details: the values with Edit when complete; open fields when something is missing. */}
            {hasDetails && (
              <section className="sb-details" aria-labelledby="sb-details-h" style={SECTION}>
                {showDetailFields ? (
                  <div id="sb-details-body">
                    <div style={SECTION_HEAD}>
                      <div><h2 id="sb-details-h" style={H2}>Details {proName} asks for</h2><p style={SUB}>Saved on this device as you type.</p></div>
                      {!detailsReady && <span aria-live="polite" style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>{missingCount} needed</span>}
                    </div>
                    {detailFields}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 18px', minHeight: 60 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 id="sb-details-h" style={{ ...H2, fontSize: 15 }}>Details for {proName}</h2>
                      <p style={{ ...SUB, margin: '1px 0 0', overflowWrap: 'anywhere' }}>{detailSummary || 'Nothing else to add'}</p>
                    </div>
                    <button className="sb-btn" onClick={() => setDetailsOpen(true)} aria-expanded={false} aria-controls="sb-details-body" aria-label={`Edit details for ${proName}`} style={textAction}>Edit</button>
                  </div>
                )}
              </section>
            )}

            {/* What happens next, with anything to resolve first directly above the action. */}
            <section className="sb-portal" aria-labelledby="sb-portal-h" style={{ ...SECTION, padding: '16px 18px 14px', border: `1px solid ${portalProminent ? C.borderGold : C.border}` }}>
              <h2 id="sb-portal-h" style={H2}>{actionsHeading}</h2>
              <p style={SUB}>{actionsSub}</p>

              {territoryMismatch && venueTerritory && (
                <p role="note" style={{ margin: '12px 0 0', padding: '12px 14px', borderRadius: 12, fontSize: 14.5, color: C.text, lineHeight: 1.5, background: C.amberDim, border: '1px solid color-mix(in srgb, var(--sl-warn) 28%, transparent)', display: 'flex', gap: 10 }}>
                  <AlertTriangle size={16} style={{ color: C.amber, flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
                  <span><b style={{ fontWeight: 700 }}>Check the reporting route.</b> This show looks like it was in {TERRITORY_LABEL[venueTerritory]}, and {rule.program} is for shows in {TERRITORY_LABEL[rule.homeTerritory]}{TERRITORY_LABEL[rule.homeTerritory].endsWith('.') ? '' : '.'} Ask {proName} support how to report it.</span>
                </p>
              )}

              {prerequisites}

              {!isDelegate && missingFields.length > 0 && songs.length > 0 && (
                <p style={{ margin: '12px 0 0', fontSize: 14, color: C.secondary, lineHeight: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 12px' }}>
                  <span style={{ flex: '1 1 200px' }}>The sheet won’t include your {missingFields.join(' or ')}. Some PROs need {missingFields.length > 1 ? 'them' : 'it'}.</span>
                  <button className="sb-btn" onClick={() => router.push('/app/settings')} style={textAction}>Add in Settings</button>
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>{actions}</div>
              {sheetPanel}
            </section>

            {/* The claim sheet, in the portal's order */}
            <section className="sb-sheet" aria-labelledby="sb-sheet-h" style={SECTION}>
              <div style={SECTION_HEAD}>
                <div><h2 id="sb-sheet-h" style={H2}>Claim sheet</h2><p style={SUB}>In {rule.program} order. Tap a field to copy it.</p></div>
              </div>
              {copyFailed && <p role="alert" style={{ margin: '0 18px 12px', padding: '12px 14px', borderRadius: 12, fontSize: 14.5, color: C.text, lineHeight: 1.5, background: C.amberDim, border: '1px solid color-mix(in srgb, var(--sl-warn) 28%, transparent)' }}>Couldn’t copy to the clipboard. Try again, or press and hold the text to select it.</p>}
              {sheetFields.map(f => {
                if (f.key === 'songs') return songsBlock
                const value = fieldValue(f.key), wasCopied = hasCopyMark(copyMarks, f.key, value)
                return (
                  <button key={f.key} className="sb-row" disabled={!value} onClick={() => value && copyText(value, f.key)} aria-label={value ? `Copy ${f.label}: ${value}` : `${f.label}: ${f.required ? 'needed above' : 'optional, not filled in'}`}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 30%) minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12, minHeight: 52, padding: '8px 18px', width: '100%', background: copied === f.key ? 'color-mix(in srgb, var(--sl-accent) 6%, transparent)' : 'transparent', border: 'none', borderTop: `1px solid ${C.border}`, cursor: value ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: 14, color: C.secondary }}>{f.label}</span>
                    <span style={{ fontSize: 15, fontFamily: MONO, color: !value ? (f.required ? C.amber : C.muted) : C.text, overflowWrap: 'anywhere', fontStyle: value ? 'normal' : 'italic' }}>{value || (f.required ? 'Needed above' : 'Optional')}</span>
                    {value ? copyMark(f.key, wasCopied) : <span />}
                  </button>
                )
              })}
              {(profile?.legal_name || profile?.ipi_number || profile?.publisher_name) && (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  <p style={{ fontSize: 13, color: C.muted, margin: 0, padding: '10px 18px 0' }}>If the portal asks</p>
                  {([['legal_name', 'Legal name'], ['ipi_number', 'IPI'], ['publisher_name', 'Publisher']] as [ClaimFieldKey, string][]).map(([k, label]) => {
                    const v = fieldValue(k); if (!v) return null
                    return (
                      <button key={k} className="sb-row" onClick={() => copyText(v, k)} aria-label={`Copy ${label}: ${v}`}
                        style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 30%) minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12, minHeight: 48, padding: '6px 18px', width: '100%', background: copied === k ? 'color-mix(in srgb, var(--sl-accent) 6%, transparent)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <span style={{ fontSize: 14, color: C.secondary }}>{label}</span>
                        <span style={{ fontSize: 15, fontFamily: MONO, color: C.text, overflowWrap: 'anywhere' }}>{v}</span>
                        {copyMark(k, hasCopyMark(copyMarks, k, v))}
                      </button>
                    )
                  })}
                </div>
              )}
              <p style={{ fontSize: 13, color: C.muted, margin: 0, padding: '10px 18px 12px', borderTop: `1px solid ${C.border}` }}>A check means you copied that value in this tab. It doesn’t mean anything was submitted.</p>
            </section>

            {rule.notes.length > 0 && (
              <ul className="sb-notes" style={{ margin: 0, padding: '0 4px 0 22px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rule.notes.map(n => <li key={n} style={{ fontSize: 14, color: C.secondary, lineHeight: 1.5 }}>{n}</li>)}
              </ul>
            )}
            {markBlock}

            {/* Help, folded: where to click. */}
            <section className="sb-help" style={SECTION}>
              <button className="sb-btn" onClick={() => setStepsOpen(v => !v)} aria-expanded={stepsOpen} aria-controls="sb-steps"
                style={{ width: '100%', minHeight: 52, padding: '0 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontFamily: 'inherit' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text, textAlign: 'left' }}>{selfServe ? `Where to click in ${rule.program}` : `Steps with the ${proName} rep`}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: C.secondary, whiteSpace: 'nowrap' }}>{stepsCompleted > 0 ? `${stepsCompleted} of ${totalSteps}` : `${rule.steps.length} steps`}{stepsOpen ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}</span>
              </button>
              {stepsOpen && (
                <div id="sb-steps" style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rule.steps.map((step, i) => (
                    <button key={i} className="sb-btn" role="checkbox" aria-checked={!!stepsDone[i]} onClick={() => setStepsDone(prev => prev.map((v, idx) => idx === i ? !v : v))}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minHeight: 44, padding: '10px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: stepsDone[i] ? C.green : 'color-mix(in srgb, var(--sl-text) 6%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{stepsDone[i] ? <Check size={12} strokeWidth={3} style={{ color: 'var(--sl-on-accent)' }} /> : <span style={{ fontSize: 11, color: C.secondary, fontFamily: MONO, fontWeight: 700 }}>{i + 1}</span>}</span>
                      <span style={{ fontSize: 15, color: stepsDone[i] ? C.muted : C.text, lineHeight: 1.4, textDecoration: stepsDone[i] ? 'line-through' : 'none' }}>{step}</span>
                    </button>
                  ))}
                  <p style={{ ...hintStyle, margin: '6px 0 0' }}>
                    {rule.supportUrl && <a href={rule.supportUrl} target="_blank" rel="noreferrer" style={{ color: C.secondary }}>{proName} support</a>}
                    {rule.phone && <> · {rule.phone}</>}
                  </p>
                </div>
              )}
            </section>
        </div>
      )}
    </>
  )
}
