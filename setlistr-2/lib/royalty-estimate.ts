// ─── Setlistr Royalty Estimate Engine ────────────────────────────────────────
// Heuristic model — not a precise payout calculator.
// Outputs a low/expected/high range with explanation copy.
// All multipliers are based on publicly available PRO rate structures
// and typical live performance licensing fee ranges.

export type VenueCapacityBand =
  | 'tiny'    // < 100
  | 'small'   // 100–300
  | 'medium'  // 300–1,000  ← baseline
  | 'large'   // 1,000–5,000
  | 'major'   // 5,000–15,000
  | 'arena'   // 15,000+

export type ShowType =
  | 'single'          // headline solo
  | 'writers_round'   // split among writers
  | 'support'         // opening act
  | 'festival'        // broad audience
  | 'private'         // corporate / private event
  | 'cover_band'      // reduced original royalties

export type CrowdDensity = 'sparse' | 'normal' | 'packed'

export type RegistrationStatus = 'confirmed' | 'likely' | 'unknown'

export type SongRegistration = {
  status: RegistrationStatus
}

export type EstimateInput = {
  songCount: number
  venueCapacityBand?: VenueCapacityBand
  showType?: ShowType
  territory?: string            // 'CA', 'US', 'GB', etc.
  crowdDensity?: CrowdDensity
  songs?: SongRegistration[]    // per-song registration — optional
}

export type EstimateOutput = {
  low: number
  expected: number
  high: number
  eligibleSongs: number         // songs that will actually collect
  explanations: string[]        // 1–3 lines explaining the key drivers
  confidenceNote: string        // single line on model confidence
}

// ─── Multiplier tables ────────────────────────────────────────────────────────

const CAPACITY_MULTIPLIER: Record<VenueCapacityBand, number> = {
  tiny:   0.30,
  small:  0.60,
  medium: 1.00,   // baseline
  large:  2.20,
  major:  5.00,
  arena:  12.00,
}

const CAPACITY_LABEL: Record<VenueCapacityBand, string> = {
  tiny:   'small room (<100)',
  small:  'club (100–300)',
  medium: 'mid-size venue (300–1k)',
  large:  'large venue (1k–5k)',
  major:  'major venue (5k–15k)',
  arena:  'arena (15k+)',
}

const SHOW_TYPE_MULTIPLIER: Record<ShowType, number> = {
  single:       1.00,
  writers_round: 0.70,  // royalties split among writers
  support:      0.60,
  festival:     1.40,
  private:      1.80,   // corporate licensing fees are higher
  cover_band:   0.40,
}

const SHOW_TYPE_LABEL: Record<ShowType, string> = {
  single:       'headline show',
  writers_round: "writer's round",
  support:      'support slot',
  festival:     'festival set',
  private:      'private/corporate event',
  cover_band:   'cover performance',
}

const TERRITORY_MULTIPLIER: Record<string, number> = {
  CA: 1.50,   // SOCAN rates are higher than ASCAP/BMI
  US: 1.00,
  GB: 0.90,
  AU: 0.75,
  // default for unknown territories: 0.70
}

const CROWD_MULTIPLIER: Record<CrowdDensity, number> = {
  sparse: 0.70,
  normal: 1.00,
  packed: 1.30,
}

// Registration confidence gates the estimate:
// An unregistered song won't collect anything.
const REGISTRATION_MULTIPLIER: Record<RegistrationStatus, number> = {
  confirmed: 1.00,
  likely:    0.60,
  unknown:   0.15,
}

// Base rate per song at medium venue, single artist, US territory
const BASE_RATE_PER_SONG = 1.20

// Variance band — model is heuristic, show a range
const VARIANCE_LOW  = 0.65
const VARIANCE_HIGH = 1.45

// ─── Main estimate function ───────────────────────────────────────────────────

export function estimateRoyalties(input: EstimateInput): EstimateOutput {
  const {
    songCount,
    venueCapacityBand = 'medium',
    showType = 'single',
    territory = 'US',
    crowdDensity = 'normal',
    songs,
  } = input

  if (songCount === 0) {
    return {
      low: 0, expected: 0, high: 0, eligibleSongs: 0,
      explanations: [],
      confidenceNote: 'No songs to estimate.',
    }
  }

  // ── Registration-weighted song count ─────────────────────────────────────
  // If per-song registration is provided, weight each song by its confidence.
  // Otherwise assume all songs are 'likely' (0.6) — conservative default.
  let weightedSongs: number
  let eligibleSongs: number

  if (songs && songs.length > 0) {
    weightedSongs = songs.reduce((acc, s) => acc + REGISTRATION_MULTIPLIER[s.status], 0)
    eligibleSongs = songs.filter(s => s.status !== 'unknown').length
  } else {
    // No registration data — assume likely for all songs
    weightedSongs = songCount * REGISTRATION_MULTIPLIER['likely']
    eligibleSongs = songCount
  }

  // ── Multipliers ───────────────────────────────────────────────────────────
  const capacityMult  = CAPACITY_MULTIPLIER[venueCapacityBand]
  const showTypeMult  = SHOW_TYPE_MULTIPLIER[showType]
  const territoryMult = TERRITORY_MULTIPLIER[territory] ?? 0.70
  const crowdMult     = CROWD_MULTIPLIER[crowdDensity]

  // ── Expected value ────────────────────────────────────────────────────────
  const expected = BASE_RATE_PER_SONG
    * weightedSongs
    * capacityMult
    * showTypeMult
    * territoryMult
    * crowdMult

  const low  = Math.round(expected * VARIANCE_LOW)
  const high = Math.round(expected * VARIANCE_HIGH)
  const exp  = Math.round(expected)

  // ── Explanation copy ──────────────────────────────────────────────────────
  const explanations: string[] = []

  // Venue is the dominant driver — always mention it
  explanations.push(
    `${CAPACITY_LABEL[venueCapacityBand]} · ${capacityMult}× venue rate`
  )

  // Show type only if non-default
  if (showType !== 'single') {
    explanations.push(
      `${SHOW_TYPE_LABEL[showType]} · ${showTypeMult}× rate applied`
    )
  }

  // Territory if not US
  if (territory === 'CA') {
    explanations.push('SOCAN territory — Canadian rates applied (+50%)')
  } else if (territory && territory !== 'US') {
    explanations.push(`${territory} territory rates applied`)
  }

  // Registration warning
  if (songs && songs.length > 0) {
    const unknownCount = songs.filter(s => s.status === 'unknown').length
    if (unknownCount > 0) {
      explanations.push(
        `${unknownCount} song${unknownCount > 1 ? 's' : ''} may not be registered — register to maximize payout`
      )
    }
  } else {
    explanations.push('Register songs with your PRO to maximize collection')
  }

  // Crowd density if non-default
  if (crowdDensity === 'packed') {
    explanations.push('Packed house — attendance boost applied')
  } else if (crowdDensity === 'sparse') {
    explanations.push('Sparse attendance factored in')
  }

  // ── Confidence note ───────────────────────────────────────────────────────
  let confidenceNote = 'Heuristic estimate — actual payouts vary by PRO and registration status.'
  if (venueCapacityBand === 'tiny' || venueCapacityBand === 'small') {
    confidenceNote = 'Small venue estimate — royalties scale significantly with room size.'
  } else if (venueCapacityBand === 'arena' || venueCapacityBand === 'major') {
    confidenceNote = 'Large venue estimate — ensure all songs are registered to collect the full amount.'
  }

  return {
    low,
    expected: exp,
    high,
    eligibleSongs,
    explanations: explanations.slice(0, 3), // cap at 3 lines
    confidenceNote,
  }
}

// ─── Venue capacity helpers ───────────────────────────────────────────────────

export function capacityToBand(capacity?: number | null): VenueCapacityBand {
  if (!capacity) return 'medium'
  if (capacity < 100)   return 'tiny'
  if (capacity < 300)   return 'small'
  if (capacity < 1000)  return 'medium'
  if (capacity < 5000)  return 'large'
  if (capacity < 15000) return 'major'
  return 'arena'
}

export const CAPACITY_BAND_OPTIONS: { value: VenueCapacityBand; label: string; sublabel: string }[] = [
  { value: 'tiny',   label: 'Tiny',   sublabel: '< 100 people' },
  { value: 'small',  label: 'Small',  sublabel: '100 – 300' },
  { value: 'medium', label: 'Medium', sublabel: '300 – 1,000' },
  { value: 'large',  label: 'Large',  sublabel: '1,000 – 5,000' },
  { value: 'major',  label: 'Major',  sublabel: '5,000 – 15,000' },
  { value: 'arena',  label: 'Arena',  sublabel: '15,000+' },
]

// ─── Multi-show aggregate ─────────────────────────────────────────────────────
// Used on dashboard to sum unclaimed earnings across shows.

export type ShowEstimateInput = EstimateInput & {
  performanceId: string
  status: string  // 'review' | 'completed' | 'exported'
}

export function aggregateUnclaimedEarnings(shows: ShowEstimateInput[]): {
  totalLow: number
  totalExpected: number
  totalHigh: number
  unclaimedCount: number
  unclaimedLow: number
  unclaimedExpected: number
  unclaimedHigh: number
} {
  let totalLow = 0, totalExpected = 0, totalHigh = 0
  let unclaimedLow = 0, unclaimedExpected = 0, unclaimedHigh = 0
  let unclaimedCount = 0

  for (const show of shows) {
    const est = estimateRoyalties(show)
    totalLow      += est.low
    totalExpected += est.expected
    totalHigh     += est.high

    // 'exported' = submitted to PRO — everything else is unclaimed
    if (show.status !== 'exported') {
      unclaimedLow      += est.low
      unclaimedExpected += est.expected
      unclaimedHigh     += est.high
      unclaimedCount++
    }
  }

  return {
    totalLow, totalExpected, totalHigh,
    unclaimedCount, unclaimedLow, unclaimedExpected, unclaimedHigh,
  }
}
