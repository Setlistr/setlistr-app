'use client'
import React from 'react'

interface SongDebutCardProps {
  songTitle: string
  artistName: string
  venueName: string
  date: string
  totalDebuts: number
}

export default function SongDebutCard({ songTitle, artistName, venueName, date, totalDebuts }: SongDebutCardProps) {
  return (
    <div style={{
      width: '100%', aspectRatio: '9/16', height: '100%', position: 'relative',
      overflow: 'hidden', borderRadius: 16,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      backgroundColor: '#0a0908',
    }}>
      <img src="/share-cards/milestone-special-bg.png" alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(10,9,8,0.4) 0%, rgba(10,9,8,0.15) 30%, rgba(10,9,8,0.7) 65%, rgba(10,9,8,0.97) 100%)',
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
          }}>LIVE DEBUT</span>
          <img src="/logo-horizontal.png" alt="Setlistr"
            style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Hero */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: '50%', height: 2, background: 'linear-gradient(90deg, #c9a84c, transparent)', marginBottom: '5%' }} />

          <div style={{
            fontSize: 13, fontWeight: 700, color: '#c9a84c',
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '4%',
          }}>First time ever.</div>

          <div style={{
            fontSize: 42, fontWeight: 800, color: '#f0ece3',
            lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: '6%',
          }}>{songTitle}</div>

          <div style={{ width: '50%', height: 2, background: 'linear-gradient(90deg, #c9a84c, transparent)', marginBottom: '6%' }} />

          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: '5%' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {totalDebuts > 1 && (
              <span style={{ fontSize: 13, color: '#c9a84c', fontWeight: 600, marginBottom: 4 }}>
                + {totalDebuts - 1} more debut{totalDebuts - 1 > 1 ? 's' : ''} tonight
              </span>
            )}
            <span style={{ fontSize: 18, color: '#f0ece3', fontWeight: 700 }}>{venueName}</span>
            <span style={{ fontSize: 13, color: '#8a7a68' }}>{date}</span>
            <span style={{ fontSize: 13, color: '#8a7a68', letterSpacing: '0.04em' }}>{artistName}</span>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }} />
    </div>
  )
}
