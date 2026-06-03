'use client'
import React from 'react'

interface TonightsRunCardProps {
  artistName: string
  venueName: string
  city: string
  date: string
  songCount: number
  minutes: number
  showNumber: number
}

export default function TonightsRunCard({
  artistName,
  venueName,
  city,
  date,
  songCount,
  minutes,
  showNumber,
}: TonightsRunCardProps) {
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
      {/* Background image */}
      <img
        src={`${typeof window !== 'undefined' ? window.location.origin : ''}/share-cards/show-complete-bg.png`}
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

      {/* Dark overlay for text legibility */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(to bottom, rgba(10,9,8,0.3) 0%, rgba(10,9,8,0.15) 40%, rgba(10,9,8,0.7) 75%, rgba(10,9,8,0.95) 100%)',
      }} />

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '7% 8%',
        justifyContent: 'space-between',
      }}>

        {/* Top — label + logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span style={{
            fontSize: 'clamp(14px, 3.2vw, 20px)',
            fontWeight: 800,
            color: '#c9a84c',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            TONIGHT'S RUN
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <img
              src="/logo-horizontal.png"
              alt="Setlistr"
              style={{
                height: 'clamp(28px, 7vw, 44px)',
                width: 'auto',
                objectFit: 'contain',
              }}
            />
          </div>
        </div>

        {/* Middle — hero text */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: '8%' }}>
          <div style={{
            fontSize: 'clamp(48px, 14vw, 96px)',
            fontWeight: 800,
            color: '#f0ece3',
            lineHeight: 0.88,
            letterSpacing: '-0.03em',
            marginBottom: '6%',
          }}>
            ANOTHER<br />ONE.
          </div>
          <div style={{
            fontSize: 'clamp(22px, 6vw, 38px)',
            fontWeight: 700,
            color: '#c9a84c',
            letterSpacing: '0.04em',
            fontStyle: 'italic',
            marginBottom: '2%',
          }}>
            IN THE BOOKS.
          </div>
        </div>

        {/* Bottom — show details + stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4%' }}>

          {/* Show info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1%' }}>
            <span style={{ fontSize: 'clamp(11px, 2.8vw, 18px)', color: '#c9a84c', fontWeight: 400 }}>{date}</span>
            <span style={{ fontSize: 'clamp(14px, 3.5vw, 22px)', color: '#f0ece3', fontWeight: 700 }}>{venueName}</span>
            <span style={{ fontSize: 'clamp(12px, 2.8vw, 17px)', color: '#b8a888', fontWeight: 400 }}>{city}</span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />

          {/* Stats row */}
          <div style={{ display: 'flex', gap: '8%', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 'clamp(36px, 10vw, 64px)', fontWeight: 800, color: '#f0ece3', lineHeight: 1, letterSpacing: '-0.02em' }}>{songCount}</span>
              <span style={{ fontSize: 'clamp(12px, 2.8vw, 18px)', color: '#8a7a68', letterSpacing: '0.12em', textTransform: 'uppercase' }}>SONGS</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 'clamp(36px, 10vw, 64px)', fontWeight: 800, color: '#f0ece3', lineHeight: 1, letterSpacing: '-0.02em' }}>{minutes}</span>
              <span style={{ fontSize: 'clamp(12px, 2.8vw, 18px)', color: '#8a7a68', letterSpacing: '0.12em', textTransform: 'uppercase' }}>MINUTES</span>
            </div>
            {showNumber > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 'clamp(28px, 8vw, 52px)', fontWeight: 800, color: '#c9a84c', lineHeight: 1, letterSpacing: '-0.02em' }}>#{showNumber}</span>
                <span style={{ fontSize: 'clamp(12px, 2.8vw, 18px)', color: '#8a7a68', letterSpacing: '0.12em', textTransform: 'uppercase' }}>SHOW</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Bottom gold bar */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 3,
        background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
      }} />
    </div>
  )
}
