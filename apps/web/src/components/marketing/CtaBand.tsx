'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';
import { motion, type Variants } from 'motion/react';
import { useHydrated } from '@/hooks';

const GITHUB_URL = 'https://github.com/ArthurDEV44/distill';

interface CtaBandTranslations {
  badge: string;
  titleLine1: string;
  titleMuted: string;
  paragraph: string;
  docsCta: string;
  githubCta: string;
  githubAriaLabel: string;
}

const translations: { fr: CtaBandTranslations; en: CtaBandTranslations } = {
  fr: {
    badge: 'get started',
    titleLine1: 'Prêt à distiller',
    titleMuted: 'votre contexte ?',
    paragraph:
      'Une commande, zéro config. Compatible Claude Code, Cursor, Windsurf et tout client MCP.',
    docsCta: 'Lire la doc',
    githubCta: 'Star on GitHub',
    githubAriaLabel: 'Voir Distill sur GitHub (ouvre un nouvel onglet)',
  },
  en: {
    badge: 'get started',
    titleLine1: 'Ready to distill',
    titleMuted: 'your context?',
    paragraph:
      'One command, zero config. Works with Claude Code, Cursor, Windsurf, and any MCP client.',
    docsCta: 'Read the docs',
    githubCta: 'Star on GitHub',
    githubAriaLabel: 'View Distill on GitHub (opens in new tab)',
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

interface CtaBandProps {
  lang?: string;
}

const CtaBand = ({ lang = 'en' }: CtaBandProps) => {
  const mounted = useHydrated();
  const t = lang === 'fr' ? translations.fr : translations.en;
  const docsHref = lang === 'fr' ? '/fr/docs' : '/docs';

  const Card = mounted ? motion.div : 'div';
  const cardProps = mounted
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.3 },
      }
    : {};

  return (
    <section
      id="cta"
      className="relative px-4 sm:px-6 py-20 md:py-24"
      aria-labelledby="cta-title"
    >
      <div className="max-w-5xl mx-auto">
        <Card
          {...cardProps}
          className="relative overflow-hidden rounded-2xl border border-white/10 px-6 py-12 md:px-10 md:py-14 text-center"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 90% 120% at 50% 0%, rgba(218,116,70,0.10) 0%, transparent 70%)',
            backgroundColor: 'rgba(255,255,255,0.015)',
          }}
        >
          {/* Faint grid overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              WebkitMaskImage:
                'radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent 80%)',
              maskImage:
                'radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent 80%)',
            }}
          />

          <div className="relative z-10 flex flex-col items-center gap-5">
            <span className="inline-flex items-center gap-2.5 font-mono text-[11px] text-white/50 tracking-[0.14em] uppercase">
              <span className="h-px w-5 bg-[#da7446]/70" />
              {t.badge}
            </span>

            <h2
              id="cta-title"
              className="text-[1.7rem] md:text-[2.2rem] lg:text-[2.6rem] font-semibold tracking-[-0.03em] leading-[1.1] text-white text-balance max-w-xl"
            >
              {t.titleLine1}
              <br />
              <span className="text-white/40">{t.titleMuted}</span>
            </h2>

            <p className="max-w-md text-[14.5px] leading-[1.6] text-white/55 text-balance">
              {t.paragraph}
            </p>

            <div className="flex w-full max-w-sm items-stretch gap-2 mt-2">
              <Link
                href={docsHref}
                className="flex-1 inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-white text-black font-medium text-[14px] tracking-tight hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                {t.docsCta}
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.githubAriaLabel}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-white/10 bg-white/[0.02] text-white/80 hover:text-white hover:bg-white/[0.04] hover:border-white/20 transition-colors font-medium text-[14px] tracking-tight focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                <Github size={14} aria-hidden="true" />
                <span>{t.githubCta}</span>
              </a>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
};

export default CtaBand;
