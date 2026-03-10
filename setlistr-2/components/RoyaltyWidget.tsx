'use client'
import { useState } from 'react'
import { DollarSign, ChevronDown, ChevronUp, Info } from 'lucide-react'

type Performance = {
  id: string
  venue_name: string
  city: string
  country: string
  set_duration_minutes: number
  song_count?: number
}

type RoyaltyEstimate = {
  low: number
  mid: number
  high: number
  perSong: { low: number; high: number }
  confidence: 'low' | 'medium' | 'high'
  drivers: { label: string; value: string; impact: 'positive' | 'neutral' | 'negative' }[]
}

function estimateRoyalties(performances: Performance[]) {
  const breakdown = performances.map(p => {
    const songs = p.song_count || 0
    const duration = p.set_duration_minutes || 45

    const venueName = (p.venue_name || '').toLowerCase()
    const isLargeVenue = /arena|stadium|center|theatre|theater|hall|festival/.test(venueName)
    const isSmallVenue = /cafe|bar|pub|lounge|coffee|house|basement|room/.test(venueName)
    const venueMult = isLargeVenue ? 2.2 : isSmallVenue ? 0.7 : 1.0
    const venueLabel = isLargeVenue ? 'large venue' : isSmallVenue ? 'small venue' : 'mid-size venue'

    const country = (p.country || '').toLowerCase()
    const isUSCA = country.includes('united states') || country.includes('canada')
    const isEU = country.includes('united kingdom') || country.includes('germany') || country.includes('france')
    const territoryMult = isUSCA ? 1.0 : isEU ? 1.15 : 0.7
    const territoryLabel = isUSCA ? 'US/CA' : isEU ? 'EU' : 'International'

    const durationMult = duration >= 90 ? 1.2 : duration >= 60 ? 1.0 : 0.8

    const basePerSong = 3.5
    const adjustedRate = basePerSong * venueMult * territoryMult * durationMult

    const mid = Math.round(songs * adjustedRate)
    const low = Math.round(mid * 0.55)
    const high = Math.round(mid * 1.7)

    const confidence: 'low' | 'medium' | 'high' =
      songs >= 8 && duration >= 45 ? 'medium' : 'low'

    const drivers = [
      { label: 'Venue size', value: venueLabel, impact: isLargeVenue ? 'positive' : isSmallVenue ? 'negative' : 'neutral' as any },
      { label: 'Territory', value: territoryLabel, impact: isEU ? 'positive' : isUSCA ? 'neutral' : 'negative' as any },
      { label: 'Set duration', value: `${duration} min`, impact: duration >= 60 ? 'positive' : 'neutral' as any },
      { label: 'Songs performed', value: `${songs} songs`, impact: songs >= 10 ? 'positive' : 'neutral' as any },
    ]

    return {
      performance: p,
      estimate: { low, mid, high, perSong: { low: Math.round(low / Math.max(songs, 1)), high: Math.round(high / Math.max(songs, 1)) }, confidence, drivers } as RoyaltyEstimate
    }
  })

  const totalLow = breakdown.reduce((sum, b) => sum + b.estimate.low, 0)
  const totalMid = breakdown.reduce((sum, b) => sum + b.estimate.mid, 0)
  const totalHigh = breakdown.reduce((sum, b) => sum + b.estimate.high, 0)
  const totalSongs = breakdown.reduce((sum, b) => sum + (b.performance.song_count || 0), 0)

  return { totalLow, totalMid, totalHigh, totalSongs, breakdown }
}

export function RoyaltyWidget({ performances }: { performances: Performance[] }) {
  const [expanded, setExpanded] = useState(false)
  const completed = performances.filter(p => (p.song_count || 0) > 0)

  if (completed.length === 0) return null

  const { totalLow, totalMid, totalHigh, totalSongs, breakdown } = estimateRoyalties(completed)

  return (
    <div className="bg-[#1a1814] border border-gold/20 rounded-2xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center">
              <DollarSign size={14} className="text-gold" />
            </div>
            <span className="text-xs uppercase tracking-wider text-[#6a6660] font-medium">Est. Live Royalty Value</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-[#4a4640] bg-[#2a2620] px-2 py-0.5 rounded-full">
            <Info size={9} />
            Estimate only
          </div>
        </div>

        <div className="flex items-end gap-2 mb-1">
          <span className="text-4xl font-bold text-cream">${totalMid}</span>
          <span className="text-[#6a6660] text-sm mb-1">midpoint</span>
        </div>
        <div className="text-xs text-[#6a6660] mb-3">
          Range: <span className="text-cream">${totalLow} – ${totalHigh}</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-[#6a6660] mb-4">
          <span>{totalSongs} songs logged</span>
          <span>{completed.length} shows</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            Medium confidence
          </span>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-gold hover:text-yellow-300 transition-colors"
        >
          {expanded ? 'Hide' : 'View'} breakdown
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#2e2b26] px-4 py-4 flex flex-col gap-4">
          <p className="text-xs text-[#4a4640]">
            Based on venue size, market, territory, set length, and historical performance royalty assumptions. Not a guarantee of payment.
          </p>

          {breakdown.map(({ performance, estimate }) => (
            <div key={performance.id} className="bg-[#0f0e0c] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-cream text-sm font-medium">{performance.venue_name}</p>
                  <p className="text-[#6a6660] text-xs">{performance.city}</p>
                </div>
                <div className="text-right">
                  <p className="text-gold font-bold">${estimate.mid}</p>
                  <p className="text-[#4a4640] text-xs">${estimate.low}–${estimate.high}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {estimate.drivers.map(d => (
                  <div key={d.label} className="flex items-center justify-between text-xs">
                    <span className="text-[#4a4640]">{d.label}</span>
                    <span className={
                      d.impact === 'positive' ? 'text-green-400' :
                      d.impact === 'negative' ? 'text-red-400' :
                      'text-[#6a6660]'
                    }>{d.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-2 pt-2 border-t border-[#2a2620] flex items-center justify-between text-xs">
                <span className="text-[#4a4640]">Per song estimate</span>
                <span className="text-cream">${estimate.perSong.low}–${estimate.perSong.high}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
