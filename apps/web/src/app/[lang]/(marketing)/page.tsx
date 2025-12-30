'use client';

import React from 'react';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import Navbar from '@/components/marketing/Navbar';
import Hero from '@/components/marketing/HeroSection';
import Stats from '@/components/marketing/Stats';
import Footer from '@/components/marketing/Footer';
import NebulaShader from '@/components/canvas/NebulaShader';
import StarDust from '@/components/canvas/StarDust';

export default function HomePage() {
  const params = useParams();
  const lang = (params.lang as string) || 'fr';

  return (
    <div className="min-h-screen bg-obsidian text-white selection:bg-indigo-500/30 selection:text-white relative">
      {/* Unified Background Layer (Nebula + Particles) */}
      <div className="fixed inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
          <Suspense fallback={null}>
            <NebulaShader />
            <StarDust />
          </Suspense>
        </Canvas>
      </div>

      <div className="relative z-10">
        <Navbar />
        <main>
          <Hero lang={lang} />
          <Stats lang={lang} />
        </main>
        <Footer />
      </div>
    </div>
  );
}
