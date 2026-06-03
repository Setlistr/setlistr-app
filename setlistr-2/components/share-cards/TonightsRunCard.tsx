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
  artistName, venueName, city, date, songCount, minutes, showNumber,
}: TonightsRunCardProps) {
  return (
    <div style={{
      width: '100%', aspectRatio: '9/16', position: 'relative',
      overflow: 'hidden', borderRadius: 16,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      backgroundColor: '#0a0908',
    }}>
      <img src="/share-cards/show-complete-bg.png" alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(10,9,8,0.2) 0%, rgba(10,9,8,0.05) 30%, rgba(10,9,8,0.6) 65%, rgba(10,9,8,0.97) 100%)',
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
          }}>TONIGHT'S RUN</span>
          <img src="/logo-horizontal.png" alt="Setlistr"
            style={{ height: 'clamp(24px, 6vw, 40px)', width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontSize: 'clamp(52px, 15vw, 108px)', fontWeight: 800,
            color: '#f0ece3', lineHeight: 0.88, letterSpacing: '-0.03em',
            marginBottom: '4%',
          }}>ANOTHER<br />ONE.</div>
          <div style={{
            fontSize: 'clamp(22px, 6vw, 42px)', fontWeight: 700,
            color: '#c9a84c', letterSpacing: '0.04em', fontStyle: 'italic',
            marginBottom: '8%',
          }}>IN THE BOOKS.</div>

          {/* Show details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5%', marginBottom: '5%' }}>
            <span style={{ fontSize: 'clamp(13px, 3.2vw, 22px)', color: '#c9a84c', fontWeight: 500 }}>{date}</span>
            <span style={{ fontSize: 'clamp(16px, 4vw, 28px)', color: '#f0ece3', fontWeight: 700 }}>{venueName}</span>
            <span style={{ fontSize: 'clamp(13px, 3vw, 20px)', color: '#b8a888', fontWeight: 400 }}>{city}</span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: '5%' }} />

          {/* Stats */}
          <div style={{ display: 'flex', gap: '10%', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'clamp(36px, 10vw, 72px)', fontWeight: 800, color: '#f0ece3', lineHeight: 1, letterSpacing: '-0.02em' }}>{songCount}</span>
              <span style={{ fontSize: 'clamp(11px, 2.8vw, 18px)', color: '#8a7a68', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>SONGS</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 'clamp(36px, 10vw, 72px)', fontWeight: 800, color: '#f0ece3', lineHeight: 1, letterSpacing: '-0.02em' }}>{minutes}</span>
              <span style={{ fontSize: 'clamp(11px, 2.8vw, 18px)', color: '#8a7a68', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>MINUTES</span>
            </div>
            {showNumber > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 'clamp(36px, 10vw, 72px)', fontWeight: 800, color: '#c9a84c', lineHeight: 1, letterSpacing: '-0.02em' }}>#{showNumber}</span>
                <span style={{ fontSize: 'clamp(11px, 2.8vw, 18px)', color: '#8a7a68', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>SHOW</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }} />
    </div>
  )
}
