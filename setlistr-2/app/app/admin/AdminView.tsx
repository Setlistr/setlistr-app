'use client'
import { useState, useMemo } from 'react'

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:        '#0a0908',
  card:      '#141210',
  card2:     '#1a1814',
  border:    'rgba(255,255,255,0.07)',
  borderGold:'rgba(201,168,76,0.25)',
  text:      '#f0ece3',
  secondary: '#a09070',
  muted:     '#6a6050',
  gold:      '#c9a84c',
  goldDim:   'rgba(201,168,76,0.1)',
  green:     '#4ade80',
  greenDim:  'rgba(74,222,128,0.08)',
  red:       '#f87171',
  redDim:    'rgba(248,113,113,0.08)',
  amber:     '#f59e0b',
}

// ── Types ────────────────────────────────────────────────────────────────────
type DetectionEvent = {
  id: string
  performance_id: string
  acr_title: string | null
  acr_artist: string | null
  acr_score: number
  confidence_level: string | null
  auto_confirmed: boolean
  venue_name: string | null
  artist_name: string | null
  final_title: string | null
  final_source: string | null
  created_at: string
}

type Performance = {
  id: string
  venue_name: string
  artist_name: string
  city: string
  country: string
  status: string
  submission_status: string | null
  started_at: string
  user_id: string | null
  set_duration_minutes: number | null
}

type PerformanceSong = {
  performance_id: string
  title: string
  artist: string
  isrc: string | null
  composer: string | null
}

type Profile = {
  id: string
  full_name: string | null
  artist_name: string | null
  pro_affiliation: string | null
}

type UserSong = {
  user_id: string
  song_title: string
  confirmed_count: number
  last_confirmed_at: string
}

type BetaInvite = {
  id: string
  email: string
  name: string | null
  added_by: string | null
  created_at: string
  accepted_at: string | null
}

type Tab = 'overview' | 'detection' | 'artists' | 'songs' | 'venues' | 'shows' | 'beta' | 'superadmin'

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Stat card ────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 800, color: color || C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</p>
      {sub ? <p style={{ fontSize: 11, color: C.secondary, margin: '5px 0 0' }}>{sub}</p> : null}
    </div>
  )
}

// ── Bar ──────────────────────────────────────────────────────────────────────
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ── Dot ─────────────────────────────────────────────────────────────────────
function Dot({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AdminDashboard({
  detectionEvents, performances, performanceSongs, profiles, userSongs, betaInvites,
}: {
  detectionEvents: DetectionEvent[]
  performances:    Performance[]
  performanceSongs: PerformanceSong[]
  profiles:        Profile[]
  userSongs:       UserSong[]
  betaInvites:     BetaInvite[]
}) {
  const [tab, setTab]             = useState<Tab>('overview')
  const [detFilter, setDetFilter] = useState<'all' | 'detected' | 'missed'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [songSearch, setSongSearch]   = useState('')
  const [newEmail, setNewEmail]       = useState('')
  const [newName, setNewName]         = useState('')
  const [addingUser, setAddingUser]   = useState(false)
  const [addError, setAddError]       = useState('')
  const [addSuccess, setAddSuccess]   = useState('')
  const [invites, setInvites]         = useState<BetaInvite[]>(betaInvites)
  // Superadmin state
  const [saArtistId, setSaArtistId]         = useState('')
  const [saManagerId, setSaManagerId]       = useState('')
  const [saAssigning, setSaAssigning]       = useState(false)
  const [saAssignMsg, setSaAssignMsg]       = useState('')
  const [saSetlistArtistId, setSaSetlistArtistId] = useState('')
  const [saSetlistSongs, setSaSetlistSongs] = useState('')
  const [saSetlistLoading, setSaSetlistLoading]   = useState(false)
  const [saSetlistMsg, setSaSetlistMsg]     = useState('')

  const [spotifyImporting, setSpotifyImporting] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [spotifyOverride, setSpotifyOverride]   = useState<Record<string, string>>({})
  const [localPerfs, setLocalPerfs]   = useState<Performance[]>(performances)

  // ── Detection stats ────────────────────────────────────────────────────────
  const det = useMemo(() => {
    const total      = detectionEvents.length
    const detected   = detectionEvents.filter(e =>
      e.auto_confirmed || e.confidence_level === 'suggest' || e.confidence_level === 'auto'
    ).length
    const missed     = detectionEvents.filter(e =>
      e.confidence_level === 'no_result' || (!e.auto_confirmed && !e.acr_title)
    ).length
    const hitRate    = total > 0 ? Math.round((detected / total) * 100) : 0
    const scored     = detectionEvents.filter(e => e.acr_score > 0)
    const avgScore   = scored.length > 0
      ? Math.round(scored.reduce((s, e) => s + e.acr_score, 0) / scored.length)
      : 0
    const last24h    = detectionEvents.filter(e =>
      Date.now() - new Date(e.created_at).getTime() < 86400000
    ).length
    return { total, detected, missed, hitRate, avgScore, last24h }
  }, [detectionEvents])

  // ── Performance + submission funnel ───────────────────────────────────────
  const perf = useMemo(() => {
    const total     = performances.length
    const live      = performances.filter(p => p.status === 'live').length
    const completed = performances.filter(p =>
      ['completed', 'complete', 'review', 'exported'].includes(p.status)
    ).length
    const submitted = performances.filter(p => p.submission_status === 'submitted').length
    const submitRate = completed > 0 ? Math.round((submitted / completed) * 100) : 0
    return { total, live, completed, submitted, submitRate }
  }, [performances])

  // ── Data quality ──────────────────────────────────────────────────────────
  const quality = useMemo(() => {
    const total      = performanceSongs.length
    const withIsrc   = performanceSongs.filter(s => s.isrc).length
    const withComp   = performanceSongs.filter(s => s.composer).length
    const withBoth   = performanceSongs.filter(s => s.isrc && s.composer).length
    const isrcPct    = total > 0 ? Math.round((withIsrc / total) * 100) : 0
    const compPct    = total > 0 ? Math.round((withComp / total) * 100) : 0
    const matchedPct = total > 0 ? Math.round((withBoth / total) * 100) : 0
    return { total, withIsrc, withComp, withBoth, isrcPct, compPct, matchedPct }
  }, [performanceSongs])

  // ── Artist overview ────────────────────────────────────────────────────────
  const artists = useMemo(() => {
    const profileMap = new Map(profiles.map(p => [p.id, p]))
    const songMap    = new Map<string, UserSong[]>()
    const perfMap    = new Map<string, Performance[]>()

    userSongs.forEach(s => {
      const arr = songMap.get(s.user_id) || []
      arr.push(s)
      songMap.set(s.user_id, arr)
    })
    performances.forEach(p => {
      if (!p.user_id) return
      const arr = perfMap.get(p.user_id) || []
      arr.push(p)
      perfMap.set(p.user_id, arr)
    })

    return Array.from(profileMap.values()).map(profile => {
      const userPerfs    = perfMap.get(profile.id) || []
      const userSongList = songMap.get(profile.id) || []
      const submitted    = userPerfs.filter(p => p.submission_status === 'submitted').length
      const lastPerf     = userPerfs[0]?.started_at || null
      const hasName      = !!(profile.artist_name || profile.full_name)
      const displayName  = profile.artist_name || profile.full_name || 'Unknown Artist'
      return {
        id:          profile.id,
        name:        displayName,
        hasName,
        pro:         profile.pro_affiliation || '—',
        showCount:   userPerfs.length,
        songCount:   userSongList.length,
        submitted,
        lastPerf,
      }
    })
    .filter(u => u.showCount > 0 || u.hasName)
    .sort((a, b) => b.showCount - a.showCount)
  }, [profiles, performances, userSongs])

  // ── Top songs ─────────────────────────────────────────────────────────────
  const topSongs = useMemo(() => {
    const map = new Map<string, { title: string; artist: string; count: number; isrcCount: number }>()
    performanceSongs.forEach(s => {
      const key = s.title.toLowerCase().trim()
      const existing = map.get(key)
      if (existing) {
        existing.count++
        if (s.isrc) existing.isrcCount++
      } else {
        map.set(key, { title: s.title, artist: s.artist, count: 1, isrcCount: s.isrc ? 1 : 0 })
      }
    })
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 100)
  }, [performanceSongs])

  // ── Venue overview ────────────────────────────────────────────────────────
  const venues = useMemo(() => {
    const map = new Map<string, { name: string; city: string; showCount: number; lastShow: string }>()
    performances.forEach(p => {
      if (!p.venue_name) return
      const key = p.venue_name.toLowerCase().trim()
      const existing = map.get(key)
      if (existing) {
        existing.showCount++
        if (p.started_at > existing.lastShow) existing.lastShow = p.started_at
      } else {
        map.set(key, { name: p.venue_name, city: p.city || '', showCount: 1, lastShow: p.started_at })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.showCount - a.showCount)
  }, [performances])

  // ── Filtered detection feed ────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    return detectionEvents.filter(e => {
      if (detFilter === 'detected') return e.auto_confirmed || e.confidence_level === 'auto' || e.confidence_level === 'suggest'
      if (detFilter === 'missed')   return e.confidence_level === 'no_result' || (!e.acr_title && !e.auto_confirmed)
      return true
    })
  }, [detectionEvents, detFilter])

  // ── Filtered top songs ─────────────────────────────────────────────────────
  const filteredSongs = useMemo(() => {
    if (!songSearch.trim()) return topSongs
    const q = songSearch.toLowerCase()
    return topSongs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
  }, [topSongs, songSearch])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',  label: 'Overview'  },
    { id: 'detection', label: 'Detection' },
    { id: 'artists',   label: 'Artists'   },
    { id: 'songs',     label: 'Songs'     },
    { id: 'venues',    label: 'Venues'    },
    { id: 'shows',     label: 'Shows'     },
    { id: 'beta',      label: 'Beta Users' },
    { id: 'superadmin', label: '⚡ Superadmin' },
  ]

  async function deletePerformance(id: string, venueName: string) {
    if (!confirm(`Delete "${venueName || 'this show'}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/admin/delete-performance`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setLocalPerfs(prev => prev.filter(p => p.id !== id))
      } else {
        alert('Failed to delete — try again')
      }
    } catch {
      alert('Network error — try again')
    }
  }

  async function deleteShow(perfId: string) {
    if (!confirm('Delete this show and all its data? This cannot be undone.')) return
    try {
      const res = await fetch('/api/admin/delete-show', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: perfId }),
      })
      if (res.ok) {
        setLocalPerfs(prev => prev.filter(p => p.id !== perfId))
      } else {
        const err = await res.json().catch(() => ({}))
        alert('Failed to delete: ' + (err.error || res.status))
      }
    } catch (e: any) { alert('Network error: ' + e.message) }
  }

  async function forceEndShow(perfId: string) {
    if (!confirm('Force-end this live show?')) return
    try {
      const res = await fetch('/api/admin/delete-show', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_id: perfId }),
      })
      if (res.ok) {
        setLocalPerfs(prev => prev.map(p => p.id === perfId ? { ...p, status: 'review' } : p))
      } else {
        alert('Failed to force-end show')
      }
    } catch { alert('Network error') }
  }

  function exportCSV(type: 'shows' | 'songs' | 'detection') {
    let csv = ''
    let filename = ''

    if (type === 'shows') {
      filename = 'setlistr-shows.csv'
      csv = 'Date,Venue,City,Artist,Status,Submitted,Songs\n'
      performances.forEach(p => {
        const songCount = performanceSongs.filter(s => s.performance_id === p.id).length
        csv += `"${new Date(p.started_at).toLocaleDateString()}","${p.venue_name || ''}","${p.city || ''}","${p.artist_name || ''}","${p.status}","${p.submission_status || 'no'}","${songCount}"\n`
      })
    } else if (type === 'songs') {
      filename = 'setlistr-songs.csv'
      csv = 'Title,Artist,ISRC,Composer,Performance ID\n'
      performanceSongs.forEach(s => {
        csv += `"${s.title}","${s.artist}","${s.isrc || ''}","${s.composer || ''}","${s.performance_id}"\n`
      })
    } else {
      filename = 'setlistr-detection.csv'
      csv = 'Date,Title,Artist,Score,Confidence,Venue,Source\n'
      detectionEvents.forEach(e => {
        csv += `"${new Date(e.created_at).toLocaleString()}","${e.final_title || e.acr_title || ''}","${e.acr_artist || ''}","${e.acr_score}","${e.confidence_level || ''}","${e.venue_name || ''}","${e.final_source || ''}"\n`
      })
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  async function importSpotifyForArtist(userId: string, artistName: string) {
    const searchName = spotifyOverride[userId]?.trim() || artistName
    setSpotifyImporting(prev => ({ ...prev, [userId]: 'loading' }))
    try {
      const res = await fetch('/api/admin/spotify-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, artist_name: searchName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setSpotifyImporting(prev => ({ ...prev, [userId]: 'done' }))
      setTimeout(() => setSpotifyImporting(prev => ({ ...prev, [userId]: 'idle' })), 4000)
    } catch {
      setSpotifyImporting(prev => ({ ...prev, [userId]: 'error' }))
      setTimeout(() => setSpotifyImporting(prev => ({ ...prev, [userId]: 'idle' })), 3000)
    }
  }

  async function addBetaUser() {
    if (!newEmail.trim()) return
    setAddingUser(true)
    setAddError('')
    setAddSuccess('')
    try {
      const res = await fetch('/api/admin/beta-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), name: newName.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to add user')
      } else {
        setInvites(prev => [data.invite, ...prev])
        setNewEmail('')
        setNewName('')
        setAddSuccess(`${data.invite.email} ${data.email_sent ? '— invite email sent' : '— added (email not sent)'}`)
        setTimeout(() => setAddSuccess(''), 4000)
      }
    } catch {
      setAddError('Network error — try again')
    }
    setAddingUser(false)
  }

  async function removeBetaUser(id: string, email: string) {
    if (!confirm(`Remove access for ${email}?`)) return
    try {
      const res = await fetch('/api/admin/beta-invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setInvites(prev => prev.filter(i => i.id !== id))
      }
    } catch {}
  }

  async function assignDelegate() {
    if (!saArtistId.trim() || !saManagerId.trim()) return
    setSaAssigning(true); setSaAssignMsg('')
    try {
      const res = await fetch('/api/admin/assign-delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: saArtistId.trim(), delegate_id: saManagerId.trim() }),
      })
      const data = await res.json()
      setSaAssignMsg(data.success ? '✓ Delegate assigned' : '✗ ' + (data.error || 'Failed'))
    } catch { setSaAssignMsg('✗ Network error') }
    setSaAssigning(false)
  }

  async function preloadSetlist() {
    if (!saSetlistArtistId.trim() || !saSetlistSongs.trim()) return
    setSaSetlistLoading(true); setSaSetlistMsg('')
    const songs = saSetlistSongs.split('\n').map(s => s.trim()).filter(Boolean)
    try {
      const res = await fetch('/api/admin/preload-setlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: saSetlistArtistId.trim(), songs }),
      })
      const data = await res.json()
      setSaSetlistMsg(data.success ? `✓ ${data.count} songs added to catalog` : '✗ ' + (data.error || 'Failed'))
    } catch { setSaSetlistMsg('✗ Network error') }
    setSaSetlistLoading(false)
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', color: C.text }}>

      {/* ── Header ── */}
      <div style={{ padding: '28px 20px 0', maxWidth: 800, margin: '0 auto' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.gold + '99', margin: '0 0 4px' }}>
          Setlistr · Admin
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.025em' }}>
            Data Infrastructure
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'pulse-dot 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, color: C.secondary }}>Live</span>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 24 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding: '8px 16px', background: 'none', border: 'none',
                borderBottom: tab === t.id ? `2px solid ${C.gold}` : '2px solid transparent',
                color: tab === t.id ? C.gold : C.muted,
                fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', cursor: 'pointer',
                fontFamily: 'inherit', marginBottom: -1,
                transition: 'color 0.15s ease',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '0 20px 60px', maxWidth: 800, margin: '0 auto' }}>

        {/* ════════════════════════════ OVERVIEW ════════════════════════════ */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Top stat row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <Stat label="Total Shows"      value={perf.total}      sub={`${perf.live} live now`} />
              <Stat label="Songs Captured"   value={performanceSongs.length} sub={`across ${perf.total} shows`} />
              <Stat label="Detection Rate"   value={`${det.hitRate}%`} color={det.hitRate >= 90 ? C.green : det.hitRate >= 70 ? C.gold : C.red} sub={`${det.detected} of ${det.total} attempts`} />
              <Stat label="ISRC Coverage"    value={`${quality.isrcPct}%`} color={quality.isrcPct >= 70 ? C.green : C.gold} sub={`${quality.withIsrc} of ${quality.total} songs`} />
            </div>

            {/* Submission funnel */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 16px' }}>Submission Funnel</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Shows captured',  value: perf.total,     pct: 100,                                                             color: C.gold  },
                  { label: 'Shows completed', value: perf.completed, pct: perf.total > 0 ? (perf.completed / perf.total) * 100 : 0,       color: C.gold  },
                  { label: 'Submitted to PRO',value: perf.submitted, pct: perf.total > 0 ? (perf.submitted / perf.total) * 100 : 0,       color: C.green },
                ].map(row => (
                  <div key={row.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: C.secondary }}>{row.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace' }}>{row.value}</span>
                    </div>
                    <Bar pct={row.pct} color={row.color} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: C.muted, margin: '14px 0 0' }}>
                Submission rate: <span style={{ color: C.gold, fontWeight: 700 }}>{perf.submitRate}%</span> of completed shows submitted to PRO
              </p>
            </div>

            {/* Data quality */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 16px' }}>Song Data Quality</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'ISRC present',          value: quality.withIsrc, pct: quality.isrcPct,    color: C.green },
                  { label: 'Composer present',       value: quality.withComp, pct: quality.compPct,    color: C.gold  },
                  { label: 'Full match (ISRC + composer)', value: quality.withBoth, pct: quality.matchedPct, color: C.green },
                ].map(row => (
                  <div key={row.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: C.secondary }}>{row.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: '"DM Mono", monospace' }}>
                        {row.value} <span style={{ color: C.muted, fontWeight: 400 }}>({row.pct}%)</span>
                      </span>
                    </div>
                    <Bar pct={row.pct} color={row.color} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: C.muted, margin: '14px 0 0' }}>
                {quality.total} total songs across all performances
              </p>
            </div>

            {/* PRO distribution */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>PRO Distribution</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(() => {
                  const proCounts: Record<string, number> = {}
                  profiles.forEach(p => {
                    const pro = p.pro_affiliation || 'None'
                    proCounts[pro] = (proCounts[pro] || 0) + 1
                  })
                  return Object.entries(proCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([pro, count]) => (
                      <div key={pro} style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{pro}</span>
                        <span style={{ fontSize: 12, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{count}</span>
                      </div>
                    ))
                })()}
              </div>
            </div>

            {/* Export */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>Export Data</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  { type: 'shows' as const,     label: 'All Shows CSV'     },
                  { type: 'songs' as const,     label: 'All Songs CSV'     },
                  { type: 'detection' as const, label: 'Detection Log CSV' },
                ]).map(btn => (
                  <button key={btn.type} onClick={() => exportCSV(btn.type)}
                    style={{ padding: '8px 14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 8, color: C.gold, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em' }}>
                    ↓ {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>Recent Shows</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {localPerfs.slice(0, 20).map(p => {
                  const songCount = performanceSongs.filter(s => s.performance_id === p.id).length
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: songCount === 0 ? C.muted : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: songCount === 0 ? 'italic' : 'normal' }}>
                            {p.venue_name || '—'}
                          </p>
                          {songCount === 0 && (
                            <span style={{ fontSize: 9, color: C.muted, flexShrink: 0 }}>empty</span>
                          )}
                        </div>
                        <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>
                          {p.artist_name} · {p.city} · {songCount} song{songCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                          padding: '2px 7px', borderRadius: 4,
                          background: p.submission_status === 'submitted' ? 'rgba(74,222,128,0.1)' : p.status === 'live' ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.05)',
                          color: p.submission_status === 'submitted' ? C.green : p.status === 'live' ? C.gold : C.muted,
                        }}>
                          {p.submission_status === 'submitted' ? 'Submitted' : p.status === 'live' ? 'Live' : p.status}
                        </span>
                        <span style={{ fontSize: 11, color: C.muted }}>{timeAgo(p.started_at)}</span>
                        <button
                          onClick={() => deletePerformance(p.id, p.venue_name)}
                          style={{ background: 'none', border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 5, color: C.red, fontSize: 11, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit', opacity: 0.5, transition: 'opacity 0.15s ease', flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.5'}>
                          del
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════ DETECTION ════════════════════════════ */}
        {tab === 'detection' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <Stat label="Total Attempts" value={det.total}   sub={`${det.last24h} in last 24h`} />
              <Stat label="Hit Rate"       value={`${det.hitRate}%`} color={det.hitRate >= 90 ? C.green : det.hitRate >= 70 ? C.gold : C.red} sub={`${det.detected} detected`} />
              <Stat label="Avg ACR Score"  value={det.avgScore} color={det.avgScore >= 70 ? C.green : C.gold} sub="higher = more confident" />
              <Stat label="Missed"         value={det.missed}  color={C.red} sub={`${det.total - det.detected - det.missed} pending/other`} />
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { id: 'all',      label: `All (${det.total})`           },
                { id: 'detected', label: `Detected (${det.detected})`   },
                { id: 'missed',   label: `Missed (${det.missed})`        },
              ] as const).map(f => (
                <button key={f.id} onClick={() => setDetFilter(f.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                    fontFamily: 'inherit', border: `1px solid ${detFilter === f.id ? C.gold : C.border}`,
                    background: detFilter === f.id ? C.goldDim : 'transparent',
                    color: detFilter === f.id ? C.gold : C.muted,
                    transition: 'all 0.15s ease',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredEvents.slice(0, 100).map(e => {
                const isDetected  = e.auto_confirmed || e.confidence_level === 'auto' || e.confidence_level === 'suggest'
                const isExpanded  = expandedId === e.id
                const scoreColor  = e.acr_score >= 80 ? C.green : e.acr_score >= 55 ? C.gold : C.red
                return (
                  <div key={e.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
                      {/* Status dot */}
                      <div style={{ marginTop: 3, flexShrink: 0 }}>
                        <Dot color={isDetected ? C.green : C.red} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isDetected ? (
                          <>
                            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
                              {e.final_title || e.acr_title}
                            </p>
                            <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 6px' }}>{e.acr_artist}</p>
                          </>
                        ) : (
                          <p style={{ fontSize: 13, color: C.red, margin: '0 0 6px', fontWeight: 600 }}>No match</p>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          {e.venue_name && (
                            <span style={{ fontSize: 11, color: C.muted }}>📍 {e.venue_name}</span>
                          )}
                          {e.acr_score > 0 && (
                            <span style={{ fontSize: 11, color: scoreColor, fontFamily: '"DM Mono", monospace', fontWeight: 700 }}>
                              {e.acr_score}
                            </span>
                          )}
                          {e.final_source && (
                            <span style={{ fontSize: 11, color: C.muted }}>via {e.final_source}</span>
                          )}
                          {e.confidence_level && (
                            <span style={{ fontSize: 11, color: C.muted }}>{e.confidence_level}</span>
                          )}
                          <span style={{ fontSize: 11, color: C.muted }}>{timeAgo(e.created_at)}</span>
                        </div>
                      </div>

                      {/* Expand button */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : e.id)}
                        style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, flexShrink: 0, fontSize: 14 }}>
                        {isExpanded ? '▲' : '▼'}
                      </button>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px', background: C.bg }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                          {[
                            ['Performance ID', e.performance_id?.slice(0, 8) + '…'],
                            ['ACR Title',      e.acr_title || '—'],
                            ['ACR Artist',     e.acr_artist || '—'],
                            ['ACR Score',      e.acr_score?.toString() || '—'],
                            ['Confidence',     e.confidence_level || '—'],
                            ['Auto confirmed', e.auto_confirmed ? 'Yes' : 'No'],
                            ['Source',         e.final_source || '—'],
                            ['Time',           new Date(e.created_at).toLocaleString()],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <p style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 2px' }}>{k}</p>
                              <p style={{ fontSize: 12, color: C.secondary, margin: 0, fontFamily: '"DM Mono", monospace' }}>{v}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredEvents.length === 0 && (
                <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>No events</p>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════ ARTISTS ═════════════════════════════ */}
        {tab === 'artists' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 8 }}>
              <Stat label="Total Artists" value={profiles.length} />
              <Stat label="Active Artists" value={artists.filter(a => a.showCount > 0).length} sub="with at least 1 show" />
            </div>

            {artists.map(a => (
              <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>{a.name}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 10px' }}>
                      {a.pro !== '—' ? a.pro : 'No PRO set'} · Last show: {a.lastPerf ? timeAgo(a.lastPerf) : 'never'}
                    </p>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {[
                        { label: 'Shows',     value: a.showCount  },
                        { label: 'Songs',     value: a.songCount  },
                        { label: 'Submitted', value: a.submitted  },
                      ].map(s => (
                        <div key={s.label}>
                          <p style={{ fontSize: 18, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>{s.value}</p>
                          <p style={{ fontSize: 9, color: C.muted, margin: '1px 0 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    {a.submitted > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.green, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 6, padding: '3px 8px' }}>
                        Submitted
                      </span>
                    )}
                    {(() => {
                      const state = spotifyImporting[a.id] || 'idle'
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                            value={spotifyOverride[a.id] ?? ''}
                            onChange={e => setSpotifyOverride(prev => ({ ...prev, [a.id]: e.target.value }))}
                            placeholder={a.name}
                            title="Override artist name for Spotify search"
                            style={{ background: '#0f0e0c', border: '1px solid rgba(30,215,96,0.2)', borderRadius: 6, padding: '4px 8px', color: '#f0ece3', fontSize: 11, fontFamily: 'inherit', outline: 'none', width: '100%', textAlign: 'right', boxSizing: 'border-box' as const }}
                          />
                        <button
                          onClick={() => importSpotifyForArtist(a.id, a.name)}
                          disabled={state === 'loading'}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: state === 'done' ? 'rgba(74,222,128,0.08)' : state === 'error' ? 'rgba(248,113,113,0.08)' : 'rgba(30,215,96,0.08)', border: `1px solid ${state === 'done' ? 'rgba(74,222,128,0.25)' : state === 'error' ? 'rgba(248,113,113,0.25)' : 'rgba(30,215,96,0.2)'}`, borderRadius: 8, cursor: state === 'loading' ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: state === 'loading' ? 0.6 : 1, transition: 'all 0.2s ease' }}>
                          {state === 'loading'
                            ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(30,215,96,0.3)', borderTopColor: '#1ed760', animation: 'spin 0.8s linear infinite' }} />
                            : <svg width="10" height="10" viewBox="0 0 24 24" fill={state === 'done' ? C.green : state === 'error' ? C.red : '#1ed760'}><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>}
                          <span style={{ fontSize: 10, fontWeight: 700, color: state === 'done' ? C.green : state === 'error' ? C.red : '#1ed760' }}>
                            {state === 'loading' ? 'Importing...' : state === 'done' ? 'Imported ✓' : state === 'error' ? 'Failed' : 'Spotify'}
                          </span>
                        </button>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            ))}

            {artists.length === 0 && (
              <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>No artists yet</p>
            )}
          </div>
        )}

        {/* ════════════════════════════ SONGS ════════════════════════════════ */}
        {tab === 'songs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <Stat label="Unique Songs"   value={topSongs.length}        sub="across all artists" />
              <Stat label="Total Captures" value={performanceSongs.length} sub="song-performance pairs" />
            </div>

            {/* Search */}
            <input
              value={songSearch}
              onChange={e => setSongSearch(e.target.value)}
              placeholder="Search songs..."
              style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '11px 14px', color: C.text, fontSize: 14, outline: 'none',
                fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
              }}
            />

            {/* Song list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredSongs.map((s, i) => (
                <div key={s.title + s.artist} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: C.muted, minWidth: 24, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{s.artist}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {s.isrcCount > 0 && (
                      <span style={{ fontSize: 9, color: C.green, fontFamily: '"DM Mono", monospace', opacity: 0.7 }}>ISRC</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>×{s.count}</span>
                  </div>
                </div>
              ))}
              {filteredSongs.length === 0 && (
                <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>No songs found</p>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════ VENUES ════════════════════════════════ */}
        {tab === 'venues' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Stat label="Venues Captured" value={venues.length} sub="unique venues with shows" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {venues.map((v, i) => (
                <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <span style={{ fontSize: 11, color: C.muted, minWidth: 24, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{v.city} · Last show: {timeAgo(v.lastShow)}</p>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>
                    {v.showCount} {v.showCount === 1 ? 'show' : 'shows'}
                  </span>
                </div>
              ))}
              {venues.length === 0 && (
                <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>No venues yet</p>
              )}
            </div>
          </div>
        )}
      </div>

        {/* ════════════════════════════ SHOWS ═════════════════════════════ */}
        {tab === 'shows' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <Stat label="Total Shows"    value={localPerfs.length} />
              <Stat label="With Songs"     value={localPerfs.filter(p => {
                const count = performanceSongs.filter(s => s.performance_id === p.id).length
                return count > 0
              }).length} color={C.green} sub="non-empty shows" />
            </div>

            {/* Filter hint */}
            <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 12, color: '#f87171', margin: 0 }}>
                🔒 Admin only — delete removes show, songs, and detection events permanently. Use for test data cleanup only.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {localPerfs.map(p => {
                const songCount = performanceSongs.filter(s => s.performance_id === p.id).length
                const isEmpty   = songCount === 0
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: isEmpty ? 'rgba(248,113,113,0.04)' : C.card, border: `1px solid ${isEmpty ? 'rgba(248,113,113,0.15)' : C.border}`, borderRadius: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: isEmpty ? '#f87171' : C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.venue_name || 'Unknown venue'}
                        {isEmpty && <span style={{ fontSize: 10, marginLeft: 8, opacity: 0.7 }}>empty</span>}
                      </p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>
                        {p.artist_name} · {p.city} · {timeAgo(p.started_at)} · {songCount} song{songCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 4,
                        background: p.submission_status === 'submitted' ? 'rgba(74,222,128,0.1)' : p.status === 'live' ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.05)',
                        color: p.submission_status === 'submitted' ? C.green : p.status === 'live' ? C.gold : C.muted,
                      }}>
                        {p.submission_status === 'submitted' ? 'Submitted' : p.status}
                      </span>
                      {p.status === 'live' && (
                        <button
                          onClick={() => forceEndShow(p.id)}
                          style={{ background: 'rgba(201,168,76,0.1)', border: `1px solid rgba(201,168,76,0.3)`, borderRadius: 6, color: C.gold, fontSize: 10, cursor: 'pointer', padding: '3px 8px', fontFamily: 'inherit', flexShrink: 0 }}>
                          End
                        </button>
                      )}
                      <button
                        onClick={() => deleteShow(p.id)}
                        style={{ background: 'none', border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 6, color: '#f87171', fontSize: 11, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit', opacity: 0.6, transition: 'opacity 0.15s ease', flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.6'}>
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
              {localPerfs.length === 0 && (
                <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>No shows yet</p>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════ BETA USERS ══════════════════════════ */}
        {tab === 'beta' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <Stat label="Total Invited" value={invites.length} />
              <Stat label="Accepted"      value={invites.filter(i => i.accepted_at).length} color={C.green} sub="signed up" />
              <Stat label="Pending"       value={invites.filter(i => !i.accepted_at).length} color={C.amber} sub="not yet" />
            </div>

            {/* Signup link */}
            <div style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.25)`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: '0 0 3px' }}>Share this link</p>
                <p style={{ fontSize: 12, color: C.secondary, margin: 0, fontFamily: '"DM Mono", monospace' }}>setlistr.ai/auth/login</p>
              </div>
              <button onClick={() => navigator.clipboard.writeText(window.location.origin + '/auth/login')}
                style={{ padding: '8px 14px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                Copy
              </button>
            </div>

            {/* Add user form */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>Add Beta Artist</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (optional)"
                    style={{ flex: 1, background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                  <input value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBetaUser()} placeholder="email@example.com" type="email"
                    style={{ flex: 2, background: '#0f0e0c', border: `1px solid ${newEmail.trim() ? 'rgba(201,168,76,0.3)' : C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
                </div>
                {addError && <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{addError}</p>}
                {addSuccess && <p style={{ fontSize: 12, color: C.green, margin: 0 }}>✓ {addSuccess}</p>}
                <button onClick={addBetaUser} disabled={addingUser || !newEmail.trim()}
                  style={{ padding: '11px', background: newEmail.trim() ? C.gold : C.muted, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: addingUser || !newEmail.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: addingUser ? 0.7 : newEmail.trim() ? 1 : 0.4 }}>
                  {addingUser ? 'Adding...' : 'Add to Beta'}
                </button>
              </div>
            </div>

            {/* Pending */}
            {invites.filter(i => !i.accepted_at).length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Pending · {invites.filter(i => !i.accepted_at).length}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {invites.filter(i => !i.accepted_at).map(invite => (
                    <div key={invite.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {invite.name && <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 1px' }}>{invite.name}</p>}
                        <p style={{ fontSize: invite.name ? 12 : 13, color: invite.name ? C.muted : C.text, margin: 0 }}>{invite.email}</p>
                        <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>Added {timeAgo(invite.created_at)}</p>
                      </div>
                      <button onClick={() => removeBetaUser(invite.id, invite.email)}
                        style={{ background: 'none', border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 6, color: C.red, fontSize: 11, cursor: 'pointer', padding: '4px 10px', fontFamily: 'inherit', opacity: 0.5, flexShrink: 0 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.5'}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accepted */}
            {invites.filter(i => i.accepted_at).length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Accepted · {invites.filter(i => i.accepted_at).length}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {invites.filter(i => i.accepted_at).map(invite => (
                    <div key={invite.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: C.card, border: `1px solid rgba(74,222,128,0.12)`, borderRadius: 10 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, flexShrink: 0, opacity: 0.7 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {invite.name && <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 1px' }}>{invite.name}</p>}
                        <p style={{ fontSize: invite.name ? 12 : 13, color: invite.name ? C.muted : C.text, margin: 0 }}>{invite.email}</p>
                        <p style={{ fontSize: 11, color: C.green, margin: '2px 0 0', opacity: 0.7 }}>Joined {timeAgo(invite.accepted_at!)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {invites.length === 0 && (
              <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>No beta artists yet</p>
            )}
          </div>
        )}

        {/* ════════════════════════════ SUPERADMIN ════════════════════════════ */}
        {tab === 'superadmin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Warning */}
            <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 12, padding: '12px 16px' }}>
              <p style={{ fontSize: 12, color: C.red, margin: 0, fontWeight: 700 }}>⚡ Superadmin — for founder use only. These actions bypass normal auth flows.</p>
            </div>

            {/* Profile lookup reference */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>Artist Profile IDs</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {artists.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{a.pro}</span>
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(a.id)}
                      style={{ fontSize: 10, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      {a.id.slice(0, 8)}… copy
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Assign delegate */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Assign Manager Access</p>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 14px' }}>Skips the invite/accept flow. Instantly gives delegate_id manager access to artist_id.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={saArtistId} onChange={e => setSaArtistId(e.target.value)} placeholder="Artist user_id (the account being managed)"
                  style={{ background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', fontFamily: '"DM Mono", monospace' }} />
                <input value={saManagerId} onChange={e => setSaManagerId(e.target.value)} placeholder="Manager user_id (Daryl's ID)"
                  style={{ background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', fontFamily: '"DM Mono", monospace' }} />
                {saAssignMsg && <p style={{ fontSize: 12, color: saAssignMsg.startsWith('✓') ? C.green : C.red, margin: 0 }}>{saAssignMsg}</p>}
                <button onClick={assignDelegate} disabled={saAssigning || !saArtistId.trim() || !saManagerId.trim()}
                  style={{ padding: '11px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', opacity: saAssigning ? 0.7 : 1 }}>
                  {saAssigning ? 'Assigning...' : 'Assign Manager Access'}
                </button>
              </div>
            </div>

            {/* Preload setlist / song catalog */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Preload Song Catalog</p>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 14px' }}>Adds songs to an artist's user_songs catalog so they appear in quick-add during capture. One song per line.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={saSetlistArtistId} onChange={e => setSaSetlistArtistId(e.target.value)} placeholder="Artist user_id"
                  style={{ background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', fontFamily: '"DM Mono", monospace' }} />
                <textarea value={saSetlistSongs} onChange={e => setSaSetlistSongs(e.target.value)} placeholder={"Song Title One\nSong Title Two\nSong Title Three"}
                  rows={8}
                  style={{ background: '#0f0e0c', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.6 }} />
                {saSetlistMsg && <p style={{ fontSize: 12, color: saSetlistMsg.startsWith('✓') ? C.green : C.red, margin: 0 }}>{saSetlistMsg}</p>}
                <button onClick={preloadSetlist} disabled={saSetlistLoading || !saSetlistArtistId.trim() || !saSetlistSongs.trim()}
                  style={{ padding: '11px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', opacity: saSetlistLoading ? 0.7 : 1 }}>
                  {saSetlistLoading ? 'Loading...' : 'Preload Songs'}
                </button>
              </div>
            </div>

          </div>
        )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
        * { box-sizing: border-box; }
        input::placeholder { color: #5a5040; }
        input:focus { border-color: rgba(201,168,76,0.3) !important; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
