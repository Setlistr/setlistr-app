'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Check, Copy, ExternalLink, ChevronRight } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80',
  greenDim: 'rgba(74,222,128,0.08)',
}

type PRO = 'SOCAN' | 'ASCAP' | 'BMI'

const PRO_CONFIG: Record<PRO, {
  url: string
  urlLabel: string
  instructions: string[]
  fields: string
  country: string
}> = {
  SOCAN: {
    url: 'https://members.socan.com',
    urlLabel: 'members.socan.com',
    country: 'Canada',
    fields: 'Concert Notification',
    instructions: [
      'Log in at members.socan.com',
      'Go to "My Music" → "Concert Notification"',
      'Enter the performance date and venue',
      'Add each song title and composer',
      'Click Submit',
    ],
  },
  ASCAP: {
    url: 'https://www.ascap.com/playback',
    urlLabel: 'ascap.com/playback',
    country: 'USA',
    fields: 'Live Performance',
    instructions: [
      'Log in at ascap.com/playback',
      'Click "Report a Live Performance"',
      'Enter the venue name, city, and date',
      'Add each song with title and writer',
      'Submit your report',
    ],
  },
  BMI: {
    url: 'https://repertoire.bmi.com',
    urlLabel: 'repertoire.bmi.com',
    country: 'USA',
    fields: 'Live Performance Report',
    instructions: [
      'Log in at repertoire.bmi.com',
      'Select "Live Performance Report"',
      'Fill in the venue and date',
      'Enter each song title and composer',
      'Submit the report',
    ],
  },
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: copied ? 'rgba(74,222,128,0.1)' : C.goldDim,
      border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : C.borderGold}`,
      borderRadius: 8, padding: '6px 12px',
      color: copied ? C.green : C.gold,
      fontSize: 11, fontWeight: 700, cursor: 'pointer',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      transition: 'all 0.15s ease', fontFamily: 'inherit',
      flexShrink: 0,
    }}>
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} />}
      {copied ? 'Copied' : (label || 'Copy')}
    </button>
  )
}

export default function SubmitPage({ params }: { params: { id: string } }) {
  const router = useRouter()

  const [performance, setPerformance] = useState<any>(null)
  const [songs, setSongs]             = useState<any[]>([])
  const [profile, setProfile]         = useState<any>(null)
  const [loading, setLoading]         = useState(true)

  const [selectedPRO, setSelectedPRO] = useState<PRO | null>(null)
  const [step, setStep]               = useState(0) // 0 = PRO select, 1-4 = steps
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([false, false, false, false])
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()

      const [{ data: perf }, { data: songData }, { data: prof }] = await Promise.all([
        supabase.from('performances').select('*').eq('id', params.id).single(),
        supabase.from('performance_songs').select('*').eq('performance_id', params.id).order('position'),
        user ? supabase.from('profiles').select('pro_affiliation, ipi_number, publisher_name, legal_name, artist_name').eq('id', user.id).single() : { data: null },
      ])

      setPerformance(perf)
      setSongs(songData || [])
      setProfile(prof)

      // Auto-select PRO from profile
      if (prof?.pro_affiliation && ['SOCAN', 'ASCAP', 'BMI'].includes(prof.pro_affiliation)) {
        setSelectedPRO(prof.pro_affiliation as PRO)
      }

      // Check if already submitted
      if (perf?.submitted_at) setSubmitted(true)

      setLoading(false)
    }
    load()
  }, [params.id])

async function markSubmitted() {
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from('performances').update({
      submitted_to_pro: selectedPRO,
      submitted_at: new Date().toISOString(),
      status: 'exported',
    }).eq('id', params.id)
    setSubmitted(true)
    setSubmitting(false)
  }

  function toggleStep(i: number) {
    setCheckedSteps(prev => prev.map((v, idx) => idx === i ? !v : v))
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function buildSetlistText() {
    if (!performance) return ''
    const lines = [
      `${selectedPRO} Live Performance Report`,
      `Artist: ${profile?.artist_name || performance.artist_name}`,
      `Venue: ${performance.venue_name}`,
      `City: ${performance.city}`,
      `Date: ${formatDate(performance.started_at)}`,
      ``,
      `Songs Performed:`,
      ...songs.map((s, i) => `${i + 1}. ${s.title}${s.composer ? ` — ${s.composer}` : ''}`),
    ]
    if (profile?.ipi_number) lines.splice(2, 0, `IPI: ${profile.ipi_number}`)
    if (profile?.publisher_name) lines.splice(3, 0, `Publisher: ${profile.publisher_name}`)
    return lines.join('\n')
  }

  const royaltyLow  = Math.round(songs.length * 1.25 * 0.7)
  const royaltyHigh = Math.round(songs.length * 1.25 * 1.3)

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
      </div>
    )
  }

  // ── Submitted confirmation screen ─────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.07) 0%, transparent 65%)' }} />
        <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, textAlign: 'center', animation: 'fadeUp 0.5s ease' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Check size={26} color={C.green} strokeWidth={2.5} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.03em' }}>
            Submission recorded.
          </h1>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 6px' }}>
            {performance?.venue_name} · {performance?.city}
          </p>
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 28px' }}>
            {songs.length} songs submitted to {performance?.submitted_to_pro || selectedPRO}
          </p>
          <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '20px', marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 6px' }}>Estimated royalties</p>
            <p style={{ fontSize: 36, fontWeight: 800, color: C.gold, margin: '0 0 4px', letterSpacing: '-0.03em', fontFamily: '"DM Mono", monospace' }}>
              ${royaltyLow}–${royaltyHigh}
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>typically paid within 60–90 days</p>
          </div>
          <button onClick={() => router.push('/app/dashboard')} style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
            Back to Dashboard
          </button>
        </div>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    )
  }

  const config = selectedPRO ? PRO_CONFIG[selectedPRO] : null

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '45vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ paddingTop: 28, paddingBottom: 24, animation: 'fadeUp 0.4s ease' }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 20 }}>
            ← Back
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 10px', marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold }}>💰 Submit to Get Paid</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.025em' }}>
            {performance?.venue_name}
          </h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>
            {formatDate(performance?.started_at)} · {songs.length} songs · Est. ${royaltyLow}–${royaltyHigh}
          </p>
        </div>

        {/* ── Step 0: PRO Selection ── */}
        {step === 0 && (
          <div style={{ animation: 'fadeUp 0.4s ease', paddingBottom: 40 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 16px' }}>
                Which PRO are you with?
              </p>

              {profile?.pro_affiliation && (
                <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, color: C.gold, margin: 0 }}>
                    ✦ Your profile is set to <strong>{profile.pro_affiliation}</strong>
                    {profile.ipi_number ? ` · IPI ${profile.ipi_number}` : ''}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(['SOCAN', 'ASCAP', 'BMI'] as PRO[]).map(pro => (
                  <button key={pro} onClick={() => setSelectedPRO(pro)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: selectedPRO === pro ? C.goldDim : 'transparent', border: `1px solid ${selectedPRO === pro ? C.borderGold : C.border}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: selectedPRO === pro ? C.gold : C.text, margin: 0 }}>{pro}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{PRO_CONFIG[pro].country}</p>
                    </div>
                    {selectedPRO === pro && <Check size={16} color={C.gold} strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={() => selectedPRO && setStep(1)} disabled={!selectedPRO}
              style={{ width: '100%', padding: '15px', background: selectedPRO ? C.gold : C.muted, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: selectedPRO ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
              Start Submission Guide <ChevronRight size={15} />
            </button>
          </div>
        )}

        {/* ── Steps 1–4 ── */}
        {step > 0 && config && selectedPRO && (
          <div style={{ animation: 'fadeUp 0.3s ease', paddingBottom: 40 }}>

            {/* Progress bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
              {[1, 2, 3, 4].map(s => (
                <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? C.gold : C.border, transition: 'background 0.3s ease' }} />
              ))}
            </div>

            {/* Step 1 — Open PRO portal */}
            {step === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 12px' }}>
                    Step 1 of 4 · Open {selectedPRO}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 8px', lineHeight: 1.3 }}>
                    Log in to your {selectedPRO} account
                  </p>
                  <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px', lineHeight: 1.5 }}>
                    Open the {selectedPRO} member portal in a new tab. Keep this page open — you'll come back to copy your setlist data.
                  </p>
                  <a href={config.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, color: C.gold, fontSize: 13, fontWeight: 700, textDecoration: 'none', transition: 'all 0.15s ease' }}>
                    <span>{config.urlLabel}</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
                <button onClick={() => setStep(2)} style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  I'm logged in <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Step 2 — Copy setlist */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 12px' }}>
                    Step 2 of 4 · Copy Your Setlist
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
                    Your data is ready to copy
                  </p>
                  <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px', lineHeight: 1.5 }}>
                    Copy the full setlist report below and paste it into the {selectedPRO} {config.fields} form.
                  </p>

                  {/* Formatted setlist block */}
                  <div style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px', marginBottom: 12, fontFamily: '"DM Mono", monospace', fontSize: 12, color: C.secondary, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {buildSetlistText()}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <CopyButton value={buildSetlistText()} label="Copy Full Report" />
                  </div>
                </div>

                {/* Individual copy fields */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>
                    Copy Individual Fields
                  </p>
                  {[
                    { label: 'Artist Name', value: profile?.artist_name || performance?.artist_name },
                    { label: 'Venue', value: performance?.venue_name },
                    { label: 'City', value: performance?.city },
                    { label: 'Date', value: formatDate(performance?.started_at) },
                    ...(profile?.ipi_number ? [{ label: 'IPI Number', value: profile.ipi_number }] : []),
                    ...(profile?.legal_name ? [{ label: 'Legal Name', value: profile.legal_name }] : []),
                  ].map(field => (
                    <div key={field.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: '0 0 2px' }}>{field.label}</p>
                        <p style={{ fontSize: 13, color: C.text, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.value}</p>
                      </div>
                      <CopyButton value={field.value || ''} />
                    </div>
                  ))}
                </div>

                <button onClick={() => setStep(3)} style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  Copied — Next Step <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Step 3 — Paste and fill */}
            {step === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 12px' }}>
                    Step 3 of 4 · Fill In the Form
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>
                    Paste your data into {selectedPRO}
                  </p>

                  {/* Step-by-step instructions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {config.instructions.map((instruction, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: C.gold }}>{i + 1}</span>
                        </div>
                        <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>{instruction}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={() => setStep(4)} style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  Form is filled in <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Step 4 — Confirm submission */}
            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 12px' }}>
                    Step 4 of 4 · Confirm
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
                    Submit and confirm
                  </p>
                  <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>
                    Hit Submit on the {selectedPRO} form, then confirm here so Setlistr can track it.
                  </p>

                  {/* Checklist */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      `Opened ${selectedPRO} member portal`,
                      'Copied and pasted setlist data',
                      `Filled in venue, date, and songs on ${selectedPRO}`,
                      `Clicked Submit on ${selectedPRO}`,
                    ].map((item, i) => (
                      <button key={i} onClick={() => toggleStep(i)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: checkedSteps[i] ? 'rgba(74,222,128,0.06)' : 'transparent', border: `1px solid ${checkedSteps[i] ? 'rgba(74,222,128,0.25)' : C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: checkedSteps[i] ? C.green : 'transparent', border: `1px solid ${checkedSteps[i] ? C.green : C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' }}>
                          {checkedSteps[i] && <Check size={11} color="#0a0908" strokeWidth={3} />}
                        </div>
                        <p style={{ fontSize: 13, color: checkedSteps[i] ? C.green : C.secondary, margin: 0, fontWeight: checkedSteps[i] ? 600 : 400 }}>{item}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={markSubmitted}
                  disabled={submitting || !checkedSteps.every(Boolean)}
                  style={{ width: '100%', padding: '15px', background: checkedSteps.every(Boolean) ? C.gold : C.muted, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: checkedSteps.every(Boolean) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? (
                    <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Recording...</>
                  ) : (
                    <><Check size={15} strokeWidth={2.5} />I submitted it — Mark as Done</>
                  )}
                </button>

                {!checkedSteps.every(Boolean) && (
                  <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: 0 }}>
                    Check all steps above to confirm
                  </p>
                )}
              </div>
            )}

            {/* Back button between steps */}
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '12px', width: '100%', marginTop: 4 }}>
                ← Previous step
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
