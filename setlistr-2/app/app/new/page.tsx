'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, User, Building2, Calendar, ArrowRight, Music4, Search } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', red: '#dc2626',
}

type Venue = {
  id: string
  name: string
  city: string
  country: string
}

export default function NewShowPage() {
  const router = useRouter()
  const [artist, setArtist]   = useState('')
  const [venue, setVenue]     = useState('')
  const [venueId, setVenueId] = useState<string | null>(null)
  const [city, setCity]       = useState('')
  const [country, setCountry] = useState('')
  const [date, setDate]       = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Venue autocomplete state
  const [venueResults, setVenueResults]     = useState<Venue[]>([])
  const [venueSearching, setVenueSearching] = useState(false)
  const [showDropdown, setShowDropdown]     = useState(false)
  const [venueSelected, setVenueSelected]   = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const isValid = artist.trim().length > 0 && venue.trim().length > 0 && date.length > 0

  // ── Close dropdown on outside click ────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Venue search ────────────────────────────────────────────────────────────
  const searchVenues = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setVenueResults([])
      setShowDropdown(false)
      return
    }

    setVenueSearching(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('venues')
      .select('id, name, city, country')
      .ilike('name', `%${query}%`)
      .limit(6)

    setVenueResults(data || [])
    setShowDropdown(true)
    setVenueSearching(false)
  }, [])

  function handleVenueInput(val: string) {
    setVenue(val)
    setVenueId(null)
    setVenueSelected(false)

    // Debounce search
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => searchVenues(val), 280)
  }

  function selectVenue(v: Venue) {
    setVenue(v.name)
    setVenueId(v.id)
    setCity(v.city || '')
    setCountry(v.country || '')
    setVenueSelected(true)
    setShowDropdown(false)
    setVenueResults([])
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!isValid || loading) return
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // If venue not selected from DB, create it
      let resolvedVenueId = venueId
      if (!resolvedVenueId && venue.trim()) {
        const { data: newVenue } = await supabase
          .from('venues')
          .insert({
            name: venue.trim(),
            city: city.trim() || null,
            country: country.trim() || null,
          })
          .select()
          .single()
        if (newVenue) resolvedVenueId = newVenue.id
      }

      // Create performance directly (same flow as before)
      const { data: performance, error: perfError } = await supabase
        .from('performances')
        .insert({
          artist_name: artist.trim(),
          venue_name: venue.trim(),
          venue_id: resolvedVenueId || null,
          city: city.trim() || '',
          country: country.trim() || '',
          status: 'pending',
          set_duration_minutes: 60,
          auto_close_buffer_minutes: 5,
          started_at: new Date().toISOString(),
          user_id: user?.id || null,
        })
        .select()
        .single()

      if (perfError) throw perfError

      router.push(`/app/live/${performance.id}`)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  // ── Standard field ──────────────────────────────────────────────────────────
  function Field({
    icon, label, value, onChange, type = 'text', placeholder, required,
  }: {
    icon: React.ReactNode; label: string; value: string
    onChange: (v: string) => void; type?: string
    placeholder?: string; required?: boolean
  }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: C.muted,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {icon}{label}
          {required && <span style={{ color: C.gold, marginLeft: 2 }}>*</span>}
        </label>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={{
            background: C.input,
            border: `1px solid ${value.trim() ? C.borderGold : C.border}`,
            borderRadius: 10, padding: '12px 14px',
            color: C.text, fontSize: 15, fontFamily: 'inherit',
            width: '100%', transition: 'border-color 0.15s ease',
            colorScheme: 'dark',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>

      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)',
      }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1, animation: 'fadeUp 0.4s ease' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: C.goldDim, border: `1px solid ${C.borderGold}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Music4 size={16} color={C.gold} />
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Setlistr</p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>New Show</p>
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.025em' }}>
          Set up your show
        </h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 28px' }}>
          Fill in the details below to begin live capture.
        </p>

        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '24px',
          display: 'flex', flexDirection: 'column', gap: 18,
          marginBottom: 16,
        }}>

          {/* Artist */}
          <Field
            icon={<User size={10} />}
            label="Artist" value={artist}
            onChange={setArtist}
            placeholder="e.g. The War on Drugs"
            required
          />

          {/* ── Venue autocomplete ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }} ref={dropdownRef}>
            <label style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: C.muted,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Building2 size={10} />
              Venue
              <span style={{ color: C.gold, marginLeft: 2 }}>*</span>
            </label>

            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={venue}
                onChange={e => handleVenueInput(e.target.value)}
                onFocus={() => { if (venueResults.length > 0) setShowDropdown(true) }}
                placeholder="Search or type venue name..."
                style={{
                  background: C.input,
                  border: `1px solid ${venueSelected ? C.borderGold : venue.trim() ? C.borderGold : C.border}`,
                  borderRadius: 10, padding: '12px 40px 12px 14px',
                  color: C.text, fontSize: 15, fontFamily: 'inherit',
                  width: '100%', transition: 'border-color 0.15s ease',
                  boxSizing: 'border-box',
                }}
              />
              {/* Search / selected indicator */}
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                {venueSearching ? (
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
                ) : venueSelected ? (
                  <span style={{ fontSize: 14, color: C.gold }}>✓</span>
                ) : (
                  <Search size={14} color={C.muted} />
                )}
              </div>
            </div>

            {/* Dropdown */}
            {showDropdown && venueResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#1a1816', border: `1px solid ${C.borderGold}`,
                borderRadius: 10, marginTop: 4, zIndex: 50,
                overflow: 'hidden', animation: 'fadeIn 0.15s ease',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {venueResults.map((v, i) => (
                  <button
                    key={v.id}
                    onMouseDown={() => selectVenue(v)}
                    style={{
                      width: '100%', padding: '11px 14px',
                      background: 'transparent', border: 'none',
                      borderBottom: i < venueResults.length - 1 ? `1px solid ${C.border}` : 'none',
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', flexDirection: 'column', gap: 2,
                      transition: 'background 0.1s ease', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHover}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{v.name}</span>
                    {(v.city || v.country) && (
                      <span style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <MapPin size={9} />
                        {[v.city, v.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </button>
                ))}

                {/* Add new option */}
                <button
                  onMouseDown={() => {
                    setVenueSelected(false)
                    setShowDropdown(false)
                  }}
                  style={{
                    width: '100%', padding: '10px 14px',
                    background: C.goldDim, border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 12, color: C.gold, fontWeight: 600 }}>
                    + Add "{venue}" as new venue
                  </span>
                </button>
              </div>
            )}

            {/* No results state */}
            {showDropdown && venueResults.length === 0 && venue.trim().length >= 2 && !venueSearching && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#1a1816', border: `1px solid ${C.border}`,
                borderRadius: 10, marginTop: 4, zIndex: 50,
                padding: '12px 14px', animation: 'fadeIn 0.15s ease',
              }}>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 8px' }}>No venues found — will be saved as new.</p>
              </div>
            )}
          </div>

          {/* City — auto-filled when venue selected, still editable */}
          <Field
            icon={<MapPin size={10} />}
            label="City" value={city}
            onChange={setCity}
            placeholder="e.g. Nashville, TN"
          />

          {/* Date */}
          <Field
            icon={<Calendar size={10} />}
            label="Date" value={date}
            onChange={setDate}
            type="date"
            required
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            animation: 'fadeIn 0.2s ease',
          }}>
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          style={{
            width: '100%', padding: '15px',
            background: isValid ? C.gold : C.muted,
            border: 'none', borderRadius: 12,
            color: '#0a0908', fontSize: 13, fontWeight: 800,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: isValid && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.7 : 1,
            transition: 'background 0.2s ease, opacity 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'inherit',
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />
              Starting...
            </>
          ) : (
            <>Start Live Capture<ArrowRight size={15} strokeWidth={2.5} /></>
          )}
        </button>

        <button
          onClick={() => router.push('/app/dashboard')}
          style={{
            background: 'none', border: 'none', color: C.muted,
            fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em',
            fontFamily: 'inherit', padding: '12px', width: '100%', marginTop: 4,
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </div>
  )
}
