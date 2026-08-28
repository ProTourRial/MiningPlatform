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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  transpilePackages: ['@mining/shared'],
  output: standaloneOutput ? 'standalone' : undefined,
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
