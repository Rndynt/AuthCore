import type { NextConfig } from 'next';

const apiUrl = process.env.NEXT_INTERNAL_API_URL || 'http://localhost:5001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/admin/:path*', destination: `${apiUrl}/admin/:path*` },
      { source: '/healthz', destination: `${apiUrl}/healthz` },
      { source: '/tenant/:path*', destination: `${apiUrl}/tenant/:path*` },
      { source: '/dev/:path*', destination: `${apiUrl}/dev/:path*` },
      { source: '/me', destination: `${apiUrl}/me` },
      { source: '/legacy/:path*', destination: `${apiUrl}/legacy/:path*` },
    ];
  },
};

export default nextConfig;
