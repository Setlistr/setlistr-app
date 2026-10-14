'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Users, Settings } from 'lucide-react'
import type { Profile } from '@/types'
import { useActingAs } from '@/components/ActingAsProvider'
import { roleInfoFor } from '@/lib/teamRoleInfo'
import { useWorkspaceRole } from '@/components/layout/WorkspaceRole'

// Pages can ask the header's menu to open (e.g. the dashboard's "Switch
// workspace" recovery button) without owning any of its state.
export const OPEN_ACCOUNT_MENU_EVENT = 'sl:open-account-menu'
export function openAccountMenu() {
  try { window.dispatchEvent(new Event(OPEN_ACCOUNT_MENU_EVENT)) } catch {}
}

const itemStyle: React.CSSProperties = {
  width: '100%', minHeight: 48, padding: '0 16px', border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
  fontSize: 15, fontWeight: 600, color: 'var(--sl-text)', textDecoration: 'none',
}
const headingStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--sl-text-3)', margin: 0, padding: '12px 16px 4px' }

// The single top-right entry point for everything that isn't a primary
// bottom-tab destination: the own-account/managed-artist workspace
// switcher, Settings (which already contains profile fields and team
// management — no new route), and the Manager workspace entry point.
// The trigger names the workspace being worked in, and — for a team member
// acting for an artist — the role they hold there, so who you're acting as
// is visible on every page rather than only in a dashboard banner.
export function AccountMenu({ profile, hasWorkspace }: { profile: Profile; hasWorkspace: boolean }) {
  const { actingAs, selectManagedArtist, returnToOwnWorkspace } = useActingAs()
  const [open, setOpen] = useState(false)
  // Team connections and role come from the app frame (WorkspaceRole), so
  // the identity line here and the capture controls agree.
  const { managed } = useWorkspaceRole()
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onOpen() { setOpen(true) }
    window.addEventListener(OPEN_ACCOUNT_MENU_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_ACCOUNT_MENU_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const first = listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const initials = (profile.full_name || profile.email).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const actingArtist = actingAs ? managed.find(a => a.artist_id === actingAs.artist_id) : undefined

  // What the trigger says. A team member acting for an artist sees the
  // artist and their own role there (only once the role is known — never a
  // guessed default). Someone with no workspace at all (e.g. a team member
  // whose access was removed) sees their own account and that fact.
  let name: string
  let detail: string | null = null
  if (actingAs) {
    name = actingAs.artist_name
    if (actingArtist) detail = roleInfoFor(actingArtist.role).label
  } else if (!hasWorkspace) {
    name = 'Your account'
    detail = managed.length > 0 ? 'No workspace selected' : 'No workspace'
  } else {
    name = profile.artist_name || profile.full_name || 'Account'
  }
  const avatarUrl = actingAs ? actingArtist?.avatar_url : (hasWorkspace ? profile.avatar_url : null)
  const avatarInitials = actingAs ? actingAs.artist_name.charAt(0).toUpperCase() : initials

  return (
    <div ref={menuRef} style={{ position: 'relative', minWidth: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account and workspace menu, ${name}${detail ? `, ${detail}` : ''}`}
        style={{
          // Sizes read --sl-acct-* so the desktop top bar (AppShell) can use
          // the larger identity from the approved desktop design.
          display: 'flex', alignItems: 'center', gap: 8, minHeight: 'var(--sl-acct-h, 44px)', maxWidth: '100%', minWidth: 0,
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          padding: '0 4px 0 10px', borderRadius: 22, textAlign: 'right',
        }}>
        <span style={{ minWidth: 0, lineHeight: 1.15 }}>
          <span style={{ display: 'block', fontSize: 'var(--sl-acct-name, 15px)', fontWeight: 600, color: 'var(--sl-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          {detail && <span style={{ display: 'block', fontSize: 'var(--sl-acct-detail, 12px)', fontWeight: 700, color: actingAs ? 'var(--sl-gold-text)' : 'var(--sl-text-3)', whiteSpace: 'nowrap' }}>{detail}</span>}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--sl-text-3)' }} aria-hidden="true" />
        <span style={{
          width: 'var(--sl-acct-ava, 32px)', height: 'var(--sl-acct-ava, 32px)', borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--sl-surface)',
          border: actingAs ? '2px solid var(--sl-gold)' : '1.5px solid var(--sl-line)',
        }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 12, fontWeight: 800, color: actingAs ? 'var(--sl-gold-text)' : 'var(--sl-text-2)' }}>{avatarInitials}</span>}
        </span>
      </button>

      {open && (
        <div ref={listRef} role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 'min(280px, calc(100vw - 24px))', background: 'var(--sl-elevated)', border: '1px solid var(--sl-line)', borderRadius: 14, overflow: 'hidden', zIndex: 60, boxShadow: 'var(--sl-menu-shadow)' }}>
          {managed.length > 0 && (
            <>
              <p style={headingStyle}>Workspace</p>
              <button role="menuitem" onClick={() => { returnToOwnWorkspace(); setOpen(false) }}
                style={{ ...itemStyle, background: !actingAs ? 'var(--sl-surface)' : 'transparent' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--sl-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--sl-text-2)' }}>{initials}</span>}
                </span>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.artist_name || profile.full_name || 'Your account'}</span>
                {!actingAs && <Check size={14} style={{ color: 'var(--sl-gold-text)', flexShrink: 0 }} strokeWidth={2.5} />}
              </button>
              {managed.map(a => (
                <button role="menuitem" key={a.artist_id} onClick={() => { selectManagedArtist({ artist_id: a.artist_id, artist_name: a.artist_name }); setOpen(false) }}
                  style={{ ...itemStyle, background: actingAs?.artist_id === a.artist_id ? 'var(--sl-surface)' : 'transparent' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--sl-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {a.avatar_url ? <img src={a.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--sl-gold-text)' }}>{a.artist_name.charAt(0).toUpperCase()}</span>}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.artist_name}</span>
                  {actingAs?.artist_id === a.artist_id && <Check size={14} style={{ color: 'var(--sl-gold-text)', flexShrink: 0 }} strokeWidth={2.5} />}
                </button>
              ))}
              <Link role="menuitem" href="/app/manager" onClick={() => setOpen(false)} style={{ ...itemStyle, color: 'var(--sl-gold-text)', fontWeight: 700 }}>
                <Users size={16} /> Manager workspace
              </Link>
            </>
          )}
          <p style={{ ...headingStyle, borderTop: managed.length > 0 ? '1px solid var(--sl-line)' : 'none' }}>Account</p>
          <Link role="menuitem" href="/app/settings" onClick={() => setOpen(false)} style={itemStyle}>
            <Settings size={16} style={{ color: 'var(--sl-text-2)', flexShrink: 0 }} /> Settings &amp; Profile
          </Link>
          <Link role="menuitem" href="/app/team" onClick={() => setOpen(false)} style={{ ...itemStyle, marginBottom: 4 }}>
            <Users size={16} style={{ color: 'var(--sl-text-2)', flexShrink: 0 }} /> Team
          </Link>
        </div>
      )}
    </div>
  )
}
