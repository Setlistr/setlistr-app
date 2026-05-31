'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

const PRO_OPTIONS = ['SOCAN', 'ASCAP', 'BMI', 'SESAC', 'GMR', 'APRA', 'PRS', 'Other', 'Not sure']

type SpotifyArtist = {
  id: string; name: string; followers: number
  image: string | null; genres: string[]
}

type CareerData = {
  state: 'loading' | 'rich' | 'partial' | 'empty'
  totalShows: number
  cities: string[]
  shows: any[]
  estimatedMin: number
  estimatedMax: number
  artistName: string
  lastfmListeners: number
}

function estimateRoyalties(totalShows: number, avgSongsPerShow: number = 10): { min: number; max: number } {
  // Conservative PRO live performance rate: $2–8 per song per show depending on venue size
  const min = Math.round(totalShows * avgSongsPerShow * 2)
  const max = Math.round(totalShows * avgSongsPerShow * 8)
  return { min, max }
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [artistName, setArtistName] = useState('')
  const [proAffiliation, setProAffiliation] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(true)
  const careerFetchedRef = useRef(false)

  // Career reveal state
  const [career, setCareer] = useState<CareerData>({
    state: 'loading',
    totalShows: 0,
    cities: [],
    shows: [],
    estimatedMin: 0,
    estimatedMax: 0,
    artistName: '',
    lastfmListeners: 0,
  })

  // Spotify step
  const [spotifyQuery, setSpotifyQuery] = useState('')
  const [spotifySearching, setSpotifySearching] = useState(false)
  const [spotifyResults, setSpotifyResults] = useState<SpotifyArtist[]>([])
  const [spotifyError, setSpotifyError] = useState('')
  const [importing, setImporting] = useState(false)
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(null)
  const [importDone, setImportDone] = useState(false)
  const [importCount, setImportCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/auth/login'); return }
      supabase.from('profiles').select('full_name, artist_name').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.artist_name?.trim()) {
            router.replace('/app/dashboard')
          } else {
            if (data?.full_name) setFullName(data.full_name)
            setChecking(false)
          }
        })
    })
  }, [router])

  async function fetchCareerHistory(name: string) {
    if (careerFetchedRef.current) return
    careerFetchedRef.current = true

    setCareer(prev => ({ ...prev, state: 'loading' }))

    try {
      const [setlistRes, lastfmRes] = await Promise.allSettled([
        fetch(`/api/setlistfm?artist=${encodeURIComponent(name)}`),
        fetch(`/api/lastfm?artist=${encodeURIComponent(name)}`),
      ])

      let totalShows = 0
      let cities: string[] = []
      let shows: any[] = []
      let lastfmListeners = 0

      if (setlistRes.status === 'fulfilled' && setlistRes.value.ok) {
        const data = await setlistRes.value.json()
        totalShows = data.totalShows || 0
        cities = data.cities || []
        shows = data.shows || []

        // Save to Supabase in the background — don't await, don't block the reveal
        if (shows.length > 0) {
          fetch('/api/setlistfm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shows, artistName: name }),
          }).catch(err => console.error('Background save failed:', err))
        }
      }

      if (lastfmRes.status === 'fulfilled' && lastfmRes.value.ok) {
        const data = await lastfmRes.value.json()
        if (data.found) lastfmListeners = data.listeners || 0
      }

      const { min, max } = estimateRoyalties(totalShows)

      let state: CareerData['state'] = 'empty'
      if (totalShows >= 10) state = 'rich'
      else if (totalShows > 0) state = 'partial'

      setCareer({
        state,
        totalShows,
        cities,
        shows,
        estimatedMin: min,
        estimatedMax: max,
        artistName: name,
        lastfmListeners,
      })
    } catch (err) {
      setCareer(prev => ({ ...prev, state: 'empty' }))
    }
  }

  async function handleStep1() {
    if (!fullName.trim() || !artistName.trim() || saving) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    await supabase.from('profiles').update({
      full_name: fullName.trim(),
      artist_name: artistName.trim(),
      pro_affiliation: proAffiliation || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)

    // Kick off career fetch immediately — runs while step 2 renders
    fetchCareerHistory(artistName.trim())
    setSpotifyQuery(artistName.trim())
    setSaving(false)
    setStep(2)
  }

  async function searchSpotify() {
    if (!spotifyQuery.trim()) return
    setSpotifySearching(true); setSpotifyError(''); setSpotifyResults([])
    try {
      const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(spotifyQuery.trim())}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSpotifyResults(data.artists || [])
      if (!data.artists?.length) setSpotifyError('No artists found — try a different spelling')
    } catch (err: any) {
      setSpotifyError(err.message || 'Search failed')
    } finally {
      setSpotifySearching(false)
    }
  }

  useEffect(() => {
    if (step === 3 && spotifyQuery.trim()) searchSpotify()
  }, [step])

  async function importFromSpotify(artist: SpotifyArtist) {
    setSelectedArtist(artist); setImporting(true); setSpotifyError('')
    try {
      const res = await fetch(
        `/api/spotify-import?artist_id=${artist.id}&artist_name=${encodeURIComponent(artist.name)}`,
        { method: 'POST' }
      )
      if (!res.ok) throw new Error('Import failed')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setImportCount(data.imported || 0)
      setImportDone(true)
    } catch (err: any) {
      setSpotifyError(err.message || 'Import failed')
      setSelectedArtist(null)
    } finally {
      setImporting(false)
    }
  }

  function finish() { router.push('/app/show/new') }

  if (checking) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  const isStep1Valid = fullName.trim().length > 0 && artistName.trim().length > 0

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 32, animation: 'fadeUp 0.3s ease' }}>
          <p style={{ fontSize: 13, color: C.muted, letterSpacing: '0.08em', margin: 0 }}>Your verified live career starts here.</p>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{
              height: 3, borderRadius: 2,
              width: step === s ? 32 : 10,
              background: step === s ? C.gold : s < step ? C.gold : C.muted,
              opacity: step === s ? 1 : s < step ? 0.6 : 0.35,
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* STEP 1: Profile */}
        {step === 1 && (
          <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 20, padding: '32px 28px', animation: 'fadeUp 0.35s ease' }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Let's begin your record.
            </h1>
            <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 32px', lineHeight: 1.5 }}>
              This takes a minute. Your career will take longer.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Your Name</label>
                <input
                  autoFocus type="text" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fullName.trim() && document.getElementById('artist-input')?.focus()}
                  placeholder="Your name"
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${fullName.trim() ? C.borderGold : C.border}`, borderRadius: 12, padding: '14px 16px', color: C.text, fontSize: 16, fontFamily: 'inherit', outline: 'none' }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                  onBlur={e => (e.target.style.borderColor = fullName.trim() ? C.borderGold : C.border)}
                />
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Artist Name</label>
                <input
                  id="artist-input" type="text" value={artistName}
                  onChange={e => setArtistName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && isStep1Valid && handleStep1()}
                  placeholder="Your stage or band name"
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${artistName.trim() ? C.borderGold : C.border}`, borderRadius: 12, padding: '14px 16px', color: C.text, fontSize: 16, fontFamily: 'inherit', outline: 'none' }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                  onBlur={e => (e.target.style.borderColor = artistName.trim() ? C.borderGold : C.border)}
                />
                <p style={{ fontSize: 13, color: C.muted, margin: '5px 0 0' }}>This is how you'll appear in your performance record.</p>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: C.muted, display: 'block', marginBottom: 12 }}>
                  PRO <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRO_OPTIONS.map(pro => (
                    <button key={pro} type="button"
                      onClick={() => setProAffiliation(pro === proAffiliation ? '' : pro)}
                      style={{ padding: '8px 14px', borderRadius: 20, border: `1px solid ${proAffiliation === pro ? C.borderGold : C.border}`, background: proAffiliation === pro ? C.goldDim : 'transparent', color: proAffiliation === pro ? C.gold : C.secondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease' }}>
                      {pro}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleStep1} disabled={!isStep1Valid || saving}
                style={{ width: '100%', padding: '16px', background: isStep1Valid ? C.gold : C.muted, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: isStep1Valid && !saving ? 'pointer' : 'not-allowed', opacity: saving ? 0.7 : isStep1Valid ? 1 : 0.4, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: 4 }}>
                {saving
                  ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving...</>
                  : <>Start my record <ArrowRight size={15} strokeWidth={2.5} /></>}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Career Reveal */}
        {step === 2 && (
          <div style={{ animation: 'fadeUp 0.35s ease' }}>

            {/* Loading state */}
            {career.state === 'loading' && (
              <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 20, padding: '48px 28px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite', margin: '0 auto 20px' }} />
                <p style={{ fontSize: 15, color: C.secondary, margin: 0 }}>Searching your performance history...</p>
                <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 0' }}>This only takes a moment.</p>
              </div>
            )}

            {/* Rich history found */}
            {career.state === 'rich' && (
              <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 20, padding: '32px 28px' }}>
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.gold, margin: '0 0 8px' }}>Your career, found</p>
                  <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    We found {career.totalShows} shows<br />in your history.
                  </h2>
                  <p style={{ fontSize: 15, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
                    {career.cities.length > 0 && `${career.cities.slice(0, 3).join(', ')}${career.cities.length > 3 ? ` and ${career.cities.length - 3} more cities.` : '.'}`}
                  </p>
                </div>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: '14px 16px' }}>
                    <p style={{ fontSize: 24, fontWeight: 800, color: C.gold, margin: '0 0 2px', letterSpacing: '-0.02em' }}>{career.totalShows}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Shows found</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                    <p style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 2px', letterSpacing: '-0.02em' }}>{career.cities.length}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: 0, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Cities</p>
                  </div>
                </div>

                {/* Injustice number */}
                <div style={{ background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.red, margin: '0 0 4px', letterSpacing: '0.04em' }}>Estimated uncollected</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                    ${career.estimatedMin.toLocaleString()} – ${career.estimatedMax.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                    Across your {career.totalShows} shows, royalties were generated — most redistributed because no setlists were on file. We can't recover the past. We protect everything from today.
                  </p>
                </div>

                <button onClick={() => setStep(3)}
                  style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s ease' }}>
                  Claim my record <ArrowRight size={15} strokeWidth={2.5} />
                </button>

                <p style={{ fontSize: 11, color: C.muted, margin: '10px 0 0', textAlign: 'center' }}>
                  Based on {career.totalShows} shows · Standard PRO live rates · <span style={{ color: C.gold }}>How we calculate this</span>
                </p>
              </div>
            )}

            {/* Partial history */}
            {career.state === 'partial' && (
              <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 20, padding: '32px 28px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.gold, margin: '0 0 8px' }}>Your career, started</p>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  We found {career.totalShows} shows so far.
                </h2>
                <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>
                  Your full history likely goes deeper. Setlistr will build it show by show from here.
                </p>

                <div style={{ background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '16px', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.red, margin: '0 0 4px' }}>From what we found</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>
                    ${career.estimatedMin.toLocaleString()} – ${career.estimatedMax.toLocaleString()} uncollected
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>The actual number is almost certainly higher.</p>
                </div>

                <button onClick={() => setStep(3)}
                  style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Start my full record <ArrowRight size={15} strokeWidth={2.5} />
                </button>
              </div>
            )}

            {/* Empty state — no history found */}
            {career.state === 'empty' && (
              <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 20, padding: '32px 28px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Your career</p>
                <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  No record found.<br />That's the problem.
                </h2>
                <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>
                  You've been performing and the industry has no record of it. Every show you've played generated royalties — and with no setlists on file, that money went elsewhere.
                </p>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', marginBottom: 20 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: C.gold, margin: '0 0 4px' }}>Your record starts tonight.</p>
                  <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                    The first show you capture becomes the beginning of a permanent, verified career archive. Every show after that builds it.
                  </p>
                </div>

                <button onClick={() => setStep(3)}
                  style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  Begin my record <ArrowRight size={15} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Spotify */}
        {step === 3 && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 20, padding: '32px 28px', marginBottom: 10 }}>
              {importDone ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>✓</div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                    {importCount} songs ready.
                  </h2>
                  <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 6px', lineHeight: 1.5 }}>
                    Your catalog is loaded. The first time you play one of these live, it joins your record.
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: '0 0 24px' }}>
                    Songs you actually perform will always rank first.
                  </p>
                  <button onClick={finish}
                    style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    Let's play a show <ArrowRight size={15} strokeWidth={2.5} />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(30,215,96,0.1)', border: '1px solid rgba(30,215,96,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1ed760"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    </div>
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Load your catalog.</h2>
                      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>We'll listen for these songs at every show.</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      type="text" value={spotifyQuery}
                      onChange={e => setSpotifyQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchSpotify()}
                      placeholder="Search Spotify for your artist name"
                      style={{ flex: 1, background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                    />
                    <button onClick={searchSpotify} disabled={spotifySearching}
                      style={{ padding: '12px 16px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {spotifySearching ? '...' : 'Search'}
                    </button>
                  </div>

                  {spotifyError && (
                    <p style={{ fontSize: 13, color: C.red, margin: '0 0 12px' }}>{spotifyError}</p>
                  )}

                  {spotifyResults.map(artist => (
                    <button key={artist.id} onClick={() => importFromSpotify(artist)}
                      disabled={importing}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px', background: selectedArtist?.id === artist.id ? C.goldDim : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedArtist?.id === artist.id ? C.borderGold : C.border}`, borderRadius: 12, cursor: importing ? 'not-allowed' : 'pointer', marginBottom: 8, fontFamily: 'inherit', transition: 'all 0.15s ease' }}>
                      {artist.image && (
                        <img src={artist.image} alt={artist.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <div style={{ textAlign: 'left', flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>{artist.name}</p>
                        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{artist.followers.toLocaleString()} followers</p>
                      </div>
                      {selectedArtist?.id === artist.id && importing && (
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${C.goldDim}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                      )}
                    </button>
                  ))}
                </>
              )}
            </div>

            {!importDone && (
              <button onClick={finish}
                style={{ width: '100%', padding: '14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                I'll add songs during my first show
              </button>
            )}
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, marginTop: 16 }}>
          {step === 1 ? 'Free forever · No credit card' : step === 2 ? 'Verified performance data · Not financial advice' : 'Your record starts tonight.'}
        </p>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
          @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
          @keyframes spin { to{transform:rotate(360deg)} }
          @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
          * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
          input::placeholder { color: #6a6050; }
          input:focus { outline: none; }
          button:active { transform: scale(0.98); }
        `}</style>
      </div>
    </div>
  )
}
