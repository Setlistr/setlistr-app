'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, ExternalLink, Copy, ChevronDown, ChevronUp, Download, FileText } from 'lucide-react'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'

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
}> = {
  SOCAN: {
    portalLabel: 'Open SOCAN Portal', program: 'Set Lists & Performances',
    submitUrl: 'https://memp.socan.com', deadline: '1 year from show date',
    deadlineDays: () => 365,
    steps: [
      'Log in at memp.socan.com',
      'Go to Set Lists & Performances → Register New Set List',
      'Enter the Set List Title below as the title',
      'Click "Add Work" → search each song by title or work number',
      'Click Next → fill in venue name, date, and attach your set list',
      'Click Confirm & Submit Setlist',
    ],
  },
  ASCAP: {
    portalLabel: 'Open ASCAP OnStage', program: 'ASCAP OnStage',
    submitUrl: 'https://www.ascap.com/members', deadline: 'Same quarter as performance',
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
      'Select your setlist → Submit',
    ],
  },
  BMI: {
    portalLabel: 'Open BMI Live', program: 'BMI Live',
    submitUrl: 'https://www.bmi.com', deadline: '9 months from show date',
    deadlineDays: () => 270,
    steps: [
      'Log in at bmi.com → your name → Online Services',
      'Click BMI Live in the applications panel',
      'Click Add a Performance (top right)',
      'Enter venue name, address, date and time',
      'Search each song by title → Submit',
    ],
  },
  SESAC: {
    portalLabel: 'Open SESAC Portal', program: 'SESAC Affiliate Services',
    submitUrl: 'https://affiliates.sesac.com', deadline: 'Contact your SESAC rep',
    deadlineDays: () => 180,
    steps: [
      'Log in at affiliates.sesac.com',
      'Navigate to Live Performances',
      'Create a setlist using the title below',
      'Enter venue, capacity, date and music fees',
      'Add song titles → Submit',
    ],
  },
  GMR: {
    portalLabel: 'Contact GMR Rep', program: 'GMR — Rep Submission',
    submitUrl: 'https://globalmusicrights.com', deadline: 'Contact your GMR rep',
    deadlineDays: () => 180,
    steps: [
      'GMR does not have a self-serve portal',
      'Contact your GMR representative directly',
      'Provide: venue, date, setlist, and audience size',
      'Your rep handles submission on your behalf',
    ],
  },
  PRS: {
    portalLabel: 'Open PRS Portal', program: 'PRS Live Music Reporting',
    submitUrl: 'https://www.prsformusic.com/login', deadline: '1 year from show date',
    deadlineDays: () => 365,
    steps: [
      'Log in at prsformusic.com/login',
      'Go to Live Music → Submit a setlist',
      'Enter venue name, postcode, date and ticket price',
      'Add song titles and your writer share',
      'Submit',
    ],
  },
  APRA: {
    portalLabel: 'Open APRA Portal', program: 'APRA AMCOS Live Performance',
    submitUrl: 'https://www.apraamcos.com.au/members', deadline: '1 year from show date',
    deadlineDays: () => 365,
    steps: [
      'Log in at apraamcos.com.au/members',
      'Navigate to Live Performance → Submit a setlist',
      'Enter venue, date, and performance details',
      'Add songs performed from your catalog → Submit',
    ],
  },
}

type VenueSizePick = 'small' | 'medium' | 'large' | 'arena'
const VENUE_SIZE_OPTIONS: { key: VenueSizePick; label: string; sub: string; capacity: number }[] = [
  { key: 'small',  label: 'Small',  sub: '< 300',   capacity: 200 },
  { key: 'medium', label: 'Medium', sub: '300–2k',  capacity: 600 },
  { key: 'large',  label: 'Large',  sub: '2k–10k',  capacity: 5000 },
  { key: 'arena',  label: 'Arena',  sub: '10k+',    capacity: 20000 },
]

type Song = {
  title: string; artist: string; isrc?: string; composer?: string
  publisher?: string; work_number?: string; is_cover?: boolean
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

// ── Generates and downloads a plain-text submission brief ─────────────────────
// This is the foundation of the "Setlistr prepared everything" experience.
// Future: swap this for a PDF or structured PRO-formatted file per organization.
function downloadSubmissionBrief({
  performance, songs, profile, proConfig, pro, estimate, suggestedTitle, effectiveCapacity,
}: {
  performance: Performance
  songs: Song[]
  profile: Profile | null
  proConfig: typeof PRO_CONFIG[string] | null
  pro: string | null | undefined
  estimate: { expected: number; low: number; high: number }
  suggestedTitle: string
  effectiveCapacity: number | null
}) {
  const showDate = new Date(performance.started_at)
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const line = (char = '─', n = 52) => char.repeat(n)

  const songLines = songs.map((s, i) => {
    const parts = [`${String(i + 1).padStart(2, ' ')}. ${s.title}`]
    if (s.is_cover) parts.push('  [COVER]')
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
    '',
    `ESTIMATED ROYALTIES`,
    line('─', 30),
    `Expected:  ~$${estimate.expected}`,
    `Range:     $${estimate.low} – $${estimate.high}`,
    `Songs:     ${songs.length}`,
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
    `Keep this file for your records. Royalty payments typically arrive 6–9 months`,
    `after submission. Questions? support@setlistr.ai`,
  ].filter(l => l !== null && l !== undefined).join('\n')

  const blob = new Blob([brief], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeVenue = performance.venue_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const safeDate = new Date(performance.started_at).toISOString().slice(0, 10)
  a.href = url
  a.download = `setlistr-brief-${safeVenue}-${safeDate}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function SubmitPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance]   = useState<Performance | null>(null)
  const [songs, setSongs]               = useState<Song[]>([])
  const [profile, setProfile]           = useState<Profile | null>(null)
  const [loading, setLoading]           = useState(true)
  const [copied, setCopied]             = useState<string | null>(null)
  const [stepsOpen, setStepsOpen]       = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [markingDone, setMarkingDone]   = useState(false)
  const [stepsDone, setStepsDone]       = useState<boolean[]>([])
  const [venueSizePick, setVenueSizePick] = useState<VenueSizePick | null>(null)
  // Tracks whether artist has opened the PRO portal — flips the primary CTA
  // to "I've Filed It" so they close the loop without hunting for a ghost button
  const [portalOpened, setPortalOpened] = useState(false)

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
      } catch (e) {
        console.error('[SubmitPage] songs fetch failed:', e)
      }

      const mapped: Song[] = songData.map(s => ({
        title: s.title, artist: s.artist || '',
        isrc: s.isrc || '', composer: s.composer || '',
        publisher: s.publisher || '', work_number: s.work_number || '',
        is_cover: s.is_cover || false,
        matchConfidence: deriveConfidence(s),
      }))
      setSongs(mapped)

      const config = profileData?.pro_affiliation ? PRO_CONFIG[profileData.pro_affiliation] : null
      if (config) setStepsDone(new Array(config.steps.length).fill(false))

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

  // Copies every song title as a newline-separated list — one tap, ready to paste
  function copyAllSongs() {
    const allTitles = songs.map(s => s.title).join('\n')
    copyText(allTitles, 'all-songs')
  }

  function handleOpenPortal(url: string) {
    window.open(url, '_blank')
    // Flip CTA state: artist just went to file — surface "I've Filed It" immediately
    setPortalOpened(true)
  }

  async function markSubmitted() {
    if (markingDone) return
    setMarkingDone(true)
    const supabase = createClient()
    await supabase.from('performances').update({
      submission_status: 'submitted', submitted_at: new Date().toISOString(),
    }).eq('id', params.id)
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
  const territory      = getTerritory(performance.country, performance.city)
  const daysLeft       = proConfig ? proConfig.deadlineDays(new Date()) : 365
  const stepsCompleted = stepsDone.filter(Boolean).length
  const totalSteps     = stepsDone.length
  const showDate       = new Date(performance.started_at)
  const suggestedTitle = `${profile?.artist_name || performance.artist_name} - ${performance.venue_name}`
  const matchedCount   = songs.filter(s => s.matchConfidence === 'matched').length
  const partialCount   = songs.filter(s => s.matchConfidence === 'partial').length
  const unverCount     = songs.filter(s => s.matchConfidence === 'unverified').length
  const coverCount     = songs.filter(s => s.is_cover).length

  const effectiveCapacity = performance.venue_capacity
    || (venueSizePick ? VENUE_SIZE_OPTIONS.find(o => o.key === venueSizePick)?.capacity : null)
  const needsVenuePick = !performance.venue_capacity

  const songCount = songs.length > 0 ? songs.length : 8
  const estimate  = estimateRoyalties({
    songCount,
    venueCapacityBand: capacityToBand(effectiveCapacity),
    showType: (performance.show_type as any) || 'single',
    territory,
  })

  // ── Submitted confirmation ──────────────────────────────────────────────────
  if (submitted) return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.06) 0%, transparent 65%)' }} />
      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fadeUp 0.5s ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Check size={28} color={C.green} strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.025em' }}>Filed with {pro}</h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 6px' }}>{performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}</p>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 28px' }}>{showDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div style={{ width: '100%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: C.green, margin: '0 0 4px', fontWeight: 600 }}>~${estimate.expected} on its way</p>
          <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>{songs.length} songs on record · expect payment in 6–9 months</p>
        </div>

        {/* Receipt — the trust-building artefact that accumulates over time */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px', marginBottom: 20, textAlign: 'left' }}>
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
          style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
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

        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 20px', letterSpacing: '0.04em' }}>← Back</button>

        {/* Hero */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 6px', opacity: 0.8 }}>
          {performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Claim Your<br /><span style={{ color: C.gold }}>Royalties</span>
        </h1>
        <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 24px' }}>
          {showDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Venue size picker */}
        {needsVenuePick && (
          <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
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
          <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 6px' }}>You're owed</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>~${estimate.expected}</p>
            <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>est. ${estimate.low}–${estimate.high}</p>
          </div>
          <div style={{ background: daysLeft <= 30 ? C.redDim : daysLeft <= 60 ? C.goldDim : C.greenDim, border: `1px solid ${daysLeft <= 30 ? 'rgba(248,113,113,0.25)' : daysLeft <= 60 ? C.borderGold : 'rgba(74,222,128,0.25)'}`, borderRadius: 14, padding: '16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: daysLeft <= 30 ? C.red : daysLeft <= 60 ? C.gold : C.green, margin: '0 0 6px' }}>
              {daysLeft <= 60 ? 'Deadline!' : 'Submit by'}
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, color: daysLeft <= 30 ? C.red : daysLeft <= 60 ? C.gold : C.green, margin: 0, fontFamily: '"DM Mono", monospace' }}>
              {daysLeft <= 365 ? `${daysLeft}d` : '1yr'}
            </p>
            <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>{proConfig?.deadline || '1 year from show date'}</p>
          </div>
        </div>

        {/* No PRO warning */}
        {!hasPRO && (
          <div style={{ background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: C.red, margin: '0 0 4px', fontWeight: 700 }}>No PRO selected</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 10px' }}>Set your PRO affiliation in Settings to use the guided submission flow.</p>
            <button onClick={() => router.push('/app/settings')}
              style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '8px 14px', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Go to Settings →
            </button>
          </div>
        )}

        {/* Step 1 — Setlist title */}
        <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 6px' }}>Step 1 — Set List Title</p>
          <p style={{ fontSize: 11, color: C.muted, margin: '0 0 12px', lineHeight: 1.5 }}>Use this as your title when creating the setlist in the {pro || 'PRO'} portal.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#0a0908', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 10, padding: '12px 14px' }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.01em' }}>{suggestedTitle}</span>
            <button onClick={() => copyText(suggestedTitle, 'title')}
              style={{ flexShrink: 0, background: copied === 'title' ? C.greenDim : 'rgba(255,255,255,0.04)', border: `1px solid ${copied === 'title' ? 'rgba(74,222,128,0.3)' : C.border}`, borderRadius: 8, padding: '7px 12px', color: copied === 'title' ? C.green : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              {copied === 'title' ? <><Check size={11} strokeWidth={3} /> Copied</> : <><Copy size={11} /> Copy</>}
            </button>
          </div>
          {profile?.ipi_number && (
            <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>
              IPI: <span style={{ color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{profile.ipi_number}</span>
              <button onClick={() => copyText(profile.ipi_number!, 'ipi')} style={{ background: 'none', border: 'none', color: copied === 'ipi' ? C.green : C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 6 }}>
                {copied === 'ipi' ? '✓ copied' : 'copy'}
              </button>
            </p>
          )}
        </div>

        {/* Step 2 — Song list */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: 0 }}>
                Step 2 — Add Songs ({songs.length} total)
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {matchedCount > 0 && <span style={{ fontSize: 10, color: C.green }}>●&nbsp;{matchedCount} matched</span>}
                {partialCount > 0 && <span style={{ fontSize: 10, color: C.gold }}>●&nbsp;{partialCount} partial</span>}
                {unverCount > 0 && <span style={{ fontSize: 10, color: C.muted }}>●&nbsp;{unverCount} no data</span>}
              </div>
            </div>

            {/* Copy All Songs — eliminates song-by-song tapping */}
            {songs.length > 0 && (
              <button
                onClick={copyAllSongs}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: copied === 'all-songs' ? C.greenDim : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${copied === 'all-songs' ? 'rgba(74,222,128,0.3)' : C.border}`,
                  borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                  fontFamily: 'inherit', marginBottom: 8,
                }}>
                {copied === 'all-songs'
                  ? <><Check size={11} color={C.green} strokeWidth={3} /><span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>All {songs.length} titles copied</span></>
                  : <><Copy size={11} color={C.muted} /><span style={{ fontSize: 11, fontWeight: 600, color: C.secondary }}>Copy all song titles</span></>
                }
              </button>
            )}

            <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
              Or tap any song to copy its title individually.
              {coverCount > 0 && <span style={{ color: C.gold }}> {coverCount} cover{coverCount > 1 ? 's' : ''} — use "Add Cover Version" in the portal.</span>}
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
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: isCopied ? 'rgba(74,222,128,0.04)' : 'transparent', border: 'none', borderBottom: i < songs.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                    <span style={{ fontSize: 11, color: C.muted, minWidth: 20, textAlign: 'right', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: isCopied ? C.green : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                        {song.is_cover && <span style={{ fontSize: 9, fontWeight: 700, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>COVER</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' as const }}>
                        {song.composer && <span style={{ fontSize: 10, color: C.muted }}>Writer: <span style={{ color: C.secondary }}>{song.composer}</span></span>}
                        {song.work_number && <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace' }}>Work #: <span style={{ color: C.gold }}>{song.work_number}</span></span>}
                        {song.isrc && !song.work_number && <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace' }}>ISRC: <span style={{ color: C.secondary }}>{song.isrc}</span></span>}
                        {!song.composer && !song.isrc && !song.work_number && <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>no metadata — search by title</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <ConfDot c={song.matchConfidence} />
                      {isCopied ? <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>Copied</span> : <Copy size={12} color={C.muted} />}
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
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 12, overflow: 'hidden' }}>
            <button onClick={() => setStepsOpen(v => !v)}
              style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Step-by-step: {pro} portal</span>
                {stepsCompleted > 0
                  ? <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px' }}>{stepsCompleted}/{totalSteps} done</span>
                  : <span style={{ fontSize: 11, color: C.muted }}>{proConfig.steps.length} steps</span>}
              </div>
              {stepsOpen ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
            </button>
            {stepsOpen && (
              <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 14px' }}>Program: <strong style={{ color: C.secondary }}>{proConfig.program}</strong></p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {proConfig.steps.map((step, i) => (
                    <button key={i} onClick={() => setStepsDone(prev => prev.map((v, idx) => idx === i ? !v : v))}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', background: stepsDone[i] ? C.greenDim : 'rgba(255,255,255,0.02)', border: `1px solid ${stepsDone[i] ? 'rgba(74,222,128,0.2)' : C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: stepsDone[i] ? C.green : 'rgba(255,255,255,0.06)', border: `1px solid ${stepsDone[i] ? C.green : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {stepsDone[i] ? <Check size={11} color="#0a0908" strokeWidth={3} /> : <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace', fontWeight: 700 }}>{i + 1}</span>}
                      </div>
                      <span style={{ fontSize: 13, color: stepsDone[i] ? C.green : C.text, lineHeight: 1.4, textDecoration: stepsDone[i] ? 'line-through' : 'none', opacity: stepsDone[i] ? 0.7 : 1 }}>{step}</span>
                    </button>
                  ))}
                </div>
                {stepsCompleted === totalSteps && totalSteps > 0 && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check size={14} color={C.green} strokeWidth={2.5} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>All steps done — tap "I've Filed It" below</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Download Submission Brief — Setlistr prepares everything, artist just files */}
          {songs.length > 0 && (
            <button
              onClick={() => downloadSubmissionBrief({ performance, songs, profile, proConfig: proConfig || null, pro, estimate, suggestedTitle, effectiveCapacity })}
              style={{
                width: '100%', padding: '14px',
                background: 'rgba(201,168,76,0.06)',
                border: `1px solid ${C.borderGold}`,
                borderRadius: 12, color: C.gold, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8, fontFamily: 'inherit',
              }}>
              <FileText size={14} strokeWidth={2} />
              Download Submission Brief
            </button>
          )}

          {/* Primary CTA: flips from "Open Portal" → "I've Filed It" after portal is opened */}
          {hasPRO && proConfig && (
            !portalOpened ? (
              <button
                onClick={() => handleOpenPortal(proConfig.submitUrl)}
                style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                <ExternalLink size={15} strokeWidth={2.5} />{proConfig.portalLabel}
              </button>
            ) : (
              <button
                onClick={markSubmitted}
                disabled={markingDone}
                style={{
                  width: '100%', padding: '16px',
                  background: markingDone ? C.greenDim : C.green,
                  border: 'none', borderRadius: 12,
                  color: markingDone ? C.green : '#0a0908',
                  fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
                  textTransform: 'uppercase' as const,
                  cursor: markingDone ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, fontFamily: 'inherit',
                  animation: 'fadeUp 0.3s ease',
                }}>
                <Check size={15} strokeWidth={2.5} />
                {markingDone ? 'Recording...' : "I've Filed It"}
              </button>
            )
          )}

          {/* If no PRO — still show the mark submitted ghost button */}
          {!hasPRO && (
            <button onClick={markSubmitted} disabled={markingDone}
              style={{ width: '100%', padding: '14px', background: 'transparent', border: `1px solid ${C.green}40`, borderRadius: 12, color: C.green, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit', opacity: markingDone ? 0.6 : 1 }}>
              <Check size={14} strokeWidth={2.5} />{markingDone ? 'Recording...' : 'Mark as Submitted'}
            </button>
          )}

          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '8px', width: '100%' }}>
            Back to Dashboard
          </button>
        </div>

        <div style={{ marginTop: 24, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.04)`, borderRadius: 12 }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            💡 <strong style={{ color: C.secondary }}>Why this matters:</strong> Your venue paid {pro || 'your PRO'} a licensing fee for this show. That money is sitting unclaimed until you submit your setlist. Most artists never do.
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
      `}</style>
    </div>
  )
}
