// setlistr-2/app/support/page.tsx

export const metadata = {
  title: 'Support — Setlistr',
  description: 'Get help with Setlistr: how live capture works, submitting to your PRO, resetting your password, and how to reach us. FAQs and support contact.',
}

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

const FAQS = [
  {
    q: 'How does Setlistr capture my show?',
    a: 'Start a capture before you go on stage. Setlistr listens and identifies the songs you perform, then builds a record of your set — venue, date, and every song in order. You review it afterward, so nothing is final until you\'ve seen it.',
  },
  {
    q: 'Do I need to enter my setlist manually?',
    a: 'No. Setlistr identifies what you play automatically. You can add a planned setlist beforehand to improve accuracy, but it isn\'t required — just hit capture and play.',
  },
  {
    q: 'What happens after the show?',
    a: 'You get a review screen showing everything Setlistr captured. Confirm anything the app flagged as uncertain, make any edits, and save. Your show is then a verified record you can submit or keep.',
  },
  {
    q: 'How do I submit to my PRO?',
    a: 'Once a show is reviewed and saved, Setlistr prepares it for your performing rights organization — SOCAN, ASCAP, BMI, PRS, APRA, SESAC, or GMR — with the performance details they need. You stay in control of what gets submitted.',
  },
  {
    q: 'Will this get me paid?',
    a: 'Setlistr helps you capture and submit verified performance data so your live shows are properly documented and claimed. Actual payments are determined by your PRO based on their rules and rates — Setlistr doesn\'t pay royalties directly, and payout amounts vary. For cover songs, Setlistr builds an accurate record of what you performed; whether a performance generates a payment depends on your PRO and the rights involved.',
  },
  {
    q: 'Does Setlistr record audio of my whole show?',
    a: 'Setlistr uses your device\'s microphone to identify the songs you perform. It\'s built to recognize your setlist, not to store continuous recordings of your performance.',
  },
  {
    q: 'How do I reset my password?',
    a: 'On the login screen, tap "Forgot password?" and enter your email. You\'ll get a link to set a new password. If you don\'t see the email, check your spam folder.',
  },
  {
    q: 'How do I contact support?',
    a: 'Email us at info@setlistr.ai and we\'ll get back to you.',
  },
  {
    q: 'Who built Setlistr?',
    a: 'Setlistr is built by working songwriters and performers who wanted live performance royalties to actually get captured and claimed. We\'re based in Nashville, Tennessee.',
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
            href="mailto:info@setlistr.ai"
            style={{ fontSize: 18, fontWeight: 700, color: C.gold, textDecoration: 'none' }}
          >
            info@setlistr.ai
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
          Setlistr · info@setlistr.ai
        </p>
      </div>
    </div>
  )
}
