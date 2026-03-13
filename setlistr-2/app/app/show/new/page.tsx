'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Calendar, ArrowRight, Music4, Music2 } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
  goldDim: 'rgba(201,168,76,0.1)',
  red: '#dc2626',
}

export default function NewShowPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [showType, setShowType] = useState<'single' | 'writers_round'>('single')
  const [scheduledAt, setScheduledAt] = useState(
    new Date().toISOString().slice(0, 16) // YYYY-MM-DDTHH:MM
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isValid = name.trim().length > 0

  async function handleSubmit() {
    if (!isValid || loading) return

    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const scheduledIso = scheduledAt
        ? new Date(scheduledAt).toISOString()
        : null

      // 1) Create the show
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

      // 2) Create the linked performance
      const { data: performance, error: perfError } = await supabase
        .from('performances')
        .insert({
          show_id: show.id,
          performance_date: scheduledIso || new Date().toISOString(),
          artist_name: name.trim(),
          venue_name: name.trim(),
          city: '',
          country: '',
          status: 'pending',
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

  return (
    <div
      style={{
        minHeight: '100svh',
        background: C.bg,
        fontFamily: '"DM Sans", system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '120vw',
          height: '50vh',
          pointerEvents: 'none',
          zIndex: 0,
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 440,
          position: 'relative',
          zIndex: 1,
          animation: 'fadeUp 0.4s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: C.goldDim,
              border: `1px solid ${C.borderGold}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Music4 size={16} color={C.gold} />
          </div>
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.gold,
                margin: 0,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}
            >
              Setlistr
            </p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>New Show</p>
          </div>
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: C.text,
            margin: '0 0 6px',
            letterSpacing: '-0.025em',
          }}
        >
          Set up your show
        </h1>

        <p
          style={{
            fontSize: 14,
            color: C.secondary,
            margin: '0 0 28px',
          }}
        >
          Fill in the details below to begin live capture.
        </p>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.muted,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Building2 size={10} />
              Show Name
              <span style={{ color: C.gold }}>*</span>
            </label>

            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Massey Hall, Jesse's House..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
              style={{
                background: C.input,
                border: `1px solid ${name.trim() ? C.borderGold : C.border}`,
                borderRadius: 10,
                padding: '13px 14px',
                color: C.text,
                fontSize: 15,
                fontFamily: 'inherit',
                width: '100%',
                transition: 'border-color 0.15s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.muted,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Music2 size={10} />
              Show Type
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              {(['single', 'writers_round'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setShowType(type)}
                  type="button"
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: showType === type ? C.goldDim : 'transparent',
                    border: `1px solid ${
                      showType === type ? C.borderGold : C.border
                    }`,
                    borderRadius: 10,
                    color: showType === type ? C.gold : C.secondary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    fontFamily: 'inherit',
                  }}
                >
                  {type === 'single' ? 'Single Artist' : "Writer's Round"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.muted,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Calendar size={10} />
              Scheduled Time
            </label>

            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              style={{
                background: C.input,
                border: `1px solid ${scheduledAt ? C.borderGold : C.border}`,
                borderRadius: 10,
                padding: '12px 14px',
                color: C.text,
                fontSize: 14,
                fontFamily: 'inherit',
                width: '100%',
                colorScheme: 'dark',
              }}
            />
          </div>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 14,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          style={{
            width: '100%',
            padding: '15px',
            background: isValid ? C.gold : C.muted,
            border: 'none',
            borderRadius: 12,
            color: '#0a0908',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: isValid && !loading ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.7 : 1,
            transition: 'background 0.2s ease, opacity 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            fontFamily: 'inherit',
          }}
        >
          {loading ? (
            <>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid #0a090840',
                  borderTopColor: '#0a0908',
                  animation: 'spin 0.7s linear infinite',
                }}
              />
              Starting...
            </>
          ) : (
            <>
              Start Live Capture
              <ArrowRight size={15} strokeWidth={2.5} />
            </>
          )}
        </button>

        <button
          onClick={() => router.push('/app/dashboard')}
          style={{
            background: 'none',
            border: 'none',
            color: C.muted,
            fontSize: 12,
            cursor: 'pointer',
            letterSpacing: '0.04em',
            fontFamily: 'inherit',
            padding: '12px',
            width: '100%',
            marginTop: 4,
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        * {
          -webkit-tap-highlight-color: transparent;
          box-sizing: border-box;
        }

        input::placeholder {
          color: #6a6050;
        }

        input:focus {
          border-color: rgba(201,168,76,0.4) !important;
          outline: none;
        }

        input[type="datetime-local"]::-webkit-calendar-picker-indicator {
          filter: invert(0.5);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
