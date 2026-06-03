'use client'
import React from 'react'

interface RoyaltyMomentCardProps {
  amount: number
  venueName: string
  date: string
  artistName: string
}

export default function RoyaltyMomentCard({
  amount,
  venueName,
  date,
  artistName,
}: RoyaltyMomentCardProps) {
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
        src={`${typeof window !== 'undefined' ? window.location.origin : ''}/share-cards/royalty-moment-bg.png`}
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
        background: 'linear-gradient(to bottom, rgba(10,9,8,0.4) 0%, rgba(10,9,8,0.2) 30%, rgba(10,9,8,0.75) 70%, rgba(10,9,8,0.97) 100%)',
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
            color: '#c9a84c',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            ROYALTY MOMENT
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

        {/* Middle — hero amount */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{
            fontSize: 'clamp(64px, 20vw, 128px)',
            fontWeight: 800,
            color: '#c9a84c',
            lineHeight: 0.85,
            letterSpacing: '-0.03em',
            marginBottom: '5%',
          }}>
            +${amount}
          </div>
          <div style={{
            fontSize: 'clamp(16px, 4vw, 26px)',
            fontWeight: 700,
            color: '#f0ece3',
            lineHeight: 1.2,
            marginBottom: '4%',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}>
            ESTIMATED ROYALTIES<br />ADDED TONIGHT.
          </div>
          <div style={{
            fontSize: 'clamp(13px, 3vw, 19px)',
            color: '#c9a84c',
            fontStyle: 'italic',
            fontWeight: 400,
          }}>
            Because you tracked your shows.
          </div>
        </div>

        {/* Bottom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3%' }}>
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          <span style={{ fontSize: 'clamp(14px, 3.2vw, 20px)', color: '#f0ece3', fontWeight: 700 }}>{venueName}</span>
          <span style={{ fontSize: 'clamp(11px, 2.5vw, 16px)', color: '#8a7a68' }}>{date}</span>
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
