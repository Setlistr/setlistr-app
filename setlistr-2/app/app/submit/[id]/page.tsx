'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, ExternalLink, Copy, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'

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
}

const PRO_CONFIG: Record<string, {
  portalLabel: string; program: string; submitUrl: string
  deadline: string; deadlineDays: (now: Date) => number; steps: string[]
  requiresTicketPrice?: boolean; requiresPromoter?: boolean; requiresAttendance?: boolean
  supportUrl?: string; phone?: string
}> = {
  SOCAN: {
    portalLabel: 'Open SOCAN Portal', program: 'Set Lists & Performances',
    submitUrl: 'https://memp.socan.com', deadline: '1 year from show date',
    deadlineDays: () => 365,
    requiresPromoter: true,
    supportUrl: 'https://www.socan.com/contact-us', phone: '1-800-557-6226',
    steps: [
      'Log in at memp.socan.com',
      'Go to Set Lists & Performances → Register New Set List',
      'Enter the Set List Title below as the title',
      'Click "Add Work" → search each song by title or work number',
      'Click Next → fill in venue name, date, promoter name, and attach your set list',
      'Click Confirm & Submit Setlist',
    ],
  },
  ASCAP: {
    portalLabel: 'Open ASCAP OnStage', program: 'ASCAP OnStage',
    submitUrl: 'https://www.ascap.com/members', deadline: 'Same quarter as performance',
    requiresTicketPrice: true, requiresPromoter: true, requiresAttendance: true,
    supportUrl: 'https://www.ascap.com/help', phone: '1-800-952-7227',
    deadlineDays: (now) => {
      const y = now.getFullYear()
      const ends = [new Date(y,5,30),new Date(y,8,30),new Date(y,11,31),new Date(y+1,2,31)]
      for (const e of ends) { const d = Math.ceil((e.getTime()-now.getTime())/86400000); if(d>0) return d }
      return 90
    },
    steps: [
      'Log in at ascap.com/members',
      'Works → OnStage → Setlists → Add+',
      'Name your setlist using the title below',
      'Check each song you performed → Add to Setlist',
      'Performances → Add+ → search your venue',
      'Enter ticket price, promoter name, and estimated attendance',
      'Select your setlist → Submit',
    ],
  },
  BMI: {
    portalLabel: 'Open BMI Live', program: 'BMI Live',
    submitUrl: 'https://www.bmi.com', deadline: '9 months from show date',
    requiresTicketPrice: true, requiresPromoter: true,
    supportUrl: 'https://www.bmi.com/contact', phone: '1-800-925-8451',
    deadlineDays: () => 270,
    steps: [
      'Log in at bmi.com → your name → Online Services',
      'Click BMI Live in the applications panel',
      'Click Add a Performance (top right)',
      'Enter venue name, address, date, time, and ticket price',
      'Enter promoter name if applicable',
      'Search each song by title → Submit',
    ],
  },
  SESAC: {
    portalLabel: 'Open SESAC Portal', program: 'SESAC Affiliate Services',
    submitUrl: 'https://affiliates.sesac.com', deadline: 'Contact your SESAC rep',
    requiresTicketPrice: true, requiresAttendance: true,
    supportUrl: 'https://www.sesac.com/contact',
    deadlineDays: () => 180,
    steps: [
      'Log in at affiliates.sesac.com',
      'Navigate to Live Performances',
      'Create a setlist using the title below',
      'Enter venue, capacity, date, ticket price, and music fees',
      'Add song titles → Submit',
    ],
  },
  GMR: {
    portalLabel: 'Contact GMR Rep', program: 'GMR — Rep Submission',
    submitUrl: 'https://globalmusicrights.com', deadline: 'Contact your GMR rep',
    supportUrl: 'https://globalmusicrights.com/contact',
    deadlineDays: () => 180,
    steps: [
      'GMR does not have a self-serve portal',
      'Contact your GMR representative directly',
      'Provide: venue, date, promoter, setlist, and audience size',
      'Your rep handles submission on your behalf',
    ],
  },
  PRS: {
    portalLabel: 'Open PRS Portal', program: 'PRS Live Music Reporting',
    submitUrl: 'https://www.prsformusic.com/login', deadline: '1 year from show date',
    requiresTicketPrice: true, requiresPromoter: true,
    supportUrl: 'https://www.prsformusic.com/help', phone: '+44 (0)207 580 5544',
    deadlineDays: () => 365,
    steps: [
      'Log in at prsformusic.com/login',
      'Go to Live Music → Submit a setlist',
      'Enter venue name, postcode, date, and ticket price',
      'Enter promoter name',
      'Add song titles and your writer share',
      'Submit',
    ],
  },
  APRA: {
    portalLabel: 'Open APRA Portal', program: 'APRA AMCOS Live Performance',
    submitUrl: 'https://www.apraamcos.com.au/members', deadline: '1 year from show date',
    requiresPromoter: true,
    supportUrl: 'https://www.apraamcos.com.au/contact', phone: '+61 2 9935 7900',
    deadlineDays: () => 365,
    steps: [
      'Log in at apraamcos.com.au/members',
      'Navigate to Live Performance → Submit a setlist',
      'Enter venue, date, promoter, and performance details',
      'Add songs performed from your catalog → Submit',
    ],
  },
}



type VenueSizePick = 'small' | 'medium' | 'large' | 'arena'
const VENUE_SIZE_OPTIONS: { key: VenueSizePick; label: string; sub: string; capacity: number }[] = [
  { key: 'small',  label: 'Small',  sub: '< 300',  capacity: 200 },
  { key: 'medium', label: 'Medium', sub: '300–2k', capacity: 600 },
  { key: 'large',  label: 'Large',  sub: '2k–10k', capacity: 5000 },
  { key: 'arena',  label: 'Arena',  sub: '10k+',   capacity: 20000 },
]

type Song = {
  title: string; artist: string; isrc?: string; composer?: string
  publisher?: string; work_number?: string
  matchConfidence: 'matched' | 'partial' | 'unverified' | 'none'
}
type Performance = {
  id: string; venue_name: string; city: string; country: string
  started_at: string; artist_name: string; show_type?: string | null
  venue_capacity?: number | null; submission_status?: string | null
  setlist_id?: string | null
}
type Profile = {
  pro_affiliation: string | null; legal_name: string | null
  ipi_number: string | null; publisher_name: string | null; artist_name: string | null
}

function deriveConfidence(song: { isrc?: string; composer?: string }): Song['matchConfidence'] {
  if (song.isrc && song.composer) return 'matched'
  if (song.isrc || song.composer) return 'partial'
  return 'unverified'
}

function ConfDot({ c }: { c: Song['matchConfidence'] }) {
  const color = c === 'matched' ? C.green : c === 'partial' ? C.gold : c === 'unverified' ? C.muted : 'transparent'
  return <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function getTerritory(country?: string | null, city?: string | null): string {
  const s = ((country || '') + ' ' + (city || '')).toLowerCase()
  if (s.includes('canada') || s.includes('ontario') || s.includes('british columbia')
    || s.includes('alberta') || s.includes('quebec') || s.includes('toronto')
    || s.includes('vancouver') || s.includes('montreal') || s.trim() === 'ca') return 'CA'
  return 'US'
}

function downloadSubmissionBrief({
  performance, songs, profile, proConfig, pro, estimate, suggestedTitle,
  effectiveCapacity, promoter, ticketPrice, attendanceEstimate,
}: {
  performance: Performance; songs: Song[]; profile: Profile | null
  proConfig: typeof PRO_CONFIG[string] | null; pro: string | null | undefined
  estimate: { expected: number; low: number; high: number }
  suggestedTitle: string; effectiveCapacity: number | null
  promoter: string; ticketPrice: string; attendanceEstimate: string
}) {
  const showDate = new Date(performance.started_at)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const line = (char = '─', n = 52) => char.repeat(n)
  const songLines = songs.map((s, i) => {
    const parts = [`${String(i + 1).padStart(2, ' ')}. ${s.title}`]

    if (s.composer) parts.push(`    Composer: ${s.composer}`)
    if (s.work_number) parts.push(`    Work #: ${s.work_number}`)
    if (s.isrc) parts.push(`    ISRC: ${s.isrc}`)
    return parts.join('\n')
  }).join('\n\n')
  const steps = proConfig
    ? proConfig.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
    : '  Set your PRO in Setlistr Settings to see submission steps.'

  const brief = [
    `SETLISTR SUBMISSION BRIEF`,
    `Generated: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    line(),
    '',
    `SHOW DETAILS`,
    line('─', 30),
    `Artist:    ${profile?.artist_name || performance.artist_name}`,
    `Venue:     ${performance.venue_name}${performance.city ? `, ${performance.city}` : ''}`,
    `Date:      ${showDate}`,
    effectiveCapacity ? `Capacity:  ~${effectiveCapacity.toLocaleString()}` : '',
    promoter ? `Promoter:  ${promoter}` : '',
    ticketPrice ? `Ticket:    $${ticketPrice}` : '',
    attendanceEstimate ? `Attendance: ~${attendanceEstimate}` : '',
    '',
    `PRO SUBMISSION`,
    line('─', 30),
    `PRO:           ${pro || 'Not set'}`,
    profile?.legal_name ? `Legal Name:    ${profile.legal_name}` : '',
    profile?.ipi_number ? `IPI Number:    ${profile.ipi_number}` : '',
    profile?.publisher_name ? `Publisher:     ${profile.publisher_name}` : '',
    `Setlist Title: ${suggestedTitle}`,
    proConfig ? `Portal:        ${proConfig.submitUrl}` : '',
    proConfig ? `Deadline:      ${proConfig.deadline}` : '',
    proConfig?.supportUrl ? `Support:       ${proConfig.supportUrl}` : '',
    proConfig?.phone ? `Phone:         ${proConfig.phone}` : '',
    '',
    `ESTIMATED ROYALTIES`,
    line('─', 30),
    `Expected:  ~$${estimate.expected}`,
    `Range:     $${estimate.low} – $${estimate.high}`,
    `Songs:     ${songs.length}`,
    '',
    `WHAT HAPPENS NEXT`,
    line('─', 30),
    `  After submission, your PRO reviews and processes the claim.`,
    `  Royalty payments typically arrive 6–9 months after submission.`,
    `  You can track submission status in your PRO member portal.`,
    `  Questions? ${proConfig?.supportUrl || 'support@setlistr.ai'}`,
    '',
    `SETLIST (${songs.length} songs)`,
    line('─', 30),
    songLines,
    '',
    `SUBMISSION STEPS — ${pro || 'Your PRO'}`,
    line('─', 30),
    steps,
    '',
    line(),
    `Keep this file for your records. Questions? support@setlistr.ai`,
  ].filter(l => l !== null && l !== undefined).join('\n')

  const blob = new Blob([brief], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeVenue = performance.venue_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const safeDate = new Date(performance.started_at).toISOString().slice(0, 10)
  a.href = url
  a.download = `setlistr-brief-${safeVenue}-${safeDate}.txt`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

export default function SubmitPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance]     = useState<Performance | null>(null)
  const [songs, setSongs]                 = useState<Song[]>([])
  const [profile, setProfile]             = useState<Profile | null>(null)
  const [loading, setLoading]             = useState(true)
  const [copied, setCopied]               = useState<string | null>(null)
  const [stepsOpen, setStepsOpen]         = useState(false)
  const [submitted, setSubmitted]         = useState(false)
  const [markingDone, setMarkingDone]     = useState(false)
  const [filedPulse, setFiledPulse]       = useState(false)
  const [stepsDone, setStepsDone]         = useState<boolean[]>([])
  const [venueSizePick, setVenueSizePick] = useState<VenueSizePick | null>(null)
  const [portalOpened, setPortalOpened]   = useState(false)

  // Show details PROs need
  const [promoter, setPromoter]                 = useState('')
  const [ticketPrice, setTicketPrice]           = useState('')
  const [attendanceEstimate, setAttendanceEstimate] = useState('')
  const [showDetailsOpen, setShowDetailsOpen]   = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profileData } = await supabase
        .from('profiles').select('pro_affiliation, legal_name, ipi_number, publisher_name, artist_name')
        .eq('id', user.id).single()
      setProfile(profileData)

      const { data: perf } = await supabase
        .from('performances').select('*, shows(show_type), venues(capacity)')
        .eq('id', params.id).single()

      if (!perf) { setLoading(false); return }

      const perfRecord: Performance = {
        ...perf,
        show_type:         perf.shows?.show_type || null,
        venue_capacity:    perf.venues?.capacity || null,
        submission_status: perf.submission_status || null,
        setlist_id:        perf.setlist_id || null,
      }
      setPerformance(perfRecord)
      setSubmitted(perf.submission_status === 'submitted')

      let songData: any[] = []
      try {
        const songsRes = await fetch(`/api/performance-songs?performanceId=${params.id}`)
        const songsJson = await songsRes.json()
        songData = songsJson.songs || []
      } catch (e) { console.error('[SubmitPage] songs fetch failed:', e) }

      const mapped: Song[] = songData.map(s => ({
        title: s.title, artist: s.artist || '',
        isrc: s.isrc || '', composer: s.composer || '',
        publisher: s.publisher || '', work_number: s.work_number || '',

        matchConfidence: deriveConfidence(s),
      }))
      setSongs(mapped)

      const config = profileData?.pro_affiliation ? PRO_CONFIG[profileData.pro_affiliation] : null
      if (config) setStepsDone(new Array(config.steps.length).fill(false))

      // Auto-open show details if PRO requires promoter/ticket price
      if (config && (config.requiresPromoter || config.requiresTicketPrice)) {
        setShowDetailsOpen(true)
      }

      setLoading(false)
    }
    load()
  }, [params.id])

  function copyText(text: string, key: string) {
    try { navigator.clipboard.writeText(text) } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function copyAllSongs() {
    copyText(songs.map(s => s.title).join('\n'), 'all-songs')
  }

  function handleOpenPortal(url: string) {
    window.open(url, '_blank')
    setPortalOpened(true)
  }

  async function markSubmitted() {
    if (markingDone) return
    setMarkingDone(true)
    const supabase = createClient()
    await supabase.from('performances').update({
      submission_status: 'submitted', submitted_at: new Date().toISOString(),
    }).eq('id', params.id)
    setFiledPulse(true)
    await new Promise(r => setTimeout(r, 400))
    setSubmitted(true)
    setMarkingDone(false)
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
  const proConfig      = pro ? PRO_CONFIG[pro] : null
  const hasPRO         = !!proConfig
  const stepsCompleted = stepsDone.filter(Boolean).length
  const totalSteps     = stepsDone.length
  const showDate       = new Date(performance.started_at)
  const suggestedTitle = `${profile?.artist_name || performance.artist_name} - ${performance.venue_name}`
  const matchedCount   = songs.filter(s => s.matchConfidence === 'matched').length
  const partialCount   = songs.filter(s => s.matchConfidence === 'partial').length
  const unverCount     = songs.filter(s => s.matchConfidence === 'unverified').length

  const territory      = getTerritory(performance.country, performance.city)
  const daysLeft       = proConfig ? proConfig.deadlineDays(new Date()) : 365
  const deadlineDate   = proConfig
    ? new Date(showDate.getTime() + proConfig.deadlineDays(showDate) * 86400000)
    : new Date(showDate.getTime() + 365 * 86400000)

  const effectiveCapacity = performance.venue_capacity
    || (venueSizePick ? VENUE_SIZE_OPTIONS.find(o => o.key === venueSizePick)?.capacity : null)
  const needsVenuePick = !performance.venue_capacity

  const songCount = songs.length > 0 ? songs.length : 8
  const estimate  = estimateRoyalties({
    songCount, venueCapacityBand: capacityToBand(effectiveCapacity),
    showType: (performance.show_type as any) || 'single', territory,
  })


  const needsPromoter    = proConfig?.requiresPromoter
  const needsTicket      = proConfig?.requiresTicketPrice
  const needsAttendance  = proConfig?.requiresAttendance
  const hasAnyShowDetail = needsPromoter || needsTicket || needsAttendance
  const showDetailsFilled = (!needsPromoter || promoter.trim())
    && (!needsTicket || ticketPrice.trim())
    && (!needsAttendance || attendanceEstimate.trim())

  // ── Submitted confirmation ──────────────────────────────────────────────────
  if (submitted) return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.06) 0%, transparent 65%)' }} />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fadeUp 0.5s ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Check size={28} color={C.green} strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Filed with {pro}</h1>
        <p style={{ fontSize: 17, color: C.secondary, margin: '0 0 6px' }}>{performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}</p>
        <p style={{ fontSize: 15, color: C.muted, margin: '0 0 28px' }}>{showDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div style={{ width: '100%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 16, padding: '20px', marginBottom: 14 }}>
          <p style={{ fontSize: 13, color: C.green, margin: '0 0 4px', fontWeight: 600 }}>~${estimate.expected} in royalties filed</p>
          <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>{songs.length} songs on record · expect payment in 6–9 months</p>
        </div>

        {/* What happens next */}
        <div style={{ width: '100%', background: CARD.background, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px 18px', marginBottom: 14, textAlign: 'left', boxShadow: CARD.boxShadow }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 12px' }}>What Happens Next</p>
          {[
            { icon: '1', label: 'PRO reviews your claim', when: 'Now – 4 weeks' },
            { icon: '2', label: 'Claim processed & logged', when: '1–3 months' },
            { icon: '3', label: 'Royalty payment issued', when: '6–9 months' },
          ].map(({ icon, label, when }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: label !== 'Royalty payment issued' ? `1px solid ${C.border}` : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: '"DM Mono", monospace', flexShrink: 0, minWidth: 16, textAlign: 'center' }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, color: C.text, margin: 0, fontWeight: 600 }}>{label}</p>
              </div>
              <span style={{ fontSize: 11, color: C.muted, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{when}</span>
            </div>
          ))}
          {proConfig?.supportUrl && (
            <p style={{ fontSize: 11, color: C.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
              Track your claim at{' '}
              <a href={proConfig.submitUrl} target="_blank" rel="noreferrer" style={{ color: C.gold, textDecoration: 'none' }}>{proConfig.submitUrl}</a>
            </p>
          )}
        </div>

        {/* Receipt */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '14px 18px', marginBottom: 20, textAlign: 'left' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 10px' }}>Submission Receipt</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              ['Show', `${performance.venue_name}${performance.city ? `, ${performance.city}` : ''}`],
              ['Date', showDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
              ['Filed to', pro || '—'],
              ['Songs', String(songs.length)],
              ['Filed on', new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
              ['Est. value', `~$${estimate.expected}`],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                <span style={{ fontSize: 11, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={() => router.push('/app/dashboard')}
          style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
          Back to Dashboard
        </button>
        <button onClick={() => setSubmitted(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          View submission details
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '28px 16px 80px', boxSizing: 'border-box' as const }}>

        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 20px', letterSpacing: '0.04em' }}>← Back</button>

        {/* Hero */}
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: C.gold, margin: '0 0 6px', opacity: 0.8 }}>
          {performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Claim Your Royalties
        </h1>
        <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 24px' }}>
          {showDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Venue size picker */}
        {needsVenuePick && (
          <div style={{ background: CARD.background, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '14px 16px', marginBottom: 12, boxShadow: CARD.boxShadow }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 4px' }}>Venue Size</p>
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px' }}>Helps calculate your royalty estimate</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {VENUE_SIZE_OPTIONS.map(opt => (
                <button key={opt.key} onClick={() => setVenueSizePick(venueSizePick === opt.key ? null : opt.key)}
                  style={{ flex: 1, padding: '8px 4px', background: venueSizePick === opt.key ? C.goldDim : 'transparent', border: `1px solid ${venueSizePick === opt.key ? C.borderGold : C.border}`, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: venueSizePick === opt.key ? C.gold : C.secondary }}>{opt.label}</span>
                  <span style={{ fontSize: 9, color: C.muted }}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Money + deadline */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: C.gold, margin: '0 0 6px' }}>Performance royalties</p>
            <p style={{ fontSize: 32, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>~${estimate.expected}</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: '2px 0 0' }}>est. ${estimate.low}–${estimate.high}</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, margin: '0 0 6px' }}>Deadline</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.01em' }}>
              {deadlineDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '2px 0 0' }}>{proConfig?.deadline || '1 year from show date'}</p>
          </div>
        </div>

        {/* No PRO warning */}
        {!hasPRO && (
          <div style={{ background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ fontSize: 15, color: C.red, margin: '0 0 4px', fontWeight: 700 }}>No PRO selected</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 10px' }}>Set your PRO affiliation in Settings to use the guided submission flow.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <button onClick={() => router.push('/app/settings')}
                style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '8px 14px', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Go to Settings →
              </button>
              <a href="https://www.alltrack.org" target="_blank" rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: `1px solid ${C.borderGold}`, borderRadius: 8, padding: '8px 14px', color: C.gold, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                Not in a PRO? Try AllTrack ↗
              </a>
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: '10px 0 0', lineHeight: 1.5 }}>
              AllTrack is recommended by SOCAN for tech-forward global submission. Free to join.
            </p>
          </div>
        )}

        {/* Show Details — PRO required fields */}
        {hasAnyShowDetail && (
          <div style={{ background: CARD.background, border: `1px solid ${showDetailsFilled ? 'rgba(74,222,128,0.25)' : C.borderGold}`, borderRadius: 16, marginBottom: 12, overflow: 'hidden', boxShadow: CARD.boxShadow }}>
            <button onClick={() => setShowDetailsOpen(v => !v)}
              style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Show Details</span>
                {showDetailsFilled
                  ? <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px' }}>✓ Ready</span>
                  : <span style={{ fontSize: 11, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '2px 8px' }}>Required by {pro}</span>
                }
              </div>
              {showDetailsOpen ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
            </button>
            {showDetailsOpen && (
              <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 0', lineHeight: 1.5 }}>
                  {pro} requires these details for a complete submission. Fill them in before opening the portal.
                </p>

                {needsPromoter && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, display: 'block', marginBottom: 6 }}>
                      Promoter Name <span style={{ color: C.gold }}>*</span>
                    </label>
                    <input
                      type="text"
                      value={promoter}
                      onChange={e => setPromoter(e.target.value)}
                      placeholder="e.g. Live Nation, self-promoted, venue name..."
                      style={{ width: '100%', background: '#0a0908', border: `1px solid ${promoter ? C.borderGold : C.border}`, borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                    <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>
                      If self-promoted, enter your own name or the venue name.
                    </p>
                  </div>
                )}

                {needsTicket && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, display: 'block', marginBottom: 6 }}>
                      Ticket Price <span style={{ color: C.gold }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 13 }}>$</span>
                      <input
                        type="number"
                        value={ticketPrice}
                        onChange={e => setTicketPrice(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        style={{ width: '100%', background: '#0a0908', border: `1px solid ${ticketPrice ? C.borderGold : C.border}`, borderRadius: 10, padding: '11px 14px 11px 28px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                      />
                    </div>
                    <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>
                      Enter 0 for free shows. This affects your royalty calculation.
                    </p>
                  </div>
                )}

                {needsAttendance && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, display: 'block', marginBottom: 6 }}>
                      Estimated Attendance
                    </label>
                    <input
                      type="number"
                      value={attendanceEstimate}
                      onChange={e => setAttendanceEstimate(e.target.value)}
                      placeholder="e.g. 150"
                      min="0"
                      style={{ width: '100%', background: '#0a0908', border: `1px solid ${attendanceEstimate ? C.borderGold : C.border}`, borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                    <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>
                      Best estimate is fine — PROs use this for weighting, not auditing.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 1 — Setlist title */}
        <div style={{ background: CARD.background, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '16px 18px', marginBottom: 12, boxShadow: CARD.boxShadow }}>
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: C.gold, margin: '0 0 6px' }}>Your set title</p>
          <p style={{ fontSize: 11, color: C.muted, margin: '0 0 12px', lineHeight: 1.5 }}>Use this as your title when creating the setlist in the {pro || 'PRO'} portal.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0a0908', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 10, padding: '12px 14px' }}>
            <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.01em' }}>{suggestedTitle}</span>
            <button onClick={() => copyText(suggestedTitle, 'title')}
              style={{ flexShrink: 0, background: copied === 'title' ? C.goldDim : 'rgba(255,255,255,0.04)', border: `1px solid ${copied === 'title' ? C.borderGold : C.border}`, borderRadius: 8, padding: '7px 12px', color: copied === 'title' ? C.gold : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              {copied === 'title' ? <><Check size={11} strokeWidth={3} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>

          {/* Profile info for portal */}
          {(profile?.ipi_number || profile?.legal_name || profile?.publisher_name) && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {profile?.legal_name && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Legal Name</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{profile.legal_name}</span>
                    <button onClick={() => copyText(profile.legal_name!, 'legal')} style={{ background: 'none', border: 'none', color: copied === 'legal' ? C.gold : C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{copied === 'legal' ? '✓' : 'copy'}</button>
                  </div>
                </div>
              )}
              {profile?.ipi_number && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: C.muted }}>IPI Number</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{profile.ipi_number}</span>
                    <button onClick={() => copyText(profile.ipi_number!, 'ipi')} style={{ background: 'none', border: 'none', color: copied === 'ipi' ? C.gold : C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{copied === 'ipi' ? '✓' : 'copy'}</button>
                  </div>
                </div>
              )}
              {profile?.publisher_name && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: C.muted }}>Publisher</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{profile.publisher_name}</span>
                    <button onClick={() => copyText(profile.publisher_name!, 'pub')} style={{ background: 'none', border: 'none', color: copied === 'pub' ? C.gold : C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{copied === 'pub' ? '✓' : 'copy'}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2 — Song list */}
        <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 12, overflow: 'hidden', boxShadow: CARD.boxShadow }}>
          <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', color: C.muted, margin: 0 }}>
                Songs performed ({songs.length} total)
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {matchedCount > 0 && <span style={{ fontSize: 10, color: C.green }}>●&nbsp;{matchedCount} matched</span>}
                {partialCount > 0 && <span style={{ fontSize: 10, color: C.gold }}>●&nbsp;{partialCount} partial</span>}
                {unverCount > 0 && <span style={{ fontSize: 10, color: C.muted }}>●&nbsp;{unverCount} no data</span>}
              </div>
            </div>
            {songs.length > 0 && (
              <button onClick={copyAllSongs}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: copied === 'all-songs' ? C.goldDim : 'rgba(255,255,255,0.03)', border: `1px solid ${copied === 'all-songs' ? C.borderGold : C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                {copied === 'all-songs'
                  ? <><Check size={11} color={C.gold} strokeWidth={3} /><span style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>All {songs.length} titles copied</span></>
                  : <><Copy size={11} color={C.muted} /><span style={{ fontSize: 13, fontWeight: 600, color: C.secondary }}>Copy all song titles</span></>}
              </button>
            )}
            <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
              Or tap any song to copy its title individually.
            </p>
          </div>

          {songs.length === 0 ? (
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>No songs saved yet — complete your setlist review first.</p>
              <button onClick={() => router.push(`/app/review/${params.id}`)}
                style={{ background: 'none', border: `1px solid ${C.borderGold}`, borderRadius: 8, padding: '10px 18px', color: C.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Review Setlist →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {songs.map((song, i) => {
                const key = `song-${i}`
                const isCopied = copied === key
                return (
                  <button key={i} onClick={() => copyText(song.title, key)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: isCopied ? 'rgba(201,168,76,0.04)' : 'transparent', border: 'none', borderBottom: i < songs.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                    <span style={{ fontSize: 13, color: C.muted, minWidth: 20, textAlign: 'right', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 16, fontWeight: 600, color: isCopied ? C.gold : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>

                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' as const }}>
                        {song.composer && <span style={{ fontSize: 12, color: C.muted }}>Writer: <span style={{ color: C.secondary }}>{song.composer}</span></span>}
                        {song.work_number && <span style={{ fontSize: 12, color: C.muted, fontFamily: '"DM Mono", monospace' }}>Work #: <span style={{ color: C.gold }}>{song.work_number}</span></span>}
                        {song.isrc && !song.work_number && <span style={{ fontSize: 12, color: C.muted, fontFamily: '"DM Mono", monospace' }}>ISRC: <span style={{ color: C.secondary }}>{song.isrc}</span></span>}
                        {!song.composer && !song.isrc && !song.work_number && <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>no metadata — search by title</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <ConfDot c={song.matchConfidence} />
                      {isCopied ? <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>Copied</span> : <Copy size={12} color={C.muted} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.01)' }}>
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
              Green = has ISRC + writer · Gold = partial metadata · Grey = title only
            </p>
          </div>
        </div>

        {/* Guided steps */}
        {hasPRO && proConfig && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 12, overflow: 'hidden', boxShadow: CARD.boxShadow }}>
            <button onClick={() => setStepsOpen(v => !v)}
              style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Step-by-step: {pro} portal</span>
                {stepsCompleted > 0
                  ? <span style={{ fontSize: 11, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '2px 8px' }}>{stepsCompleted}/{totalSteps} done</span>
                  : <span style={{ fontSize: 11, color: C.muted }}>{proConfig.steps.length} steps</span>}
              </div>
              {stepsOpen ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
            </button>
            {stepsOpen && (
              <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0 14px' }}>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Program: <strong style={{ color: C.secondary }}>{proConfig.program}</strong></p>
                  {proConfig.phone && (
                    <a href={`tel:${proConfig.phone.replace(/[^0-9+]/g, '')}`}
                      style={{ fontSize: 11, color: C.muted, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {proConfig.phone}
                    </a>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {proConfig.steps.map((step, i) => (
                    <button key={i} onClick={() => setStepsDone(prev => prev.map((v, idx) => idx === i ? !v : v))}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', background: stepsDone[i] ? C.goldDim : 'rgba(255,255,255,0.02)', border: `1px solid ${stepsDone[i] ? C.borderGold : C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: stepsDone[i] ? C.gold : 'rgba(255,255,255,0.06)', border: `1px solid ${stepsDone[i] ? C.gold : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {stepsDone[i] ? <Check size={11} color="#0a0908" strokeWidth={3} /> : <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace', fontWeight: 700 }}>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: 15, color: stepsDone[i] ? C.gold : C.text, lineHeight: 1.4, textDecoration: stepsDone[i] ? 'line-through' : 'none', opacity: stepsDone[i] ? 0.7 : 1 }}>{step}</span>
                    </button>
                  ))}
                </div>
                {stepsCompleted === totalSteps && totalSteps > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check size={14} color={C.gold} strokeWidth={2.5} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>All steps done — tap "I've Filed It" below</span>
                  </div>
                )}
                {proConfig.supportUrl && (
                  <a href={proConfig.supportUrl} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, fontSize: 11, color: C.muted, textDecoration: 'none' }}>
                    Need help? {pro} support ↗
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {songs.length > 0 && (
            <button
              onClick={() => downloadSubmissionBrief({ performance, songs, profile, proConfig: proConfig || null, pro, estimate, suggestedTitle, effectiveCapacity: effectiveCapacity ?? null, promoter, ticketPrice, attendanceEstimate })}
              style={{ width: '100%', padding: '14px', background: 'rgba(201,168,76,0.06)', border: `1px solid ${C.borderGold}`, borderRadius: 12, color: C.gold, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              <FileText size={14} strokeWidth={2} />
              Download Submission Brief
            </button>
          )}

          {hasPRO && proConfig && (
            !portalOpened ? (
              <button onClick={() => handleOpenPortal(proConfig.submitUrl)}
                style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                <ExternalLink size={15} strokeWidth={2.5} />{proConfig.portalLabel}
              </button>
            ) : (
              <button onClick={markSubmitted} disabled={markingDone}
                style={{ width: '100%', padding: '16px', background: filedPulse ? C.green : markingDone ? C.greenDim : C.green, border: 'none', borderRadius: 12, color: filedPulse ? '#0a0908' : markingDone ? C.green : '#0a0908', fontSize: 16, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: markingDone ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', animation: 'fadeUp 0.3s ease', transform: filedPulse ? 'scale(1.03)' : 'scale(1)', transition: 'all 0.3s ease' }}>
                <Check size={15} strokeWidth={2.5} />
                {markingDone ? 'Recording...' : "I've Filed It"}
              </button>
            )
          )}

          {!hasPRO && (
            <button onClick={markSubmitted} disabled={markingDone}
              style={{ width: '100%', padding: '14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit', opacity: markingDone ? 0.6 : 1 }}>
              <Check size={14} strokeWidth={2.5} />{markingDone ? 'Recording...' : 'Mark as Submitted'}
            </button>
          )}

          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: '8px', width: '100%' }}>
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
