import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@mining/shared'],
  output: 'standalone',
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
