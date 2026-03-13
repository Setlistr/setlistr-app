'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Search, ChevronLeft, Music2 } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.1)',
}

type Performance = {
  id: string
  venue_name: string
  artist_name: string
  city: string
  country: string
  status: string
  started_at: string
  created_at: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  live:      { label: 'Live',         color: C.red },
  pending:   { label: 'Live',         color: C.red },
  review:    { label: 'Needs Review', color: C.blue },
  complete:  { label: 'Completed',    color: C.green },
  completed: { label: 'Completed',    color: C.green },
  exported:  { label: 'Exported',     color: C.green },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function HistoryPage() {
  const router = useRouter()
  const [performances, setPerformances] = useState<Performance[]>([])
  const [filtered, setFiltered]         = useState<Performance[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [showFilters, setShowFilters]   = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('performances')
      .select('id, venue_name, artist_name, city, country, status, started_at, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('History error:', error)
        if (data) {
          setPerformances(data)
          setFiltered(data)
        }
        setLoading(false)
      })
  }, [])

  // ── Filter logic ─────────────────────────────────────────────────────────
  useEffect(() => {
    let result = [...performances]

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.venue_name?.toLowerCase().includes(q) ||
        p.artist_name?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      )
    }

    if (dateFrom) {
      result = result.filter(p => (p.started_at || p.created_at) >= dateFrom)
    }
    if (dateTo) {
      result = result.filter(p => (p.started_at || p.created_at) <= dateTo + 'T23:59:59')
    }

    setFiltered(result)
  }, [search, dateFrom, dateTo, performances])

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  function navigateTo(p: Performance) {
    if (p.status === 'live' || p.status === 'pending') {
      router.push(`/app/live/${p.id}`)
    } else {
      router.push(`/app/review/${p.id}`)
    }
  }

  const hasFilters = search || dateFrom || dateTo

  if (loading) {
    return (
      <div style={{
        minHeight: '100svh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: `1.5px solid ${C.gold}`,
            animation: 'breathe 1.8s ease-in-out infinite',
          }} />
          <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            Loading
          </span>
        </div>
        <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '120vw', height: '40vh', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)',
      }} />

      <div style={{
        maxWidth: 600, margin: '0 auto', padding: '0 16px',
        position: 'relative', zIndex: 1,
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '20px 0 24px', animation: 'fadeUp 0.3s ease',
        }}>
          <button
            onClick={() => router.push('/app/dashboard')}
            style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '7px 10px',
              color: C.secondary, cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
            }}
          >
            <ChevronLeft size={14} /> Back
          </button>

          <h1 style={{
            fontSize: 20, fontWeight: 800, color: C.text,
            margin: 0, letterSpacing: '-0.02em', flex: 1,
          }}>
            Performance History
          </h1>

          <div style={{
            fontSize: 11, color: C.muted,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 20, padding: '5px 10px',
          }}>
            {performances.length} shows
          </div>
        </div>

        {/* ── Search ── */}
        <div style={{ animation: 'fadeUp 0.35s ease', marginBottom: 12 }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} style={{
              position: 'absolute', left: 12, top: '50%',
              transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none',
            }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search venue, artist, or city..."
              style={{
                width: '100%', background: C.card,
                border: `1px solid ${search ? C.borderGold : C.border}`,
                borderRadius: 10, padding: '11px 14px 11px 36px',
                color: C.text, fontSize: 14, fontFamily: 'inherit',
                transition: 'border-color 0.15s ease',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Filter row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                background: showFilters ? C.goldDim : 'transparent',
                border: `1px solid ${showFilters ? C.borderGold : C.border}`,
                borderRadius: 8, padding: '7px 12px',
                color: showFilters ? C.gold : C.muted,
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                fontFamily: 'inherit', transition: 'all 0.15s ease',
              }}
            >
              Date Range {showFilters ? '▲' : '▼'}
            </button>

            {hasFilters && (
              <button
                onClick={clearFilters}
                style={{
                  background: 'none', border: 'none', color: C.muted,
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Clear ×
              </button>
            )}

            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Date inputs */}
          {showFilters && (
            <div style={{
              display: 'flex', gap: 10, marginTop: 10,
              animation: 'slideUp 0.15s ease',
            }}>
              {[
                { label: 'From', value: dateFrom, set: setDateFrom },
                { label: 'To',   value: dateTo,   set: setDateTo },
              ].map(({ label, value, set }) => (
                <div key={label} style={{ flex: 1 }}>
                  <label style={{
                    fontSize: 10, color: C.muted, display: 'block', marginBottom: 5,
                    letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700,
                  }}>{label}</label>
                  <input
                    type="date" value={value}
                    onChange={e => set(e.target.value)}
                    style={{
                      width: '100%', background: C.input,
                      border: `1px solid ${value ? C.borderGold : C.border}`,
                      borderRadius: 8, padding: '9px 12px',
                      color: C.text, fontSize: 13, fontFamily: 'inherit',
                      colorScheme: 'dark', boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── List ── */}
        <div style={{ paddingBottom: 48, animation: 'fadeUp 0.4s ease' }}>

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '52px 20px', textAlign: 'center',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: C.goldDim, border: `1px solid ${C.borderGold}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <Music2 size={20} color={C.gold} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
                {hasFilters ? 'No shows match your filters' : 'No past performances yet'}
              </p>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
                {hasFilters ? 'Try adjusting your search' : 'Completed shows will appear here'}
              </p>
              {!hasFilters && (
                <button
                  onClick={() => router.push('/app/show/new')}
                  style={{
                    background: C.goldDim, border: `1px solid ${C.borderGold}`,
                    borderRadius: 10, padding: '10px 20px',
                    color: C.gold, fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', letterSpacing: '0.06em',
                    textTransform: 'uppercase', fontFamily: 'inherit',
                  }}
                >
                  Start First Show
                </button>
              )}
            </div>
          )}

          {/* Rows */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((perf, i) => {
                const status  = STATUS_LABEL[perf.status] || STATUS_LABEL.review
                const dateStr = perf.started_at || perf.created_at

                return (
                  <button
                    key={perf.id}
                    onClick={() => navigateTo(perf)}
                    style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 12, padding: '14px 16px',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.12s ease, border-color 0.12s ease',
                      display: 'flex', alignItems: 'center', gap: 12,
                      fontFamily: 'inherit',
                      animation: `fadeUp ${0.4 + i * 0.03}s ease`,
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = C.cardHover
                      el.style.borderColor = 'rgba(255,255,255,0.11)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = C.card
                      el.style.borderColor = C.border
                    }}
                  >
                    {/* Date block */}
                    <div style={{ minWidth: 36, textAlign: 'center', flexShrink: 0 }}>
                      <p style={{
                        fontSize: 17, fontWeight: 800, color: C.text, margin: 0,
                        fontFamily: '"DM Mono", monospace', lineHeight: 1,
                      }}>
                        {new Date(dateStr).getDate()}
                      </p>
                      <p style={{
                        fontSize: 9, color: C.muted, margin: '2px 0 0',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                      }}>
                        {new Date(dateStr).toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                    </div>

                    <div style={{ width: 1, height: 30, background: C.border, flexShrink: 0 }} />

                    {/* Venue + artist */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 14, fontWeight: 600, color: C.text,
                        margin: '0 0 2px', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {perf.venue_name}
                      </p>
                      <p style={{ fontSize: 11, color: C.secondary, margin: 0 }}>
                        {perf.artist_name}
                        {perf.city ? ` · ${perf.city}` : ''}
                        {perf.country ? `, ${perf.country}` : ''}
                      </p>
                    </div>

                    {/* Status */}
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      textTransform: 'uppercase', flexShrink: 0,
                      color: status.color,
                      background: status.color + '18',
                      border: `1px solid ${status.color}35`,
                      borderRadius: 20, padding: '3px 8px',
                    }}>
                      {status.label}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(5px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; outline: none; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
      `}</style>
    </div>
  )
}
