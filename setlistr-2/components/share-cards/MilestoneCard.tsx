'use client'
import React from 'react'

interface MilestoneCardProps {
  showNumber: number
  artistName: string
}

const SPECIAL_MILESTONES: Record<number, string> = {
  1: 'Your record starts here.',
  5: 'The habit begins.',
  10: 'Getting serious.',
  25: 'Quarter Century Club.',
  50: 'Now we\'re talking.',
  75: 'Three quarters to 100.',
  100: 'The Run Continues.',
  150: '150 verified nights.',
  200: 'Two hundred. Still standing.',
  250: 'A quarter thousand shows.',
}

const SPECIAL_NUMBERS = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250]

export default function MilestoneCard({ showNumber, artistName }: MilestoneCardProps) {
  const special = SPECIAL_NUMBERS.includes(showNumber)
  const tagline = SPECIAL_MILESTONES[showNumber] || 'Another verified show.'
  const bgImage = special ? '/share-cards/milestone-special-bg.png' : '/share-cards/milestone-standard-bg.png'

  return (
    <div style={{
      width: '100%', aspectRatio: '9/16', position: 'relative',
      overflow: 'hidden', borderRadius: 16,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      backgroundColor: '#0a0908',
    }}>
      <img src={bgImage} alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: special
          ? 'linear-gradient(to bottom, rgba(10,9,8,0.4) 0%, rgba(10,9,8,0.15) 30%, rgba(10,9,8,0.7) 65%, rgba(10,9,8,0.97) 100%)'
          : 'linear-gradient(to bottom, rgba(10,9,8,0.5) 0%, rgba(10,9,8,0.25) 30%, rgba(10,9,8,0.8) 65%, rgba(10,9,8,0.97) 100%)',
      }} />
      <div style={{
        position: 'relative', zIndex: 1, height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '7% 7% 6%', justifyContent: 'space-between',
      }}>

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
            color: special ? '#c9a84c' : '#8a7a68',
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>{special ? 'MILESTONE' : 'VERIFIED SHOW'}</span>
          <img src="/logo-horizontal.png" alt="Setlistr"
            style={{ height: 20, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {special && (
            <div style={{ width: '50%', height: 2, background: 'linear-gradient(90deg, #c9a84c, transparent)', marginBottom: '5%' }} />
          )}

          <div style={{
            fontSize: 100, fontWeight: 800, color: '#f0ece3',
            lineHeight: 0.85, letterSpacing: '-0.04em', marginBottom: '3%',
          }}>{showNumber}</div>

          <div style={{
            fontSize: 28, fontWeight: 800, color: '#c9a84c',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            marginBottom: '6%', whiteSpace: 'nowrap',
          }}>{showNumber === 1 ? 'VERIFIED SHOW' : 'VERIFIED SHOWS'}</div>

          {special && (
            <div style={{ width: '50%', height: 2, background: 'linear-gradient(90deg, #c9a84c, transparent)', marginBottom: '6%' }} />
          )}

          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: '5%' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{
              fontSize: 22, color: special ? '#f0ece3' : '#b8a888',
              fontStyle: 'italic', fontWeight: special ? 700 : 400, lineHeight: 1.3,
            }}>{tagline}</span>
            <span style={{ fontSize: 13, color: '#8a7a68', letterSpacing: '0.04em' }}>{artistName}</span>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }} />
    </div>
  )
}
