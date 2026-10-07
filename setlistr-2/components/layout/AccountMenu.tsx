'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Check, Users, Settings } from 'lucide-react'
import type { Profile } from '@/types'
import { useActingAs } from '@/components/ActingAsProvider'

const C = {
  card: '#141210', border: 'rgba(255,255,255,0.08)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
}

type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

// The single top-right entry point for everything that isn't a primary
// bottom-tab destination: the own-account/managed-artist workspace
// switcher (moved here from app/app/dashboard's own header, now available
// on every page, not just Dashboard), Settings (which already contains
// profile fields and team management — no new route), and the Manager
// workspace entry point (previously a separate pill button on Dashboard
// only).
export function AccountMenu({ profile }: { profile: Profile }) {
  const { actingAs, selectManagedArtist, returnToOwnWorkspace } = useActingAs()
  const [open, setOpen] = useState(false)
  const [managed, setManaged] = useState<ManagedArtist[]>([])
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/team/managed-artists').then(r => r.ok ? r.json() : { managed: [] }).then(d => setManaged(d.managed || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const initials = (profile.full_name || profile.email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const displayName = actingAs ? actingAs.artist_name : (profile.artist_name || profile.full_name || 'Account')

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px 4px 4px', borderRadius: 20,
        }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: actingAs ? C.goldDim : 'rgba(255,255,255,0.08)', border: `1.5px solid ${actingAs ? C.borderGold : 'rgba(255,255,255,0.14)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {(actingAs ? managed.find(a => a.artist_id === actingAs.artist_id)?.avatar_url : profile.avatar_url) ? (
            <img src={(actingAs ? managed.find(a => a.artist_id === actingAs.artist_id)?.avatar_url : profile.avatar_url) || ''} alt={displayName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 800, color: actingAs ? C.gold : C.secondary }}>{actingAs ? displayName!.charAt(0).toUpperCase() : initials}</span>
          )}
        </div>
      </button>

      {open && (
        <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 260, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', zIndex: 60, boxShadow: '0 8px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          {managed.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: 0, padding: '10px 14px 6px' }}>Workspace</p>
              <button role="menuitem" onClick={() => { returnToOwnWorkspace(); setOpen(false) }}
                style={{ width: '100%', padding: '10px 14px', background: !actingAs ? C.goldDim : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' as const }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 800, color: C.secondary }}>{initials}</span>}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: C.text, fontWeight: 600 }}>{profile.artist_name || profile.full_name || 'Your account'}</span>
                {!actingAs && <Check size={13} color={C.gold} strokeWidth={2.5} />}
              </button>
              {managed.map(a => (
                <button role="menuitem" key={a.artist_id} onClick={() => { selectManagedArtist({ artist_id: a.artist_id, artist_name: a.artist_name }); setOpen(false) }}
                  style={{ width: '100%', padding: '10px 14px', background: actingAs?.artist_id === a.artist_id ? C.goldDim : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' as const }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: C.goldDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 800, color: C.gold }}>{a.artist_name.charAt(0).toUpperCase()}</span>}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.artist_name}</span>
                  {actingAs?.artist_id === a.artist_id && <Check size={13} color={C.gold} strokeWidth={2.5} />}
                </button>
              ))}
              <Link role="menuitem" href="/app/manager" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: `1px solid ${C.border}`, color: C.gold, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                <Users size={15} /> Manager workspace
              </Link>
            </>
          )}
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: 0, padding: '10px 14px 6px', borderTop: managed.length > 0 ? `1px solid ${C.border}` : 'none' }}>Account</p>
          <Link role="menuitem" href="/app/settings" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', color: C.text, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <Settings size={15} color={C.secondary} /> Settings &amp; Profile
          </Link>
          <Link role="menuitem" href="/app/team" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px 12px', color: C.text, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <Users size={15} color={C.secondary} /> Team
          </Link>
        </div>
      )}
    </div>
  )
}
