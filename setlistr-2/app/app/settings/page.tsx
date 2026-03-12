'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, KeyRound, User } from 'lucide-react'

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

export default function SettingsPage() {
  const [fullName, setFullName] = useState('')
  const [artistName, setArtistName] = useState('')
  const [email, setEmail] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, artist_name')
        .eq('id', user.id)
        .single()
      if (profile) {
        setFullName(profile.full_name ?? '')
        setArtistName(profile.artist_name ?? '')
      }
    }
    load()
  }, [])

  async function saveProfile() {
    if (!fullName.trim()) { setProfileError('Name is required'); return }
    setProfileSaving(true)
    setProfileError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      artist_name: artistName.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    setProfileSaving(false)
    if (error) { setProfileError(error.message); return }
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  async function savePassword() {
    if (!newPassword) { setPasswordError('Enter a new password'); return }
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return }
    setPasswordSaving(true)
    setPasswordError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)
    if (error) { setPasswordError(error.message); return }
    setPasswordSaved(true)
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setPasswordSaved(false), 2000)
  }

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
  const inputStyle = { background: C.input, border: `1px solid ${C.inputBorder}`, color: C.text }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>
      <div className="px-4 pt-8 pb-4 max-w-lg mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.3em] mb-1" style={{ color: C.gold + '99' }}>Account</p>
        <h1 className="font-display text-3xl" style={{ color: C.text }}>Settings</h1>
      </div>

      <div className="px-4 max-w-lg mx-auto w-full flex flex-col gap-5 pb-12">

        <div className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <User size={15} style={{ color: C.gold }} />
            <p className="text-xs uppercase tracking-wider" style={{ color: C.secondary }}>Profile</p>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: C.secondary }}>
              Email
            </label>
            <input value={email} disabled className={inputClass}
              style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: C.secondary }}>
              Your Name <span style={{ color: C.gold }}>*</span>
            </label>
            <input value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="e.g. John Smith" className={inputClass} style={inputStyle} />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: C.secondary }}>
              Artist Name
            </label>
            <input value={artistName} onChange={e => setArtistName(e.target.value)}
              placeholder="e.g. The Midnight, Hozier..." className={inputClass} style={inputStyle} />
            <p className="text-xs mt-1.5" style={{ color: C.muted }}>
              Appears on your setlists and PRO exports
            </p>
          </div>

          {profileError && (
            <div className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
              {profileError}
            </div>
          )}

          <button onClick={saveProfile} disabled={profileSaving || profileSaved}
            className="w-full flex items-center justify-center gap-2 font-bold rounded-xl py-3 text-sm transition-all disabled:opacity-60"
            style={{ background: profileSaved ? '#16a34a' : C.gold, color: profileSaved ? '#fff' : '#0a0908' }}>
            {profileSaved ? <><Check size={15} />Saved!</> : profileSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-4"
          style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <KeyRound size={15} style={{ color: C.gold }} />
            <p className="text-xs uppercase tracking-wider" style={{ color: C.secondary }}>Change Password</p>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: C.secondary }}>
              New Password
            </label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 6 characters" className={inputClass} style={inputStyle} />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: C.secondary }}>
              Confirm New Password
            </label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && savePassword()}
              placeholder="Repeat new password" className={inputClass} style={inputStyle} />
          </div>

          {passwordError && (
            <div className="rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
              {passwordError}
            </div>
          )}

          <button onClick={savePassword} disabled={passwordSaving || passwordSaved}
            className="w-full flex items-center justify-center gap-2 font-bold rounded-xl py-3 text-sm transition-all disabled:opacity-60"
            style={{ background: passwordSaved ? '#16a34a' : C.gold, color: passwordSaved ? '#fff' : '#0a0908' }}>
            {passwordSaved ? <><Check size={15} />Updated!</> : passwordSaving ? 'Updating...' : 'Update Password'}
          </button>
        </div>

      </div>
    </div>
  )
}
