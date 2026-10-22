/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Proof of Performance PDF (app/api/proof/pdf): the renderer runs on the
    // server only and is loaded from node_modules at runtime, not bundled.
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
    // Files the PDF route reads that tracing can't see: the embedded fonts
    // (SIL Open Font License), and pdfkit's built-in font data, which it
    // loads with a computed require when every document starts (without it
    // the deployed export fails: "Cannot find module …/standard-fonts/Helvetica.cjs").
    outputFileTracingIncludes: { '/api/proof/pdf': ['./lib/proof/pdf/fonts/**', './node_modules/pdfkit/js/standard-fonts/**'] },
  },
}

export default nextConfig
