'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, ArrowRight, Music4, MapPin, Calendar, Clock, ChevronRight, TrendingUp, Mic } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
}

type Show = {
  id: string
  artist: string
  venue: string
  city: string
  date: string
  status: 'draft' | 'reviewed' | 'exported' | 'completed'
  song_count: number
  created_at: string
  // joined from performances
  performance_id?: string
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'In Progress', color: C.gold,      bg: C.goldDim },
  reviewed:  { label: 'Reviewed',    color: '#60a5fa',   bg: 'rgba(96,165,250,0.1)' },
  exported:  { label: 'Exported',    color: C.green,     bg: C.greenDim },
  completed: { label: 'Completed',   color: C.green,     bg: C.greenDim },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function DashboardPage() {
  const router = useRouter()
  const [shows, setShows]             = useState<Show[]>([])
  const [loading, setLoading]         = useState(true)
  const [draftShow, setDraftShow]     = useState<Show | null>(null)
  const [totalShows, setTotalShows]   = useState(0)
  const [totalSongs, setTotalSongs]   = useState(0)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      // Fetch shows with linked performance_id
      const { data: showData } = await supabase
        .from('shows')
        .select(`
          id, artist, venue, city, date, status, song_count, created_at,
          performances(id)
        `)
        .order('created_at', { ascending: false })
        .limit(20)

      if (showData) {
        const mapped: Show[] = showData.map((s: any) => ({
          ...s,
          performance_id: s.performances?.[0]?.id || null,
        }))

        setShows(mapped)
        setTotalShows(mapped.length)
        setTotalSongs(mapped.reduce((acc, s) => acc + (s.song_count || 0), 0))

        // Most recent draft = resume candidate
        const draft = mapped.find(s => s.status === 'draft')
        setDraftShow(draft || null)
      }

      setLoading(false)
    }

    load()
  }, [])

  // Placeholder royalty math — ~$1.65/song average across PROs
  const estimatedRoyalties = Math.round(totalSongs * 1.65)

  function navigateToShow(show: Show) {
    if (show.status === 'draft' && show.performance_id) {
      router.push(`/app/live/${show.performance_id}`)
    } else if (show.performance_id) {
      router.push(`/app/review/${show.performance_id}`)
    }
  }

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
        <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }`}</style>
      </div>
    )
  }

  const recentShows = shows.slice(0, 5)

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '120vw', height: '45vh', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)',
      }} />

      <div style={{
        maxWidth: 520, margin: '0 auto', padding: '0 16px',
        position: 'relative', zIndex: 1,
      }}>

        {/* ── Top nav ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 0 28px',
          animation: 'fadeUp 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: C.goldDim, border: `1px solid ${C.borderGold}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Music4 size={14} color={C.gold} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>
              Setlistr
            </span>
          </div>
          <button
            onClick={() => router.push('/app/history')}
            style={{
              background: 'none', border: 'none', color: C.muted,
              fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em',
              fontFamily: 'inherit',
            }}
          >
            History →
          </button>
        </div>

        {/* ── Hero CTA ── */}
        <div style={{ animation: 'fadeUp 0.35s ease', marginBottom: 20 }}>
          <h1 style={{
            fontSize: 32, fontWeight: 800, color: C.text,
            margin: '0 0 6px', letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            Ready to<br />
            <span style={{ color: C.gold }}>go live?</span>
          </h1>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 22px' }}>
            Capture your setlist in real time.
          </p>

          <button
            onClick={() => router.push('/app/show/new')}
            style={{
              width: '100%', padding: '16px',
              background: C.gold, border: 'none', borderRadius: 14,
              color: '#0a0908', fontSize: 14, fontWeight: 800,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'opacity 0.15s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
          >
            <Plus size={16} strokeWidth={2.5} />
            Start New Show
          </button>
        </div>

        {/* ── Resume draft ── */}
        {draftShow && (
          <div style={{ animation: 'fadeUp 0.4s ease', marginBottom: 20 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.muted, margin: '0 0 8px',
            }}>
              Resume
            </p>
            <button
              onClick={() => navigateToShow(draftShow)}
              style={{
                width: '100%', background: C.card,
                border: `1px solid ${C.borderGold}`,
                borderRadius: 14, padding: '16px',
                cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.15s ease', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHover}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.card}
            >
              {/* Pulsing live dot */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: C.goldDim, border: `1px solid ${C.borderGold}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', background: C.gold,
                  animation: 'pulse-dot 1.4s ease-in-out infinite',
                }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 3px' }}>
                  {draftShow.venue}
                </p>
                <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>
                  {draftShow.artist} · {formatDate(draftShow.date)}
                  {draftShow.song_count > 0 && ` · ${draftShow.song_count} songs`}
                </p>
              </div>

              <div style={{
                background: C.goldDim, border: `1px solid ${C.borderGold}`,
                borderRadius: 8, padding: '6px 10px',
                fontSize: 11, fontWeight: 700, color: C.gold,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                flexShrink: 0,
              }}>
                Continue →
              </div>
            </button>
          </div>
        )}

        {/* ── Stats row ── */}
        {totalShows > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 10, marginBottom: 20,
            animation: 'fadeUp 0.45s ease',
          }}>
            {/* Royalty estimate */}
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '16px',
              gridColumn: '1 / -1',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: C.muted, margin: '0 0 8px',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}>
                    <TrendingUp size={10} />
                    Royalty Estimate
                  </p>
                  <p style={{
                    fontSize: 30, fontWeight: 800, color: C.gold,
                    margin: 0, fontFamily: '"DM Mono", monospace',
                    letterSpacing: '-0.02em',
                  }}>
                    ${estimatedRoyalties.toLocaleString()}
                  </p>
                  <p style={{ fontSize: 12, color: C.secondary, margin: '4px 0 0' }}>
                    estimated from {totalSongs} songs across {totalShows} show{totalShows !== 1 ? 's' : ''}
                  </p>
                </div>
                <div style={{
                  fontSize: 9, color: C.muted, letterSpacing: '0.06em',
                  textTransform: 'uppercase', textAlign: 'right', lineHeight: 1.5,
                  maxWidth: 80,
                }}>
                  Avg<br />$1.65/<br />song
                </div>
              </div>
            </div>

            {/* Total shows */}
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '14px',
            }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: C.muted, margin: '0 0 6px',
              }}>Shows</p>
              <p style={{
                fontSize: 26, fontWeight: 800, color: C.text, margin: 0,
                fontFamily: '"DM Mono", monospace',
              }}>{totalShows}</p>
            </div>

            {/* Total songs */}
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '14px',
            }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: C.muted, margin: '0 0 6px',
              }}>Songs Logged</p>
              <p style={{
                fontSize: 26, fontWeight: 800, color: C.text, margin: 0,
                fontFamily: '"DM Mono", monospace',
              }}>{totalSongs}</p>
            </div>
          </div>
        )}

        {/* ── Recent shows ── */}
        <div style={{ animation: 'fadeUp 0.5s ease', paddingBottom: 48 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: C.muted, margin: 0,
            }}>
              Recent Shows
            </p>
            {shows.length > 5 && (
              <button
                onClick={() => router.push('/app/history')}
                style={{
                  background: 'none', border: 'none', color: C.muted,
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  letterSpacing: '0.04em',
                }}
              >
                View all →
              </button>
            )}
          </div>

          {/* Empty state */}
          {recentShows.length === 0 && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: '40px 20px',
              textAlign: 'center',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: C.goldDim, border: `1px solid ${C.borderGold}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 14px',
              }}>
                <Mic size={20} color={C.gold} />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
                No shows recorded yet
              </p>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 18px' }}>
                Start your first live capture
              </p>
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
                Start Now
              </button>
            </div>
          )}

          {/* Show list */}
          {recentShows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentShows.map((show, i) => {
                const status = STATUS_LABEL[show.status] || STATUS_LABEL.draft
                return (
                  <button
                    key={show.id}
                    onClick={() => navigateToShow(show)}
                    style={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 12, padding: '14px 16px',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.15s ease, border-color 0.15s ease',
                      display: 'flex', alignItems: 'center', gap: 12,
                      fontFamily: 'inherit',
                      animation: `fadeUp ${0.5 + i * 0.06}s ease`,
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = C.cardHover
                      el.style.borderColor = 'rgba(255,255,255,0.12)'
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = C.card
                      el.style.borderColor = C.border
                    }}
                  >
                    {/* Date block */}
                    <div style={{
                      minWidth: 40, textAlign: 'center', flexShrink: 0,
                    }}>
                      <p style={{
                        fontSize: 18, fontWeight: 800, color: C.text, margin: 0,
                        fontFamily: '"DM Mono", monospace', lineHeight: 1,
                      }}>
                        {new Date(show.date).getDate()}
                      </p>
                      <p style={{
                        fontSize: 9, color: C.muted, margin: '2px 0 0',
                        textTransform: 'uppercase', letterSpacing: '0.08em',
                      }}>
                        {new Date(show.date).toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                    </div>

                    {/* Divider */}
                    <div style={{ width: 1, height: 32, background: C.border, flexShrink: 0 }} />

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 14, fontWeight: 600, color: C.text,
                        margin: '0 0 3px', whiteSpace: 'nowrap',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {show.venue}
                      </p>
                      <p style={{ fontSize: 11, color: C.secondary, margin: 0 }}>
                        {show.artist}
                        {show.song_count > 0 && ` · ${show.song_count} songs`}
                      </p>
                    </div>

                    {/* Status */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                      gap: 4, flexShrink: 0,
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: status.color, background: status.bg,
                        border: `1px solid ${status.color}40`,
                        borderRadius: 20, padding: '3px 8px',
                      }}>
                        {status.label}
                      </span>
                      <span style={{ fontSize: 10, color: C.muted }}>
                        {timeAgo(show.created_at)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse-dot{ 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }
        @keyframes breathe  { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
