'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, ExternalLink, Copy } from 'lucide-react'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  blue: '#60a5fa',
}

type Song = {
  title: string
  artist: string
  isrc?: string
  composer?: string
  publisher?: string
  registrationStatus: 'registered' | 'likely' | 'unknown'
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
}

type Profile = {
  pro_affiliation: string | null
  legal_name: string | null
  ipi_number: string | null
  publisher_name: string | null
  artist_name: string | null
}

// PRO portal links and navigation instructions
// None of these PROs support public deep links to submission forms —
// they all require login first. We link to the member portal login page
// and give exact navigation steps to reach the submission form.
const PRO_LINKS: Record<string, { url: string; label: string; instructions: string }> = {
  SOCAN: {
    url:          'https://www.socan.com/member-portal',
    label:        'Open SOCAN Portal',
    instructions: 'Log in → Performances & Repertoire → Live Performances → Submit NLMP form',
  },
  ASCAP: {
    url:          'https://www.ascap.com/member',
    label:        'Open ASCAP Portal',
    instructions: 'Log in → My Account → Concerts & Live Performances → Submit setlist',
  },
  BMI: {
    url:          'https://www.bmi.com/members',
    label:        'Open BMI Portal',
    instructions: 'Log in → My Account → Live Performance Royalties → Submit setlist',
  },
  SESAC: {
    url:          'https://www.sesac.com/members',
    label:        'Open SESAC Portal',
    instructions: 'Log in or contact your SESAC rep to submit live performance data',
  },
  GMR: {
    url:          'https://www.globalmusicrights.com',
    label:        'Open GMR',
    instructions: 'Contact your GMR representative directly to submit setlists',
  },
  APRA: {
    url:          'https://www.apraamcos.com.au/members',
    label:        'Open APRA Portal',
    instructions: 'Log in → Live Performance → Submit a setlist',
  },
  PRS: {
    url:          'https://www.prsformusic.com/my-prs',
    label:        'Open PRS Portal',
    instructions: 'Log in → My Account → Live Music → Submit setlist',
  },
}

function deriveRegistrationStatus(song: { isrc?: string; composer?: string }): 'registered' | 'likely' | 'unknown' {
  if (song.isrc) return 'registered'
  if (song.composer) return 'likely'
  return 'unknown'
}

function buildSubmissionText(songs: Song[], performance: Performance, profile: Profile): string {
  const date = new Date(performance.started_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
  const lines: string[] = [
    `SETLIST SUBMISSION`,
    `==================`,
    `Venue: ${performance.venue_name}${performance.city ? `, ${performance.city}` : ''}`,
    `Date: ${date}`,
    `Artist: ${profile.artist_name || performance.artist_name}`,
    profile.legal_name ? `Legal Name: ${profile.legal_name}` : '',
    profile.ipi_number ? `IPI/CAE: ${profile.ipi_number}` : '',
    profile.publisher_name ? `Publisher: ${profile.publisher_name}` : '',
    ``,
    `SONGS PERFORMED`,
    `---------------`,
    ...songs.map((s, i) => {
      const parts = [`${i + 1}. ${s.title}`]
      if (s.isrc) parts.push(`(ISRC: ${s.isrc})`)
      if (s.composer) parts.push(`- Written by ${s.composer}`)
      if (s.publisher) parts.push(`- Published by ${s.publisher}`)
      return parts.join(' ')
    }),
    ``,
    `Total songs: ${songs.length}`,
  ].filter(l => l !== null)

  return lines.join('\n')
}

export default function SubmitPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [songs, setSongs]             = useState<Song[]>([])
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [loading, setLoading]         = useState(true)
  const [copied, setCopied]           = useState(false)
  const [sheetOpen, setSheetOpen]     = useState(false)
  const [step, setStep]               = useState<'idle' | 'copied' | 'opened'>('idle')

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      // Load profile for PRO info
      const { data: profileData } = await supabase
        .from('profiles')
        .select('pro_affiliation, legal_name, ipi_number, publisher_name, artist_name')
        .eq('id', user.id)
        .single()

      setProfile(profileData)

      // Load performance with show type and venue capacity
      const { data: perf } = await supabase
        .from('performances')
        .select('*, shows(show_type), venues(capacity)')
        .eq('id', params.id)
        .single()

      if (!perf) { setLoading(false); return }

      setPerformance({
        ...perf,
        show_type:      perf.shows?.show_type || null,
        venue_capacity: perf.venues?.capacity || null,
      })

      // Load songs
      const { data: songData } = await supabase
        .from('performance_songs')
        .select('title, artist, isrc, composer, publisher')
        .eq('performance_id', params.id)
        .order('position')

      if (songData) {
        setSongs(songData.map(s => ({
          title:     s.title,
          artist:    s.artist || '',
          isrc:      s.isrc || '',
          composer:  s.composer || '',
          publisher: s.publisher || '',
          registrationStatus: deriveRegistrationStatus(s),
        })))
      }

      setLoading(false)
    }
    load()
  }, [params.id])

  async function handleCopy() {
    if (!performance || !profile) return
    const text = buildSubmissionText(songs, performance, profile)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setStep('copied')
    } catch {
      // Fallback for browsers that block clipboard
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setStep('copied')
    }
  }

  function handleOpenPRO() {
    const pro = profile?.pro_affiliation
    if (!pro || !PRO_LINKS[pro]) return
    window.open(PRO_LINKS[pro].url, '_blank')
    setStep('opened')
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

  const registeredCount = songs.filter(s => s.registrationStatus === 'registered').length
  const likelyCount     = songs.filter(s => s.registrationStatus === 'likely').length
  const unknownCount    = songs.filter(s => s.registrationStatus === 'unknown').length
  const readyCount      = registeredCount + likelyCount

  const territory = performance.country === 'CA' || performance.country === 'Canada' ? 'CA' : 'US'
  const estimate  = estimateRoyalties({
    songCount:         songs.length,
    venueCapacityBand: capacityToBand(performance.venue_capacity),
    showType:          (performance.show_type as any) || 'single',
    territory,
  })

  const pro       = profile?.pro_affiliation
  const proInfo   = pro ? PRO_LINKS[pro] : null
  const hasPRO    = !!proInfo

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '28px 16px 60px', boxSizing: 'border-box' }}>

        {/* Header */}
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Back
        </button>

        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 6px', opacity: 0.8 }}>
          {performance.venue_name}{performance.city ? ` · ${performance.city}` : ''}
        </p>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Claim Your<br /><span style={{ color: C.gold }}>Royalties</span>
        </h1>
        <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 28px' }}>
          {new Date(performance.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {/* Earnings card */}
        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '20px', marginBottom: 12, animation: 'fadeUp 0.4s ease' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: '0 0 6px' }}>Estimated Earnings</p>
          <p style={{ fontSize: 36, fontWeight: 800, color: C.gold, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
            ${estimate.low}–${estimate.high}
          </p>
          <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>expected ~${estimate.expected}</p>
        </div>

        {/* Readiness card */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 20, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>Song Readiness</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {registeredCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text }}>Registered</span>
                  <span style={{ fontSize: 11, color: C.muted }}>— ISRC confirmed</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: '"DM Mono", monospace' }}>{registeredCount}</span>
              </div>
            ) : null}
            {likelyCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.gold, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text }}>Likely registered</span>
                  <span style={{ fontSize: 11, color: C.muted }}>— composer known</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{likelyCount}</span>
              </div>
            ) : null}
            {unknownCount > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.muted, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.secondary }}>Unknown</span>
                  <span style={{ fontSize: 11, color: C.muted }}>— may not collect</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: '"DM Mono", monospace' }}>{unknownCount}</span>
              </div>
            ) : null}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>
              <strong style={{ color: readyCount > 0 ? C.green : C.muted }}>{readyCount} of {songs.length} songs</strong> ready to claim
              {unknownCount > 0 ? ` · ${unknownCount} may need registration` : ''}
            </p>
          </div>
        </div>

        {/* No PRO set warning */}
        {!hasPRO ? (
          <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, animation: 'fadeUp 0.4s 0.1s ease both' }}>
            <p style={{ fontSize: 13, color: '#f87171', margin: '0 0 6px', fontWeight: 600 }}>No PRO selected</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 10px' }}>Set your PRO in Settings to enable one-tap submission.</p>
            <button onClick={() => router.push('/app/settings')}
              style={{ background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '8px 14px', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Go to Settings →
            </button>
          </div>
        ) : null}

        {/* Get Paid CTA */}
        <div style={{ animation: 'fadeUp 0.4s 0.1s ease both' }}>
          <button
            onClick={() => { setSheetOpen(true); handleCopy() }}
            disabled={!hasPRO}
            style={{ width: '100%', padding: '17px', background: hasPRO ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: hasPRO ? 'pointer' : 'not-allowed', opacity: hasPRO ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginBottom: 10 }}
          >
            💰 Get Paid
          </button>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ width: '100%', padding: '12px', background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Back to Dashboard
          </button>
        </div>

        {/* Song list with registration status */}
        <div style={{ marginTop: 24, animation: 'fadeUp 0.4s 0.15s ease both' }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>Setlist</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {songs.map((song, i) => {
              const statusColor = song.registrationStatus === 'registered' ? C.green : song.registrationStatus === 'likely' ? C.gold : C.muted
              const statusLabel = song.registrationStatus === 'registered' ? 'Registered' : song.registrationStatus === 'likely' ? 'Likely' : 'Unknown'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: C.muted, minWidth: 18, textAlign: 'right', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                    {song.isrc ? <p style={{ fontSize: 10, color: C.muted, margin: '1px 0 0', fontFamily: '"DM Mono", monospace' }}>{song.isrc}</p> : null}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, flexShrink: 0, letterSpacing: '0.04em' }}>{statusLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Get Paid bottom sheet */}
      {sheetOpen ? (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}
          onClick={() => setSheetOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, background: '#141210', borderRadius: '24px 24px 0 0', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none', padding: '24px 24px 48px', fontFamily: '"DM Sans", system-ui, sans-serif', animation: 'sheetUp 0.25s ease' }}
          >
            {/* Sheet header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Submit to {pro}</p>
                <p style={{ fontSize: 12, color: C.secondary, margin: '2px 0 0' }}>{proInfo?.instructions}</p>
              </div>
              <button onClick={() => setSheetOpen(false)} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted }}>
                ✕
              </button>
            </div>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {[
                { label: 'Setlist copied to clipboard', done: step === 'copied' || step === 'opened', active: true },
                { label: `Open ${pro} submission page`, done: step === 'opened', active: step === 'copied' || step === 'opened' },
                { label: 'Paste & submit', done: false, active: step === 'opened' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: item.done ? C.greenDim : item.active ? 'rgba(255,255,255,0.03)' : 'transparent', border: `1px solid ${item.done ? 'rgba(74,222,128,0.2)' : item.active ? C.border : 'transparent'}`, borderRadius: 10, transition: 'all 0.2s ease' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: item.done ? C.green : item.active ? 'rgba(255,255,255,0.08)' : 'transparent', border: `1px solid ${item.done ? C.green : item.active ? C.border : 'rgba(255,255,255,0.04)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}>
                    {item.done ? <Check size={12} color="#0a0908" strokeWidth={3} /> : <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: item.active ? 600 : 400, color: item.done ? C.green : item.active ? C.text : C.muted, transition: 'color 0.2s ease' }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            {step === 'idle' || step === 'copied' ? (
              <button
                onClick={step === 'idle' ? handleCopy : handleOpenPRO}
                style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
              >
                {step === 'idle' ? (
                  <><Copy size={15} /> Copy Setlist</>
                ) : (
                  <><ExternalLink size={15} /> {proInfo?.label}</>
                )}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12 }}>
                  <Check size={16} color={C.green} strokeWidth={2.5} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.green }}>Setlist copied · {pro} opened · Paste and submit!</span>
                </div>
                <button onClick={() => handleOpenPRO()}
                  style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.secondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <ExternalLink size={13} /> Open {pro} again
                </button>
                <button onClick={() => { setSheetOpen(false); router.push('/app/dashboard') }}
                  style={{ width: '100%', padding: '13px', background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Done → Back to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes sheetUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
