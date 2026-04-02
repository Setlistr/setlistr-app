'use client'
import { useState } from 'react'
import { DollarSign, ChevronDown, ChevronUp, Info, TrendingUp } from 'lucide-react'

type Performance = {
  id: string
  venue_name: string
  city: string
  country: string
  set_duration_minutes: number
  song_count?: number
}

type ImpactType = 'positive' | 'neutral' | 'negative'

type Driver = {
  label: string
  value: string
  impact: ImpactType
}

type RoyaltyEstimate = {
  low: number
  mid: number
  high: number
  perSong: { low: number; high: number }
  confidence: 'low' | 'medium' | 'high'
  tariff: string
  drivers: Driver[]
}

// ─────────────────────────────────────────────────────────────────────────────
// VENUE TIER DETECTION
// Returns: 'festival' | 'theatre' | 'club' | 'bar'
// ─────────────────────────────────────────────────────────────────────────────
function detectVenueTier(venueName: string, capacity?: number): {
  tier: 'festival' | 'theatre' | 'club' | 'bar'
  label: string
} {
  const n = (venueName || '').toLowerCase()

  // Explicit capacity override (from venue picker)
  if (capacity) {
    if (capacity >= 5000) return { tier: 'festival', label: 'Festival / Arena' }
    if (capacity >= 800)  return { tier: 'theatre',  label: 'Theatre / Large Venue' }
    if (capacity >= 200)  return { tier: 'club',     label: 'Club / Mid-size' }
    return { tier: 'bar', label: 'Bar / Small Venue' }
  }

  // Name-based heuristic
  if (/festival|arena|stadium|amphith|amphi/.test(n))
    return { tier: 'festival', label: 'Festival / Arena' }
  if (/theatre|theater|hall|centre|center|auditorium|opera|symphony/.test(n))
    return { tier: 'theatre', label: 'Theatre / Large Venue' }
  if (/club|venue|music|live|room|stage|loft|pavilion/.test(n))
    return { tier: 'club', label: 'Club / Mid-size' }
  // Default: bar
  return { tier: 'bar', label: 'Bar / Small Venue' }
}

// ─────────────────────────────────────────────────────────────────────────────
// TERRITORY DETECTION
// ─────────────────────────────────────────────────────────────────────────────
function detectTerritory(country: string): {
  key: 'canada' | 'us' | 'eu' | 'other'
  label: string
  pro: string
} {
  const c = (country || '').toLowerCase()
  if (c.includes('canada') || c === 'ca')
    return { key: 'canada', label: 'Canada', pro: 'SOCAN' }
  if (c.includes('united states') || c === 'us' || c === 'usa')
    return { key: 'us', label: 'United States', pro: 'ASCAP/BMI' }
  if (c.includes('united kingdom') || c.includes('germany') || c.includes('france') ||
      c.includes('australia') || c.includes('ireland') || c.includes('netherlands'))
    return { key: 'eu', label: 'UK/EU/AU', pro: 'PRS/APRA' }
  return { key: 'other', label: 'International', pro: 'PRO' }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE ESTIMATION
//
// Grounded in real PRO tariff data:
//
// SOCAN Canada:
//   Bar/club (Tariff 3A): pool max $75/show → writer share ~$3–6/song
//   Club/mid (Tariff 4A): 3% of ~$2,000–8,000 gross → $60–240 pool / ~$5–16/song
//   Theatre (Tariff 4A): 3% of ~$15,000–60,000 gross → $450–1,800 pool / ~$30–120/song
//   Festival (Tariff 5B+): 3% of performer fees, large pools → $50–300+/song
//
// US ASCAP/BMI:
//   Bars/clubs: survey-sampled, often uncollected → $1–4/song
//   Mid venue: $3–12/song
//   Theatre: $10–40/song
//   Festival: $30–150/song
//
// EU/UK (PRS etc.): generally 10–20% higher than US for equivalent venues
//
// Per-song figures represent WRITER SHARE only (50% of total pool).
// Self-published artists collect both writer + publisher = 2x shown.
// ─────────────────────────────────────────────────────────────────────────────
const RATES = {
  canada: {
    bar:      { low: 2,  mid: 4,   high: 6,   tariff: 'SOCAN Tariff 3A' },
    club:     { low: 5,  mid: 10,  high: 18,  tariff: 'SOCAN Tariff 4A' },
    theatre:  { low: 28, mid: 55,  high: 100, tariff: 'SOCAN Tariff 4A' },
    festival: { low: 50, mid: 120, high: 280, tariff: 'SOCAN Tariff 5B' },
  },
  us: {
    bar:      { low: 1,  mid: 3,   high: 5,   tariff: 'ASCAP/BMI (sampled)' },
    club:     { low: 3,  mid: 8,   high: 15,  tariff: 'ASCAP/BMI' },
    theatre:  { low: 10, mid: 28,  high: 55,  tariff: 'ASCAP/BMI' },
    festival: { low: 30, mid: 80,  high: 180, tariff: 'ASCAP/BMI' },
  },
  eu: {
    bar:      { low: 3,  mid: 5,   high: 9,   tariff: 'PRS/APRA' },
    club:     { low: 6,  mid: 12,  high: 22,  tariff: 'PRS/APRA' },
    theatre:  { low: 22, mid: 45,  high: 90,  tariff: 'PRS/APRA' },
    festival: { low: 45, mid: 110, high: 250, tariff: 'PRS/APRA' },
  },
  other: {
    bar:      { low: 1,  mid: 2,  high: 4,   tariff: 'Local PRO' },
    club:     { low: 2,  mid: 5,  high: 10,  tariff: 'Local PRO' },
    theatre:  { low: 8,  mid: 20, high: 40,  tariff: 'Local PRO' },
    festival: { low: 20, mid: 55, high: 120, tariff: 'Local PRO' },
  },
}

// SOCAN Tariff 3A hard cap: $75 total per show
const SOCAN_3A_CAP = 75

function estimateRoyalties(performances: Performance[]) {
  const breakdown = performances.map(p => {
    const songs    = p.song_count || 0
    const duration = p.set_duration_minutes || 45

    const { tier, label: venueLabel }         = detectVenueTier(p.venue_name)
    const { key: territory, label: territoryLabel, pro } = detectTerritory(p.country)

    const rates = RATES[territory][tier]

    // Raw per-song estimates
    let rawLow  = songs * rates.low
    let rawMid  = songs * rates.mid
    let rawHigh = songs * rates.high

    // Apply SOCAN Tariff 3A cap for bar shows in Canada
    if (territory === 'canada' && tier === 'bar') {
      rawLow  = Math.min(rawLow,  SOCAN_3A_CAP * 0.55)
      rawMid  = Math.min(rawMid,  SOCAN_3A_CAP)
      rawHigh = Math.min(rawHigh, SOCAN_3A_CAP * 1.3) // slight high headroom for self-published
    }

    // Duration modifier: short sets have fewer songs and less engagement weight
    const durationMult = duration >= 90 ? 1.15 : duration >= 60 ? 1.0 : duration >= 40 ? 0.85 : 0.7
    rawLow  = Math.round(rawLow  * durationMult)
    rawMid  = Math.round(rawMid  * durationMult)
    rawHigh = Math.round(rawHigh * durationMult)

    // Confidence: needs songs + duration data to be meaningful
    const confidence: 'low' | 'medium' | 'high' =
      songs >= 10 && duration >= 60 ? 'high' :
      songs >= 6  && duration >= 40 ? 'medium' : 'low'

    // Driver signals
    const tierImpact: ImpactType =
      tier === 'festival' || tier === 'theatre' ? 'positive' :
      tier === 'bar' ? 'negative' : 'neutral'

    const territoryImpact: ImpactType =
      territory === 'canada' || territory === 'eu' ? 'positive' :
      territory === 'us' ? 'neutral' : 'negative'

    const durationImpact: ImpactType = duration >= 60 ? 'positive' : duration >= 40 ? 'neutral' : 'negative'
    const songsImpact: ImpactType    = songs >= 10 ? 'positive' : songs >= 6 ? 'neutral' : 'negative'

    const drivers: Driver[] = [
      { label: 'Venue type',      value: venueLabel,     impact: tierImpact },
      { label: 'PRO territory',   value: `${territoryLabel} (${pro})`, impact: territoryImpact },
      { label: 'Set length',      value: `${duration} min`, impact: durationImpact },
      { label: 'Songs logged',    value: `${songs} songs`,  impact: songsImpact },
    ]

    const estimate: RoyaltyEstimate = {
      low:  rawLow,
      mid:  rawMid,
      high: rawHigh,
      perSong: {
        low:  rates.low,
        high: rates.high,
      },
      confidence,
      tariff: rates.tariff,
      drivers,
    }

    return { performance: p, estimate }
  })

  const totalLow  = breakdown.reduce((sum, b) => sum + b.estimate.low,  0)
  const totalMid  = breakdown.reduce((sum, b) => sum + b.estimate.mid,  0)
  const totalHigh = breakdown.reduce((sum, b) => sum + b.estimate.high, 0)
  const totalSongs = breakdown.reduce((sum, b) => sum + (b.performance.song_count || 0), 0)

  return { totalLow, totalMid, totalHigh, totalSongs, breakdown }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNUALISED PROJECTION
// If we have ≥2 shows, extrapolate to a full year
// ─────────────────────────────────────────────────────────────────────────────
function annualProjection(totalMid: number, showCount: number) {
  if (showCount < 2) return null
  const perShow   = totalMid / showCount
  const annual50  = Math.round(perShow * 50)   // ~1 show/week
  const annual100 = Math.round(perShow * 100)  // touring pace
  return { perShow: Math.round(perShow), annual50, annual100 }
}

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  bg: '#1a1814', card: '#0f0e0c', border: 'rgba(201,168,76,0.2)',
  borderInner: 'rgba(255,255,255,0.06)', gold: '#c9a84c',
  goldDim: 'rgba(201,168,76,0.08)', goldBorder: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#6a6660', faint: '#4a4640',
  green: '#4ade80', red: '#f87171', amber: '#fbbf24',
}

function confidenceDot(c: 'low' | 'medium' | 'high') {
  const color = c === 'high' ? C.green : c === 'medium' ? C.amber : C.muted
  const label = c === 'high' ? 'High confidence' : c === 'medium' ? 'Medium confidence' : 'Low confidence'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ color: C.muted, fontSize: 11 }}>{label}</span>
    </span>
  )
}

function impactColor(i: ImpactType) {
  return i === 'positive' ? C.green : i === 'negative' ? C.red : C.muted
}

export function RoyaltyWidget({ performances }: { performances: Performance[] }) {
  const [expanded, setExpanded] = useState(false)
  const completed = performances.filter(p => (p.song_count || 0) > 0)

  if (completed.length === 0) return null

  const { totalLow, totalMid, totalHigh, totalSongs, breakdown } = estimateRoyalties(completed)
  const projection = annualProjection(totalMid, completed.length)

  // Overall confidence = lowest confidence in set
  const overallConfidence: 'low' | 'medium' | 'high' =
    breakdown.some(b => b.estimate.confidence === 'low') ? 'low' :
    breakdown.some(b => b.estimate.confidence === 'medium') ? 'medium' : 'high'

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: C.goldDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={14} color={C.gold} />
            </div>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, fontWeight: 700 }}>
              Est. Live Royalty Value
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.faint, background: '#2a2620', padding: '2px 8px', borderRadius: 99 }}>
            <Info size={9} />
            Estimate only
          </div>
        </div>

        {/* ── Main number ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: C.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
            ${totalMid.toLocaleString()}
          </span>
          <span style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>midpoint</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Range: <span style={{ color: C.secondary }}>${totalLow.toLocaleString()} – ${totalHigh.toLocaleString()}</span>
        </div>

        {/* ── Stats row ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, color: C.muted, marginBottom: 12, flexWrap: 'wrap' }}>
          <span>{totalSongs} songs</span>
          <span>{completed.length} {completed.length === 1 ? 'show' : 'shows'}</span>
          {confidenceDot(overallConfidence)}
        </div>

        {/* ── Annual projection teaser (the money hook) ── */}
        {projection && (
          <div style={{ background: C.goldDim, border: `1px solid ${C.goldBorder}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <TrendingUp size={12} color={C.gold} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Annual projection
              </span>
            </div>
            <p style={{ fontSize: 12, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
              At this rate, <strong style={{ color: C.text }}>50 shows/yr</strong> = <strong style={{ color: C.gold }}>${projection.annual50.toLocaleString()}</strong> in unclaimed royalties.
              Playing 100 shows? <strong style={{ color: C.gold }}>${projection.annual100.toLocaleString()}</strong>.
            </p>
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.gold, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
        >
          {expanded ? 'Hide' : 'View'} breakdown
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* ── Expanded breakdown ── */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.borderInner}`, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          <p style={{ fontSize: 11, color: C.faint, margin: 0, lineHeight: 1.5 }}>
            Estimates based on published PRO tariff rates (SOCAN, ASCAP/BMI, PRS/APRA) for live performance royalties.
            Writer's share only — self-published artists may collect an additional publisher share.
            Actual payments depend on venue license status and PRO distribution rules.
          </p>

          {breakdown.map(({ performance, estimate }) => (
            <div key={performance.id} style={{ background: C.card, borderRadius: 12, padding: 12 }}>
              {/* Show header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 2px' }}>{performance.venue_name}</p>
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{performance.city}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: C.gold, margin: '0 0 2px' }}>${estimate.mid}</p>
                  <p style={{ fontSize: 10, color: C.faint, margin: 0 }}>${estimate.low}–${estimate.high}</p>
                </div>
              </div>

              {/* Drivers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                {estimate.drivers.map(d => (
                  <div key={d.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 10, color: C.faint }}>{d.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: impactColor(d.impact) }}>{d.value}</span>
                  </div>
                ))}
              </div>

              {/* Per song + tariff */}
              <div style={{ borderTop: `1px solid rgba(255,255,255,0.05)`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: C.faint }}>
                  ~${estimate.perSong.low}–${estimate.perSong.high} per song
                </span>
                <span style={{ fontSize: 10, color: C.faint, background: '#2a2620', padding: '2px 6px', borderRadius: 4 }}>
                  {estimate.tariff}
                </span>
              </div>
            </div>
          ))}

          {/* Note about self-publishing */}
          <div style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ fontSize: 11, color: '#4ade80', margin: 0, lineHeight: 1.5 }}>
              💡 <strong>Self-published?</strong> Register as both writer and publisher with your PRO to collect up to 2× these estimates.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
