/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/how-it-works',
        destination: '/how-it-works.html',
      },
    ]
  },
}
export default nextConfig
