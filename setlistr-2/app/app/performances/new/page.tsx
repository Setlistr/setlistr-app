'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Play, Plus, MapPin } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  input: '#0f0e0c',
  inputBorder: 'rgba(255,255,255,0.09)',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
}

const COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Brazil', 'Other']

const SEED_VENUES: { name: string; city: string; country: string }[] = [
  { name: 'The Bluebird Cafe', city: 'Nashville', country: 'United States' },
  { name: 'Ryman Auditorium', city: 'Nashville', country: 'United States' },
  { name: 'Station Inn', city: 'Nashville', country: 'United States' },
  { name: 'The Listening Room Cafe', city: 'Nashville', country: 'United States' },
  { name: '3rd and Lindsley', city: 'Nashville', country: 'United States' },
  { name: 'Mercy Lounge', city: 'Nashville', country: 'United States' },
  { name: 'Cannery Ballroom', city: 'Nashville', country: 'United States' },
  { name: 'The Basement', city: 'Nashville', country: 'United States' },
  { name: 'The Basement East', city: 'Nashville', country: 'United States' },
  { name: 'Bridgestone Arena', city: 'Nashville', country: 'United States' },
  { name: 'Ascend Amphitheater', city: 'Nashville', country: 'United States' },
  { name: 'Exit/In', city: 'Nashville', country: 'United States' },
  { name: 'The 5 Spot', city: 'Nashville', country: 'United States' },
  { name: 'Tootsies Orchid Lounge', city: 'Nashville', country: 'United States' },
  { name: "Robert's Western World", city: 'Nashville', country: 'United States' },
  { name: 'Honky Tonk Central', city: 'Nashville', country: 'United States' },
  { name: 'Madison Square Garden', city: 'New York', country: 'United States' },
  { name: 'Carnegie Hall', city: 'New York', country: 'United States' },
  { name: 'Bowery Ballroom', city: 'New York', country: 'United States' },
  { name: 'Brooklyn Steel', city: 'New York', country: 'United States' },
  { name: 'Radio City Music Hall', city: 'New York', country: 'United States' },
  { name: 'Webster Hall', city: 'New York', country: 'United States' },
  { name: 'Irving Plaza', city: 'New York', country: 'United States' },
  { name: "Baby's All Right", city: 'New York', country: 'United States' },
  { name: 'The Troubadour', city: 'Los Angeles', country: 'United States' },
  { name: 'Hollywood Bowl', city: 'Los Angeles', country: 'United States' },
  { name: 'The Roxy Theatre', city: 'Los Angeles', country: 'United States' },
  { name: 'The Wiltern', city: 'Los Angeles', country: 'United States' },
  { name: 'The Palladium', city: 'Los Angeles', country: 'United States' },
  { name: 'Largo at the Coronet', city: 'Los Angeles', country: 'United States' },
  { name: 'The Metro', city: 'Chicago', country: 'United States' },
  { name: 'Empty Bottle', city: 'Chicago', country: 'United States' },
  { name: 'Thalia Hall', city: 'Chicago', country: 'United States' },
  { name: 'United Center', city: 'Chicago', country: 'United States' },
  { name: 'ACL Live at the Moody Center', city: 'Austin', country: 'United States' },
  { name: "Stubb's Waller Creek Amphitheater", city: 'Austin', country: 'United States' },
  { name: 'The Parish', city: 'Austin', country: 'United States' },
  { name: "Emo's Austin", city: 'Austin', country: 'United States' },
  { name: 'Continental Club', city: 'Austin', country: 'United States' },
  { name: 'The Fox Theatre', city: 'Atlanta', country: 'United States' },
  { name: 'Tabernacle', city: 'Atlanta', country: 'United States' },
  { name: 'The Showbox', city: 'Seattle', country: 'United States' },
  { name: 'Neumos', city: 'Seattle', country: 'United States' },
  { name: 'Red Rocks Amphitheatre', city: 'Morrison', country: 'United States' },
  { name: 'The Fillmore', city: 'San Francisco', country: 'United States' },
  { name: '9:30 Club', city: 'Washington', country: 'United States' },
  { name: 'The Anthem', city: 'Washington', country: 'United States' },
  { name: 'The O2 Arena', city: 'London', country: 'United Kingdom' },
  { name: 'Royal Albert Hall', city: 'London', country: 'United Kingdom' },
  { name: "Ronnie Scott's", city: 'London', country: 'United Kingdom' },
  { name: 'Brixton Academy', city: 'London', country: 'United Kingdom' },
  { name: 'Massey Hall', city: 'Toronto', country: 'Canada' },
  { name: 'The Commodore Ballroom', city: 'Vancouver', country: 'Canada' },
]

export default function NewPerformancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [venueQuery, setVenueQuery] = useState('')
  const [venueResults, setVenueResults] = useState<typeof SEED_VENUES>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [venueSelected, setVenueSelected] = useState(false)
  const venueRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    artist_name: '',
    venue_name: '',
    city: '',
    country: 'United States',
    performance_date: new Date().toISOString().split('T')[0],
    start_time: '20:00',
    set_duration_minutes: 60,
    notes: '',
  })

  function set(key: string, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
  }

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('artist_name, full_name')
        .eq('id', user.id)
        .single()
      if (profile?.artist_name) set('artist_name', profile.artist_name)
      else if (profile?.full_name) set('artist_name', profile.full_name)
    }
    loadProfile()
  }, [])

  useEffect(() => {
    if (!venueQuery.trim() || venueSelected) {
      setVenueResults([])
      setShowDropdown(false)
      return
    }
    const q = venueQuery.toLowerCase()
    const results = SEED_VENUES.filter(v =>
      v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q)
    ).slice(0, 6)
    setVenueResults(results)
    setShowDropdown(true)
  }, [venueQuery, venueSelected])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (venueRef.current && !venueRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectVenue(venue: typeof SEED_VENUES[0]) {
    setVenueQuery(venue.name)
    setForm(f => ({ ...f, venue_name: venue.name, city: venue.city, country: venue.country }))
    setVenueSelected(true)
    setShowDropdown(false)
  }

  function handleVenueChange(val: string) {
    setVenueQuery(val)
    setVenueSelected(false)
    set('venue_name', val)
  }

  function addNewVenue() {
    set('venue_name', venueQuery)
    setVenueSelected(true)
    setShowDropdown(false)
  }

  async function handleStart() {
    if (!form.artist_name || !form.venue_name || !form.city) {
      setError('Please fill in artist name, venue, and city')
      return
    }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // 1. Get or create artist record for this user
    let artistId: string
    const { data: existingArtist } = await supabase
      .from('artists')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existingArtist) {
      artistId = existingArtist.id
      // Update name in case they changed it
      await supabase.from('artists').update({
        name: form.artist_name,
        updated_at: new Date().toISOString(),
      }).eq('id', artistId)
    } else {
      const { data: newArtist, error: artistErr } = await supabase
        .from('artists')
        .insert({ user_id: user.id, name: form.artist_name })
        .select()
        .single()
      if (artistErr || !newArtist) { setError('Failed to create artist profile'); setLoading(false); return }
      artistId = newArtist.id
    }

    // 2. Get or create venue record
    let venueId: string | null = null
    const { data: existingVenue } = await supabase
      .from('venues')
      .select('id')
      .ilike('name', form.venue_name)
      .eq('city', form.city)
      .single()

    if (existingVenue) {
      venueId = existingVenue.id
    } else {
      const { data: newVenue } = await supabase
        .from('venues')
        .insert({ name: form.venue_name, city: form.city, country: form.country })
        .select()
        .single()
      if (newVenue) venueId = newVenue.id
    }

    // 3. Create the show
    const scheduledAt = new Date(`${form.performance_date}T${form.start_time}`).toISOString()
    const { data: show, error: showErr } = await supabase
      .from('shows')
      .insert({
        venue_id: venueId,
        name: null,
        show_type: 'single',
        scheduled_at: scheduledAt,
        started_at: new Date().toISOString(),
        status: 'live',
        created_by: user.id,
      })
      .select()
      .single()

    if (showErr || !show) { setError(showErr?.message || 'Failed to create show'); setLoading(false); return }

    // 4. Add artist to show lineup
    await supabase.from('show_artists').insert({
      show_id: show.id,
      artist_id: artistId,
      performance_order: 1,
      headliner: true,
      status: 'confirmed',
    })

    // 5. Create setlist for this artist
    const { data: setlist, error: setlistErr } = await supabase
      .from('setlists')
      .insert({
        show_id: show.id,
        artist_id: artistId,
        status: 'draft',
      })
      .select()
      .single()

    if (setlistErr || !setlist) { setError(setlistErr?.message || 'Failed to create setlist'); setLoading(false); return }

    // 6. Create capture session
    await supabase.from('capture_sessions').insert({
      show_id: show.id,
      artist_id: artistId,
      started_at: new Date().toISOString(),
      status: 'active',
    })

    // 7. Also write to legacy performances table so live page still works
    const { data: performance } = await supabase
      .from('performances')
      .insert({
        user_id: user.id,
        artist_name: form.artist_name,
        venue_name: form.venue_name,
        city: form.city,
        country: form.country,
        performance_date: form.performance_date,
        start_time: form.start_time,
        set_duration_minutes: form.set_duration_minutes,
        auto_close_buffer_minutes: 5,
        notes: form.notes,
        status: 'live',
        started_at: new Date().toISOString(),
        show_id: show.id,
        setlist_id: setlist.id,
        artist_id: artistId,
      })
      .select()
      .single()

    if (!performance) { setError('Failed to create performance record'); setLoading(false); return }

    router.push(`/app/live/${performance.id}`)
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
  const inputStyle = { background: C.input, border: `1px solid ${C.inputBorder}`, color: C.text }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>
      <div className="px-4 pt-8 pb-6 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => router.back()} style={{ color: C.secondary }}>
            <ChevronLeft size={22} />
          </button>
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em]" style={{ color: C.gold + '99' }}>New Performance</p>
            <h1 className="font-display text-2xl" style={{ color: C.text }}>Set Up Show</h1>
          </div>
        </div>
      </div>

      <div className="px-4 max-w-lg mx-auto w-full flex flex-col gap-5 pb-12">

        <Field label="Artist Name" required color={C.secondary}>
          <input value={form.artist_name} onChange={e => set('artist_name', e.target.value)}
            placeholder="e.g. The Midnight" className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Venue Name" required color={C.secondary}>
          <div className="relative" ref={venueRef}>
            <input
              value={venueQuery}
              onChange={e => handleVenueChange(e.target.value)}
              onFocus={() => venueQuery && !venueSelected && setShowDropdown(true)}
              placeholder="Search venues or type a new one..."
              className={inputClass}
              style={{
                ...inputStyle,
                borderColor: venueSelected ? 'rgba(201,168,76,0.3)' : C.inputBorder,
              }}
            />
            {showDropdown && (
              <div className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
                style={{ background: '#1a1814', border: `1px solid ${C.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                {venueResults.map(venue => (
                  <button key={`${venue.name}-${venue.city}`}
                    onMouseDown={() => selectVenue(venue)}
                    className="w-full px-4 py-3 text-left flex items-center gap-3 transition-colors hover:bg-white/5">
                    <MapPin size={13} style={{ color: C.gold, flexShrink: 0 }} />
                    <div>
                      <div className="text-sm" style={{ color: C.text }}>{venue.name}</div>
                      <div className="text-xs" style={{ color: C.muted }}>{venue.city}, {venue.country}</div>
                    </div>
                  </button>
                ))}
                <button onMouseDown={addNewVenue}
                  className="w-full px-4 py-3 text-left flex items-center gap-3 transition-colors hover:bg-white/5 border-t"
                  style={{ borderColor: C.border }}>
                  <Plus size={13} style={{ color: C.gold, flexShrink: 0 }} />
                  <div>
                    <div className="text-sm" style={{ color: C.gold }}>Add "{venueQuery}"</div>
                    <div className="text-xs" style={{ color: C.muted }}>Save as a new venue</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City" required color={C.secondary}>
            <input value={form.city} onChange={e => set('city', e.target.value)}
              placeholder="Nashville" className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Country" color={C.secondary}>
            <select value={form.country} onChange={e => set('country', e.target.value)}
              className={inputClass} style={{ ...inputStyle, appearance: 'none' as any }}>
              {COUNTRIES.map(c => <option key={c} style={{ background: '#141210' }}>{c}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" color={C.secondary}>
            <input type="date" value={form.performance_date}
              onChange={e => set('performance_date', e.target.value)}
              className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Start Time" color={C.secondary}>
            <input type="time" value={form.start_time}
              onChange={e => set('start_time', e.target.value)}
              className={inputClass} style={inputStyle} />
          </Field>
        </div>

        <Field label="Set Duration (min)" color={C.secondary}>
          <input type="number" value={form.set_duration_minutes} min={10} max={360}
            onChange={e => set('set_duration_minutes', parseInt(e.target.value))}
            className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Notes (optional)" color={C.secondary}>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Any notes about this show..." rows={3}
            className={`${inputClass} resize-none`} style={inputStyle} />
        </Field>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
            {error}
          </div>
        )}

        <button onClick={handleStart} disabled={loading}
          className="flex items-center justify-center gap-2 w-full font-bold rounded-2xl py-4 text-lg transition-colors mt-2 disabled:opacity-50"
          style={{ background: C.gold, color: '#0a0908' }}>
          <Play size={20} fill="currentColor" />
          {loading ? 'Starting...' : 'Start Performance'}
        </button>

        <p className="text-center text-xs" style={{ color: C.muted }}>
          Recognition starts automatically when you begin
        </p>
      </div>
    </div>
  )
}

function Field({ label, children, required, color }: {
  label: string; children: React.ReactNode; required?: boolean; color: string
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color }}>
        {label}{required && <span style={{ color: '#c9a84c' }} className="ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
