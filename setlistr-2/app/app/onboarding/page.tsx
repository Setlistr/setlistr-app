'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Search, Music2 } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171',
}

const PRO_OPTIONS = ['SOCAN', 'ASCAP', 'BMI', 'SESAC', 'GMR', 'APRA', 'PRS', 'Other', 'Not sure']

type SpotifyArtist = {
  id: string; name: string; followers: number
  image: string | null; genres: string[]
}

export default function OnboardingPage() {
  const router  = useRouter()
  const [step, setStep]                 = useState(1)
  const [fullName, setFullName]         = useState('')
  const [artistName, setArtistName]     = useState('')
  const [proAffiliation, setProAffiliation] = useState('')
  const [saving, setSaving]             = useState(false)
  const [checking, setChecking]         = useState(true)

  // Spotify step
  const [spotifyQuery, setSpotifyQuery]       = useState('')
  const [spotifySearching, setSpotifySearching] = useState(false)
  const [spotifyResults, setSpotifyResults]   = useState<SpotifyArtist[]>([])
  const [spotifyError, setSpotifyError]       = useState('')
  const [importing, setImporting]             = useState(false)
  const [selectedArtist, setSelectedArtist]   = useState<SpotifyArtist | null>(null)
  const [importDone, setImportDone]           = useState(false)
  const [importCount, setImportCount]         = useState(0)

  // If profile already complete, skip onboarding
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

    // Pre-fill Spotify search with artist name
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

  // Auto-search when step 2 loads
  useEffect(() => {
    if (step === 2 && spotifyQuery.trim()) {
      searchSpotify()
    }
  }, [step])

  async function importFromSpotify(artist: SpotifyArtist) {
    setSelectedArtist(artist); setImporting(true); setSpotifyError('')
    try {
      const res = await fetch(`/api/spotify-import?artist_id=${artist.id}&artist_name=${encodeURIComponent(artist.name)}`, { method: 'POST' })
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

  function finish() {
    router.push('/app/show/new')
  }

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
          <p style={{ fontSize: 14, fontWeight: 800, color: C.gold, letterSpacing: '0.16em', textTransform: 'uppercase', margin: '0 0 5px' }}>Setlistr</p>
          <p style={{ fontSize: 11, color: C.muted, letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>Live Performance Registry</p>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              height: 3, borderRadius: 2,
              width: step === s ? 24 : 8,
              background: step === s ? C.gold : C.muted,
              opacity: step === s ? 1 : 0.35,
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* ── STEP 1: Profile ── */}
        {step === 1 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '28px 24px', animation: 'fadeUp 0.35s ease' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Set up your profile.
            </h1>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 24px', lineHeight: 1.5 }}>
              30 seconds. You'll load your first set right after.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Your Name</label>
                <input
                  autoFocus type="text" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fullName.trim() && document.getElementById('artist-input')?.focus()}
                  placeholder="e.g. Jesse Slack"
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${fullName.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
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
                  style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${artistName.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                  onBlur={e => (e.target.style.borderColor = artistName.trim() ? C.borderGold : C.border)}
                />
                <p style={{ fontSize: 11, color: C.muted, margin: '5px 0 0' }}>Appears on setlists and PRO exports</p>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 8 }}>
                  PRO <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRO_OPTIONS.map(pro => (
                    <button key={pro} type="button"
                      onClick={() => setProAffiliation(pro === proAffiliation ? '' : pro)}
                      style={{ padding: '6px 11px', borderRadius: 8, border: `1px solid ${proAffiliation === pro ? C.borderGold : C.border}`, background: proAffiliation === pro ? C.goldDim : 'transparent', color: proAffiliation === pro ? C.gold : C.secondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease' }}>
                      {pro}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleStep1} disabled={!isStep1Valid || saving}
                style={{ width: '100%', padding: '14px', background: isStep1Valid ? C.gold : C.muted, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: isStep1Valid && !saving ? 'pointer' : 'not-allowed', opacity: saving ? 0.7 : isStep1Valid ? 1 : 0.4, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: 4 }}>
                {saving
                  ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving...</>
                  : <>Continue <ArrowRight size={15} strokeWidth={2.5} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Spotify ── */}
        {step === 2 && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '28px 24px', marginBottom: 10 }}>

              {importDone ? (
                /* Success state */
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>
                    ✓
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                    {importCount} songs imported
                  </h2>
                  <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 6px', lineHeight: 1.5 }}>
                    From {selectedArtist?.name}. These will appear in your quick-add list during shows.
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: '0 0 24px' }}>
                    Real show data always ranks above imported songs.
                  </p>
                  <button onClick={finish}
                    style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    Load Your First Set <ArrowRight size={15} strokeWidth={2.5} />
                  </button>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(30,215,96,0.1)', border: '1px solid rgba(30,215,96,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1ed760"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
                    </div>
                    <div>
                      <h2 style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.01em' }}>Seed your catalog</h2>
                      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Import your Spotify tracks for quick-add during shows</p>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>
                    Find yourself on Spotify — we'll pull your top tracks so they appear in the quick-add list during live capture.
                  </p>

                  {/* Search */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input
                      value={spotifyQuery}
                      onChange={e => setSpotifyQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && searchSpotify()}
                      placeholder="Search your artist name..."
                      style={{ flex: 1, background: C.input, border: `1px solid ${spotifyQuery.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                      onBlur={e => (e.target.style.borderColor = spotifyQuery.trim() ? C.borderGold : C.border)}
                    />
                    <button onClick={searchSpotify} disabled={spotifySearching || !spotifyQuery.trim()}
                      style={{ padding: '11px 16px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', cursor: spotifySearching ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, flexShrink: 0, opacity: spotifySearching ? 0.7 : 1 }}>
                      <Search size={14} />
                      {spotifySearching ? '...' : 'Search'}
                    </button>
                  </div>

                  {spotifyError && <p style={{ fontSize: 12, color: C.red, margin: '0 0 12px' }}>{spotifyError}</p>}

                  {/* Results */}
                  {spotifyResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Select your profile</p>
                      {spotifyResults.map(artist => (
                        <button key={artist.id} onClick={() => importFromSpotify(artist)} disabled={importing}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: selectedArtist?.id === artist.id ? C.goldDim : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedArtist?.id === artist.id ? C.borderGold : C.border}`, borderRadius: 12, cursor: importing ? 'wait' : 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', transition: 'all 0.15s ease', WebkitTapHighlightColor: 'transparent' }}
                          onMouseEnter={e => { if (!importing) (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.06)' }}
                          onMouseLeave={e => { if (selectedArtist?.id !== artist.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}>
                          {artist.image
                            ? <img src={artist.image} alt={artist.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                            : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Music2 size={18} color={C.muted} /></div>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist.name}</p>
                            <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>
                              {artist.followers.toLocaleString()} followers
                              {artist.genres.length > 0 && ` · ${artist.genres.slice(0, 2).join(', ')}`}
                            </p>
                          </div>
                          {importing && selectedArtist?.id === artist.id
                            ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${C.gold}40`, borderTopColor: C.gold, animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                            : <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>Import →</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Skip */}
            {!importDone && (
              <button onClick={finish}
                style={{ width: '100%', background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '10px', textAlign: 'center' }}>
                Skip for now — I'll add songs during my show
              </button>
            )}
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.4, marginTop: 16 }}>
          Free forever · No credit card
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { outline: none; }
      `}</style>
    </div>
  )
}
