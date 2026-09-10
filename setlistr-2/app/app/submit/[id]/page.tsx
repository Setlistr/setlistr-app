'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, ExternalLink, Copy, ChevronDown, ChevronUp, FileText, AlertTriangle, Clock } from 'lucide-react'
import {
  getProRule, daysUntil, urgencyFor, formatClaimDate, formatClaimTime, detectTerritory,
  INPUT_FIELDS,
  type ProRule, type ClaimFieldKey, type DeadlineResult, type Urgency, type Territory,
} from '@/lib/pro-rules'

const CARD = {
  background: 'linear-gradient(180deg, #171512 0%, #121009 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  amber: '#f59e0b', amberDim: 'rgba(245,158,11,0.08)',
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveConfidence(song: { isrc?: string; composer?: string }): Song['matchConfidence'] {
  if (song.isrc && song.composer) return 'full'
  if (song.isrc || song.composer) return 'partial'
  return 'none'
}

function ConfDot({ c }: { c: Song['matchConfidence'] }) {
  const color = c === 'full' ? C.green : c === 'partial' ? C.gold : C.muted
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function defaultStartTime(perf: Performance): string {
  if (perf.started_at) {
    const d = new Date(perf.started_at)
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
  }
  if (perf.start_time) return perf.start_time.slice(0, 5)
  return ''
}

function urgencyStyle(u: Urgency) {
  if (u === 'expired' || u === 'urgent') return { color: C.red, bg: C.redDim, border: 'rgba(248,113,113,0.25)' }
  if (u === 'soon') return { color: C.amber, bg: C.amberDim, border: 'rgba(245,158,11,0.25)' }
  return { color: C.text, bg: 'rgba(255,255,255,0.02)', border: C.border }
}

function downloadSubmissionBrief({
  performance, songs, profile, rule, deadline, suggestedTitle,
  effectiveCapacity, inputs,
}: {
  performance: Performance; songs: Song[]; profile: Profile | null
  rule: ProRule | null; deadline: DeadlineResult | null
  suggestedTitle: string; effectiveCapacity: number | null; inputs: ClaimInputs
}) {
  const showDate = new Date(performance.started_at)
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

  const blob = new Blob([brief], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeVenue = performance.venue_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const safeDate = showDate.toISOString().slice(0, 10)
  a.href = url
  a.download = `setlistr-claim-${safeVenue}-${safeDate}.txt`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

export default function SubmitPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance]     = useState<Performance | null>(null)
  const [songs, setSongs]                 = useState<Song[]>([])
  const [profile, setProfile]             = useState<Profile | null>(null)
  const [isDelegate, setIsDelegate]       = useState(false)
  const [loading, setLoading]             = useState(true)
  const [copied, setCopied]               = useState<string | null>(null)
  const [copiedKeys, setCopiedKeys]       = useState<string[]>([])
  const [stepsOpen, setStepsOpen]         = useState(false)
  const [submitted, setSubmitted]         = useState(false)
  const [submittedAt, setSubmittedAt]     = useState<string | null>(null)
  const [markingDone, setMarkingDone]     = useState(false)
  const [filedPulse, setFiledPulse]       = useState(false)
  const [stepsDone, setStepsDone]         = useState<boolean[]>([])
  const [venueSizePick, setVenueSizePick] = useState<VenueSizePick | null>(null)
  const [portalOpened, setPortalOpened]   = useState(false)
  const [preflightDone, setPreflightDone] = useState<string[]>([])
  const [preflightOpen, setPreflightOpen] = useState(true)
  const [inputsReady, setInputsReady]     = useState(false)

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
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: perf } = await supabase
        .from('performances_visible').select('*, shows(show_type), venues(capacity, city, country)')
        .eq('id', params.id).single()

      if (!perf) { setLoading(false); return }

      const ownerId = perf.user_id as string
      const delegateView = user.id !== ownerId
      setIsDelegate(delegateView)

      const perfRecord: Performance = {
        ...perf,
        show_type:         perf.shows?.show_type || null,
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
        try {
          const ctxRes = await fetch(`/api/team/context-data?artist_id=${ownerId}`)
          const ctx = await ctxRes.json()
          if (!ctx.error) {
            profileData = {
              pro_affiliation: ctx.pro_affiliation || null,
              artist_name:     ctx.artist_name || null,
              legal_name:      null,
              ipi_number:      null,
              publisher_name:  null,
            }
          }
        } catch (e) { console.error('[SubmitPage] context-data fetch failed:', e) }
      } else {
        const { data } = await supabase
          .from('profiles').select('pro_affiliation, legal_name, ipi_number, publisher_name, artist_name')
          .eq('id', ownerId).single()
        profileData = data
      }
      setProfile(profileData)

      let songData: any[] = []
      try {
        const songsRes = await fetch(`/api/performance-songs?performanceId=${params.id}`)
        const songsJson = await songsRes.json()
        songData = songsJson.songs || []
      } catch (e) { console.error('[SubmitPage] songs fetch failed:', e) }

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
        const pf = readLocal<string[]>(`setlistr:preflight:${ownerId}:${rule.code}`) || []
        setPreflightDone(pf)
        const allDone = rule.preflight.every(p => pf.includes(p.id))
        setPreflightOpen(!allDone)
      }

      // Restore any show details typed on this device for this show
      const saved = readLocal<ClaimInputs>(`setlistr:claim:${params.id}`)
      setPromoter(saved?.promoter || '')
      setTicketPrice(saved?.ticketPrice || '')
      setAttendance(saved?.attendance || '')
      setStartTime(saved?.startTime || defaultStartTime(perfRecord))
      setManualCity(saved?.city || '')
      setInputsReady(true)

      setLoading(false)
    }
    load()
  }, [params.id])

  useEffect(() => {
    if (!inputsReady) return
    writeLocal(`setlistr:claim:${params.id}`, { promoter, ticketPrice, attendance, startTime, city: manualCity })
  }, [inputsReady, params.id, promoter, ticketPrice, attendance, startTime, manualCity])

  function copyText(text: string, key: string) {
    try { navigator.clipboard.writeText(text) } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(key)
    setCopiedKeys(prev => prev.includes(key) ? prev : [...prev, key])
    setTimeout(() => setCopied(null), 2000)
  }

  function togglePreflight(rule: ProRule, id: string) {
    if (!performance) return
    setPreflightDone(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      writeLocal(`setlistr:preflight:${performance.user_id}:${rule.code}`, next)
      if (rule.preflight.every(p => next.includes(p.id))) setPreflightOpen(false)
      return next
    })
  }

  function handleOpenPortal(url: string) {
    window.open(url, '_blank')
    setPortalOpened(true)
  }

  async function markSubmitted() {
    if (markingDone) return
    setMarkingDone(true)
    const supabase = createClient()
    const now = new Date().toISOString()
    await supabase.from('performances').update({
      submission_status: 'submitted', submitted_at: now,
    }).eq('id', params.id)
    setSubmittedAt(now)
    setFiledPulse(true)
    await new Promise(r => setTimeout(r, 400))
    setSubmitted(true)
    setMarkingDone(false)
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
  // confirmation dialog exists so a delegate can't tap through and imply
  // Setlistr (or the delegate) verified a PRO filing that only the artist
  // can actually make.
  async function handleArtistFiledIt() {
    if (!rule || !performance) return
    const ok = window.confirm(`Confirm ${artistDisplayName} completed the submission in ${rule.program}.`)
    if (!ok) return
    await markSubmitted()
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  if (!performance) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <p style={{ color: C.muted }}>Performance not found.</p>
    </div>
  )

  const pro            = profile?.pro_affiliation
  const rule           = getProRule(pro)
  const hasPRO         = !!rule
  const proName        = rule?.name || pro || 'your PRO'
  const stepsCompleted = stepsDone.filter(Boolean).length
  const totalSteps     = stepsDone.length
  const showDate       = new Date(performance.started_at)
  const artistDisplayName = profile?.artist_name || performance.artist_name
  const suggestedTitle = `${artistDisplayName} - ${performance.venue_name}`
  const fullCount    = songs.filter(s => s.matchConfidence === 'full').length
  const partialCount = songs.filter(s => s.matchConfidence === 'partial').length
  const noneCount     = songs.filter(s => s.matchConfidence === 'none').length

  const deadline  = rule ? rule.deadline(showDate) : null
  const daysLeft  = deadline ? daysUntil(deadline.date) : null
  const urgency   = daysLeft !== null ? urgencyFor(daysLeft) : null
  const uStyle    = urgency ? urgencyStyle(urgency) : null
  const earlyStillOpen = !!(deadline?.earlyCutoff && daysUntil(deadline.earlyCutoff) > 0)

  const venueTerritory    = detectTerritory(performance.country, performance.city)
  const territoryMismatch = !!(rule && venueTerritory && venueTerritory !== rule.homeTerritory)

  const effectiveCapacity = performance.venue_capacity
    || (venueSizePick ? VENUE_SIZE_OPTIONS.find(o => o.key === venueSizePick)?.capacity : null)
  const needsVenuePick = !performance.venue_capacity
  const capacityMatters = !!rule?.fields.some(f => f.key === 'capacity')

  const inputs: ClaimInputs = { promoter, ticketPrice, attendance, startTime, city: manualCity }
  const inputFields = rule ? rule.fields.filter(f => INPUT_FIELDS.includes(f.key)) : []
  const preflightComplete = rule ? rule.preflight.every(p => preflightDone.includes(p.id)) : true

  // City is normally derived from the performance record and never shown as
  // an input. It only becomes an editable field when the performance has no
  // city on file AND the current PRO's claim actually asks for one.
  const needsCityInput = !performance.city && !performance.venue_city && !!rule?.fields.some(f => f.key === 'venue_city')
  const cityMissing = needsCityInput && !manualCity.trim()

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

  const allSongsCopied = songs.length > 0 && (
    copiedKeys.includes('all-songs') || songs.every((_, i) => copiedKeys.includes(`song-${i}`))
  )
  const sheetFields  = rule ? rule.fields : []
  const sheetDone    = sheetFields.filter(f => f.key === 'songs' ? allSongsCopied : copiedKeys.includes(f.key)).length
  const missingRequired = inputFields.filter(f => f.required && !fieldValue(f.key))
  const detailsReady = missingRequired.length === 0 && !cityMissing
  const missingCount = missingRequired.length + (cityMissing ? 1 : 0)

  const inputStyle = (filled: boolean) => ({
    width: '100%', background: '#0a0908', border: `1px solid ${filled ? C.borderGold : C.border}`,
    borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box' as const,
  })
  const labelStyle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
    color: C.muted, display: 'block', marginBottom: 6,
  }

  // ── Submitted confirmation ──────────────────────────────────────────────────
  if (submitted) return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.06) 0%, transparent 65%)' }} />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fadeUp 0.5s ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Check size={28} color={C.green} strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Added to your claim record.</h1>
        <p style={{ fontSize: 17, color: C.secondary, margin: '0 0 6px' }}>
          Marked as filed with {proName}{isDelegate ? ` for ${artistDisplayName}` : ''}
        </p>
        <p style={{ fontSize: 15, color: C.muted, margin: '0 0 28px' }}>
          {performance.venue_name}{performance.city ? ` · ${performance.city}` : ''} · {showDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        <div style={{ width: '100%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 16, padding: '18px 20px', marginBottom: 14 }}>
          <p style={{ fontSize: 14, color: C.green, margin: '0 0 4px', fontWeight: 700 }}>{songs.length} songs on the record</p>
          <p style={{ fontSize: 12, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
            Setlistr can’t see your PRO account — check claim status in the portal.
          </p>
        </div>

        {/* What happens next */}
        <div style={{ width: '100%', background: CARD.background, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px 18px', marginBottom: 14, textAlign: 'left', boxShadow: CARD.boxShadow }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 12px' }}>What Happens Next</p>
          {[
            `${proName} reviews the submission according to its own process`,
            `Check your ${proName} portal for status`,
            `If accepted, paid in a future ${proName} distribution`,
          ].map((label, i, arr) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: MONO, flexShrink: 0, minWidth: 16, textAlign: 'center' }}>{i + 1}</span>
              <p style={{ fontSize: 14, color: C.text, margin: 0, fontWeight: 600 }}>{label}</p>
            </div>
          ))}
          {rule && (
            <p style={{ fontSize: 11, color: C.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
              Track it at{' '}
              <a href={rule.portalUrl} target="_blank" rel="noreferrer" style={{ color: C.secondary, textDecoration: 'underline' }}>{rule.portalUrl.replace(/^https?:\/\//, '')}</a>
            </p>
          )}
        </div>

        {/* Receipt */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 18px', marginBottom: 20, textAlign: 'left' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 10px' }}>Your Record</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Show', `${performance.venue_name}${performance.city ? `, ${performance.city}` : ''}`],
              ['Date', showDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
              ['Filed to', proName],
              ['Songs', String(songs.length)],
              ['Marked filed', (submittedAt ? new Date(submittedAt) : new Date()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                <span style={{ fontSize: 11, color: C.secondary, fontFamily: MONO, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => router.push('/app/dashboard')}
          style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10, transition: 'opacity 0.15s ease' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
          Back to Dashboard
        </button>
        <button onClick={() => setSubmitted(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          View claim sheet
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )

  // ── Songs block (rendered at its position in the PRO's field order) ─────────
  const songsBlock = (
    <div key="songs" style={{ borderTop: `1px solid ${C.border}` }}>
      <div style={{ padding: '12px 18px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {allSongsCopied
              ? <Check size={13} color={C.green} strokeWidth={3} />
              : <span style={{ width: 13, height: 13, borderRadius: '50%', border: `1px solid ${C.border}`, display: 'inline-block' }} />}
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted }}>Songs ({songs.length})</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {fullCount > 0 && <span style={{ fontSize: 10, color: C.green }}>●&nbsp;{fullCount}</span>}
            {partialCount > 0 && <span style={{ fontSize: 10, color: C.gold }}>●&nbsp;{partialCount}</span>}
            {noneCount > 0 && <span style={{ fontSize: 10, color: C.muted }}>●&nbsp;{noneCount}</span>}
          </div>
        </div>
        {songs.length > 0 && (
          <button onClick={() => copyText(songs.map(s => s.title).join('\n'), 'all-songs')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: copied === 'all-songs' ? C.goldDim : 'rgba(255,255,255,0.03)', border: `1px solid ${copied === 'all-songs' ? C.borderGold : C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied === 'all-songs'
              ? <><Check size={11} color={C.gold} strokeWidth={3} /><span style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>All {songs.length} titles copied</span></>
              : <><Copy size={11} color={C.muted} /><span style={{ fontSize: 13, fontWeight: 600, color: C.secondary }}>Copy all titles</span></>}
          </button>
        )}
      </div>

      {songs.length === 0 ? (
        <div style={{ padding: '8px 18px 20px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>No songs saved yet — finish your setlist review first.</p>
          <button onClick={() => router.push(`/app/review/${params.id}`)}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 18px', color: C.secondary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Review Setlist →
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {songs.map((song, i) => {
            const key = `song-${i}`
            const isCopied = copied === key
            const wasCopied = copiedKeys.includes(key) || copiedKeys.includes('all-songs')
            return (
              <button key={key} onClick={() => copyText(song.title, key)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', background: isCopied ? 'rgba(201,168,76,0.04)' : 'transparent', border: 'none', borderTop: `1px solid ${C.border}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                <span style={{ fontSize: 13, color: C.muted, minWidth: 20, textAlign: 'right', fontFamily: MONO, flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: isCopied ? C.gold : wasCopied ? C.secondary : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' as const }}>
                    {song.composer && <span style={{ fontSize: 12, color: C.muted }}>Writer: <span style={{ color: C.secondary }}>{song.composer}</span></span>}
                    {song.isrc && <span style={{ fontSize: 12, color: C.muted, fontFamily: MONO }}>ISRC: <span style={{ color: C.secondary }}>{song.isrc}</span></span>}
                    {!song.composer && !song.isrc && <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>search by title</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <ConfDot c={song.matchConfidence} />
                  {isCopied ? <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>Copied</span>
                    : wasCopied ? <Check size={12} color={C.green} strokeWidth={3} />
                    : <Copy size={12} color={C.muted} />}
                </div>
              </button>
            )
          })}
          <div style={{ padding: '9px 18px', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.01)' }}>
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Green = metadata available · Gold = partial metadata · Grey = title only</p>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '28px 16px 80px', boxSizing: 'border-box' as const }}>

        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 20px', letterSpacing: '0.04em' }}>← Back</button>

        {/* Hero */}
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: C.secondary, margin: '0 0 6px' }}>
          {performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Ready to Claim
        </h1>
        <p style={{ fontSize: 15, color: C.secondary, margin: '4px 0 20px' }}>
          {showDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          {rule ? ` · ${rule.program}` : ''}
        </p>

        {isDelegate && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              You’re preparing this claim for <strong style={{ color: C.secondary }}>{artistDisplayName}</strong>. Only {artistDisplayName} can file in {proName}’s portal — you can send this sheet to them or mark it filed once they have.
            </span>
          </div>
        )}

        {/* Deadline */}
        {deadline && uStyle && daysLeft !== null && (
          <div style={{ background: uStyle.bg, border: `1px solid ${uStyle.border}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Clock size={20} color={uStyle.color} strokeWidth={2} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: uStyle.color, margin: 0 }}>
                {urgency === 'expired'
                  ? `Window closed ${deadline.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left · ${deadline.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </p>
              <p style={{ fontSize: 12, color: C.secondary, margin: '3px 0 0', lineHeight: 1.4 }}>
                {deadline.confidence === 'unverified'
                  ? `12-month working window · confirm in the ${proName} portal`
                  : deadline.rule}
                {deadline.confidence === 'official' && deadline.sourceUrl && (
                  <> · <a href={deadline.sourceUrl} target="_blank" rel="noreferrer" style={{ color: C.secondary, textDecoration: 'underline' }}>{proName} rule ↗</a></>
                )}
                {deadline.confidence === 'reminder' && ' · Setlistr reminder, not a PRO deadline'}
              </p>
              {earlyStillOpen && deadline.earlyCutoff && (
                <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0', lineHeight: 1.4 }}>
                  File by {deadline.earlyCutoff.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} for an earlier distribution — this final cutoff stays open after that date passes.
                </p>
              )}
              {urgency === 'expired' && rule?.supportUrl && (
                <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>
                  Think this is wrong? <a href={rule.supportUrl} target="_blank" rel="noreferrer" style={{ color: C.secondary }}>Ask {proName} support ↗</a>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Territory mismatch */}
        {territoryMismatch && rule && venueTerritory && (
          <div style={{ background: C.amberDim, border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 10 }}>
            <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
              This show looks like it was in {TERRITORY_LABEL[venueTerritory]}. {rule.program} is built for shows in {TERRITORY_LABEL[rule.homeTerritory]} — ask {proName} support how to report international performances.
            </p>
          </div>
        )}

        {/* No PRO */}
        {!hasPRO && (
          <div style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ fontSize: 15, color: C.red, margin: '0 0 4px', fontWeight: 700 }}>No PRO selected</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 10px' }}>
              {isDelegate
                ? `${artistDisplayName} hasn’t set a PRO in Settings yet.`
                : 'Set your PRO in Settings to get a claim sheet built for your portal.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {!isDelegate && (
                <button onClick={() => router.push('/app/settings')}
                  style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '8px 14px', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Go to Settings →
                </button>
              )}
              <a href="https://www.alltrack.org" target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 14px', color: C.secondary, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                Not in a PRO? Try AllTrack ↗
              </a>
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
              AllTrack is recommended by SOCAN for tech-forward global submission. Free to join.
            </p>
          </div>
        )}

        {/* Venue capacity — only shown when the PRO's claim fields actually ask for it */}
        {capacityMatters && needsVenuePick && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 10px' }}>Venue size</p>
            <p style={{ fontSize: 10, color: C.muted, margin: '0 0 10px' }}>Used for the capacity field {proName} asks for.</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {VENUE_SIZE_OPTIONS.map(opt => (
                <button key={opt.key} onClick={() => setVenueSizePick(venueSizePick === opt.key ? null : opt.key)}
                  style={{ flex: 1, padding: '7px 4px', background: venueSizePick === opt.key ? 'rgba(255,255,255,0.05)' : 'transparent', border: `1px solid ${venueSizePick === opt.key ? 'rgba(255,255,255,0.2)' : C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: venueSizePick === opt.key ? C.text : C.secondary }}>{opt.label}</span>
                  <span style={{ fontSize: 9, color: C.muted }}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Preflight — one-time account checks */}
        {rule && rule.preflight.length > 0 && (
          <div style={{ background: CARD.background, border: `1px solid ${preflightComplete ? 'rgba(74,222,128,0.2)' : C.border}`, borderRadius: 16, marginBottom: 12, overflow: 'hidden', boxShadow: CARD.boxShadow }}>
            <button onClick={() => setPreflightOpen(v => !v)}
              style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{proName} account check</span>
                {preflightComplete
                  ? <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px' }}>✓ Ready</span>
                  : <span style={{ fontSize: 11, color: C.muted }}>One-time · {preflightDone.filter(id => rule.preflight.some(p => p.id === id)).length}/{rule.preflight.length}</span>}
              </div>
              {preflightOpen ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
            </button>
            {preflightOpen && (
              <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 2px', lineHeight: 1.5 }}>Claims fail silently when these aren’t set. Confirm once — we’ll remember on this device.</p>
                {rule.preflight.map(item => {
                  const done = preflightDone.includes(item.id)
                  return (
                    <button key={item.id} onClick={() => togglePreflight(rule, item.id)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', background: done ? C.greenDim : 'rgba(255,255,255,0.02)', border: `1px solid ${done ? 'rgba(74,222,128,0.2)' : C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, background: done ? C.green : 'transparent', border: `1px solid ${done ? C.green : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {done && <Check size={11} color="#0a0908" strokeWidth={3} />}
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>{item.label}</p>
                        <p style={{ fontSize: 11, color: C.muted, margin: '3px 0 0', lineHeight: 1.45 }}>{item.detail}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Show details the PRO asks for */}
        {rule && (inputFields.length > 0 || needsCityInput) && (
          <div style={{ background: CARD.background, border: `1px solid ${detailsReady ? 'rgba(74,222,128,0.2)' : C.border}`, borderRadius: 16, padding: '14px 18px 18px', marginBottom: 12, boxShadow: CARD.boxShadow }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Show details</span>
              {detailsReady
                ? <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px' }}>✓ Ready</span>
                : <span style={{ fontSize: 11, color: C.amber }}>{missingCount} needed by {proName}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {needsCityInput && (
                <div>
                  <label style={labelStyle}>City<span style={{ color: C.amber }}> *</span></label>
                  <input type="text" value={manualCity} onChange={e => setManualCity(e.target.value)}
                    placeholder="e.g. Austin, TX" style={inputStyle(!!manualCity.trim())} />
                  <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>Not on file for this show — {proName} needs it.</p>
                </div>
              )}
              {inputFields.map(f => (
                <div key={f.key}>
                  <label style={labelStyle}>
                    {f.label}{f.required && <span style={{ color: C.amber }}> *</span>}
                  </label>
                  {f.key === 'start_time' && (
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      style={{ ...inputStyle(!!startTime), colorScheme: 'dark' }} />
                  )}
                  {f.key === 'ticket_price' && (
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={ticketPrice}
                      onChange={e => setTicketPrice(e.target.value)} placeholder="0.00" style={inputStyle(!!ticketPrice)} />
                  )}
                  {f.key === 'promoter' && (
                    <input type="text" value={promoter} onChange={e => setPromoter(e.target.value)}
                      placeholder="e.g. Live Nation, the venue, your name" style={inputStyle(!!promoter)} />
                  )}
                  {f.key === 'attendance' && (
                    <input type="number" inputMode="numeric" min="0" value={attendance}
                      onChange={e => setAttendance(e.target.value)} placeholder="e.g. 150" style={inputStyle(!!attendance)} />
                  )}
                  {f.hint && <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>{f.hint}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Claim sheet — portal field order, one tap per field */}
        {rule && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 12, overflow: 'hidden', boxShadow: CARD.boxShadow }}>
            <div style={{ padding: '14px 18px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>Claim sheet</p>
                <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>In {rule.program} order. Tap to copy, paste into the portal.</p>
              </div>
              <span style={{ fontSize: 12, fontFamily: MONO, color: sheetDone === sheetFields.length ? C.green : C.secondary, flexShrink: 0 }}>
                {sheetDone}/{sheetFields.length}
              </span>
            </div>

            {sheetFields.map(f => {
              if (f.key === 'songs') return songsBlock
              const value = fieldValue(f.key)
              const isCopied = copied === f.key
              const wasCopied = copiedKeys.includes(f.key)
              return (
                <button key={f.key} disabled={!value} onClick={() => value && copyText(value, f.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', width: '100%', background: isCopied ? 'rgba(201,168,76,0.04)' : 'transparent', border: 'none', borderTop: `1px solid ${C.border}`, cursor: value ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit' }}>
                  <div style={{ width: 13, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                    {wasCopied
                      ? <Check size={13} color={C.green} strokeWidth={3} />
                      : <span style={{ width: 13, height: 13, borderRadius: '50%', border: `1px solid ${C.border}`, display: 'inline-block' }} />}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.muted, width: 92, flexShrink: 0 }}>{f.label}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontFamily: MONO, color: !value ? C.muted : isCopied ? C.gold : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: value ? 'normal' : 'italic' }}>
                    {value || (f.required ? 'fill in above' : 'optional')}
                  </span>
                  {value && (isCopied
                    ? <span style={{ fontSize: 11, color: C.gold, fontWeight: 700, flexShrink: 0 }}>Copied</span>
                    : <Copy size={12} color={C.muted} style={{ flexShrink: 0 }} />)}
                </button>
              )
            })}

            {/* Identity — for portals that ask, and for rep submissions. Never
               populated in delegate mode: profileData is built without
               legal_name/ipi_number/publisher_name when isDelegate, so this
               block simply has nothing to render for a delegate. */}
            {(profile?.legal_name || profile?.ipi_number || profile?.publisher_name) && (
              <div style={{ padding: '10px 18px 12px', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.01)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {([['legal_name', 'Legal name'], ['ipi_number', 'IPI'], ['publisher_name', 'Publisher']] as [ClaimFieldKey, string][]).map(([k, label]) => {
                  const v = fieldValue(k)
                  if (!v) return null
                  return (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
                      <button onClick={() => copyText(v, k)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 12, color: copied === k ? C.gold : C.secondary, padding: 0 }}>
                        {copied === k ? 'copied ✓' : v}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Rules that affect payment */}
        {rule && rule.notes.length > 0 && (
          <div style={{ padding: '4px 4px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rule.notes.map(n => (
              <p key={n} style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5, display: 'flex', gap: 8 }}>
                <span style={{ color: C.secondary }}>›</span><span>{n}</span>
              </p>
            ))}
          </div>
        )}

        {/* Portal walkthrough */}
        {rule && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 16, overflow: 'hidden', boxShadow: CARD.boxShadow }}>
            <button onClick={() => setStepsOpen(v => !v)}
              style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Where to click in {rule.program}</span>
                {stepsCompleted > 0
                  ? <span style={{ fontSize: 11, color: C.secondary }}>{stepsCompleted}/{totalSteps}</span>
                  : <span style={{ fontSize: 11, color: C.muted }}>{rule.steps.length} steps</span>}
              </div>
              {stepsOpen ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
            </button>
            {stepsOpen && (
              <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
                {rule.phone && (
                  <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 12px' }}>
                    Stuck? <a href={`tel:${rule.phone.replace(/[^0-9+]/g, '')}`} style={{ color: C.secondary, textDecoration: 'none' }}>{rule.phone}</a>
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: rule.phone ? 0 : 12 }}>
                  {rule.steps.map((step, i) => (
                    <button key={i} onClick={() => setStepsDone(prev => prev.map((v, idx) => idx === i ? !v : v))}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: stepsDone[i] ? C.green : 'rgba(255,255,255,0.06)', border: `1px solid ${stepsDone[i] ? C.green : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {stepsDone[i] ? <Check size={11} color="#0a0908" strokeWidth={3} /> : <span style={{ fontSize: 10, color: C.muted, fontFamily: MONO, fontWeight: 700 }}>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: 14, color: stepsDone[i] ? C.muted : C.text, lineHeight: 1.4, textDecoration: stepsDone[i] ? 'line-through' : 'none' }}>{step}</span>
                    </button>
                  ))}
                </div>
                {rule.supportUrl && (
                  <a href={rule.supportUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, fontSize: 11, color: C.muted, textDecoration: 'none' }}>
                    {proName} support ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* CTAs — one obvious action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {hasPRO && rule && (
            !portalOpened ? (
              <button onClick={() => handleOpenPortal(rule.portalUrl)}
                style={{ width: '100%', padding: '17px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'opacity 0.15s ease' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
                <ExternalLink size={15} strokeWidth={2.5} />{rule.portalLabel}
              </button>
            ) : isDelegate ? (
              <>
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 2px' }}>
                  Only {artistDisplayName} can file in {rule.program}. Send them this claim sheet, or mark it once they’ve told you it’s done.
                </p>
                <button onClick={handleSendToArtist}
                  style={{ width: '100%', padding: '15px', background: 'transparent', border: `1px solid ${C.borderGold}`, borderRadius: 12, color: C.gold, fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  {copied === 'send-link' ? <><Check size={14} strokeWidth={2.5} />Link copied</> : `Send to ${artistDisplayName}`}
                </button>
                <button onClick={handleArtistFiledIt} disabled={markingDone}
                  style={{ width: '100%', padding: '17px', background: filedPulse ? C.green : markingDone ? C.greenDim : C.green, border: 'none', borderRadius: 12, color: filedPulse ? '#0a0908' : markingDone ? C.green : '#0a0908', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: markingDone ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', animation: 'fadeUp 0.3s ease', transform: filedPulse ? 'scale(1.03)' : 'scale(1)', transition: 'all 0.3s ease' }}>
                  <Check size={15} strokeWidth={2.5} />
                  {markingDone ? 'Recording...' : 'Artist filed it'}
                </button>
                <button onClick={() => handleOpenPortal(rule.portalUrl)}
                  style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '4px' }}>
                  Reopen {rule.program} ↗
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 2px' }}>Tap once you’ve hit Submit in {rule.program}. You’re confirming these songs were performed at this show.</p>
                <button onClick={markSubmitted} disabled={markingDone}
                  style={{ width: '100%', padding: '17px', background: filedPulse ? C.green : markingDone ? C.greenDim : C.green, border: 'none', borderRadius: 12, color: filedPulse ? '#0a0908' : markingDone ? C.green : '#0a0908', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: markingDone ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', animation: 'fadeUp 0.3s ease', transform: filedPulse ? 'scale(1.03)' : 'scale(1)', transition: 'all 0.3s ease' }}>
                  <Check size={15} strokeWidth={2.5} />
                  {markingDone ? 'Recording...' : "I've Filed It"}
                </button>
                <button onClick={() => handleOpenPortal(rule.portalUrl)}
                  style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '4px' }}>
                  Reopen {rule.program} ↗
                </button>
              </>
            )
          )}

          {!hasPRO && (
            <button onClick={markSubmitted} disabled={markingDone}
              style={{ width: '100%', padding: '14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit', opacity: markingDone ? 0.6 : 1 }}>
              <Check size={14} strokeWidth={2.5} />{markingDone ? 'Recording...' : 'Mark as Submitted'}
            </button>
          )}

          {songs.length > 0 && (
            <button
              onClick={() => downloadSubmissionBrief({ performance, songs, profile, rule, deadline, suggestedTitle, effectiveCapacity: effectiveCapacity ?? null, inputs })}
              style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.secondary, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'opacity 0.15s ease' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
              <FileText size={14} strokeWidth={2} />
              {rule && !rule.selfServe ? `Download sheet for your ${proName} rep` : 'Download claim sheet'}
            </button>
          )}

          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: '8px', width: '100%', transition: 'opacity 0.15s ease' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
            Back to Dashboard
          </button>
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
        input::placeholder{color:#6a6050}
        input:focus{border-color:rgba(201,168,76,0.4)!important;outline:none}
      `}</style>
    </div>
  )
}
