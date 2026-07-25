// setlistr-2/app/support/page.tsx

export const metadata = {
  title: 'Support — Setlistr',
  description: 'Get help with Setlistr: how live capture works, submitting to your PRO, resetting your password, and how to reach us.',
}

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

const FAQS = [
  {
    q: 'How does live capture work?',
    a: 'Start a show from the app before you go on, and Setlistr listens in the background and identifies songs in real time as you play them — no manual setlist typing required. When the show ends, you review the detected songs, fix anything that was missed or misheard, and confirm the final setlist.',
  },
  {
    q: 'How do I submit a show to my PRO?',
    a: 'Once a performance is confirmed, open it from your History and go to Submit. Setlistr formats your setlist to match your PRO\'s requirements (SOCAN, ASCAP, BMI, PRS, APRA, SESAC, or GMR) using the songwriter, publisher, and PRO details in your account Settings. Make sure your PRO affiliation and IPI number are filled in under Settings before submitting.',
  },
  {
    q: 'How do I reset my password?',
    a: 'On the sign-in screen, tap "Forgot password?" and enter the email on your account. We\'ll send a reset link — open it on the same device and choose a new password. If you don\'t see the email within a few minutes, check spam before requesting another one.',
  },
  {
    q: 'How do I contact Setlistr directly?',
    a: 'Email us any time at support@setlistr.ai. We read every message and typically reply within one business day.',
  },
]

export default function SupportPage() {
  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      color: C.text,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      padding: '48px 20px 64px',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{
            color: C.gold, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', margin: '0 0 12px',
          }}>
            Setlistr
          </p>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px', color: C.text }}>
            Support
          </h1>
          <p style={{ fontSize: 15, color: C.secondary, lineHeight: 1.6, margin: 0 }}>
            Questions about capturing shows, submitting to your PRO, or your account? Check the answers below, or
            email us directly — we&apos;re happy to help.
          </p>
        </div>

        {/* Contact card */}
        <div style={{
          background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 16,
          padding: '20px 22px', marginBottom: 32,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase',
            color: C.muted, margin: '0 0 8px',
          }}>
            Contact us
          </p>
          <a
            href="mailto:support@setlistr.ai"
            style={{ fontSize: 18, fontWeight: 700, color: C.gold, textDecoration: 'none' }}
          >
            support@setlistr.ai
          </a>
          <p style={{ fontSize: 13, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
            We typically reply within one business day.
          </p>
        </div>

        {/* FAQ */}
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase',
          color: C.muted, margin: '0 0 14px',
        }}>
          Frequently asked questions
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map((item, i) => (
            <div
              key={i}
              style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: '18px 20px',
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
                {item.q}
              </h2>
              <p style={{ fontSize: 14, color: C.secondary, lineHeight: 1.65, margin: 0 }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: '0.1em',
          textTransform: 'uppercase', opacity: 0.5, marginTop: 40,
        }}>
          Setlistr · support@setlistr.ai
        </p>
      </div>
    </div>
  )
}
