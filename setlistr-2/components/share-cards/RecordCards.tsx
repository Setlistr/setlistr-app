'use client'
// The two record cards an artist shares after a show, in Setlistr's original
// art direction: stage photography, bold type, room to breathe, restrained gold.
//
//   NightCard      the artist is the headline; venue, city, date and songs support it.
//   MilestoneCard  a show that is itself the 25th, 50th, 75th… on the artist's record
//                  in show-date order (lib/record-summary.ts recordPositionOf).
//
// Neither says "tonight" or "new", so re-sharing later stays true. The milestone
// says "Through <date>": the number is the shows on the record up to and
// including that night, which stays accurate even though a backdated show can
// later move the milestone to another night (the card is then no longer offered
// for this one).
//
// Story is 9:16 and keeps clear of Instagram's top bar (~13%) and reply bar
// (~18%); Feed is 4:5, composed for its own frame. Sizes are in container
// units (cqw) so the composition is identical at any preview width, and the
// export (lib/share-card-export.ts) is always 1080px wide.
//
// Exported with html-to-image, which keeps each element's measured height: a
// single-line label never wraps and keeps spare width, so a renderer that sets
// text a hair wider can't push a line into the next element.
import React from 'react'
import type { ShareFormat } from '@/lib/share-card-export'

const CREAM = '#f0ece3', SAND = '#b8a888', GOLD = '#c9a84c'
const SANS = '"DM Sans", system-ui, sans-serif'
const DISPLAY = '"Bebas Neue", "Oswald", "Arial Narrow", sans-serif'
// Designed on a 335px card; u(px) scales with the card.
const u = (px: number) => `${+(px / 3.35).toFixed(3)}cqw`

function Frame({ format, image, children }: { format: ShareFormat; image: string; children: React.ReactNode }) {
  const story = format === 'story'
  return (
    <div style={{ width: '100%', aspectRatio: story ? '9/16' : '4/5', position: 'relative', overflow: 'hidden', borderRadius: u(16), fontFamily: SANS, backgroundColor: '#0a0908', containerType: 'inline-size' } as React.CSSProperties}>
      {/* The photograph as it is: no grading, centred. */}
      <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      {/* A readable band for the brand row, open photograph in the middle, deep shadow under the type. */}
      <div style={{ position: 'absolute', inset: 0, background: story
        ? 'linear-gradient(to bottom, rgba(10,9,8,0.62) 0%, rgba(10,9,8,0.42) 16%, rgba(10,9,8,0.04) 32%, rgba(10,9,8,0.10) 46%, rgba(10,9,8,0.84) 64%, rgba(10,9,8,0.97) 82%, rgba(10,9,8,0.98) 100%)'
        : 'linear-gradient(to bottom, rgba(10,9,8,0.62) 0%, rgba(10,9,8,0.35) 13%, rgba(10,9,8,0.04) 26%, rgba(10,9,8,0.45) 36%, rgba(10,9,8,0.88) 52%, rgba(10,9,8,0.97) 100%)' }} />
      <div style={{ position: 'absolute', left: '7%', right: '7%', top: story ? '13.5%' : '7%', bottom: story ? '19%' : '7%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {children}
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: u(3), background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
    </div>
  )
}

function TopBar({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: u(12) }}>
      <span style={{ fontSize: u(12.5), fontWeight: 800, color: GOLD, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.3 }}>{label}</span>
      {/* The wordmark PNG carries wide transparent padding; this box shows just the mark. */}
      <div style={{ height: u(17), width: u(92), flex: 'none', overflow: 'hidden', position: 'relative' }}>
        <img src="/logo-horizontal.png" alt="Setlistr" style={{ position: 'absolute', height: u(39), width: 'auto', left: u(-1), top: u(-11) }} />
      </div>
    </div>
  )
}

const rule = (story: boolean): React.CSSProperties => ({ height: 1, backgroundColor: 'rgba(255,255,255,0.18)', margin: story ? '7% 0 5%' : '5% 0 4%' })

export function NightCard({ format, photoUrl, artistName, venueName, city, date, songCount }: {
  format: ShareFormat
  photoUrl?: string | null          // the artist's own show photo, when they added one
  artistName: string; venueName: string; city: string
  date: string                      // display date of the show
  songCount: number                 // this show's saved songs
}) {
  const story = format === 'story'
  // The name is the headline: sized so its longest word fits with room to
  // spare (DM Sans 800 capitals ≈ 0.7em a letter), never broken mid-word.
  const longest = Math.max(1, ...artistName.split(/\s+/).map(w => w.length))
  const base = story ? 60 : 52
  const nameSize = Math.max(28, Math.min(base, Math.floor(288 * 0.9 / (longest * 0.7)), artistName.length > 30 ? (story ? 40 : 34) : base))
  return (
    <Frame format={format} image={photoUrl || '/share-cards/show-complete-bg.png'}>
      <TopBar label={date} />
      <div>
        <div style={{ fontSize: u(story ? 24 : 21), fontWeight: 700, color: GOLD, fontStyle: 'italic', letterSpacing: '0.04em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>IN THE BOOKS.</div>
        <div style={{ fontSize: u(nameSize), fontWeight: 800, color: CREAM, lineHeight: 1, letterSpacing: '-0.03em', textTransform: 'uppercase', marginTop: u(story ? 10 : 8), textWrap: 'balance' } as React.CSSProperties}>{artistName}</div>
        <div style={rule(story)} />
        <div style={{ fontSize: u(17.5), fontWeight: 700, color: CREAM, lineHeight: 1.3, paddingRight: '8%' }}>Live at {venueName}</div>
        <div style={{ fontSize: u(13.5), color: SAND, lineHeight: 1.4, marginTop: u(4), paddingRight: '8%' }}>{[city, `${songCount} ${songCount === 1 ? 'song' : 'songs'}`].filter(Boolean).join(' · ')}</div>
      </div>
    </Frame>
  )
}

export function MilestoneCard({ format, milestone, artistName, venueName, date }: {
  format: ShareFormat
  milestone: number                 // this show's position on the record (a multiple of 25)
  artistName: string; venueName: string
  date: string                      // display date of the show
}) {
  const story = format === 'story'
  // One gold dot per show, as on the dashboard: rows of 25 in groups of five.
  // Beyond 100 shows the dots stop reading as a count, so they're left out.
  const rows = milestone <= 100 ? Math.ceil(milestone / 25) : 0
  return (
    <Frame format={format} image="/share-cards/milestone-special-bg.png">
      <TopBar label="Milestone" />
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: u(story ? 168 : 140), lineHeight: 0.86, color: CREAM, letterSpacing: '0.005em', marginLeft: u(-4), whiteSpace: 'nowrap' }}>{milestone}</div>
        <div style={{ fontSize: u(story ? 18.5 : 17), fontWeight: 800, color: GOLD, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.25, marginTop: u(story ? 12 : 8), whiteSpace: 'nowrap' }}>Shows on the record</div>
        {rows > 0 && (
          <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: u(5), marginTop: u(story ? 14 : 10), width: u(262) }}>
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} style={{ display: 'flex', justifyContent: 'space-between' }}>
                {Array.from({ length: 5 }, (_, g) => (
                  <span key={g} style={{ display: 'flex', gap: u(3.5) }}>
                    {Array.from({ length: 5 }, (_, d) => <span key={d} style={{ width: u(6.5), height: u(6.5), borderRadius: '50%', background: GOLD }} />)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={rule(story)} />
        <div style={{ fontSize: u(19), fontWeight: 800, color: CREAM, lineHeight: 1.25, textTransform: 'uppercase', letterSpacing: '0.02em', paddingRight: '8%' }}>{artistName}</div>
        <div style={{ fontSize: u(13.5), color: SAND, lineHeight: 1.4, marginTop: u(4), whiteSpace: 'nowrap' }}>Through {date}</div>
        <div style={{ fontSize: u(13.5), color: SAND, lineHeight: 1.4, paddingRight: '8%' }}>{venueName}</div>
      </div>
    </Frame>
  )
}
