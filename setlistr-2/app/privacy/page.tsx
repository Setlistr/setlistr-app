// setlistr-2/app/privacy/page.tsx

export const metadata = {
  title: 'Privacy Policy — Setlistr',
  description: 'Setlistr Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <div style={{
      background: '#0a0908',
      minHeight: '100vh',
      color: '#f2f1f0',
      fontFamily: '"DM Sans", sans-serif',
      padding: '60px 24px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 48, borderBottom: '1px solid #2a2520', paddingBottom: 32 }}>
          <p style={{ color: '#c9a84c', fontSize: 11, fontFamily: '"DM Mono", monospace', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
            Legal
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f2f1f0', marginBottom: 12 }}>
            Privacy Policy
          </h1>
          <p style={{ color: '#888', fontSize: 13 }}>Last Updated: May 6, 2026</p>
        </div>

        <Section title="Introduction">
          <P>Setlistr, Inc. (&ldquo;Setlistr,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, process, store, share, transfer, protect, and retain information when you access or use Setlistr, including our mobile application, website, software, tools, features, data services, and related services (collectively, the &ldquo;Service&rdquo;).</P>
          <P>By accessing or using the Service, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree to this Privacy Policy, you may not access or use the Service.</P>
          <P>This Privacy Policy is incorporated into and forms part of our Terms of Service. Capitalized terms not defined in this Privacy Policy have the meanings given to them in the Terms of Service.</P>
        </Section>

        <Section title="Information We Collect">
          <SubSection title="Information You Provide Directly">
            <P>When you create an account, use the Service, or contact us, you may provide us with information including: name, email address, username, password, artist name, band name, songwriter name, PRO membership information, IPI or CAE numbers, publisher information, label information, manager information, venue information, payment information, billing address, tax information, and any other information you choose to provide.</P>
            <P>You may also provide performance information, setlist information, song information, venue details, performance dates and times, expected cover songs, setlist corrections, catalogue information, metadata, submission information, account preferences, feedback, support requests, and other information you enter or upload through the Service.</P>
          </SubSection>
          <SubSection title="Information We Collect Automatically">
            <P>When you use the Service, we may automatically collect certain information, including: device type, device identifiers, operating system, browser type, app version, IP address, approximate location (city or region level), language settings, time zone, access times and dates, pages or features viewed, session duration, feature usage patterns, crash reports, error logs, performance data, and other diagnostic or usage information.</P>
            <P>We may use cookies, pixel tags, web beacons, local storage, mobile device identifiers, and similar tracking technologies to collect this information and to support Service functionality, analytics, fraud prevention, security, and personalization.</P>
          </SubSection>
          <SubSection title="Audio Processing and Song Identification Data">
            <P>Setlistr does not store live performance audio or full audio recordings of performances.</P>
            <P>When you use song identification features, Setlistr temporarily processes short portions of audio solely for the purpose of generating audio fingerprints and matching those fingerprints against third-party or internal music identification databases. This audio is not stored by Setlistr.</P>
            <P>Setlistr may store information generated from or related to the song identification process, including song match results, confidence scores, timestamps, performance dates, venue information, artist information, user-confirmed setlists, user corrections, missing song indicators, possible song matches, and related metadata.</P>
            <P>If third-party audio recognition providers are used, limited audio fingerprinting or identification-related data may be transmitted to those providers as necessary to identify songs and return match results. Use of third-party providers is governed by their own terms and privacy policies.</P>
          </SubSection>
          <SubSection title="Information from Third-Party Services">
            <P>If you connect third-party services to your Setlistr account, such as Spotify or other music platforms, we may receive information from those services, including artist catalogue information, track metadata, album information, playlist data, and related music data.</P>
            <P>We may also receive information from performing rights organizations, collection societies, royalty administrators, publishers, labels, distributors, venues, industry databases, analytics providers, fraud prevention providers, payment processors, app marketplaces, and other third-party sources in connection with the Service.</P>
          </SubSection>
          <SubSection title="Payment and Billing Information">
            <P>If you access paid features, payment and billing information may be collected by Setlistr or by third-party payment processors or app marketplaces on our behalf. Setlistr does not store full payment card numbers. We may retain limited billing information such as the last four digits of a card, billing address, transaction records, and payment history for account management and legal compliance purposes.</P>
          </SubSection>
        </Section>

        <Section title="How We Use Your Information">
          <P>We use the information we collect to: create and manage your account; enable song identification, audio fingerprinting, and music recognition features; generate, display, organize, and manage setlists, performance records, and submission data; prepare, organize, support, transmit, or submit performance information to performing rights organizations, collection societies, royalty administrators, publishers, venues, or other authorized third parties; display royalty estimates, submission status, performance history, and related information; verify your identity and authority; process payments and manage billing; provide customer support and respond to inquiries; send service-related notices, security alerts, account updates, billing notices, and legal notices; investigate, detect, prevent, and respond to fraud, abuse, unauthorized access, security incidents, rights disputes, and violations of our Terms of Service; comply with applicable legal obligations; enforce our Terms of Service and other agreements; improve the accuracy of song identification and other features; analyze usage, performance, and trends to improve the Service; and develop new features, products, and services.</P>
        </Section>

        <Section title="Aggregated and De-Identified Data">
          <P>We may use aggregated, anonymized, or de-identified data derived from use of the Service for analytics, product improvement, research, reporting, benchmarking, fraud prevention, music industry insights, market insights, and development of new features or services. Aggregated or de-identified data does not identify you personally as an individual user.</P>
          <P>This does not permit us to sell individual artist-level User Content in a personally identifiable form unless separately authorized by you or permitted by applicable law.</P>
        </Section>

        <Section title="How We Share Your Information">
          <P>We do not sell your personal information to third parties for their own marketing purposes.</P>
          <P>We may share your information with: trusted third-party service providers that help us operate, provide, maintain, protect, and improve the Service (including hosting providers, audio recognition providers, metadata providers, payment processors, analytics providers, fraud prevention providers, customer support providers, and legal advisors); performing rights organizations, collection societies, royalty administrators, publishers, labels, venues, distributors, or other third parties where you authorize or request us to submit performance information; third-party integrations such as Spotify or other music platforms you connect to your account; app marketplaces such as Apple or Google in connection with app distribution, billing, and marketplace requirements; authorities where required by applicable law, legal process, court order, governmental or regulatory authority, or law enforcement request; and successors in connection with a merger, acquisition, financing, sale of assets, corporate reorganization, change of control, or similar transaction.</P>
        </Section>

        <Section title="Cookies and Tracking Technologies">
          <P>We may use cookies, pixel tags, web beacons, local storage, mobile device identifiers, and similar tracking technologies to collect information, support Service functionality, remember your preferences, analyze usage, support fraud prevention and security, and enable certain features.</P>
          <P>You may be able to control certain cookies through your browser settings, device settings, or other tools. However, disabling certain cookies or tracking technologies may affect your ability to use parts of the Service.</P>
        </Section>

        <Section title="Data Retention">
          <P>We retain your information for as long as reasonably necessary to provide the Service, maintain accurate records, comply with legal obligations, resolve disputes, prevent fraud, enforce our Terms of Service, and support legitimate business purposes.</P>
          <P>We may retain certain information after you delete your account or request deletion, including where retention is required or permitted by law, necessary for fraud prevention, needed to complete transactions or submissions, required to resolve disputes, needed to maintain audit trails or business records, or maintained in backup systems for a limited period.</P>
        </Section>

        <Section title="Your Privacy Rights and Choices">
          <P>Depending on where you live, you may have certain rights regarding your personal information, including the right to: access the personal information we hold about you; correct inaccurate or incomplete information; request deletion of your personal information, subject to legal limitations; request restriction of processing of your personal information; object to certain processing of your personal information; request a copy of your personal information in a portable format; withdraw consent where processing is based on consent; and lodge a complaint with a supervisory authority or data protection regulator.</P>
          <P>To exercise any of these rights, please contact us at info@setlistr.ai. We may require identity verification or account verification before responding to certain requests.</P>
        </Section>

        <Section title="California Privacy Rights">
          <P>If you are a California resident, you may have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA), including the right to know what personal information we collect, use, disclose, or sell about you; the right to request deletion of your personal information; the right to opt out of the sale or sharing of your personal information; the right to non-discrimination for exercising your privacy rights; and the right to correct inaccurate personal information.</P>
          <P>Setlistr does not sell your personal information to third parties for their own marketing purposes as defined under the CCPA/CPRA. To exercise your California privacy rights, please contact us at info@setlistr.ai.</P>
        </Section>

        <Section title="Canadian Privacy Rights">
          <P>If you are located in Canada, your personal information is handled in accordance with applicable Canadian privacy legislation, including PIPEDA and applicable provincial privacy laws. You may have the right to access the personal information we hold about you, to request correction of inaccurate information, and to withdraw consent to certain uses of your information, subject to legal and contractual restrictions.</P>
          <P>To exercise your Canadian privacy rights, please contact us at info@setlistr.ai.</P>
        </Section>

        <Section title="International Data Transfers">
          <P>Setlistr is based in the United States. If you access or use the Service from outside the United States, your information may be transferred to, processed in, and stored in the United States or other countries where we or our service providers operate. By using the Service, you understand and consent to the transfer of your information to the United States and other countries as described in this Privacy Policy.</P>
        </Section>

        <Section title="Children's Privacy">
          <P>Setlistr is not directed to children under the age of 13. We do not knowingly collect personal information from children under 13 without required parental consent. If we learn that we have collected personal information from a child under 13 without required parental consent, we will take steps to delete that information, restrict the account, suspend access, or take other steps required by applicable law.</P>
          <P>If you are a parent or legal guardian and believe that a child under 13 has provided personal information to Setlistr without required consent, please contact us at info@setlistr.ai.</P>
        </Section>

        <Section title="Security">
          <P>We implement reasonable administrative, technical, and physical safeguards designed to protect your information from unauthorized access, use, disclosure, alteration, loss, or destruction. However, no method of transmission over the internet or method of electronic storage is completely secure. If you believe your account or information has been compromised, please contact us immediately at info@setlistr.ai.</P>
        </Section>

        <Section title="Changes to This Privacy Policy">
          <P>We may update or modify this Privacy Policy from time to time. If we make material changes, we may provide notice through the Service, by email, in-app message, or another reasonable method. Your continued access to or use of the Service after the updated Privacy Policy becomes effective means you accept the updated Privacy Policy.</P>
        </Section>

        <Section title="Contact Information">
          <P>If you have questions, concerns, or requests regarding this Privacy Policy, your personal information, your privacy rights, data access, correction, deletion, portability, or other privacy matters, please contact us at:</P>
          <div style={{ background: '#141210', border: '1px solid #2a2520', borderRadius: 8, padding: '20px 24px', marginTop: 8, fontFamily: '"DM Mono", monospace', fontSize: 13, lineHeight: 2, color: '#c9a84c' }}>
            <div>Setlistr, Inc.</div>
            <div>Attn: Privacy</div>
            <div>517 E Campbell Road</div>
            <div>Madison, TN 37115</div>
            <div>Email: info@setlistr.ai</div>
            <div>Website: https://setlistr.ai</div>
            <div>Privacy Policy: https://setlistr.ai/privacy</div>
          </div>
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{
        fontSize: 16,
        fontWeight: 700,
        color: '#f2f1f0',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #2a2520',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', marginBottom: 8, fontFamily: '"DM Mono", monospace', letterSpacing: 0.5 }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14, lineHeight: 1.75, color: '#b8b0a8', marginBottom: 12 }}>
      {children}
    </p>
  );
}
