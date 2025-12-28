'use client';

import { motion, type Variants } from 'motion/react';
import { Terminal, Zap, Gauge, Sparkles } from 'lucide-react';
import { useHydrated } from '@/hooks';
import Link from 'next/link';

const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
    },
  },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

/** Tech indicator component */
function TechIndicator({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-3 z-10">
      <div className="p-2 rounded-full bg-[#f4cf8b]/10 ring-1 ring-[#f4cf8b]/50">
        <Icon className="text-[#f4cf8b]" size={20} />
      </div>
      <div className="text-center">
        <span className="block text-sm font-semibold text-white">{value}</span>
        <span className="text-[10px] tracking-widest font-mono uppercase text-white">
          {label}
        </span>
      </div>
    </div>
  );
}

/** Static content rendered during SSR */
function HeroStatic() {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-screen pt-20 px-4 sm:px-6 overflow-hidden bg-[#201c19]">
      <div className="absolute inset-0 bg-[#201c19] z-0" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto space-y-10">
        {/* Badge */}
        <div className="group relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#311c35]/40 border border-[#f4cf8b]/20 backdrop-blur-md">
          <span className="flex h-1.5 w-1.5 rounded-full bg-[#f4cf8b] animate-pulse shadow-[0_0_12px_rgba(244,207,139,0.8)]"></span>
          <span className="text-[11px] font-semibold text-neutral-300 tracking-[0.2em] uppercase">
            v0.6.0-beta Now Available
          </span>
        </div>

        <div className="relative">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-white mb-2 leading-[1.05] mix-blend-overlay">
            Extract the essence.<br />
            Save tokens.
          </h1>
        </div>
      </div>
    </section>
  );
}

const Hero = () => {
  const mounted = useHydrated();

  // Render static hidden content during SSR to prevent flash
  if (!mounted) {
    return <HeroStatic />;
  }

  return (
    <section className="relative flex flex-col items-center justify-center min-h-screen pt-20 px-4 sm:px-6 overflow-hidden bg-transparent">
      {/* 2. Content Layer */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto space-y-10"
      >
        {/* Badge */}
        <motion.div
          variants={fadeInUp}
          className="group relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#311c35]/40 border border-[#f4cf8b]/20 backdrop-blur-md hover:bg-[#311c35]/60 hover:border-[#f4cf8b]/40 transition-all cursor-default overflow-hidden"
        >
          <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_2s_infinite] bg-linear-to-r from-transparent via-white/5 to-transparent" />
          <span className="flex h-1.5 w-1.5 rounded-full bg-[#f4cf8b] animate-pulse shadow-[0_0_12px_rgba(244,207,139,0.8)]"></span>
          <span className="text-[11px] font-semibold text-neutral-300 tracking-[0.2em] uppercase">
            v0.6.0-beta Now Available
          </span>
        </motion.div>

        {/* Title */}
        <motion.div variants={scaleIn} className="relative z-20 mix-blend-overlay pointer-events-none">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-white mb-2 leading-[1.05]">
            <span className="block drop-shadow-[0_0_30px_rgba(244,207,139,0.2)]">
              Extract the essence.
            </span>
            <span className="block text-white/90">
              Save tokens.
            </span>
          </h1>
        </motion.div>

        {/* Description */}
        <motion.p
          variants={fadeInUp}
          className="max-w-2xl text-lg sm:text-xl text-neutral-300 leading-relaxed font-light tracking-wide z-20"
        >
          <span className="text-white font-medium">Distill</span> compresses LLM context intelligently.
          Get up to <span className="text-[#f4cf8b] font-semibold">98% token savings</span> with
          smart file reading, AST extraction, and the TypeScript SDK.
        </motion.p>

        {/* CTA */}
        <motion.div
          variants={fadeInUp}
          className="flex flex-col sm:flex-row items-center gap-5 pt-6 w-full justify-center z-20"
        >
          <Link
            href="/docs"
            className="group relative inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-linear-to-br from-[#f4cf8b] to-[#311c35] text-white font-semibold transition-all duration-300 hover:scale-[1.02] shadow-[0_0_20px_rgba(244,207,139,0.3)] hover:shadow-[0_0_35px_rgba(244,207,139,0.5)] overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Terminal size={18} className="relative z-10" />
            <span className="relative z-10">Get Started</span>
          </Link>
        </motion.div>

        {/* Tech indicators */}
        <motion.div
          variants={fadeInUp}
          className="pt-16 flex items-center justify-center gap-12 z-20"
        >
          <TechIndicator icon={Zap} label="Token Savings" value="40-98%" />
          <div className="h-12 w-px bg-linear-to-b from-transparent via-white/20 to-transparent" />
          <TechIndicator icon={Gauge} label="Tools" value="21" />
          <div className="h-12 w-px bg-linear-to-b from-transparent via-white/20 to-transparent" />
          <TechIndicator icon={Sparkles} label="Languages" value="7" />
        </motion.div>
      </motion.div>
    </section>
  );
};

export default Hero;
