'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, KeyRound, User, Music2 } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c',
  inputBorder: 'rgba(255,255,255,0.09)',
  text: '#f0ece3',
  secondary: '#b8a888',
  muted: '#8a7a68',
  gold: '#c9a84c',
  goldDim: 'rgba(201,168,76,0.1)',
}

const PRO_OPTIONS = ['SOCAN', 'ASCAP', 'BMI', 'SESAC', 'GMR', 'APRA', 'PRS', 'Other', 'None']

export default function SettingsPage() {
  // Profile
  const [fullName, setFullName]     = useState('')
  const [artistName, setArtistName] = useState('')
  const [email, setEmail]           = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved]   = useState(false)
  const [profileError, setProfileError]   = useState('')

  // Password
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving]   = useState(false)
  const [passwordSaved, setPasswordSaved]     = useState(false)
  const [passwordError, setPasswordError]     = useState('')

  // PRO
  const [proAffiliation, setProAffiliation] = useState('')
  const [ipiNumber, setIpiNumber]           = useState('')
  const [publisherName, setPublisherName]   = useState('')
  const [legalName, setLegalName]           = useState('')
  const [proSaving, setProSaving]           = useState(false)
  const [proSaved, setProSaved]             = useState(false)
  const [proError, setProError]             = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, artist_name, pro_affiliation, ipi_number, publisher_name, legal_name')
        .eq('id', user.id)
        .single()
      if (profile) {
        setFullName(profile.full_name ?? '')
        setArtistName(profile.artist_name ?? '')
        setProAffiliation(profile.pro_affiliation ?? '')
        setIpiNumber(profile.ipi_number ?? '')
        setPublisherName(profile.publisher_name ?? '')
        setLegalName(profile.legal_name ?? '')
      }
    }
    load()
  }, [])

  async function saveProfile() {
    if (!fullName.trim()) { setProfileError('Name is required'); return }
    setProfileSaving(true); setProfileError('')
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
    setPasswordSaving(true); setPasswordError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)
    if (error) { setPasswordError(error.message); return }
    setPasswordSaved(true)
    setNewPassword(''); setConfirmPassword('')
    setTimeout(() => setPasswordSaved(false), 2000)
  }

  async function savePRO() {
    setProSaving(true); setProError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({
      pro_affiliation: proAffiliation || null,
      ipi_number: ipiNumber.trim() || null,
      publisher_name: publisherName.trim() || null,
      legal_name: legalName.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    setProSaving(false)
    if (error) { setProError(error.message); return }
    setProSaved(true)
    setTimeout(() => setProSaved(false), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: C.input, border: `1px solid ${C.inputBorder}`,
    borderRadius: 10, padding: '11px 14px',
    color: C.text, fontSize: 14, fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.15s ease',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: C.secondary,
    display: 'block', marginBottom: 6,
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ padding: '32px 16px 8px', maxWidth: 520, margin: '0 auto' }}>
        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3em', color: C.gold + '99', margin: '0 0 4px' }}>Account</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.025em' }}>Settings</h1>
      </div>

      <div style={{ padding: '16px 16px 60px', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Profile ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={15} color={C.gold} />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Profile</p>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input value={email} disabled style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }} />
          </div>

          <div>
            <label style={labelStyle}>Your Name <span style={{ color: C.gold }}>*</span></label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" style={inputStyle}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
          </div>

          <div>
            <label style={labelStyle}>Artist Name</label>
            <input value={artistName} onChange={e => setArtistName(e.target.value)} placeholder="Your artist or stage name" style={inputStyle}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
            <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>Appears on your setlists and PRO exports</p>
          </div>

          {profileError && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '11px 14px' }}>
              <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{profileError}</p>
            </div>
          )}

          <button onClick={saveProfile} disabled={profileSaving || profileSaved}
            style={{ width: '100%', padding: '13px', background: profileSaved ? '#16a34a' : C.gold, border: 'none', borderRadius: 10, color: profileSaved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit', opacity: profileSaving ? 0.7 : 1 }}>
            {profileSaved ? <><Check size={14} strokeWidth={2.5} />Saved</> : profileSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {/* ── PRO Information ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Music2 size={15} color={C.gold} />
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>PRO Information</p>
            </div>
            {proAffiliation && (
              <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '3px 10px', letterSpacing: '0.08em' }}>
                {proAffiliation}
              </span>
            )}
          </div>

          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>
            This information pre-fills your PRO submission reports. It is never shared or submitted automatically.
          </p>

          {/* PRO Affiliation selector */}
          <div>
            <label style={labelStyle}>PRO Affiliation</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRO_OPTIONS.map(pro => (
                <button key={pro} onClick={() => setProAffiliation(pro === proAffiliation ? '' : pro)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, border: `1px solid ${proAffiliation === pro ? C.borderGold : C.border}`,
                    background: proAffiliation === pro ? C.goldDim : 'transparent',
                    color: proAffiliation === pro ? C.gold : C.secondary,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s ease', fontFamily: 'inherit',
                  }}>
                  {pro}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Legal Name</label>
            <input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Name as registered with your PRO" style={inputStyle}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
            <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>Used on PRO submission forms</p>
          </div>

          <div>
            <label style={labelStyle}>IPI / CAE Number</label>
            <input value={ipiNumber} onChange={e => setIpiNumber(e.target.value)} placeholder="e.g. 00000000000" style={{ ...inputStyle, fontFamily: '"DM Mono", monospace', letterSpacing: '0.05em' }}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
            <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>Your unique identifier as a songwriter/composer</p>
          </div>

          <div>
            <label style={labelStyle}>Publisher Name (optional)</label>
            <input value={publisherName} onChange={e => setPublisherName(e.target.value)} placeholder="e.g. Sony Music Publishing" style={inputStyle}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
            <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>Leave blank if you self-publish</p>
          </div>

          {proError && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '11px 14px' }}>
              <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{proError}</p>
            </div>
          )}

          <button onClick={savePRO} disabled={proSaving || proSaved}
            style={{ width: '100%', padding: '13px', background: proSaved ? '#16a34a' : C.gold, border: 'none', borderRadius: 10, color: proSaved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit', opacity: proSaving ? 0.7 : 1 }}>
            {proSaved ? <><Check size={14} strokeWidth={2.5} />Saved</> : proSaving ? 'Saving...' : 'Save PRO Info'}
          </button>
        </div>

        {/* ── Password ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={15} color={C.gold} />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Change Password</p>
          </div>

          <div>
            <label style={labelStyle}>New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" style={inputStyle}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
          </div>

          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePassword()} placeholder="Repeat new password" style={inputStyle}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
          </div>

          {passwordError && (
            <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '11px 14px' }}>
              <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{passwordError}</p>
            </div>
          )}

          <button onClick={savePassword} disabled={passwordSaving || passwordSaved}
            style={{ width: '100%', padding: '13px', background: passwordSaved ? '#16a34a' : C.gold, border: 'none', borderRadius: 10, color: passwordSaved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit', opacity: passwordSaving ? 0.7 : 1 }}>
            {passwordSaved ? <><Check size={14} strokeWidth={2.5} />Updated</> : passwordSaving ? 'Updating...' : 'Update Password'}
          </button>
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
      `}</style>
    </div>
  )
}
