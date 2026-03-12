'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, Play } from 'lucide-react'

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

    await supabase.from('capture_sessions').insert({
      performance_id: performance.id,
      started_at: new Date().toISOString(),
      status: 'active',
    })

    router.push(`/app/live/${performance.id}`)
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
  const inputStyle = {
    background: C.input,
    border: `1px solid ${C.inputBorder}`,
    color: C.text,
  }

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
            placeholder="e.g. Jesse Slack" className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Venue Name" required color={C.secondary}>
          <input value={form.venue_name} onChange={e => set('venue_name', e.target.value)}
            placeholder="e.g. The Bluebird Cafe" className={inputClass} style={inputStyle} />
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Set Duration (min)" color={C.secondary}>
            <input type="number" value={form.set_duration_minutes} min={10} max={360}
              onChange={e => set('set_duration_minutes', parseInt(e.target.value))}
              className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Buffer (min)" color={C.secondary}>
            <input type="number" value={form.auto_close_buffer_minutes} min={0} max={30}
              onChange={e => set('auto_close_buffer_minutes', parseInt(e.target.value))}
              className={inputClass} style={inputStyle} />
          </Field>
        </div>

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
          Session will auto-close after {form.set_duration_minutes + form.auto_close_buffer_minutes} minutes
        </p>
      </div>
    </div>
  )
}

function Field({ label, children, required, color }: { label: string; children: React.ReactNode; required?: boolean; color: string }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color }}>
        {label}{required && <span style={{ color: '#c9a84c' }} className="ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
