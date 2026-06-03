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
        background: 'linear-gradient(to bottom, rgba(10,9,8,0.3) 0%, rgba(10,9,8,0.1) 30%, rgba(10,9,8,0.65) 65%, rgba(10,9,8,0.97) 100%)',
      }} />
      <div style={{
        position: 'relative', zIndex: 1, height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '6% 7%', justifyContent: 'space-between',
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: 'clamp(13px, 3.5vw, 22px)', fontWeight: 800,
            color: '#c9a84c', letterSpacing: '0.2em', textTransform: 'uppercase',
          }}>ROYALTY MOMENT</span>
          <img src="/logo-horizontal.png" alt="Setlistr"
            style={{ height: 'clamp(24px, 6vw, 40px)', width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: 'clamp(64px, 18vw, 128px)', fontWeight: 800,
            color: '#c9a84c', lineHeight: 0.85, letterSpacing: '-0.03em',
            marginBottom: '5%',
          }}>+${amount}</div>

          <div style={{
            fontSize: 'clamp(20px, 5vw, 36px)', fontWeight: 800,
            color: '#f0ece3', lineHeight: 1.15, textTransform: 'uppercase',
            letterSpacing: '0.02em', marginBottom: '4%',
          }}>ESTIMATED ROYALTIES<br />ADDED TONIGHT.</div>

          <div style={{
            fontSize: 'clamp(16px, 4vw, 26px)', color: '#c9a84c',
            fontStyle: 'italic', fontWeight: 500, marginBottom: '8%',
          }}>Because you tracked your shows.</div>

          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: '5%' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2%' }}>
            <span style={{ fontSize: 'clamp(16px, 4vw, 28px)', color: '#f0ece3', fontWeight: 700 }}>{venueName}</span>
            <span style={{ fontSize: 'clamp(13px, 3vw, 20px)', color: '#8a7a68' }}>{date}</span>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }} />
    </div>
  )
}
