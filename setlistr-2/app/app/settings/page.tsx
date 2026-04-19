'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, KeyRound, User, Music2, Search, Download, Radio, Users, Copy, X, Clock } from 'lucide-react'

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
  green: '#4ade80',
  greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171',
  redDim: 'rgba(248,113,113,0.08)',
}

const PRO_OPTIONS = ['SOCAN', 'ASCAP', 'BMI', 'SESAC', 'GMR', 'APRA', 'PRS', 'Other', 'None']

type SpotifyArtist = {
  id: string
  name: string
  followers: number
  image: string | null
  genres: string[]
}

type Delegate = {
  id: string
  delegate_id: string
  name: string
  role: string
  accepted: boolean
  accepted_at: string | null
  invited_at: string
  invite_url: string | null
  invite_token: string | null
}

export default function SettingsPage() {
  // Profile
  const [fullName, setFullName]     = useState('')
  const [artistName, setArtistName] = useState('')
  const [email, setEmail]           = useState('')
  const [userId, setUserId]         = useState('')
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

  // Bandsintown
  const [bandsintownName, setBandsintownName]       = useState('')
  const [bandsintownSaving, setBandsintownSaving]   = useState(false)
  const [bandsintownSaved, setBandsintownSaved]     = useState(false)
  const [bandsintownTesting, setBandsintownTesting] = useState(false)
  const [bandsintownTestResult, setBandsintownTestResult] = useState<{ ok: boolean; count: number } | null>(null)

  // Spotify import
  const [spotifyQuery, setSpotifyQuery]           = useState('')
  const [spotifySearching, setSpotifySearching]   = useState(false)
  const [spotifyResults, setSpotifyResults]       = useState<SpotifyArtist[]>([])
  const [spotifyError, setSpotifyError]           = useState('')
  const [selectedArtist, setSelectedArtist]       = useState<SpotifyArtist | null>(null)
  const [importing, setImporting]                 = useState(false)
  const [importDone, setImportDone]               = useState(false)
  const [importCount, setImportCount]             = useState(0)
  const [existingImportCount, setExistingImportCount] = useState(0)

  // Team / delegation
  const [delegates, setDelegates]             = useState<Delegate[]>([])
  const [delegateEmail, setDelegateEmail]     = useState('')
  const [inviting, setInviting]               = useState(false)
  const [inviteResult, setInviteResult]       = useState<{ invite_url: string; invite_message: string; delegate_name: string | null; delegate_found: boolean; email_sent: boolean } | null>(null)
  const [inviteError, setInviteError]         = useState('')
  const [copiedInvite, setCopiedInvite]       = useState(false)
  const [revoking, setRevoking]               = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, artist_name, pro_affiliation, ipi_number, publisher_name, legal_name, bandsintown_artist_name')
        .eq('id', user.id)
        .single()

      if (profile) {
        setFullName(profile.full_name ?? '')
        setArtistName(profile.artist_name ?? '')
        setProAffiliation(profile.pro_affiliation ?? '')
        setIpiNumber(profile.ipi_number ?? '')
        setPublisherName(profile.publisher_name ?? '')
        setLegalName(profile.legal_name ?? '')
        setBandsintownName(profile.bandsintown_artist_name ?? '')
        if (profile.artist_name) setSpotifyQuery(profile.artist_name)
      }

      const { count } = await supabase
        .from('user_songs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source', 'spotify_import')
      setExistingImportCount(count || 0)

      // Load existing delegates
      loadDelegates(user.id)
    }
    load()
  }, [])

  async function loadDelegates(artistId: string) {
    try {
      const res = await fetch(`/api/team/delegates?artist_id=${artistId}`)
      const data = await res.json()
      setDelegates(data.delegates || [])
    } catch { /* silently fail */ }
  }

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

  async function saveBandsintown() {
    setBandsintownSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({
      bandsintown_artist_name: bandsintownName.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    setBandsintownSaving(false)
    setBandsintownSaved(true)
    setTimeout(() => setBandsintownSaved(false), 2000)
  }

  async function testBandsintown() {
    if (!bandsintownName.trim()) return
    setBandsintownTesting(true)
    setBandsintownTestResult(null)
    try {
      const res = await fetch(`/api/bandsintown/upcoming?artist=${encodeURIComponent(bandsintownName.trim())}`)
      const data = await res.json()
      setBandsintownTestResult({ ok: true, count: data.events?.length ?? 0 })
    } catch {
      setBandsintownTestResult({ ok: false, count: 0 })
    } finally {
      setBandsintownTesting(false)
    }
  }

  async function searchSpotify() {
    if (!spotifyQuery.trim()) return
    setSpotifySearching(true); setSpotifyError(''); setSpotifyResults([]); setSelectedArtist(null); setImportDone(false)
    try {
      const res = await fetch(`/api/spotify-search?q=${encodeURIComponent(spotifyQuery.trim())}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSpotifyResults(data.artists || [])
      if (!data.artists?.length) setSpotifyError('No artists found. Try a different name.')
    } catch (err: any) {
      setSpotifyError(err?.message || 'Search failed. Please try again.')
    } finally {
      setSpotifySearching(false)
    }
  }

  async function importFromSpotify(artist: SpotifyArtist) {
    setSelectedArtist(artist); setImporting(true); setSpotifyError('')
    try {
      const res = await fetch(`/api/spotify-import?artist_id=${artist.id}&artist_name=${encodeURIComponent(artist.name)}`, { method: 'POST' })
      if (!res.ok) throw new Error('Import failed')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setImportCount(data.imported || 0); setImportDone(true)
      setExistingImportCount(prev => prev + (data.imported || 0))
    } catch (err: any) {
      setSpotifyError(err?.message || 'Import failed. Please try again.')
      setSelectedArtist(null)
    } finally {
      setImporting(false)
    }
  }

  async function sendInvite() {
    if (!delegateEmail.trim() || !userId) return
    setInviting(true); setInviteError(''); setInviteResult(null)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: userId, delegate_email: delegateEmail.trim() }),
      })
      const data = await res.json()
      if (data.error) { setInviteError(data.error); return }
      setInviteResult(data)
      setDelegateEmail('')
      // Refresh delegate list
      loadDelegates(userId)
    } catch {
      setInviteError('Something went wrong. Try again.')
    } finally {
      setInviting(false)
    }
  }

  async function revokeDelegate(delegateId: string) {
    if (!userId) return
    setRevoking(delegateId)
    try {
      await fetch('/api/team/delegates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegate_id: delegateId, artist_id: userId }),
      })
      setDelegates(prev => prev.filter(d => d.id !== delegateId))
    } catch { /* silently fail */ } finally {
      setRevoking(null)
    }
  }

  function copyInvite(text: string) {
    try { navigator.clipboard.writeText(text) } catch {
      const el = document.createElement('textarea')
      el.value = text; document.body.appendChild(el); el.select()
      document.execCommand('copy'); document.body.removeChild(el)
    }
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2000)
  }

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
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

        {/* ── Team ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} color={C.gold} />
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Team Access</p>
            </div>
            {delegates.filter(d => d.accepted).length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 10px' }}>
                {delegates.filter(d => d.accepted).length} active
              </span>
            )}
          </div>

          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            Give your manager, tour manager, or band member access to capture shows and submit royalties on your behalf. Every action they take is logged under your account.
          </p>

          {/* Existing delegates */}
          {delegates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {delegates.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${d.accepted ? 'rgba(74,222,128,0.15)' : C.border}`, borderRadius: 10 }}>
                  {/* Avatar */}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: d.accepted ? C.greenDim : C.goldDim, border: `1px solid ${d.accepted ? 'rgba(74,222,128,0.2)' : C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: d.accepted ? C.green : C.gold }}>
                      {d.name.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</p>
                      {d.accepted
                        ? <span style={{ fontSize: 9, fontWeight: 700, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '2px 6px', flexShrink: 0 }}>Active</span>
                        : <span style={{ fontSize: 9, fontWeight: 700, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '2px 6px', flexShrink: 0 }}>Pending</span>
                      }
                    </div>
                    <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>
                      {d.role} · {d.accepted ? `Joined ${timeAgo(d.accepted_at!)}` : `Invited ${timeAgo(d.invited_at)}`}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {/* Resend invite link if pending */}
                    {!d.accepted && d.invite_url && (
                      <button onClick={() => copyInvite(d.invite_url!)}
                        style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Copy size={10} /> Resend
                      </button>
                    )}
                    {/* Revoke */}
                    <button onClick={() => revokeDelegate(d.id)} disabled={revoking === d.id}
                      style={{ background: 'none', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '5px 10px', color: C.red, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, opacity: revoking === d.id ? 0.5 : 1 }}>
                      <X size={10} /> {revoking === d.id ? '...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invite form */}
          <div>
            <label style={labelStyle}>Invite by email</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={delegateEmail}
                onChange={e => { setDelegateEmail(e.target.value); setInviteError(''); setInviteResult(null) }}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
                placeholder="manager@email.com"
                type="email"
                style={{ ...inputStyle, flex: 1 }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder}
              />
              <button onClick={sendInvite} disabled={inviting || !delegateEmail.trim()}
                style={{ padding: '11px 16px', background: delegateEmail.trim() ? C.gold : 'rgba(255,255,255,0.04)', border: `1px solid ${delegateEmail.trim() ? C.gold : C.border}`, borderRadius: 10, color: delegateEmail.trim() ? '#0a0908' : C.muted, fontSize: 13, fontWeight: 700, cursor: inviting || !delegateEmail.trim() ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: inviting ? 0.7 : 1 }}>
                {inviting ? '...' : 'Invite'}
              </button>
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>
              They'll get a link to accept access. If they don't have a Setlistr account yet, they can create one when they accept.
            </p>
          </div>

          {/* Invite error */}
          {inviteError && (
            <div style={{ background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '11px 14px' }}>
              <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{inviteError}</p>
            </div>
          )}

          {/* Invite result */}
          {inviteResult && (
            <div style={{ background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={14} color={C.green} strokeWidth={2.5} />
                <p style={{ fontSize: 13, fontWeight: 700, color: C.green, margin: 0 }}>
                  {(inviteResult as any).email_sent ? 'Invite email sent' : inviteResult.delegate_found ? `Invite created for ${inviteResult.delegate_name || 'this user'}` : 'Invite created'}
                </p>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>
                {(inviteResult as any).email_sent
                  ? "They'll receive an email with a link to accept access to your account."
                  : 'Send them this link — they tap it to accept access.'}
              </p>
              <button onClick={() => copyInvite(inviteResult.invite_url)}
                style={{ width: '100%', padding: '12px', background: copiedInvite ? '#16a34a' : 'transparent', border: `1px solid ${copiedInvite ? 'rgba(74,222,128,0.4)' : 'rgba(74,222,128,0.25)'}`, borderRadius: 10, color: copiedInvite ? C.green : C.secondary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {copiedInvite ? <><Check size={12} strokeWidth={2.5} /> Link Copied</> : <><Copy size={12} strokeWidth={2} /> Copy Invite Link</>}
              </button>
            </div>
          )}
        </div>

        {/* ── Bandsintown ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Radio size={15} color={C.gold} />
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Upcoming Shows</p>
            </div>
            {bandsintownName && bandsintownTestResult?.ok && bandsintownTestResult.count > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 10px' }}>
                Connected
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            Connect your artist profile to automatically see upcoming shows on your dashboard. We check Bandsintown and Ticketmaster.
          </p>
          <div>
            <label style={labelStyle}>Your Artist Name</label>
            <input value={bandsintownName} onChange={e => { setBandsintownName(e.target.value); setBandsintownTestResult(null) }} placeholder="e.g. Jesse Slack" style={inputStyle}
              onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
              onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
            <p style={{ fontSize: 11, color: C.muted, margin: '6px 0 0' }}>Must match exactly how your name appears on Bandsintown or Ticketmaster</p>
          </div>
          {bandsintownTestResult && (
            <div style={{ padding: '11px 14px', borderRadius: 10, background: bandsintownTestResult.ok ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${bandsintownTestResult.ok ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
              <p style={{ fontSize: 13, color: bandsintownTestResult.ok ? C.green : '#f87171', margin: 0 }}>
                {bandsintownTestResult.ok
                  ? bandsintownTestResult.count > 0
                    ? `✓ Found ${bandsintownTestResult.count} upcoming show${bandsintownTestResult.count !== 1 ? 's' : ''}`
                    : '✓ Artist found — no upcoming shows listed yet'
                  : '✗ Artist not found — check the spelling'}
              </p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={testBandsintown} disabled={!bandsintownName.trim() || bandsintownTesting}
              style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${C.borderGold}`, borderRadius: 10, color: C.gold, fontSize: 13, fontWeight: 700, cursor: bandsintownName.trim() && !bandsintownTesting ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: !bandsintownName.trim() ? 0.4 : 1 }}>
              {bandsintownTesting ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={saveBandsintown} disabled={bandsintownSaving || bandsintownSaved}
              style={{ flex: 1, padding: '12px', background: bandsintownSaved ? '#16a34a' : C.gold, border: 'none', borderRadius: 10, color: bandsintownSaved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit', opacity: bandsintownSaving ? 0.7 : 1 }}>
              {bandsintownSaved ? <><Check size={14} strokeWidth={2.5} />Saved</> : bandsintownSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
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
          <div>
            <label style={labelStyle}>PRO Affiliation</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PRO_OPTIONS.map(pro => (
                <button key={pro} onClick={() => setProAffiliation(pro === proAffiliation ? '' : pro)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${proAffiliation === pro ? C.borderGold : C.border}`, background: proAffiliation === pro ? C.goldDim : 'transparent', color: proAffiliation === pro ? C.gold : C.secondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
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

        {/* ── Song Catalog — Spotify Import ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill={C.gold}>
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Song Catalog</p>
            </div>
            {existingImportCount > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 10px' }}>
                {existingImportCount} imported
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>
            Import your top tracks from Spotify to get a head start. These songs will appear in your quick-add list during shows.
            {existingImportCount > 0 ? ' Real show data always ranks above imported songs.' : ''}
          </p>
          {importDone ? (
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check size={16} color={C.green} strokeWidth={2.5} />
                <p style={{ fontSize: 14, fontWeight: 700, color: C.green, margin: 0 }}>{importCount} songs imported</p>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>From {selectedArtist?.name}. These will appear in your quick-add list.</p>
              <button onClick={() => { setImportDone(false); setSelectedArtist(null); setSpotifyResults([]) }}
                style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'left', textDecoration: 'underline' }}>
                Import from a different artist
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={spotifyQuery} onChange={e => setSpotifyQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchSpotify()} placeholder="Search your artist name on Spotify..." style={{ ...inputStyle, flex: 1 }}
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = C.borderGold}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = C.inputBorder} />
                <button onClick={searchSpotify} disabled={spotifySearching || !spotifyQuery.trim()}
                  style={{ padding: '11px 16px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', cursor: spotifySearching ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontWeight: 700, fontSize: 13, flexShrink: 0, opacity: spotifySearching ? 0.7 : 1 }}>
                  <Search size={14} />{spotifySearching ? '...' : 'Search'}
                </button>
              </div>
              {spotifyError && <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>{spotifyError}</p>}
              {spotifyResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>Select your profile</p>
                  {spotifyResults.map(artist => (
                    <button key={artist.id} onClick={() => importFromSpotify(artist)} disabled={importing}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: selectedArtist?.id === artist.id ? C.goldDim : 'rgba(255,255,255,0.02)', border: `1px solid ${selectedArtist?.id === artist.id ? C.borderGold : C.border}`, borderRadius: 12, cursor: importing ? 'wait' : 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', transition: 'all 0.15s ease' }}>
                      {artist.image
                        ? <img src={artist.image} alt={artist.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Music2 size={18} color={C.muted} /></div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist.name}</p>
                        <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{artist.followers.toLocaleString()} followers{artist.genres.length > 0 && ` · ${artist.genres.slice(0, 2).join(', ')}`}</p>
                      </div>
                      {importing && selectedArtist?.id === artist.id
                        ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1.5px solid ${C.gold}40`, borderTopColor: C.gold, animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                        : <Download size={14} color={C.muted} style={{ flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
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
        @keyframes spin { to { transform: rotate(360deg); } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
      `}</style>
    </div>
  )
}
