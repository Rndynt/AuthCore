import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/admin',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // No rewrites() — static export cannot use Next server rewrites.
  // All API calls use same-origin paths via window.location.origin in the browser.
};

export default nextConfig;
