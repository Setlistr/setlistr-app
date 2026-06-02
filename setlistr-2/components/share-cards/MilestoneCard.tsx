'use client'
import React from 'react'

interface MilestoneCardProps {
  showNumber: number
  artistName: string
}

const SPECIAL_MILESTONES: Record<number, string> = {
  1: 'The first of many.',
  5: 'The habit begins.',
  10: 'Getting serious.',
  25: 'Quarter Century Club.',
  50: 'Now we\'re cooking.',
  75: 'Three quarters to 100.',
  100: 'The Run Continues.',
  150: '150 nights on stage.',
  200: 'Two hundred. Still standing.',
  250: 'A quarter thousand shows.',
}

const SPECIAL_NUMBERS = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250]

function getTagline(showNumber: number): string {
  return SPECIAL_MILESTONES[showNumber] || 'The road remembers.'
}

function isSpecial(showNumber: number): boolean {
  return SPECIAL_NUMBERS.includes(showNumber)
}

export default function MilestoneCard({ showNumber, artistName }: MilestoneCardProps) {
  const special = isSpecial(showNumber)
  const tagline = getTagline(showNumber)
  const bgImage = special
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share-cards/milestone-special-bg.png`
    : `${typeof window !== 'undefined' ? window.location.origin : ''}/share-cards/milestone-standard-bg.png`

  return (
    <div style={{
      width: '100%',
      aspectRatio: '9/16',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 16,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      backgroundColor: '#0a0908',
    }}>
      <img
        src={bgImage}
        alt=""
        onError={(e) => { console.error('Image failed to load:', (e.target as HTMLImageElement).src) }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
        }}
      />

      <div style={{
        position: 'absolute',
        inset: 0,
        background: special
          ? 'linear-gradient(to bottom, rgba(10,9,8,0.5) 0%, rgba(10,9,8,0.2) 40%, rgba(10,9,8,0.8) 80%, rgba(10,9,8,0.97) 100%)'
          : 'linear-gradient(to bottom, rgba(10,9,8,0.6) 0%, rgba(10,9,8,0.3) 40%, rgba(10,9,8,0.85) 80%, rgba(10,9,8,0.97) 100%)',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '7% 8%',
        justifyContent: 'space-between',
      }}>

        {/* Top */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{
            fontSize: 'clamp(10px, 2.2vw, 14px)',
            fontWeight: 700,
            color: special ? '#c9a84c' : '#8a7a68',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            {special ? 'MILESTONE' : 'SHOW'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <img
              src="/logo-horizontal.png"
              alt="Setlistr"
              style={{
                height: 'clamp(22px, 5vw, 32px)',
                width: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>

        {/* Middle — big number */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}>
          {special && (
            <div style={{
              width: '100%',
              height: 2,
              background: 'linear-gradient(90deg, #c9a84c, transparent)',
              marginBottom: '6%',
            }} />
          )}
          <div style={{
            fontSize: 'clamp(80px, 26vw, 160px)',
            fontWeight: 800,
            color: special ? '#f0ece3' : '#f0ece3',
            lineHeight: 0.85,
            letterSpacing: '-0.04em',
            marginBottom: '4%',
          }}>
            {showNumber}
          </div>
          <div style={{
            fontSize: 'clamp(20px, 5.5vw, 36px)',
            fontWeight: 800,
            color: '#c9a84c',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '6%',
          }}>
            {showNumber === 1 ? 'SHOW' : 'SHOWS'}
          </div>
          {special && (
            <div style={{
              width: '100%',
              height: 2,
              background: 'linear-gradient(90deg, #c9a84c, transparent)',
              marginBottom: '6%',
            }} />
          )}
        </div>

        {/* Bottom — tagline + artist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3%' }}>
          <div style={{
            fontSize: 'clamp(18px, 4.5vw, 30px)',
            color: special ? '#f0ece3' : '#b8a888',
            fontStyle: 'italic',
            fontWeight: special ? 600 : 400,
            lineHeight: 1.3,
          }}>
            {tagline}
          </div>
          <span style={{
            fontSize: 'clamp(11px, 2.5vw, 16px)',
            color: '#8a7a68',
            letterSpacing: '0.06em',
          }}>
            {artistName}
          </span>
        </div>

      </div>

      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 3,
        background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
      }} />
    </div>
  )
}
