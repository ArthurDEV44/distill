'use client';

import { useParams } from 'next/navigation';
import Navbar from '@/components/marketing/Navbar';
import Hero from '@/components/marketing/HeroSection';
import Stats from '@/components/marketing/Stats';
import Workflow from '@/components/marketing/Workflow';
import CtaBand from '@/components/marketing/CtaBand';
import Footer from '@/components/marketing/Footer';

export default function HomePage() {
  const params = useParams();
  const lang = (params.lang as string) || 'en';

  return (
    <div className="min-h-screen bg-obsidian text-white selection:bg-[#da7446]/30 selection:text-white relative">
      <div className="relative z-10">
        <Navbar />
        <main>
          <Hero lang={lang} />
          <Stats lang={lang} />
          <Workflow lang={lang} />
          <CtaBand lang={lang} />
        </main>
        <Footer />
      </div>
    </div>
  );
}
