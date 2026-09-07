/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { NextConfig } from 'next';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(appRoot, '../..');
const repositoryRoot = resolve(appRoot, '../../..');
const standaloneOutput = process.env.NEXT_OUTPUT_MODE === 'standalone';
const vercelBuild = process.env.VERCEL === '1';
const apiUpstreamOrigin = process.env.API_UPSTREAM_ORIGIN?.replace(/\/$/, '');

if (apiUpstreamOrigin) {
  const parsed = new URL(apiUpstreamOrigin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== apiUpstreamOrigin) {
    throw new Error('API_UPSTREAM_ORIGIN must be an HTTP(S) origin without a path');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('API_UPSTREAM_ORIGIN must use HTTPS in production');
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ['@mining/shared'],
  output: standaloneOutput ? 'standalone' : undefined,
  async rewrites() {
    if (!apiUpstreamOrigin) return [];
    return [{ source: '/api/:path*', destination: `${apiUpstreamOrigin}/api/:path*` }];
  },
  ...(vercelBuild
    ? {
        outputFileTracingRoot: repositoryRoot,
        turbopack: { root: repositoryRoot },
      }
    : standaloneOutput
    ? {
        outputFileTracingRoot: monorepoRoot,
        turbopack: { root: monorepoRoot },
      }
    : {}),
};

export default nextConfig;
