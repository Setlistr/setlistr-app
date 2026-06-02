'use client'
import TonightsRunCard from '@/components/share-cards/TonightsRunCard'
import RoyaltyMomentCard from '@/components/share-cards/RoyaltyMomentCard'
import MilestoneCard from '@/components/share-cards/MilestoneCard'

export default function SharePreviewPage() {
  return (
    <div style={{
      minHeight: '100svh',
      background: '#0a0908',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      padding: '40px 20px',
    }}>
      <p style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: '#c9a84c',
        margin: '0 0 40px', textAlign: 'center',
      }}>
        Share Card Preview
      </p>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        justifyContent: 'center',
        maxWidth: 1200,
        margin: '0 auto',
      }}>

        {/* Tonight's Run */}
        <div style={{ width: 320 }}>
          <p style={{ fontSize: 11, color: '#8a7a68', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Tonight's Run</p>
          <TonightsRunCard
            artistName="Jesse Slack"
            venueName="Tootsie's Orchid Lounge"
            city="Nashville, TN"
            date="June 2, 2026"
            songCount={11}
            minutes={52}
            showNumber={23}
          />
        </div>

        {/* Royalty Moment */}
        <div style={{ width: 320 }}>
          <p style={{ fontSize: 11, color: '#8a7a68', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Royalty Moment</p>
          <RoyaltyMomentCard
            artistName="Jesse Slack"
            venueName="Tootsie's Orchid Lounge"
            date="June 2, 2026"
            amount={37}
          />
        </div>

        {/* Milestone — standard */}
        <div style={{ width: 320 }}>
          <p style={{ fontSize: 11, color: '#8a7a68', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Milestone — Show 23</p>
          <MilestoneCard
            showNumber={23}
            artistName="Jesse Slack"
          />
        </div>

        {/* Milestone — special 25 */}
        <div style={{ width: 320 }}>
          <p style={{ fontSize: 11, color: '#8a7a68', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Milestone — Show 25 (Special)</p>
          <MilestoneCard
            showNumber={25}
            artistName="Jesse Slack"
          />
        </div>

        {/* Milestone — special 100 */}
        <div style={{ width: 320 }}>
          <p style={{ fontSize: 11, color: '#8a7a68', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Milestone — Show 100 (Special)</p>
          <MilestoneCard
            showNumber={100}
            artistName="Jesse Slack"
          />
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
      `}</style>
    </div>
  )
}
