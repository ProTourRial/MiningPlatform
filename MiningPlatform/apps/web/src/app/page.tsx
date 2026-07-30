/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Footer } from '@/components/landing/footer';
import { Hero } from '@/components/landing/hero';
import { Navbar } from '@/components/landing/navbar';
import { LandingSections } from '@/components/landing/sections';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <LandingSections />
      </main>
      <Footer />
    </>
  );
}
