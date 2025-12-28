'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { FileCode, Zap, Cpu, LucideIcon } from 'lucide-react';
import { useHydrated } from '@/hooks';

interface Feature {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
}

const features: Feature[] = [
  {
    Icon: FileCode,
    title: 'AST-Aware Parsing',
    subtitle: '7 LANGUAGES SUPPORTED',
    description: 'Extract functions, classes, and types from code files with intelligent AST parsing. Supports TypeScript, JavaScript, Python, Go, Rust, PHP, and Swift.',
  },
  {
    Icon: Zap,
    title: 'Smart Compression',
    subtitle: 'UP TO 98% SAVINGS',
    description: 'Auto-detect content type and apply optimal compression. Build outputs, logs, diffs, and code are intelligently processed to minimize token usage.',
  },
  {
    Icon: Cpu,
    title: 'TypeScript SDK',
    subtitle: 'ONE TOOL, MANY OPERATIONS',
    description: 'Execute complex multi-step operations with a single tool call. Chain file reads, AST extraction, and compression in sandboxed TypeScript code.',
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const badgeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1 },
};

const titleVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

/** Feature card component (static, animations handled by parent) */
function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className="group relative h-full p-8 rounded-2xl bg-[#311c35]/50 border border-[#f4cf8b]/30 backdrop-blur-md transition-all duration-500 overflow-hidden">
      {/* Scanline effect on hover */}
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#f4cf8b]/5 to-transparent -translate-y-full animate-[shimmer_1.5s_infinite] pointer-events-none" />

      {/* Icon with glow effect */}
      <div className="relative mb-8 inline-flex items-center justify-center">
        <div className="absolute inset-0 bg-[#f4cf8b]/20 blur-xl rounded-full opacity-100 scale-150" />
        <div className="relative z-10 text-[#f4cf8b]">
          <feature.Icon size={28} />
        </div>
      </div>

      {/* Text content */}
      <div className="relative space-y-4">
        <span className="inline-block text-[10px] font-mono text-[#f4cf8b]/60 uppercase tracking-widest border-b border-[#f4cf8b]/30 pb-1">
          {feature.subtitle}
        </span>
        <h3 className="text-xl font-semibold text-[#f4cf8b]/90">
          {feature.title}
        </h3>
        <p className="text-sm text-neutral-300 leading-relaxed font-light">
          {feature.description}
        </p>
      </div>
    </div>
  );
}

/** Static version rendered during SSR (hidden) */
function FeaturesStatic() {
  return (
    <section className="relative py-32 px-6 bg-transparent overflow-hidden" style={{ opacity: 0 }}>
      {/* Background gradients */}
      {/* Background gradients removed */}

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col items-center mb-20 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#311c35]/40 border border-[#f4cf8b]/20 backdrop-blur-sm shadow-[0_0_15px_-3px_rgba(244,207,139,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f4cf8b] animate-pulse"></span>
            <span className="text-[10px] font-mono tracking-[0.2em] text-[#f4cf8b] uppercase">
              Core Features
            </span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
            Why use <span className="text-transparent bg-clip-text bg-linear-to-br from-white via-[#f4cf8b] to-[#311c35]">Distill?</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Animated version rendered after hydration */
function FeaturesAnimated() {
  return (
    <section className="relative py-32 px-6 bg-transparent overflow-hidden">
      {/* Nebula / Cosmic dust background effects */}
      {/* Nebula / Cosmic dust background effects removed */}

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section header */}
        <div className="flex flex-col items-center mb-20 text-center space-y-4">
          <motion.div
            variants={badgeVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#311c35]/40 border border-[#f4cf8b]/20 backdrop-blur-sm shadow-[0_0_15px_-3px_rgba(244,207,139,0.15)]"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#f4cf8b] animate-pulse"></span>
            <span className="text-[10px] font-mono tracking-[0.2em] text-[#f4cf8b] uppercase">
              Core Features
            </span>
          </motion.div>

          <motion.h2
            variants={titleVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-2 leading-[1.05]"
          >
            Why use <span className="text-transparent bg-clip-text bg-linear-to-br from-white via-neutral-100 to-neutral-400">Distill?</span>
          </motion.h2>
        </div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div key={index} variants={itemVariants} className="h-full">
              <FeatureCard feature={feature} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

const Features = () => {
  const mounted = useHydrated();
  const shouldReduceMotion = useReducedMotion();

  // Render static hidden content during SSR to prevent flash
  if (!mounted) {
    return <FeaturesStatic />;
  }

  // Skip animations for users who prefer reduced motion
  if (shouldReduceMotion) {
    return (
      <section className="relative py-32 px-6 bg-transparent overflow-hidden">
        {/* Background gradients removed */}
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col items-center mb-20 text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#311c35]/40 border border-[#f4cf8b]/20 backdrop-blur-sm shadow-[0_0_15px_-3px_rgba(244,207,139,0.15)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#f4cf8b] animate-pulse"></span>
              <span className="text-[10px] font-mono tracking-[0.2em] text-[#f4cf8b] uppercase">
                Core Features
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-2 leading-[1.05]">
              Why use <span className="text-transparent bg-clip-text bg-linear-to-br from-white via-neutral-100 to-neutral-400">Distill?</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <FeatureCard key={index} feature={feature} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return <FeaturesAnimated />;
};

export default Features;
