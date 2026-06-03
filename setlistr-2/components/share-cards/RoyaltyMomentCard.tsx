'use client'
import React from 'react'

interface RoyaltyMomentCardProps {
  amount: number
  venueName: string
  date: string
  artistName: string
}

export default function RoyaltyMomentCard({ amount, venueName, date, artistName }: RoyaltyMomentCardProps) {
  return (
    <div style={{
      width: '100%', aspectRatio: '9/16', position: 'relative',
      overflow: 'hidden', borderRadius: 16,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      backgroundColor: '#0a0908',
    }}>
      <img src="/share-cards/royalty-moment-bg.png" alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(10,9,8,0.25) 0%, rgba(10,9,8,0.1) 25%, rgba(10,9,8,0.6) 60%, rgba(10,9,8,0.97) 100%)',
      }} />
      <div style={{
        position: 'relative', zIndex: 1, height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '7% 7% 6%', justifyContent: 'space-between',
      }}>

        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 13, fontWeight: 800, color: '#c9a84c',
            letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>ROYALTY MOMENT</span>
          <img src="/logo-horizontal.png" alt="Setlistr"
            style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: 80, fontWeight: 800, color: '#c9a84c',
            lineHeight: 0.85, letterSpacing: '-0.03em', marginBottom: '5%',
            whiteSpace: 'nowrap',
          }}>+${amount}</div>

          <div style={{
            fontSize: 24, fontWeight: 800, color: '#f0ece3',
            lineHeight: 1.2, textTransform: 'uppercase',
            letterSpacing: '0.02em', marginBottom: '4%',
          }}>ESTIMATED ROYALTIES<br />ADDED TONIGHT.</div>

          <div style={{
            fontSize: 16, color: '#c9a84c', fontStyle: 'italic',
            fontWeight: 500, marginBottom: '8%', lineHeight: 1.4,
          }}>Because you tracked your shows.</div>

          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: '5%' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 18, color: '#f0ece3', fontWeight: 700 }}>{venueName}</span>
            <span style={{ fontSize: 13, color: '#8a7a68' }}>{date}</span>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }} />
    </div>
  )
}
