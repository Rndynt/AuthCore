import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/admin',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Static export: no Next server rewrites or middleware supported.
  // All API calls use same-origin paths via window.location.origin in the browser.
};

export default nextConfig;
