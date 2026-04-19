import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // sockjs-client is CommonJS — transpile it so Next.js/Turbopack can bundle it
  transpilePackages: ['sockjs-client'],

  // Proxy all /api/*, /ws/* to Spring Boot on :8080
  // This eliminates CORS issues in both dev and production
  async rewrites() {
    return [
      { source: '/api/:path*',      destination: 'http://localhost:8080/api/:path*' },
      { source: '/ws/:path*',       destination: 'http://localhost:8080/ws/:path*' },
      { source: '/actuator/:path*', destination: 'http://localhost:8080/actuator/:path*' },
    ]
  },
}

export default nextConfig
