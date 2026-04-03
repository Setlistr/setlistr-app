import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Terms of Service | Setlistr',
  description: 'Terms of Service for Setlistr — live performance tracking and royalty submission platform.',
  alternates: { canonical: 'https://setlistr.ai/terms' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 12px', letterSpacing: '-0.01em' }}>{title}</h2>
      <div style={{ fontSize: 15, color: C.secondary, lineHeight: 1.75 }}>{children}</div>
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: '0 0 12px' }}>{children}</p>
}

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />

      {/* Nav */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,9,8,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Image src="/logo-white.png" alt="Setlistr" width={130} height={34} priority style={{ objectFit: 'contain' }} />
          </Link>
          <Link href="/app/show/new" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, color: '#0a0908', background: C.gold, borderRadius: 8, padding: '8px 16px' }}>
            Start Free →
          </Link>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 12px', marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Legal</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 12px', letterSpacing: '-0.03em' }}>Terms of Service</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Last updated: April 3, 2026 · Effective immediately</p>
        </div>

        {/* Intro */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 40 }}>
          <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.7 }}>
            These Terms of Service ("Terms") govern your access to and use of Setlistr ("we," "us," "our"), 
            including our website at setlistr.ai and our mobile and web applications (collectively, the "Service"). 
            By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, 
            do not use the Service.
          </p>
        </div>

        <Section title="1. Who We Are">
          <P>Setlistr is a live performance tracking and royalty submission platform designed to help performing songwriters capture setlists and submit them to Performing Rights Organizations (PROs) such as SOCAN, ASCAP, BMI, PRS for Music, and APRA AMCOS.</P>
          <P>Setlistr is operated by Jesse Slack (doing business as Setlistr). For questions about these Terms, contact us at <a href="mailto:hello@setlistr.ai" style={{ color: C.gold }}>hello@setlistr.ai</a>.</P>
        </Section>

        <Section title="2. Eligibility">
          <P>You must be at least 18 years old to use the Service. By using the Service, you represent that you are 18 or older and have the legal capacity to enter into a binding agreement.</P>
        </Section>

        <Section title="3. Your Account">
          <P>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately at <a href="mailto:hello@setlistr.ai" style={{ color: C.gold }}>hello@setlistr.ai</a> if you suspect unauthorized access.</P>
          <P>You must provide accurate, complete information when creating your account. We reserve the right to suspend or terminate accounts that contain false information or violate these Terms.</P>
        </Section>

        <Section title="4. Audio Recording and Detection">
          <P><strong style={{ color: C.text }}>Important: Setlistr uses your device's microphone to detect and identify songs during live performances.</strong></P>
          <P>By using the live capture feature, you explicitly consent to Setlistr accessing your device's microphone and processing audio through our song recognition service (currently ACRCloud). Audio is processed in real-time and is not stored by Setlistr on our servers. Short audio fingerprints are transmitted to our recognition service for matching purposes only.</P>
          <P>You are responsible for ensuring that your use of the audio detection feature complies with applicable laws in your jurisdiction, including any laws regarding recording or monitoring in public venues. In most jurisdictions, capturing audio in a public performance venue for the purpose of identifying your own songs is lawful, but you should verify this for your specific location.</P>
          <P>You must not use the audio detection feature to identify, record, or monitor performances without the knowledge or consent of other performers where required by law.</P>
        </Section>

        <Section title="5. Royalty Estimates — Important Disclaimer">
          <P><strong style={{ color: C.text }}>Royalty estimates provided by Setlistr are for informational purposes only and are not a guarantee of payment.</strong></P>
          <P>Our estimates are based on publicly available PRO tariff data and general industry averages. Actual royalty payments depend on many factors outside our control, including but not limited to: whether the venue has paid its PRO license fee, your PRO's distribution rules and timing, your song registration status, co-writer splits, venue capacity, and PRO-specific calculation methodologies.</P>
          <P>Setlistr is not a licensed financial advisor or legal advisor. Nothing on this platform constitutes financial or legal advice. Always verify royalty information directly with your PRO.</P>
        </Section>

        <Section title="6. Not Affiliated with PROs">
          <P>Setlistr is an independent platform and is not affiliated with, endorsed by, sponsored by, or officially connected to SOCAN, ASCAP, BMI, SESAC, GMR, PRS for Music, APRA AMCOS, or any other Performing Rights Organization. All PRO names and trademarks are the property of their respective owners.</P>
          <P>Setlistr does not submit setlists to PROs on your behalf unless you explicitly use and authorize our export or submission assistance features. You remain solely responsible for completing your own PRO submissions.</P>
        </Section>

        <Section title="7. Acceptable Use">
          <P>You agree not to:</P>
          <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
            {[
              'Use the Service for any unlawful purpose',
              'Attempt to reverse engineer, hack, or disrupt the Service',
              'Submit false or misleading performance data',
              'Use the audio detection feature to monitor third parties without their consent',
              'Scrape, crawl, or extract data from the Service without written permission',
              'Impersonate another person or entity',
              'Upload malicious code or interfere with the Service\'s operation',
            ].map(item => (
              <li key={item} style={{ marginBottom: 6, color: C.secondary }}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="8. Intellectual Property">
          <P>The Setlistr name, logo, software, and content are owned by Setlistr and protected by applicable intellectual property laws. You may not use our branding or content without written permission.</P>
          <P>You retain ownership of your setlist data, performance history, and any content you submit through the Service. By using the Service, you grant Setlistr a limited license to store, process, and display your data for the purpose of providing the Service to you.</P>
          <P>We will never sell your personal data or setlist data to third parties.</P>
        </Section>

        <Section title="9. Third-Party Services">
          <P>Setlistr integrates with third-party services including ACRCloud (audio recognition), Supabase (data storage), Spotify (catalog data), and Vercel (hosting). Your use of these services is subject to their respective terms and privacy policies. We are not responsible for the practices of third-party services.</P>
        </Section>

        <Section title="10. Beta Features">
          <P>Some features of Setlistr are in beta. Beta features are provided "as-is" and may be changed, removed, or limited at any time without notice. We appreciate your feedback on beta features and use it to improve the Service.</P>
        </Section>

        <Section title="11. Limitation of Liability">
          <P>To the maximum extent permitted by applicable law, Setlistr shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to lost royalty payments, lost profits, loss of data, or business interruption.</P>
          <P>Setlistr's total liability to you for any claim arising from your use of the Service shall not exceed the amount you paid to Setlistr in the 12 months preceding the claim, or $100 CAD, whichever is greater.</P>
          <P>Some jurisdictions do not allow the limitation of certain damages. In such jurisdictions, our liability is limited to the greatest extent permitted by law.</P>
        </Section>

        <Section title="12. Disclaimer of Warranties">
          <P>The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, error-free, or that song detection will be accurate in all circumstances. Audio detection accuracy depends on venue acoustics, background noise, microphone quality, and other factors outside our control.</P>
        </Section>

        <Section title="13. Indemnification">
          <P>You agree to indemnify and hold harmless Setlistr and its operators from any claims, damages, or expenses (including legal fees) arising from your use of the Service, your violation of these Terms, or your infringement of any third-party rights.</P>
        </Section>

        <Section title="14. Governing Law">
          <P>These Terms are governed by the laws of the Province of Ontario, Canada, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Ontario, Canada.</P>
        </Section>

        <Section title="15. Changes to These Terms">
          <P>We may update these Terms from time to time. We will notify registered users of material changes by email or in-app notification. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.</P>
        </Section>

        <Section title="16. Contact">
          <P>For questions about these Terms, contact us at <a href="mailto:hello@setlistr.ai" style={{ color: C.gold }}>hello@setlistr.ai</a>.</P>
        </Section>

        {/* Footer links */}
        <div style={{ paddingTop: 32, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
          <Link href="/privacy" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Privacy Policy</Link>
          <Link href="/get-paid" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Get Paid</Link>
          <Link href="/" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Home</Link>
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; } body { margin: 0; }
      `}</style>
    </div>
  )
}
