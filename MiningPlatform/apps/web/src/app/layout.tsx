/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppProviders } from '@/components/providers/app-providers';

const metadataBase = new URL(
  process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000',
);

export const metadata: Metadata = {
  metadataBase,
  applicationName: 'MiningPlatform',
  title: {
    default: 'MiningPlatform | Mining Pool Management & Farm Monitoring',
    template: '%s | MiningPlatform',
  },
  description:
    'Platform pengelolaan mining pool untuk koneksi Stratum, validasi share, monitoring ASIC, akuntansi reward, ledger, payout, simulator, dan transparansi operasional.',
  keywords: [
    'mining pool management',
    'Stratum gateway',
    'ASIC monitoring',
    'Bitcoin mining dashboard',
    'mining farm monitoring',
    'share validation',
    'mining analytics',
  ],
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'MiningPlatform',
    title: 'MiningPlatform | Mining Pool Management & Farm Monitoring',
    description:
      'Control plane untuk koneksi worker, validasi share, monitoring farm, reward accounting, payout, dan transparansi operasional.',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'MiningPlatform Operations Control Plane',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MiningPlatform | Operations Control Plane',
    description: 'Verifiable mining operations for worker, share, and hashrate monitoring.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
