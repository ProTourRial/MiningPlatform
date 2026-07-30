import { Footer } from '@/components/landing/footer';
import { Hero } from '@/components/landing/hero';
import { Navbar } from '@/components/landing/navbar';
import { LandingSections } from '@/components/landing/sections';

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <LandingSections />
      <Footer />
    </>
  );
}
