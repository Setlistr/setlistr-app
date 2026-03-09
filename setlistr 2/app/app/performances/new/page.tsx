'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Play } from 'lucide-react'

const COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Brazil', 'Other']

export default function NewPerformancePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    artist_name: '',
    venue_name: '',
    city: '',
    country: 'United States',
    performance_date: new Date().toISOString().split('T')[0],
    start_time: '20:00',
    set_duration_minutes: 60,
    auto_close_buffer_minutes: 5,
    notes: '',
  })

  function set(key: string, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
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

    const { data: performance, error: err } = await supabase
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
        auto_close_buffer_minutes: form.auto_close_buffer_minutes,
        notes: form.notes,
        status: 'live',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (err) { setError(err.message); setLoading(false); return }

    // Create capture session
    await supabase.from('capture_sessions').insert({
      performance_id: performance.id,
      started_at: new Date().toISOString(),
      status: 'active',
    })

    router.push(`/app/live/${performance.id}`)
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => router.back()} className="text-ink-light hover:text-ink">
          <ChevronLeft size={22} />
        </button>
        <div>
          <p className="text-xs text-ink-light uppercase tracking-[0.2em]">New Performance</p>
          <h1 className="font-display text-2xl text-ink">Set Up Show</h1>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Artist */}
        <Field label="Artist Name" required>
          <input value={form.artist_name} onChange={e => set('artist_name', e.target.value)}
            placeholder="e.g. Daryl Scott" className={input} />
        </Field>

        {/* Venue */}
        <Field label="Venue Name" required>
          <input value={form.venue_name} onChange={e => set('venue_name', e.target.value)}
            placeholder="e.g. The Bluebird Cafe" className={input} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="City" required>
            <input value={form.city} onChange={e => set('city', e.target.value)}
              placeholder="Nashville" className={input} />
          </Field>
          <Field label="Country">
            <select value={form.country} onChange={e => set('country', e.target.value)} className={input}>
              {COUNTRIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" value={form.performance_date} onChange={e => set('performance_date', e.target.value)} className={input} />
          </Field>
          <Field label="Start Time">
            <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} className={input} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Set Duration (min)">
            <input type="number" value={form.set_duration_minutes} min={10} max={360}
              onChange={e => set('set_duration_minutes', parseInt(e.target.value))} className={input} />
          </Field>
          <Field label="Buffer (min)">
            <input type="number" value={form.auto_close_buffer_minutes} min={0} max={30}
              onChange={e => set('auto_close_buffer_minutes', parseInt(e.target.value))} className={input} />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder="Any notes about this show..." rows={3} className={`${input} resize-none`} />
        </Field>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
        )}

        <button onClick={handleStart} disabled={loading}
          className="flex items-center justify-center gap-2 w-full bg-gold hover:bg-gold-light disabled:opacity-50 text-ink font-bold rounded-2xl py-4 text-lg transition-colors mt-2">
          <Play size={20} fill="currentColor" />
          {loading ? 'Starting...' : 'Start Performance'}
        </button>

        <p className="text-center text-xs text-ink-light">
          Session will auto-close after {form.set_duration_minutes + form.auto_close_buffer_minutes} minutes
        </p>
      </div>
    </div>
  )
}

const input = "w-full bg-white border border-cream-dark rounded-xl px-4 py-3 text-ink placeholder:text-ink-light/50 focus:outline-none focus:border-gold transition-colors text-sm"

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="text-xs text-ink-light uppercase tracking-wider block mb-1.5">
        {label}{required && <span className="text-gold ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
