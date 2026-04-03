import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Privacy Policy | Setlistr',
  description: 'Privacy Policy for Setlistr — how we collect, use, and protect your data.',
  alternates: { canonical: 'https://setlistr.ai/privacy' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.06)',
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

function DataRow({ what, why, how }: { what: string; why: string; how: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 8 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{what}</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 2px' }}><strong style={{ color: C.secondary }}>Why:</strong> {why}</p>
      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}><strong style={{ color: C.secondary }}>Stored:</strong> {how}</p>
    </div>
  )
}

export default function PrivacyPage() {
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
          <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 12px', letterSpacing: '-0.03em' }}>Privacy Policy</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Last updated: April 3, 2026 · Effective immediately</p>
        </div>

        {/* Plain English summary */}
        <div style={{ background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: '20px 24px', marginBottom: 40 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.green, margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>Plain English Summary</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {[
              'We collect only what we need to run the service',
              'We never sell your data to anyone',
              'Audio is processed for song detection only — we don\'t store recordings',
              'You can delete your account and data at any time',
              'We use Supabase to store data securely in Canada/US',
            ].map(item => (
              <li key={item} style={{ fontSize: 14, color: C.secondary, marginBottom: 6, lineHeight: 1.5 }}>{item}</li>
            ))}
          </ul>
        </div>

        <Section title="1. Who This Applies To">
          <P>This Privacy Policy applies to all users of Setlistr, including visitors to setlistr.ai and users of our mobile and web applications. Setlistr is operated by Jesse Slack (doing business as Setlistr), based in Canada.</P>
          <P>We comply with the Personal Information Protection and Electronic Documents Act (PIPEDA) in Canada. For users in the European Economic Area, we comply with the General Data Protection Regulation (GDPR) to the extent applicable.</P>
        </Section>

        <Section title="2. What Data We Collect">
          <P>Here is exactly what we collect and why:</P>
          <DataRow
            what="Account information"
            why="To create and manage your account"
            how="Email address, artist name, PRO affiliation, IPI number — stored securely in Supabase"
          />
          <DataRow
            what="Performance data"
            why="To build your setlist history and submission records"
            how="Venue names, dates, song titles, cities — stored in your account"
          />
          <DataRow
            what="Audio fingerprints"
            why="To identify songs during live capture"
            how="Short audio samples are sent to ACRCloud for matching. We do not store audio recordings. ACRCloud's privacy policy applies to their processing."
          />
          <DataRow
            what="Song catalog data"
            why="To populate your song library and suggestions"
            how="Song titles, artists, ISRCs, composer names — sourced from Spotify public API and your manual entries"
          />
          <DataRow
            what="Usage data"
            why="To improve the service and fix bugs"
            how="Page views, feature usage, error logs — anonymized where possible"
          />
          <DataRow
            what="Device and location data"
            why="To optimize the mobile experience"
            how="Device type, OS version, approximate location (city level) for venue suggestions — not precise GPS"
          />
        </Section>

        <Section title="3. Audio Recording — Special Notice">
          <P><strong style={{ color: C.text }}>Setlistr uses your device's microphone during live show capture.</strong></P>
          <P>When you start a live show in Setlistr, the app requests microphone access to detect songs being performed. Here is exactly what happens with that audio:</P>
          <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
            {[
              'Short audio segments are captured and sent to ACRCloud, our song recognition provider',
              'ACRCloud matches the audio fingerprint against their database and returns a result',
              'We do not store the audio recording on our servers',
              'The audio fingerprint (not the raw audio) may be briefly cached during processing',
              'You can revoke microphone access at any time in your device settings',
            ].map(item => (
              <li key={item} style={{ marginBottom: 6, color: C.secondary }}>{item}</li>
            ))}
          </ul>
          <P>ACRCloud's privacy policy is available at <a href="https://www.acrcloud.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>acrcloud.com/privacy</a>.</P>
        </Section>

        <Section title="4. How We Use Your Data">
          <P>We use your data exclusively to:</P>
          <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
            {[
              'Provide and improve the Setlistr service',
              'Generate your setlist history and royalty submission exports',
              'Show you your performance statistics and royalty estimates',
              'Send product updates and important account notifications (you can opt out)',
              'Debug errors and improve detection accuracy',
            ].map(item => (
              <li key={item} style={{ marginBottom: 6, color: C.secondary }}>{item}</li>
            ))}
          </ul>
          <P><strong style={{ color: C.text }}>We never sell your data. We never use your data for advertising. We never share your setlist data with PROs, labels, or any third party without your explicit action.</strong></P>
        </Section>

        <Section title="5. Data Sharing">
          <P>We share data with the following third parties only as necessary to operate the service:</P>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
            {[
              { name: 'Supabase', role: 'Database and authentication', link: 'supabase.com/privacy' },
              { name: 'ACRCloud', role: 'Audio fingerprint recognition', link: 'acrcloud.com/privacy' },
              { name: 'Vercel', role: 'Web hosting and deployment', link: 'vercel.com/legal/privacy-policy' },
              { name: 'Spotify', role: 'Public catalog data (no user OAuth)', link: 'spotify.com/privacy' },
            ].map(({ name, role, link }) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{name}</span>
                  <span style={{ fontSize: 12, color: C.muted, marginLeft: 8 }}>{role}</span>
                </div>
                <a href={`https://${link}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.gold, textDecoration: 'none' }}>Privacy policy ↗</a>
              </div>
            ))}
          </div>
          <P>We may disclose data if required by law, court order, or to protect the rights and safety of Setlistr or its users.</P>
        </Section>

        <Section title="6. Data Storage and Security">
          <P>Your data is stored on Supabase servers located in Canada and the United States. We use industry-standard encryption in transit (TLS) and at rest. Access to your data is restricted by row-level security policies — your data is only accessible to your authenticated account.</P>
          <P>We cannot guarantee 100% security of any data transmitted over the internet, but we take reasonable precautions to protect your information.</P>
        </Section>

        <Section title="7. Your Rights">
          <P>Depending on your jurisdiction, you have the right to:</P>
          <ul style={{ paddingLeft: 20, margin: '0 0 12px' }}>
            {[
              'Access the personal data we hold about you',
              'Correct inaccurate data',
              'Delete your account and associated data',
              'Export your setlist and performance data',
              'Opt out of non-essential communications',
              'Withdraw consent for audio processing (by disabling microphone access)',
            ].map(item => (
              <li key={item} style={{ marginBottom: 6, color: C.secondary }}>{item}</li>
            ))}
          </ul>
          <P>To exercise any of these rights, email us at <a href="mailto:info@setlistr.ai" style={{ color: C.gold }}>info@setlistr.ai</a>. We will respond within 30 days.</P>
          <P>You can delete your account at any time from Settings → Account → Delete Account. Deletion removes all your personal data from our systems within 30 days, except where retention is required by law.</P>
        </Section>

        <Section title="8. Cookies">
          <P>Setlistr uses essential cookies for authentication (keeping you logged in) and session management. We do not use advertising or tracking cookies. We do not use Google Analytics or similar third-party tracking services.</P>
          <P>You can disable cookies in your browser settings, but this will prevent you from logging into the service.</P>
        </Section>

        <Section title="9. Children's Privacy">
          <P>Setlistr is not directed at children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us at <a href="mailto:info@setlistr.ai" style={{ color: C.gold }}>info@setlistr.ai</a> and we will delete it promptly.</P>
        </Section>

        <Section title="10. Changes to This Policy">
          <P>We may update this Privacy Policy from time to time. We will notify registered users of material changes by email or in-app notification at least 14 days before changes take effect. Continued use of the Service after changes take effect constitutes acceptance of the updated Policy.</P>
        </Section>

        <Section title="11. Contact">
          <P>
            For privacy questions or to exercise your rights:<br />
            Email: <a href="mailto:info@setlistr.ai" style={{ color: C.gold }}>info@setlistr.ai</a><br />
            Response time: within 30 days
          </P>
        </Section>

        {/* Footer links */}
        <div style={{ paddingTop: 32, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
          <Link href="/terms" style={{ fontSize: 13, color: C.muted, textDecoration: 'none' }}>Terms of Service</Link>
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
