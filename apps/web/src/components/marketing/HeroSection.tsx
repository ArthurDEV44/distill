'use client';

import { motion, type Variants } from 'motion/react';
import { Zap, Gauge, Sparkles, Copy, Check, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useHydrated } from '@/hooks';
import Link from 'next/link';

interface HeroTranslations {
  badge: string;
  titleLine1: string;
  titleLine2: string;
  descriptionStart: string;
  descriptionHighlight: string;
  descriptionEnd: string;
  cta: string;
  tokenSavings: string;
  tools: string;
  languages: string;
}

const translations: Record<string, HeroTranslations> = {
  fr: {
    badge: 'v0.8.0 Disponible',
    titleLine1: "Extrayez l'essentiel.",
    titleLine2: 'Économisez des tokens.',
    descriptionStart: ' compresse intelligemment le contexte LLM. Obtenez jusqu\'à ',
    descriptionHighlight: '98% d\'économie de tokens',
    descriptionEnd: ' avec la lecture intelligente de fichiers, l\'extraction AST et le SDK TypeScript.',
    cta: 'Commencer',
    tokenSavings: 'Économie tokens',
    tools: 'Outils',
    languages: 'Langages',
  },
  en: {
    badge: 'v0.8.0 Now Available',
    titleLine1: 'Extract the essence.',
    titleLine2: 'Save tokens.',
    descriptionStart: ' compresses LLM context intelligently. Get up to ',
    descriptionHighlight: '98% token savings',
    descriptionEnd: ' with smart file reading, AST extraction, and the TypeScript SDK.',
    cta: 'Get Started',
    tokenSavings: 'Token Savings',
    tools: 'Tools',
    languages: 'Languages',
  },
};

const variants: Record<string, Variants> = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.1 }
    }
  },
  item: {
    hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
    }
  },
  scale: {
    hidden: { opacity: 0, scale: 0.95, filter: 'blur(4px)' },
    visible: {
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
    }
  }
};

const TechIndicator = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
  <div className="flex flex-col items-center gap-2 @sm:gap-3 z-10 transition-transform hover:scale-105 duration-300">
    <div className="p-2 rounded-full bg-[#f4cf8b]/10 ring-1 ring-[#f4cf8b]/50 backdrop-blur-xs">
      <Icon className="text-[#f4cf8b] w-5 h-5 @md:w-6 @md:h-6" aria-hidden="true" />
    </div>
    <div className="text-center flex flex-col">
      <span className="text-sm @md:text-base font-bold text-white tabular-nums tracking-tight">{value}</span>
      <span className="text-[10px] @md:text-xs tracking-widest font-mono uppercase text-white/60">{label}</span>
    </div>
    <span className="sr-only">{value} {label}</span>
  </div>
);

function CopyCommand() {
  const [copied, setCopied] = useState(false);
  const command = 'npm install -g distill-mcp';

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/cmd flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md hover:border-[#f4cf8b]/30 transition-all duration-300 w-full max-w-xs @sm:w-auto">
      <div className="flex items-center gap-2 font-mono text-sm text-neutral-400 overflow-hidden text-nowrap">
        <span className="text-[#f4cf8b] select-none">$</span>
        <span className="group-hover/cmd:text-neutral-200 transition-colors truncate">{command}</span>
      </div>
      <div className="h-4 w-px bg-white/10 mx-auto" />
      <button
        onClick={handleCopy}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors focus:outline-none"
        aria-label={copied ? "Command copied to clipboard" : "Copy install command to clipboard"}
        aria-live="polite"
      >
        {copied ? <Check size={14} className="text-green-400" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
      <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-transparent group-hover/cmd:ring-white/10 pointer-events-none" />
    </div>
  );
}

const HeroContent = ({ t, isStatic = false }: { t: HeroTranslations; isStatic?: boolean }) => {
  const Wrapper = isStatic ? 'div' : motion.div;
  const Item = isStatic ? 'div' : motion.div;

  const wrapperProps = isStatic ? { className: "relative z-10 flex flex-col items-center text-center max-w-[90cqi] mx-auto space-y-[clamp(2rem,5cqi,3.5rem)]" } : {
    variants: variants.container,
    initial: "hidden",
    animate: "visible",
    className: "relative z-10 flex flex-col items-center text-center max-w-[90cqi] mx-auto space-y-[clamp(2rem,5cqi,3.5rem)]"
  };

  const itemProps = isStatic ? {} : { variants: variants.item };
  const scaleProps = isStatic ? {} : { variants: variants.scale };

  return (
    <Wrapper {...wrapperProps}>
      {/* Badge */}
      <Item {...itemProps} className="group relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#311c35]/40 border border-[#f4cf8b]/20 backdrop-blur-md hover:bg-[#311c35]/60 hover:border-[#f4cf8b]/40 transition-all cursor-default overflow-hidden">
        {!isStatic && (
          <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_2s_infinite] bg-linear-to-r from-transparent via-white/5 to-transparent" />
        )}
        <span className="flex h-1.5 w-1.5 rounded-full bg-[#f4cf8b] animate-pulse shadow-[0_0_12px_rgba(244,207,139,0.8)]"></span>
        <span className="text-[11px] font-semibold text-neutral-300 tracking-[0.2em] uppercase">
          {t.badge}
        </span>
      </Item>

      {/* Main Title */}
      <Item {...scaleProps} className="relative z-20 mix-blend-overlay pointer-events-none">
        <h1 id="hero-title" className="text-[clamp(2.5rem,7cqi,6rem)] font-bold tracking-tighter text-white mb-2 leading-[1.05] text-balance drop-shadow-2xl">
          <span className="block drop-shadow-[0_0_30px_rgba(244,207,139,0.2)] bg-clip-text text-transparent bg-gradient-to-b from-white to-white/80">
            {t.titleLine1}
          </span>
          <span className="block text-white/90">
            {t.titleLine2}
          </span>
        </h1>
      </Item>

      {/* Description */}
      <Item {...itemProps} className="max-w-[min(65ch,90cqi)] text-[clamp(1rem,1.2cqi,1.25rem)] text-neutral-300 leading-relaxed font-light tracking-wide z-20 text-balance">
        <span className="text-white font-medium">Distill</span>{t.descriptionStart}
        <span className="text-[#f4cf8b] font-semibold">{t.descriptionHighlight}</span>
        {t.descriptionEnd}
      </Item>

      {/* CTA Section */}
      <Item {...itemProps} className="flex flex-col @md:flex-row items-center gap-4 @md:gap-6 pt-6 w-full justify-center z-20">
        <Link
          href="/docs"
          className="group relative inline-flex items-center gap-3 px-8 py-3.5 @md:px-10 @md:py-4 rounded-full bg-[#f4cf8b] text-[#201c19] font-bold text-lg tracking-wide transition-all duration-300 shadow-[0_0_20px_rgba(244,207,139,0.3)] hover:shadow-[0_0_40px_rgba(244,207,139,0.6)] hover:scale-105 overflow-hidden ring-1 ring-white/50 w-auto justify-center"
        >
          <div className="absolute inset-0 bg-linear-to-b from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1s_infinite] bg-linear-to-r from-transparent via-white/30 to-transparent z-10" />
          <span className="relative z-20 mx-auto @sm:mx-0">{t.cta}</span>
        </Link>
        <CopyCommand />
      </Item>

      {/* Tech Grid */}
      <Item {...itemProps} className="pt-12 @md:pt-16 grid grid-cols-3 gap-8 @md:gap-12 w-full max-w-2xl justify-items-center z-20 relative">
        <TechIndicator icon={Zap} label={t.tokenSavings} value="40-98%" />
        <div className="hidden @sm:block h-12 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent absolute left-[30%]" />
        <TechIndicator icon={Gauge} label={t.tools} value="21" />
        <div className="hidden @sm:block h-12 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent absolute right-[30%]" />
        <TechIndicator icon={Sparkles} label={t.languages} value="7" />
      </Item>
    </Wrapper>
  );
};

const Hero = ({ lang = 'fr' }: { lang?: string }) => {
  const mounted = useHydrated();
  const t = (translations[lang] || translations.fr)!;

  const containerClasses = "relative flex flex-col items-center justify-center min-h-[100dvh] pt-20 px-4 sm:px-6 overflow-hidden @container";

  if (!mounted) {
    return (
      <section className={containerClasses} aria-labelledby="hero-title">
        <HeroContent t={t} isStatic={true} />
      </section>
    );
  }

  return (
    <section className={containerClasses} aria-labelledby="hero-title">
      <HeroContent t={t} />
    </section>
  );
};

export default Hero;
