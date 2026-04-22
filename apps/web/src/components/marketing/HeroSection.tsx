'use client';

import { motion, type Variants } from 'motion/react';
import { Check, Copy, Github } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useHydrated } from '@/hooks';
import { INSTALL_COMMAND } from '../constants';
import ShaderBackground from './ShaderBackground';

interface HeroStat {
  label: string;
  value: string;
  accent?: boolean;
}

interface HeroTranslations {
  badge: string;
  titleLine1: string;
  titleLine2Prefix: string;
  titleLine2Accent: string;
  titleLine2Suffix: string;
  description: string;
  cta: string;
  githubCta: string;
  githubAriaLabel: string;
  stats: HeroStat[];
}

const GITHUB_URL = 'https://github.com/ArthurDEV44/distill';

const translations: Record<string, HeroTranslations> = {
  fr: {
    badge: 'v0.10.1 — claude-code native',
    titleLine1: '3 outils. Zéro friction.',
    titleLine2Prefix: 'Moins de tokens. Plus de ',
    titleLine2Accent: 'signal',
    titleLine2Suffix: '.',
    description:
      "Distill est un serveur MCP open-source qui compresse le contexte LLM : smart file reading avec AST, auto-compression et SDK TypeScript en sandbox. Jusqu'à 98 % d'économie de tokens.",
    cta: 'Commencer',
    githubCta: 'GitHub',
    githubAriaLabel: 'Voir Distill sur GitHub (ouvre un nouvel onglet)',
    stats: [
      { label: 'tokens.saved', value: '40-98%', accent: true },
      { label: 'tools.active', value: '3' },
      { label: 'languages', value: '7' },
    ],
  },
  en: {
    badge: 'v0.10.1 — claude-code native',
    titleLine1: '3 tools. Zero friction.',
    titleLine2Prefix: 'Fewer tokens. More ',
    titleLine2Accent: 'signal',
    titleLine2Suffix: '.',
    description:
      'Distill is an open-source MCP server that compresses LLM context: AST-aware smart file reading, auto-compression, and a sandboxed TypeScript SDK. Up to 98% token savings.',
    cta: 'Get started',
    githubCta: 'GitHub',
    githubAriaLabel: 'View Distill on GitHub (opens in new tab)',
    stats: [
      { label: 'tokens.saved', value: '40-98%', accent: true },
      { label: 'tools.active', value: '3' },
      { label: 'languages', value: '7' },
    ],
  },
};

const container: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

function InstallCommand() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex w-full items-center gap-3 px-3.5 py-2.5 rounded-md border border-white/10 bg-white/[0.02] font-mono text-[13px]">
      <span className="text-white/30 select-none">$</span>
      <span className="flex-1 text-white/80 select-all truncate">{INSTALL_COMMAND}</span>
      <button
        onClick={handleCopy}
        className="flex items-center justify-center w-6 h-6 shrink-0 text-white/30 hover:text-white transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20 rounded"
        aria-label={copied ? 'Command copied to clipboard' : 'Copy install command'}
        aria-live="polite"
      >
        {copied ? (
          <Check size={13} className="text-[#da7446]" aria-hidden="true" />
        ) : (
          <Copy size={13} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

interface HeroContentProps {
  t: HeroTranslations;
  animated: boolean;
  releaseHref: string;
}

const HeroContent = ({ t, animated, releaseHref }: HeroContentProps) => {
  const Wrapper = animated ? motion.div : 'div';
  const Item = animated ? motion.div : 'div';

  const wrapperProps = animated
    ? {
        variants: container,
        initial: 'hidden' as const,
        animate: 'visible' as const,
      }
    : {};
  const itemProps = animated ? { variants: fadeUp } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="relative z-10 max-w-3xl mx-auto flex flex-col items-center text-center gap-8 @md:gap-10"
    >
      {/* Badge — links to the release page */}
      <Item {...itemProps}>
        <Link
          href={releaseHref}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md font-mono text-[11px] text-white/70 hover:text-white hover:border-white/20 hover:bg-white/[0.06] transition-colors tracking-[0.08em] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#da7446] shadow-[0_0_8px_rgba(218,116,70,0.6)]" />
          {t.badge}
        </Link>
      </Item>

      {/* Title */}
      <Item {...itemProps}>
        <h1
          id="hero-title"
          className="text-[clamp(2.25rem,6.5cqi,4.75rem)] font-semibold tracking-[-0.035em] leading-[1.02] text-white text-balance"
        >
          <span className="block">{t.titleLine1}</span>
          <span className="block text-white/40">
            {t.titleLine2Prefix}
            <span className="text-[#da7446]">{t.titleLine2Accent}</span>
            {t.titleLine2Suffix}
          </span>
        </h1>
      </Item>

      {/* Description */}
      <Item
        {...itemProps}
        className="max-w-xl text-[15px] @md:text-base leading-relaxed text-white/55 text-balance"
      >
        {t.description}
      </Item>

      {/* CTA stack — buttons row + install command, shared width */}
      <Item
        {...itemProps}
        className="flex flex-col items-stretch gap-2.5 w-full max-w-sm"
      >
        <div className="flex items-stretch gap-2">
          <Link
            href="/docs"
            className="flex-1 inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-white text-black font-medium text-[14px] tracking-tight hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            {t.cta}
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.githubAriaLabel}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-white/10 bg-white/[0.02] text-white/80 hover:text-white hover:bg-white/[0.04] hover:border-white/20 transition-colors font-medium text-[14px] tracking-tight focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Github size={15} aria-hidden="true" />
            <span>{t.githubCta}</span>
          </a>
        </div>
        <InstallCommand />
      </Item>

      {/* Stats */}
      <Item
        {...itemProps}
        className="grid grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-md overflow-hidden w-full max-w-md mt-2"
      >
        {t.stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-0.5 bg-black px-4 py-3"
          >
            <span
              className={`text-[18px] @md:text-xl font-semibold tabular-nums tracking-tight ${
                s.accent ? 'text-[#da7446]' : 'text-white'
              }`}
            >
              {s.value}
            </span>
            <span className="font-mono text-[9.5px] text-white/35 tracking-[0.15em] uppercase">
              {s.label}
            </span>
          </div>
        ))}
      </Item>
    </Wrapper>
  );
};

const Hero = ({ lang = 'en' }: { lang?: string }) => {
  const mounted = useHydrated();
  const t = (translations[lang] || translations.en)!;
  const releaseHref = lang === 'fr' ? '/fr/release' : '/release';

  const containerClasses =
    'relative overflow-hidden flex flex-col items-center justify-center min-h-[100dvh] pt-28 pb-20 px-4 sm:px-6 @container';

  return (
    <section className={containerClasses} aria-labelledby="hero-title">
      <ShaderBackground speed={1} orange={1} density={1} cell={9} />
      <HeroContent t={t} animated={mounted} releaseHref={releaseHref} />
    </section>
  );
};

export default Hero;
