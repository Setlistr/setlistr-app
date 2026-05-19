export const metadata = {
  title: 'Imprint — Setlistr',
  description: 'Legal notice and company information for Setlistr.',
}

export default function ImprintPage() {
  return (
    <div style={{
      background: '#0a0908',
      minHeight: '100vh',
      color: '#f2f1f0',
      fontFamily: '"DM Sans", sans-serif',
      padding: '60px 24px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ marginBottom: 48, borderBottom: '1px solid #2a2520', paddingBottom: 32 }}>
          <p style={{ color: '#c9a84c', fontSize: 11, fontFamily: '"DM Mono", monospace', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
            Legal
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f2f1f0', marginBottom: 12 }}>
            Imprint
          </h1>
          <p style={{ color: '#888', fontSize: 13 }}>Legal notice as required by applicable law.</p>
        </div>

        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f2f1f0', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #2a2520' }}>
            Company Information
          </h2>
          <div style={{ background: '#141210', border: '1px solid #2a2520', borderRadius: 8, padding: '20px 24px', fontFamily: '"DM Mono", monospace', fontSize: 13, lineHeight: 2, color: '#c9a84c' }}>
            <div>Setlistr, Inc.</div>
            <div>517 E Campbell Road</div>
            <div>Madison, TN 37115</div>
            <div>United States</div>
            <div style={{ marginTop: 8 }}>Email: info@setlistr.ai</div>
            <div>Website: https://setlistr.ai</div>
          </div>
        </div>

        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f2f1f0', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #2a2520' }}>
            Incorporation
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: '#b8b0a8', marginBottom: 12 }}>
            Setlistr, Inc. is a corporation incorporated under the laws of the State of Delaware, United States of America.
          </p>
        </div>

        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f2f1f0', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #2a2520' }}>
            Contact
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.75, color: '#b8b0a8', marginBottom: 12 }}>
            For legal notices, questions about this imprint, or other inquiries, please contact us at{' '}
            <a href="mailto:info@setlistr.ai" style={{ color: '#c9a84c', textDecoration: 'none' }}>info@setlistr.ai</a>.
          </p>
        </div>

      </div>
    </div>
  )
}
