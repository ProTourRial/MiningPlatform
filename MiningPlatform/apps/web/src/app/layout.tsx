import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppProviders } from '@/components/providers/app-providers';

export const metadata: Metadata = {
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
