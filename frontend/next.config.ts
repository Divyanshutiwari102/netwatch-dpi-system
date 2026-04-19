import type { NextConfig } from 'next'

const BACKEND = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

const nextConfig: NextConfig = {
  transpilePackages: ['sockjs-client'],
  async rewrites() {
    return [
      { source: '/api/:path*',      destination: `${BACKEND}/api/:path*` },
      { source: '/ws/:path*',       destination: `${BACKEND}/ws/:path*` },
      { source: '/actuator/:path*', destination: `${BACKEND}/actuator/:path*` },
    ]
  },
}
export default nextConfig