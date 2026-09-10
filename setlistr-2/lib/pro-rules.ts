// ─── Setlistr PRO Rules ──────────────────────────────────────────────────────
// Single source of truth for live-performance claim rules across every PRO
// Setlistr supports: SOCAN, ASCAP, BMI, PRS, APRA, SESAC, GMR.
//
// Every deadline carries a `confidence`:
//   'official'   — rule read from the PRO's own published pages (sourceUrl set)
//   'unverified' — Setlistr's working default; the artist is told to confirm
//   'reminder'   — the PRO publishes no self-serve deadline; this is a
//                  Setlistr nudge, never presented as a PRO deadline
//
// To promote a rule to 'official': confirm it on the PRO's site, set
// confidence + sourceUrl, and update the rule text. Nothing else changes.
//
// Claim state stays self-attested. Nothing in this file implies Setlistr can
// see whether a PRO received, accepted, or paid a claim.

export type ProCode = 'SOCAN' | 'ASCAP' | 'BMI' | 'PRS' | 'APRA' | 'SESAC' | 'GMR'

export type Territory = 'US' | 'CA' | 'GB' | 'AU'

export type DeadlineConfidence = 'official' | 'unverified' | 'reminder'

export type DeadlineResult = {
  date: Date
  confidence: DeadlineConfidence
  rule: string
  sourceUrl?: string
  // BMI-only today: an earlier, non-binding cutoff for a faster distribution.
  // Distinct from `date`, which is always the final/binding cutoff. Callers
  // must check whether earlyCutoff is still in the future before showing it —
  // this function stays a pure function of showDate and does not know `now`.
  earlyCutoff?: Date
  earlyCutoffNote?: string
}

export type Urgency = 'expired' | 'urgent' | 'soon' | 'open'

export type ClaimFieldKey =
  | 'setlist_title'
  | 'songs'
  | 'venue_name'
  | 'venue_city'
  | 'performance_date'
  | 'start_time'
  | 'ticket_price'
  | 'promoter'
  | 'attendance'
  | 'capacity'
  | 'legal_name'
  | 'ipi_number'
  | 'publisher_name'

// Fields the artist types in on the claim screen (everything else is resolved
// from the performance or profile).
export const INPUT_FIELDS: ClaimFieldKey[] = ['start_time', 'ticket_price', 'promoter', 'attendance']

export type ClaimField = {
  key: ClaimFieldKey
  label: string
  required: boolean
  hint?: string
}

export type PreflightItem = {
  id: string
  label: string
  detail: string
}

export type ProRule = {
  code: ProCode
  name: string
  program: string
  portalLabel: string
  portalUrl: string
  supportUrl?: string
  phone?: string
  homeTerritory: Territory
  dateFormat: 'MDY' | 'DMY' | 'ISO'
  selfServe: boolean
  fields: ClaimField[]      // in the order the portal asks for them
  preflight: PreflightItem[] // one-time account checks
  notes: string[]           // rules that affect what gets paid
  steps: string[]
  deadline: (showDate: Date) => DeadlineResult
  // Short, PRO-specific deadline explainer shown wherever a one-line summary
  // is needed (claim screen, marketing copy). Static — not derived from a
  // showDate — so it never disagrees with what deadline() actually computes.
  deadlineSummary: string
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DAY_MS = 86400000

function quarterOf(d: Date): number {
  return Math.floor(d.getMonth() / 3)
}

// Last moment of a quarter, where `q` may overflow past 3 (next year).
function endOfQuarter(year: number, q: number): Date {
  const y = year + Math.floor(q / 4)
  const qq = ((q % 4) + 4) % 4
  // Day 0 of the month after the quarter = last day of the quarter
  return new Date(y, qq * 3 + 3, 0, 23, 59, 59)
}

// BMI's own cutoff calendar treats a quarter-end that falls in December as
// the 21st, not the 31st (bmi.com/creators/bmi-live) — holiday processing
// cutoff, not a calendar-quarter artifact. Applies to BMI only.
function capDecember(d: Date): Date {
  if (d.getMonth() === 11) {
    return new Date(d.getFullYear(), 11, 21, 23, 59, 59)
  }
  return d
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS)
}

export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS)
}

export function urgencyFor(daysLeft: number): Urgency {
  if (daysLeft < 0) return 'expired'
  if (daysLeft <= 14) return 'urgent'
  if (daysLeft <= 45) return 'soon'
  return 'open'
}

export function formatClaimDate(d: Date, fmt: ProRule['dateFormat']): string {
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  if (fmt === 'MDY') return `${mm}/${dd}/${yyyy}`
  if (fmt === 'DMY') return `${dd}/${mm}/${yyyy}`
  return `${yyyy}-${mm}-${dd}`
}

// "20:30" → "8:30 PM" for US portals, unchanged elsewhere
export function formatClaimTime(hhmm: string, territory: Territory): string {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm
  if (territory !== 'US') return hhmm
  const [hStr, m] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${suffix}`
}

// Best-effort territory from free-text venue fields. Returns null when unsure —
// callers must treat null as "don't warn", never as a mismatch.
export function detectTerritory(country?: string | null, city?: string | null): Territory | null {
  const c = (country || '').trim().toLowerCase()
  const s = `${c} ${(city || '').toLowerCase()}`
  // 'CA' only counts as Canada when it's the whole country field — in a city
  // string it's far more likely to be California.
  if (c === 'ca' || /\b(canada|ontario|quebec|québec|british columbia|alberta|manitoba|saskatchewan|nova scotia|toronto|vancouver|montreal|ottawa|calgary)\b/.test(s)) return 'CA'
  if (/\b(united kingdom|uk|gb|england|scotland|wales|northern ireland|london|manchester|glasgow)\b/.test(s)) return 'GB'
  if (/\b(australia|au|sydney|melbourne|brisbane|perth|adelaide)\b/.test(s)) return 'AU'
  if (/\b(united states|usa|us|u\.s\.|u\.s\.a\.)\b/.test(c)) return 'US'
  return null
}

// ─── Deadline rules ───────────────────────────────────────────────────────────

// ASCAP OnStage: claims are due by the end of the quarter FOLLOWING the
// performance quarter (Q1→Jun 30, Q2→Sep 30, Q3→Dec 31, Q4→Mar 31).
function ascapDeadline(showDate: Date): DeadlineResult {
  return {
    date: endOfQuarter(showDate.getFullYear(), quarterOf(showDate) + 1),
    confidence: 'official',
    rule: 'End of the quarter after your show',
    sourceUrl: 'https://www.ascap.com/music-creators/ascap-onstage',
  }
}

// BMI Live: two cutoffs, not one.
//   - Early cutoff = end of the quarter AFTER the performance quarter (Q+1).
//     Filing by this date gets the claim into an earlier distribution — it's
//     a "file sooner, get paid sooner" marker, not a hard deadline.
//   - Final cutoff = end of the second quarter after the performance quarter
//     (Q+2). This is the actual binding window-close date.
//   Either cutoff that lands in December is capped to Dec 21 (see capDecember).
function bmiDeadline(showDate: Date): DeadlineResult {
  const q = quarterOf(showDate)
  const earlyCutoff = capDecember(endOfQuarter(showDate.getFullYear(), q + 1))
  const finalCutoff = capDecember(endOfQuarter(showDate.getFullYear(), q + 2))
  return {
    date: finalCutoff,
    confidence: 'official',
    rule: 'Final cutoff is two quarters after your show’s quarter (December cutoffs are Dec 21)',
    sourceUrl: 'https://www.bmi.com/creators/bmi-live',
    earlyCutoff,
    earlyCutoffNote: 'File by this date for an earlier distribution — the final cutoff below is still open after it passes.',
  }
}

function twelveMonthDeadline(showDate: Date): DeadlineResult {
  return {
    date: addDays(showDate, 365),
    confidence: 'unverified',
    rule: '12-month window — confirm in the portal',
  }
}

function repReminder(showDate: Date): DeadlineResult {
  return {
    date: addDays(showDate, 180),
    confidence: 'reminder',
    rule: 'No published deadline — Setlistr reminder at 6 months',
  }
}

// ─── Field presets ────────────────────────────────────────────────────────────

const F = {
  title:      { key: 'setlist_title',    label: 'Setlist title',  required: true },
  songs:      { key: 'songs',            label: 'Songs',          required: true },
  venue:      { key: 'venue_name',       label: 'Venue',          required: true },
  city:       { key: 'venue_city',       label: 'City',           required: true },
  date:       { key: 'performance_date', label: 'Date',           required: true },
  time:       { key: 'start_time',       label: 'Start time',     required: true, hint: 'From your capture — adjust if you started recording late.' },
  ticket:     { key: 'ticket_price',     label: 'Ticket price',   required: true, hint: 'Enter 0 for free shows.' },
  promoter:   { key: 'promoter',         label: 'Promoter',       required: true, hint: 'Self-promoted? Use your name or the venue.' },
  promoterOpt:{ key: 'promoter',         label: 'Promoter',       required: false, hint: 'If applicable.' },
  attendance: { key: 'attendance',       label: 'Attendance',     required: false, hint: 'Best estimate is fine.' },
  capacity:   { key: 'capacity',         label: 'Venue capacity', required: false },
} satisfies Record<string, ClaimField>

const registeredWorks = (pro: string): PreflightItem => ({
  id: 'works_registered',
  label: `Your songs are registered with ${pro}`,
  detail: 'Unregistered works can’t be selected in the portal. Register them first.',
})

// ─── Rules ────────────────────────────────────────────────────────────────────

export const PRO_RULES: Record<ProCode, ProRule> = {
  SOCAN: {
    code: 'SOCAN', name: 'SOCAN', program: 'Set Lists & Performances',
    portalLabel: 'Open SOCAN Portal', portalUrl: 'https://memp.socan.com',
    supportUrl: 'https://www.socan.com/contact-us', phone: '1-800-557-6226',
    homeTerritory: 'CA', dateFormat: 'ISO', selfServe: true,
    fields: [F.title, F.songs, F.venue, F.city, F.date, F.promoter],
    preflight: [registeredWorks('SOCAN')],
    notes: [],
    steps: [
      'Log in at memp.socan.com',
      'Set Lists & Performances → Register New Set List',
      'Paste the setlist title',
      'Add Work → search each song by title or work number',
      'Next → venue, date, promoter, attach your set list',
      'Confirm & Submit Setlist',
    ],
    deadline: twelveMonthDeadline,
    deadlineSummary: '12 months from the show — Setlistr\'s working default, confirm in the SOCAN portal',
  },

  ASCAP: {
    code: 'ASCAP', name: 'ASCAP', program: 'ASCAP OnStage',
    portalLabel: 'Open ASCAP OnStage', portalUrl: 'https://www.ascap.com/members',
    supportUrl: 'https://www.ascap.com/help', phone: '1-800-952-7227',
    homeTerritory: 'US', dateFormat: 'MDY', selfServe: true,
    fields: [F.title, F.songs, F.venue, F.city, F.date, F.ticket, F.promoter, F.attendance],
    preflight: [
      {
        id: 'direct_deposit',
        label: 'Direct deposit is your default ASCAP payment method',
        detail: 'ASCAP won’t accept an OnStage claim without it. Member Access → Profile → Payment Information.',
      },
      {
        id: 'works_registered',
        label: 'Your songs are in your ASCAP catalog',
        detail: 'New registrations can take up to 7 days to appear in OnStage.',
      },
    ],
    notes: [
      'Only a writer on the performed works can submit. One writer in the band is enough.',
    ],
    steps: [
      'Log in at ascap.com/members',
      'Works → OnStage → Setlists → Add+',
      'Paste the setlist title',
      'Check each song you performed → Add to Setlist',
      'Performances → Add+ → search your venue',
      'Enter ticket price, promoter, attendance',
      'Select your setlist → Submit',
    ],
    deadline: ascapDeadline,
    deadlineSummary: 'End of the quarter after your show',
  },

  BMI: {
    code: 'BMI', name: 'BMI', program: 'BMI Live',
    portalLabel: 'Open BMI Live', portalUrl: 'https://www.bmi.com',
    supportUrl: 'https://www.bmi.com/contact', phone: '1-800-925-8451',
    homeTerritory: 'US', dateFormat: 'MDY', selfServe: true,
    fields: [F.venue, F.city, F.date, F.time, F.ticket, F.promoterOpt, F.songs],
    preflight: [
      {
        id: 'direct_deposit',
        label: 'You’re enrolled in BMI direct deposit',
        detail: 'BMI Live payments require it.',
      },
      {
        id: 'performing_writer',
        label: 'You’re the performing songwriter',
        detail: 'Only the performing songwriter can enter shows in BMI Live — not a publisher or manager.',
      },
    ],
    notes: [
      'Covers only pay if they’re in the BMI Live cover database — add them with “Add cover song to your setlist”.',
      'BMI Live is for U.S. performances only.',
    ],
    steps: [
      'Log in at bmi.com → Online Services',
      'Open BMI Live from the applications panel',
      'Add a Performance (top right)',
      'Venue, address, date, start time, ticket price',
      'Promoter if applicable',
      'Search each song by title → Submit',
    ],
    deadline: bmiDeadline,
    deadlineSummary: 'Final cutoff is two quarters after your show\'s quarter (December cutoffs are Dec 21). File earlier to be paid a distribution sooner.',
  },

  PRS: {
    code: 'PRS', name: 'PRS for Music', program: 'PRS Live Music Reporting',
    portalLabel: 'Open PRS Portal', portalUrl: 'https://www.prsformusic.com/login',
    supportUrl: 'https://www.prsformusic.com/help', phone: '+44 (0)207 580 5544',
    homeTerritory: 'GB', dateFormat: 'DMY', selfServe: true,
    fields: [F.venue, F.city, F.date, F.ticket, F.promoter, F.songs],
    preflight: [registeredWorks('PRS')],
    notes: [],
    steps: [
      'Log in at prsformusic.com',
      'Live Music → Submit a setlist',
      'Venue, postcode, date, ticket price',
      'Promoter',
      'Add songs and your writer share',
      'Submit',
    ],
    deadline: twelveMonthDeadline,
    deadlineSummary: '12 months from the show — unverified, confirm in the portal',
  },

  APRA: {
    code: 'APRA', name: 'APRA AMCOS', program: 'APRA AMCOS Live Performance',
    portalLabel: 'Open APRA Portal', portalUrl: 'https://www.apraamcos.com.au/members',
    supportUrl: 'https://www.apraamcos.com.au/contact', phone: '+61 2 9935 7900',
    homeTerritory: 'AU', dateFormat: 'DMY', selfServe: true,
    fields: [F.venue, F.city, F.date, F.promoter, F.songs],
    preflight: [registeredWorks('APRA AMCOS')],
    notes: [],
    steps: [
      'Log in at apraamcos.com.au/members',
      'Live Performance → Submit a setlist',
      'Venue, date, promoter, performance details',
      'Add songs from your catalog → Submit',
    ],
    deadline: twelveMonthDeadline,
    deadlineSummary: '12 months from the show — unverified, confirm in the portal',
  },

  SESAC: {
    code: 'SESAC', name: 'SESAC', program: 'SESAC Affiliate Services',
    portalLabel: 'Open SESAC Portal', portalUrl: 'https://affiliates.sesac.com',
    supportUrl: 'https://www.sesac.com/contact',
    homeTerritory: 'US', dateFormat: 'MDY', selfServe: true,
    fields: [F.title, F.venue, F.city, F.capacity, F.date, F.ticket, F.attendance, F.songs],
    preflight: [registeredWorks('SESAC')],
    notes: ['SESAC timelines vary — confirm with your SESAC rep.'],
    steps: [
      'Log in at affiliates.sesac.com',
      'Live Performances',
      'Create a setlist with the title',
      'Venue, capacity, date, ticket price',
      'Add songs → Submit',
    ],
    deadline: repReminder,
    deadlineSummary: 'No published deadline — confirm with your rep',
  },

  GMR: {
    code: 'GMR', name: 'GMR', program: 'GMR — Rep Submission',
    portalLabel: 'Contact GMR Rep', portalUrl: 'https://globalmusicrights.com',
    supportUrl: 'https://globalmusicrights.com/contact',
    homeTerritory: 'US', dateFormat: 'MDY', selfServe: false,
    fields: [F.venue, F.city, F.date, F.promoterOpt, F.attendance, F.songs],
    preflight: [],
    notes: ['GMR has no self-serve portal. Send this sheet to your rep.'],
    steps: [
      'Contact your GMR representative',
      'Send venue, date, promoter, setlist, audience size',
      'Your rep files on your behalf',
    ],
    deadline: repReminder,
    deadlineSummary: 'No published deadline — confirm with your rep',
  },
}

export function getProRule(pro?: string | null): ProRule | null {
  if (!pro) return null
  return (PRO_RULES as Record<string, ProRule>)[pro] ?? null
}

export function getDeadline(pro: string | null | undefined, showDate: Date): DeadlineResult | null {
  const rule = getProRule(pro)
  return rule ? rule.deadline(showDate) : null
}
