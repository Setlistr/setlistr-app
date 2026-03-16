'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Calendar, ArrowRight, Music4, Music2, RefreshCw, Check } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', red: '#dc2626',
  green: '#4ade80',
}

type PastPerformance = {
  id: string
  venue_name: string
  artist_name: string
  started_at: string
  song_count: number
}

export default function NewShowPage() {
  const router = useRouter()

  // ── New show state ──────────────────────────────────────────────────────────
  const [name, setName]                 = useState('')
  const [showType, setShowType]         = useState<'single' | 'writers_round'>('single')
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledAt, setScheduledAt]   = useState(new Date().toISOString().slice(0, 16))
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')

  // ── Reuse setlist state ─────────────────────────────────────────────────────
  const [showReuse, setShowReuse]               = useState(false)
  const [pastPerfs, setPastPerfs]               = useState<PastPerformance[]>([])
  const [pastLoading, setPastLoading]           = useState(false)
  const [selectedPast, setSelectedPast]         = useState<PastPerformance | null>(null)
  const [cloning, setCloning]                   = useState(false)

  const isValid = name.trim().length > 0

  // ── Load past performances when reuse panel opens ───────────────────────────
  useEffect(() => {
    if (!showReuse || pastPerfs.length > 0) return
    setPastLoading(true)

    const supabase = createClient()

    async function loadPast() {
      // Load recent completed performances
      const { data: perfs } = await supabase
        .from('performances')
        .select('id, venue_name, artist_name, started_at')
        .in('status', ['review', 'complete', 'completed', 'exported'])
        .order('started_at', { ascending: false })
        .limit(10)

      if (!perfs) { setPastLoading(false); return }

      // Get song counts for each performance
      const { data: songs } = await supabase
        .from('performance_songs')
        .select('performance_id')
        .in('performance_id', perfs.map(p => p.id))

      const countMap: Record<string, number> = {}
      songs?.forEach(s => {
        countMap[s.performance_id] = (countMap[s.performance_id] || 0) + 1
      })

      const mapped = perfs
        .map(p => ({
          id: p.id,
          venue_name: p.venue_name,
          artist_name: p.artist_name,
          started_at: p.started_at,
          song_count: countMap[p.id] || 0,
        }))
        // Only show performances that actually have songs
        .filter(p => p.song_count > 0)

      setPastPerfs(mapped)
      setPastLoading(false)
    }

    loadPast()
  }, [showReuse])

  // ── Create a fresh show + performance and go live ───────────────────────────
  async function handleSubmit() {
    if (!isValid || loading) return
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const scheduledIso = showSchedule && scheduledAt
        ? new Date(scheduledAt).toISOString()
        : null

      const { data: show, error: showError } = await supabase
        .from('shows')
        .insert({
          name: name.trim(),
          show_type: showType,
          scheduled_at: scheduledIso,
          started_at: new Date().toISOString(),
          status: 'live',
          created_by: user?.id || null,
        })
        .select()
        .single()

      if (showError) throw showError

      const { data: performance, error: perfError } = await supabase
        .from('performances')
        .insert({
          show_id: show.id,
          performance_date: scheduledIso || new Date().toISOString(),
          artist_name: name.trim(),
          venue_name: name.trim(),
          city: '', country: '',
          status: 'live',
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

  // ── Clone a past performance's songs into a new performance ─────────────────
  async function handleClone() {
    if (!selectedPast || !isValid || cloning) return
    setCloning(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const scheduledIso = showSchedule && scheduledAt
        ? new Date(scheduledAt).toISOString()
        : null

      // 1. Create the show
      const { data: show, error: showError } = await supabase
        .from('shows')
        .insert({
          name: name.trim(),
          show_type: showType,
          scheduled_at: scheduledIso,
          started_at: new Date().toISOString(),
          status: 'completed',
          created_by: user?.id || null,
        })
        .select()
        .single()

      if (showError) throw showError

      // 2. Create the performance
      const { data: performance, error: perfError } = await supabase
        .from('performances')
        .insert({
          show_id: show.id,
          performance_date: scheduledIso || new Date().toISOString(),
          artist_name: name.trim(),
          venue_name: name.trim(),
          city: '', country: '',
          status: 'review',
          set_duration_minutes: 60,
          auto_close_buffer_minutes: 5,
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          user_id: user?.id || null,
        })
        .select()
        .single()

      if (perfError) throw perfError

      // 3. Fetch songs from the selected past performance (ordered by position)
      const { data: sourceSongs, error: songsError } = await supabase
        .from('performance_songs')
        .select('title, artist, position')
        .eq('performance_id', selectedPast.id)
        .order('position', { ascending: true })

      if (songsError) throw songsError

      // 4. Insert cloned songs into new performance
      if (sourceSongs && sourceSongs.length > 0) {
        const { error: insertError } = await supabase
          .from('performance_songs')
          .insert(
            sourceSongs.map((s, i) => ({
              performance_id: performance.id,
              title: s.title,
              artist: s.artist,
              position: s.position || i + 1,
            }))
          )

        if (insertError) throw insertError
      }

      // 5. Go straight to review so user can confirm/edit before export
      router.push(`/app/review/${performance.id}`)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
      setCloning(false)
    }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)',
      }} />

      <div style={{
        width: '100%', maxWidth: 440, position: 'relative', zIndex: 1,
        animation: 'fadeUp 0.4s ease',
      }}>

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
            <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, margin: 0, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Setlistr
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>New Show</p>
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.025em' }}>
          Set up your show
        </h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 28px' }}>
          Fill in the details below to begin live capture.
        </p>

        {/* ── Main form card ── */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '24px',
          display: 'flex', flexDirection: 'column', gap: 20,
          marginBottom: 16,
        }}>

          {/* Show Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: C.muted,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Building2 size={10} />
              Show Name
              <span style={{ color: C.gold }}>*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Massey Hall, Jesse's House..."
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{
                background: C.input,
                border: `1px solid ${name.trim() ? C.borderGold : C.border}`,
                borderRadius: 10, padding: '13px 14px',
                color: C.text, fontSize: 15, fontFamily: 'inherit',
                width: '100%', transition: 'border-color 0.15s ease',
              }}
            />
          </div>

          {/* Show Type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: C.muted,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <Music2 size={10} />
              Show Type
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['single', 'writers_round'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setShowType(type)}
                  type="button"
                  style={{
                    flex: 1, padding: '10px',
                    background: showType === type ? C.goldDim : 'transparent',
                    border: `1px solid ${showType === type ? C.borderGold : C.border}`,
                    borderRadius: 10,
                    color: showType === type ? C.gold : C.secondary,
                    fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  {type === 'single' ? 'Single Artist' : "Writer's Round"}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule — hidden by default */}
          {showSchedule && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'slideUp 0.2s ease' }}>
              <label style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: C.muted,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <Calendar size={10} />
                Scheduled Time
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                style={{
                  background: C.input,
                  border: `1px solid ${scheduledAt ? C.borderGold : C.border}`,
                  borderRadius: 10, padding: '12px 14px',
                  color: C.text, fontSize: 14, fontFamily: 'inherit',
                  width: '100%', colorScheme: 'dark',
                }}
              />
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 10, padding: '12px 14px', marginBottom: 14,
            animation: 'fadeIn 0.2s ease',
          }}>
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* ── Primary CTA ── */}
        {!showReuse && (
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
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid #0a090840', borderTopColor: '#0a0908',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Starting...
              </>
            ) : (
              <>
                Start Now
                <ArrowRight size={15} strokeWidth={2.5} />
              </>
            )}
          </button>
        )}

        {/* ── Reuse Setlist toggle ── */}
        <button
          onClick={() => { setShowReuse(v => !v); setSelectedPast(null) }}
          style={{
            width: '100%', padding: '11px 16px',
            background: showReuse ? C.goldDim : 'transparent',
            border: `1px solid ${showReuse ? C.borderGold : C.border}`,
            borderRadius: 10,
            color: showReuse ? C.gold : C.muted,
            fontSize: 12, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'inherit',
            marginTop: showReuse ? 0 : 10,
          }}
        >
          <RefreshCw size={12} />
          {showReuse ? 'Cancel' : 'Reuse a Previous Setlist'}
        </button>

        {/* ── Past performances list ── */}
        {showReuse && (
          <div style={{ animation: 'slideUp 0.2s ease', marginTop: 10 }}>
            {pastLoading ? (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '24px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${C.border}`, borderTopColor: C.gold,
                  animation: 'spin 0.7s linear infinite',
                }} />
              </div>
            ) : pastPerfs.length === 0 ? (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: '20px', textAlign: 'center',
              }}>
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
                  No past performances with songs yet.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: C.muted, margin: '0 0 4px',
                }}>
                  Select a set to reuse
                </p>
                {pastPerfs.map(perf => {
                  const isSelected = selectedPast?.id === perf.id
                  return (
                    <button
                      key={perf.id}
                      onClick={() => setSelectedPast(isSelected ? null : perf)}
                      style={{
                        background: isSelected ? C.goldDim : C.card,
                        border: `1px solid ${isSelected ? C.borderGold : C.border}`,
                        borderRadius: 10, padding: '12px 14px',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.15s ease', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.cardHover
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.card
                      }}
                    >
                      {/* Check indicator */}
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: isSelected ? C.gold : 'transparent',
                        border: `1px solid ${isSelected ? C.gold : C.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}>
                        {isSelected && <Check size={11} color="#0a0908" strokeWidth={3} />}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 13, fontWeight: 600,
                          color: isSelected ? C.gold : C.text,
                          margin: 0, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {perf.venue_name}
                        </p>
                        <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0' }}>
                          {perf.artist_name} · {formatDate(perf.started_at)}
                        </p>
                      </div>

                      {/* Song count */}
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: isSelected ? C.gold : C.muted,
                        flexShrink: 0,
                      }}>
                        {perf.song_count} songs
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Clone CTA — only shown when a past perf is selected */}
            {selectedPast && (
              <div style={{ marginTop: 12, animation: 'slideUp 0.15s ease' }}>
                <button
                  onClick={handleClone}
                  disabled={!isValid || cloning}
                  style={{
                    width: '100%', padding: '15px',
                    background: isValid ? C.gold : C.muted,
                    border: 'none', borderRadius: 12,
                    color: '#0a0908', fontSize: 13, fontWeight: 800,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: isValid && !cloning ? 'pointer' : 'not-allowed',
                    opacity: cloning ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit',
                  }}
                >
                  {cloning ? (
                    <>
                      <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: '2px solid #0a090840', borderTopColor: '#0a0908',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      Cloning Setlist...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      Clone {selectedPast.song_count} Songs → Review
                    </>
                  )}
                </button>
                {!isValid && (
                  <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '8px 0 0' }}>
                    Enter a show name above first
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Schedule toggle */}
        <button
          onClick={() => setShowSchedule(v => !v)}
          style={{
            background: 'none', border: 'none',
            color: showSchedule ? C.gold : C.muted,
            fontSize: 12, cursor: 'pointer',
            letterSpacing: '0.04em', fontFamily: 'inherit',
            padding: '12px', width: '100%', marginTop: 4,
            transition: 'color 0.15s ease',
          }}
        >
          {showSchedule ? '× Cancel scheduling' : '+ Schedule for later'}
        </button>

        {/* Back */}
        <button
          onClick={() => router.push('/app/dashboard')}
          style={{
            background: 'none', border: 'none', color: C.muted,
            fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em',
            fontFamily: 'inherit', padding: '4px', width: '100%',
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
        input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </div>
  )
}
