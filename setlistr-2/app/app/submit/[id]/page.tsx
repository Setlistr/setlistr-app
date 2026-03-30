'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, ExternalLink, Copy, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.08)',
}

// ─── PRO config ───────────────────────────────────────────────────────────────
// Exact navigation steps verified from each PRO's documentation.
// Portal links go to the member login page — the closest we can get without API.
const PRO_CONFIG: Record<string, {
  portal:       string
  portalLabel:  string
  program:      string  // what the PRO calls their live submission program
  steps:        string[]
  deadline:     string  // human readable
  deadlineDays: (now: Date) => number  // days until next deadline
  submitUrl:    string  // most direct URL after login
}> = {
  SOCAN: {
    portal:       'https://memp.socan.com',
    portalLabel:  'Open SOCAN New Portal',
    program:      'Live Performances & Set List Submissions',
    steps: [
      'Log in at memp.socan.com (new portal — create new login if first time)',
      'Step 1: Create your Set List — navigate to Live Performances → Set Lists → Create',
      'Add each song from your setlist (search by title, artist, or work number)',
      'Save and Register your set list (registration is instant if all songs are in SOCAN catalog)',
      'Step 2: Input Live Performance — go to Live Performances → Concerts → Add',
      'Search venue name — address auto-populates',
      'Attach the registered set list you just created → Submit',
      'Track status: Pending → Accepted (then in queue for payment)',
    ],
    deadline:     '1 year from show date',
    deadlineDays: (now: Date) => 365,
    submitUrl:    'https://memp.socan.com',
  },
  ASCAP: {
    portal:       'https://www.ascap.com/members',
    portalLabel:  'Open ASCAP OnStage',
    program:      'ASCAP OnStage',
    steps: [
      'Log in at ascap.com/members (Member Access)',
      'Click "Works" in the left sidebar → select "OnStage"',
      'Under "Setlists" → click "Add +" → name your setlist',
      'Check each song you performed → click "Add to Setlist"',
      'Under "Performances" → click "Add +"',
      'Search for your venue by name and state',
      'Select your setlist from the dropdown → click Submit',
    ],
    deadline:     'Quarterly — submit within the same quarter as your show',
    deadlineDays: (now: Date) => {
      const month = now.getMonth()
      const year  = now.getFullYear()
      const quarterEnds = [
        new Date(year, 5, 30),   // Q1 ends June 30
        new Date(year, 8, 30),   // Q2 ends Sep 30
        new Date(year, 11, 31),  // Q3 ends Dec 31
        new Date(year + 1, 2, 31), // Q4 ends Mar 31
      ]
      for (const end of quarterEnds) {
        const days = Math.ceil((end.getTime() - now.getTime()) / 86400000)
        if (days > 0) return days
      }
      return 90
    },
    submitUrl:    'https://www.ascap.com/members',
  },
  BMI: {
    portal:       'https://www.bmi.com',
    portalLabel:  'Open BMI.com',
    program:      'BMI Live',
    steps: [
      'Log in at bmi.com → click your name at top right',
      'Select "Online Services" from the dropdown',
      'Click "BMI Live" in the applications panel (top left)',
      'Click "Add a Performance" in the top right corner',
      'Enter venue name, address, phone number, date and time',
      'Search for each song by title in the BMI database',
      'Submit — must be enrolled in direct deposit to receive payment',
    ],
    deadline:     'Up to 9 months after the performance date',
    deadlineDays: (now: Date) => 270,  // 9 months
    submitUrl:    'https://www.bmi.com',
  },
  SESAC: {
    portal:       'https://affiliates.sesac.com',
    portalLabel:  'Open SESAC Affiliate Portal',
    program:      'SESAC Affiliate Services — Live Performance',
    steps: [
      'Log in at affiliates.sesac.com',
      'Navigate to "Affiliate Services" in your dashboard',
      'Go to Live Performances section',
      'Create a setlist — you can copy it across multiple show dates',
      'Enter venue address, capacity, date and music fees',
      'Add song titles and submit',
      'Contact your SESAC rep if you need help — SESAC is relationship-driven',
    ],
    deadline:     'Contact your SESAC rep for deadlines — varies by agreement',
    deadlineDays: (now: Date) => 180,
    submitUrl:    'https://affiliates.sesac.com',
  },
  GMR: {
    portal:       'https://globalmusicrights.com',
    portalLabel:  'Open GMR Website',
    program:      'GMR — Contact Your Representative',
    steps: [
      'GMR does not have a self-serve online submission portal',
      'Contact your GMR representative directly to submit live performance data',
      'Provide: venue name, date, setlist, and audience size',
      'Your rep will handle submission and royalty tracking on your behalf',
      'GMR is boutique and relationship-driven — your rep is your point of contact',
    ],
    deadline:     'Contact your GMR rep for specific deadlines',
    deadlineDays: (now: Date) => 180,
    submitUrl:    'https://globalmusicrights.com',
  },
  PRS: {
    portal:       'https://www.prsformusic.com/my-prs',
    portalLabel:  'Open PRS Portal',
    program:      'PRS for Music — Live Music Reporting',
    steps: [
      'Log in at prsformusic.com/my-prs',
      'Go to "Live Music" in your dashboard',
      'Click "Submit a setlist"',
      'Enter venue name, postcode, date and ticket price',
      'Add song titles, your writer share, and any co-writer details',
      'Submit — PRS pays a minimum per-gig rate for smaller venues',
    ],
    deadline:     'Submit within 1 year of performance',
    deadlineDays: (now: Date) => 365,
    submitUrl:    'https://www.prsformusic.com/my-prs',
  },
  APRA: {
    portal:       'https://www.apraamcos.com.au/members',
    portalLabel:  'Open APRA Portal',
    program:      'APRA AMCOS — Live Performance',
    steps: [
      'Log in at apraamcos.com.au/members',
      'Navigate to Live Performance section',
      'Click "Submit a setlist"',
      'Enter venue, date, and performance details',
      'Add songs performed from your catalog',
      'Submit for royalty distribution',
    ],
    deadline:     'Submit within 1 year of performance',
    deadlineDays: (now: Date) => 365,
    submitUrl:    'https://www.apraamcos.com.au/members',
  },
}

type Song = {
  title: string
  artist: string
  isrc?: string
  composer?: string
  publisher?: string
  matchConfidence: 'matched' | 'partial' | 'unverified' | 'none'
}

type Performance = {
  id: string
  venue_name: string
  city: string
  country: string
  started_at: string
  artist_name: string
  show_type?: string
  venue_capacity?: number | null
  submission_status?: string | null
}

type Profile = {
  pro_affiliation: string | null
  legal_name: string | null
  ipi_number: string | null
  publisher_name: string | null
  artist_name: string | null
}

// Match confidence — NOT registration status.
// Only meaningful for auto-detected songs — manual adds return 'none'.
// Source field isn't available from performance_songs, so we use metadata
// presence as the signal: both = matched, one = partial, neither = unverified.
// Songs submitted via the submit page went through detection — we treat
// absence of source info conservatively as unverified rather than none.
function deriveConfidence(song: { isrc?: string; composer?: string }): 'matched' | 'partial' | 'unverified' | 'none' {
  if (song.isrc && song.composer) return 'matched'
  if (song.isrc || song.composer) return 'partial'
  return 'unverified'
}

function buildCopyText(songs: Song[], perf: Performance, profile: Profile, pro: string): string {
  const date = new Date(perf.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const lines = [
    `${pro} SETLIST SUBMISSION`,
    `=`.repeat(40),
    `Artist:    ${profile.artist_name || perf.artist_name}`,
    profile.legal_name  ? `Legal Name: ${profile.legal_name}`  : null,
    profile.ipi_number  ? `IPI/CAE:    ${profile.ipi_number}`  : null,
    profile.publisher_name ? `Publisher:  ${profile.publisher_name}` : null,
    ``,
    `Venue:     ${perf.venue_name}${perf.city ? `, ${perf.city}` : ''}`,
    `Date:      ${date}`,
    ``,
    `SONGS PERFORMED (${songs.length} total)`,
    `-`.repeat(40),
    ...songs.map((s, i) => {
      const parts = [`${i + 1}. ${s.title}`]
      if (s.isrc)      parts.push(`  ISRC: ${s.isrc}`)
      if (s.composer)  parts.push(`  Writer: ${s.composer}`)
      if (s.publisher) parts.push(`  Publisher: ${s.publisher}`)
      return parts.join('\n')
    }),
  ].filter((l): l is string => l !== null)
  return lines.join('\n')
}

function DeadlineBadge({ daysLeft, deadline }: { daysLeft: number; deadline: string }) {
  const urgent  = daysLeft <= 30
  const warning = daysLeft <= 60
  const color   = urgent ? C.red : warning ? C.gold : C.green
  const bg      = urgent ? C.redDim : warning ? C.goldDim : C.greenDim
  const border  = urgent ? 'rgba(248,113,113,0.25)' : warning ? C.borderGold : 'rgba(74,222,128,0.25)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: bg, border: `1px solid ${border}`, borderRadius: 10 }}>
      <AlertCircle size={13} color={color} />
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color, margin: 0 }}>
          {urgent ? `⚠️ ${daysLeft} days left to submit` : warning ? `${daysLeft} days left to submit` : `Deadline: ${deadline}`}
        </p>
        {urgent && <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>Submit now to avoid losing this claim</p>}
      </div>
    </div>
  )
}

export default function SubmitPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance]   = useState<Performance | null>(null)
  const [songs, setSongs]               = useState<Song[]>([])
  const [profile, setProfile]           = useState<Profile | null>(null)
  const [loading, setLoading]           = useState(true)
  const [copied, setCopied]             = useState(false)
  const [stepsOpen, setStepsOpen]       = useState(false)
  const [submitted, setSubmitted]       = useState(false)
  const [markingDone, setMarkingDone]   = useState(false)
  const [stepsDone, setStepsDone]       = useState<boolean[]>([])

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('pro_affiliation, legal_name, ipi_number, publisher_name, artist_name')
        .eq('id', user.id).single()
      setProfile(profileData)

      const { data: perf } = await supabase
        .from('performances')
        .select('*, shows(show_type), venues(capacity)')
        .eq('id', params.id).single()

      if (!perf) { setLoading(false); return }
      setPerformance({
        ...perf,
        show_type:         perf.shows?.show_type || null,
        venue_capacity:    perf.venues?.capacity || null,
        submission_status: perf.submission_status || null,
      })
      setSubmitted(perf.submission_status === 'submitted')

      const { data: songData } = await supabase
        .from('performance_songs')
        .select('title, artist, isrc, composer, publisher')
        .eq('performance_id', params.id).order('position')

      if (songData) {
        const mapped = songData.map(s => ({
          title: s.title, artist: s.artist || '',
          isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
          matchConfidence: deriveConfidence(s),
        }))
        setSongs(mapped)
        // Init step completion state based on PRO step count
        const pro = profileData?.pro_affiliation
        const config = pro ? PRO_CONFIG[pro] : null
        if (config) setStepsDone(new Array(config.steps.length).fill(false))
      }
      setLoading(false)
    }
    load()
  }, [params.id])

  async function handleCopy() {
    if (!performance || !profile) return
    const pro  = profile.pro_affiliation || 'PRO'
    const text = buildCopyText(songs, performance, profile, pro)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  async function markSubmitted() {
    if (markingDone) return
    setMarkingDone(true)
    const supabase = createClient()
    await supabase.from('performances').update({
      submission_status: 'submitted',
      submitted_at: new Date().toISOString(),
    }).eq('id', params.id)
    setSubmitted(true)
    setMarkingDone(false)
  }

  function toggleStep(i: number) {
    setStepsDone(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
      </div>
    )
  }

  if (!performance) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
        <p style={{ color: C.muted }}>Performance not found.</p>
      </div>
    )
  }

  const pro       = profile?.pro_affiliation
  const proConfig = pro ? PRO_CONFIG[pro] : null
  const hasPRO    = !!proConfig
  const territory = performance.country === 'CA' || performance.country === 'Canada' ? 'CA' : 'US'
  const estimate  = estimateRoyalties({
    songCount:         songs.length,
    venueCapacityBand: capacityToBand(performance.venue_capacity),
    showType:          (performance.show_type as any) || 'single',
    territory,
  })

  const matchedCount    = songs.filter(s => s.matchConfidence === 'matched').length
  const partialCount    = songs.filter(s => s.matchConfidence === 'partial').length
  const unverifiedCount = songs.filter(s => s.matchConfidence === 'unverified').length
  const strongCount     = matchedCount + partialCount

  const daysLeft    = proConfig ? proConfig.deadlineDays(new Date()) : 365
  const showDate    = new Date(performance.started_at)
  const stepsCompleted = stepsDone.filter(Boolean).length
  const totalSteps     = stepsDone.length

  // ── Submitted state ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.06) 0%, transparent 65%)' }} />
        <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fadeUp 0.5s ease' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Check size={28} color={C.green} strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.025em' }}>Submitted to {pro}</h1>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 6px' }}>{performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}</p>
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 28px' }}>
            {showDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <div style={{ width: '100%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 16, padding: '20px', marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: C.green, margin: '0 0 4px', fontWeight: 600 }}>~${estimate.expected} claimed</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>
              {songs.length} songs submitted · expect payment in 6–9 months
            </p>
          </div>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
            Back to Dashboard
          </button>
          <button onClick={() => setSubmitted(false)}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            View submission details
          </button>
        </div>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
          @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '28px 16px 80px', boxSizing: 'border-box' }}>

        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 20px', letterSpacing: '0.04em' }}>
          ← Back
        </button>

        {/* ── Hero ── */}
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 6px', opacity: 0.8 }}>
          {performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Claim Your<br /><span style={{ color: C.gold }}>Royalties</span>
        </h1>
        <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 24px' }}>
          {showDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {/* ── Money + deadline ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12, animation: 'fadeUp 0.4s ease' }}>
          <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: '0 0 6px' }}>You're owed</p>
            <p style={{ fontSize: 28, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>~${estimate.expected}</p>
            <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>${estimate.low}–${estimate.high} range</p>
          </div>
          <div style={{ background: daysLeft <= 30 ? C.redDim : daysLeft <= 60 ? C.goldDim : C.greenDim, border: `1px solid ${daysLeft <= 30 ? 'rgba(248,113,113,0.25)' : daysLeft <= 60 ? C.borderGold : 'rgba(74,222,128,0.25)'}`, borderRadius: 14, padding: '16px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: daysLeft <= 30 ? C.red : daysLeft <= 60 ? C.gold : C.green, margin: '0 0 6px' }}>
              {daysLeft <= 60 ? 'Deadline' : 'Submit by'}
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, color: daysLeft <= 30 ? C.red : daysLeft <= 60 ? C.gold : C.green, margin: 0, fontFamily: '"DM Mono", monospace' }}>
              {daysLeft <= 365 ? `${daysLeft}d` : '1yr'}
            </p>
            <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>
              {proConfig?.deadline.split('—')[0].trim() || 'from show date'}
            </p>
          </div>
        </div>

        {/* ── Readiness ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 12, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>Song Readiness</p>
            <span style={{ fontSize: 12, fontWeight: 700, color: strongCount === songs.length ? C.green : C.gold }}>
              {strongCount}/{songs.length} matched
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(strongCount / Math.max(songs.length, 1)) * 100}%`, background: strongCount === songs.length ? C.green : C.gold, borderRadius: 2, transition: 'width 0.4s ease' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matchedCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text }}>Matched</span>
                  <span style={{ fontSize: 11, color: C.muted }}>strong metadata</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: '"DM Mono", monospace' }}>{matchedCount}</span>
              </div>
            ) : null}
            {partialCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text }}>Partial match</span>
                  <span style={{ fontSize: 11, color: C.muted }}>partial metadata</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{partialCount}</span>
              </div>
            ) : null}
            {unverifiedCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.muted, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.secondary }}>Unverified</span>
                  <span style={{ fontSize: 11, color: C.muted }}>no metadata found</span>
                </div>
                <button
                  onClick={() => pro && window.open(proConfig?.portal, '_blank')}
                  style={{ fontSize: 11, color: C.blue, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                  Register with your PRO →
                </button>
              </div>
            ) : null}
          </div>

          {unverifiedCount > 0 ? (
            <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 0', paddingTop: 10, borderTop: `1px solid ${C.border}`, lineHeight: 1.5 }}>
              Unverified songs have limited metadata. Register them with your PRO to ensure they're eligible for royalties.
            </p>
          ) : null}
        </div>

        {/* ── No PRO warning ── */}
        {!hasPRO ? (
          <div style={{ background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 12, animation: 'fadeUp 0.4s 0.08s ease both' }}>
            <p style={{ fontSize: 13, color: C.red, margin: '0 0 4px', fontWeight: 700 }}>No PRO selected</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 10px' }}>Set your PRO affiliation in Settings to use the guided submission flow.</p>
            <button onClick={() => router.push('/app/settings')}
              style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '8px 14px', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Go to Settings →
            </button>
          </div>
        ) : null}

        {/* ── Guided steps ── */}
        {hasPRO && proConfig ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, marginBottom: 12, overflow: 'hidden', animation: 'fadeUp 0.4s 0.1s ease both' }}>
            <button
              onClick={() => setStepsOpen(v => !v)}
              style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>How to submit on {pro}</span>
                {stepsCompleted > 0 ? (
                  <span style={{ fontSize: 11, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 8px' }}>
                    {stepsCompleted}/{totalSteps} done
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: C.muted }}>{totalSteps} steps</span>
                )}
              </div>
              {stepsOpen ? <ChevronUp size={15} color={C.muted} /> : <ChevronDown size={15} color={C.muted} />}
            </button>

            {stepsOpen ? (
              <div style={{ padding: '0 18px 18px', borderTop: `1px solid ${C.border}`, animation: 'slideUp 0.15s ease' }}>
                <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 14px', lineHeight: 1.5 }}>
                  Program: <strong style={{ color: C.secondary }}>{proConfig.program}</strong>
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {proConfig.steps.map((step, i) => (
                    <button
                      key={i}
                      onClick={() => toggleStep(i)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px', background: stepsDone[i] ? C.greenDim : 'rgba(255,255,255,0.02)', border: `1px solid ${stepsDone[i] ? 'rgba(74,222,128,0.2)' : C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.15s ease', width: '100%' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: stepsDone[i] ? C.green : 'rgba(255,255,255,0.06)', border: `1px solid ${stepsDone[i] ? C.green : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
                        {stepsDone[i]
                          ? <Check size={11} color="#0a0908" strokeWidth={3} />
                          : <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace', fontWeight: 700 }}>{i + 1}</span>
                        }
                      </div>
                      <span style={{ fontSize: 13, color: stepsDone[i] ? C.green : C.text, lineHeight: 1.4, textDecoration: stepsDone[i] ? 'line-through' : 'none', opacity: stepsDone[i] ? 0.7 : 1, transition: 'all 0.15s ease' }}>
                        {step}
                      </span>
                    </button>
                  ))}
                </div>
                {stepsCompleted === totalSteps ? (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check size={14} color={C.green} strokeWidth={2.5} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>All steps done — mark as submitted below</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Copy setlist ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', marginBottom: 12, animation: 'fadeUp 0.4s 0.12s ease both' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
            Your Formatted Setlist
          </p>
          <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 12px', lineHeight: 1.5 }}>
            Pre-formatted for {pro || 'your PRO'} with all fields required for submission. Copy and reference while entering songs in the portal.
          </p>
          <div style={{ background: '#0a0908', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 10, padding: '12px 14px', marginBottom: 10, maxHeight: 160, overflowY: 'auto' }}>
            <pre style={{ fontSize: 11, color: C.secondary, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {performance && profile ? buildCopyText(songs, performance, profile, pro || 'PRO') : ''}
            </pre>
          </div>
          <button
            onClick={handleCopy}
            style={{ width: '100%', padding: '12px', background: copied ? C.greenDim : 'rgba(255,255,255,0.04)', border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : C.border}`, borderRadius: 10, color: copied ? C.green : C.secondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit', transition: 'all 0.2s ease' }}>
            {copied ? <><Check size={13} strokeWidth={2.5} /> Copied!</> : <><Copy size={13} /> Copy Setlist</>}
          </button>
        </div>

        {/* ── Primary CTA ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeUp 0.4s 0.15s ease both' }}>
          {hasPRO && proConfig ? (
            <button
              onClick={() => window.open(proConfig.submitUrl, '_blank')}
              style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              <ExternalLink size={15} strokeWidth={2.5} />
              {proConfig.portalLabel}
            </button>
          ) : null}

          <button
            onClick={markSubmitted}
            disabled={markingDone}
            style={{ width: '100%', padding: '14px', background: 'transparent', border: `1px solid ${C.green}40`, borderRadius: 12, color: C.green, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit', opacity: markingDone ? 0.6 : 1, transition: 'all 0.2s ease' }}>
            <Check size={14} strokeWidth={2.5} />
            {markingDone ? 'Marking...' : 'Mark as Submitted'}
          </button>

          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '8px', width: '100%' }}>
            Back to Dashboard
          </button>
        </div>

        {/* ── Song list ── */}
        <div style={{ marginTop: 24, animation: 'fadeUp 0.4s 0.18s ease both' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
            Setlist · {songs.length} songs
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {songs.map((song, i) => {
              const sc = song.matchConfidence === 'matched' ? C.green : song.matchConfidence === 'partial' ? C.gold : song.matchConfidence === 'unverified' ? C.muted : 'transparent'
              const sl = song.matchConfidence === 'matched' ? 'Matched' : song.matchConfidence === 'partial' ? 'Partial' : song.matchConfidence === 'unverified' ? 'Unverified' : ''
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: C.muted, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                    {song.isrc ? <p style={{ fontSize: 10, color: C.muted, margin: '1px 0 0', fontFamily: '"DM Mono", monospace' }}>{song.isrc}</p> : null}
                  </div>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: sc, flexShrink: 0, minWidth: 32, textAlign: 'right' }}>{sl}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── PRO pitch note (for acquisition positioning) ── */}
        <div style={{ marginTop: 24, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.04)`, borderRadius: 12 }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            💡 <strong style={{ color: C.secondary }}>Why this matters:</strong> Your venue paid {pro || 'your PRO'} a licensing fee for this show. That money is sitting unclaimed until you submit your setlist. Most artists never do.
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)}  to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
