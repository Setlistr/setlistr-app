/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Proof of Performance PDF (app/api/proof/pdf): the renderer runs on the
    // server only and is loaded from node_modules at runtime, not bundled.
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
    // The PDF's embedded fonts (SIL Open Font License) ship with that route.
    outputFileTracingIncludes: { '/api/proof/pdf': ['./lib/proof/pdf/fonts/**'] },
  },
}

export default nextConfig
