import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ['@mining/shared'],
  output: 'standalone',
};

export default nextConfig;
