import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5001/api/:path*',
      },
      {
        source: '/admin/:path*',
        destination: 'http://localhost:5001/admin/:path*',
      },
      {
        source: '/healthz',
        destination: 'http://localhost:5001/healthz',
      },
      {
        source: '/tenant/:path*',
        destination: 'http://localhost:5001/tenant/:path*',
      },
      {
        source: '/dev/:path*',
        destination: 'http://localhost:5001/dev/:path*',
      },
      {
        source: '/me',
        destination: 'http://localhost:5001/me',
      },
      {
        source: '/legacy/:path*',
        destination: 'http://localhost:5001/legacy/:path*',
      },
    ];
  },
};

export default nextConfig;
