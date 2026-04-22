'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import {
  DollarSign,
  Clock,
  Zap,
  Sparkles,
  Copy,
  Check,
  Github,
  type LucideIcon,
} from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { INSTALL_COMMAND } from '@/components/constants';
import { useHydrated } from '@/hooks';

const GITHUB_URL = 'https://github.com/ArthurDEV44/distill';

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
  metric: string;
}

interface Tool {
  name: string;
  description: string;
}

interface Translations {
  badge: string;
  title: string;
  titleMuted: string;
  subtitle: string;

  problemBadge: string;
  problemHeading: string;
  problemHeadingMuted: string;
  problemP1: string;
  problemP1Strong: string;
  problemP2: string;
  problemP3Strong: string;
  problemP3: string;

  whatBadge: string;
  whatHeading: string;
  whatHeadingMuted: string;
  whatIntro: string;
  whatIntroStrong: string;
  whatIntroEnd: string;
  tools: Tool[];
  whatOutro: string;

  benefitsBadge: string;
  benefitsHeading: string;
  benefitsHeadingMuted: string;
  benefits: Benefit[];

  ctaBadge: string;
  ctaHeading: string;
  ctaHeadingMuted: string;
  ctaSubtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  ctaSecondaryAriaLabel: string;
}

const translations: Record<string, Translations> = {
  fr: {
    badge: 'à propos · 01',
    title: 'Pourquoi',
    titleMuted: 'Distill ?',
    subtitle:
      "Chaque token compte. Distill compresse le contexte LLM en amont, avant qu'il n'entre en mémoire — pour réduire les coûts, accélérer les réponses, et améliorer la qualité des sorties.",

    problemBadge: 'problème · 02',
    problemHeading: 'Le bruit tue',
    problemHeadingMuted: 'le signal.',
    problemP1:
      "Quand tu travailles avec un assistant de codage IA, tu envoies constamment de gros blocs de contexte : sorties de build, logs, fichiers de code, stacktraces. La plupart est ",
    problemP1Strong: 'redondant ou inutile',
    problemP2:
      "Une sortie d'erreur de build typique, c'est des milliers de tokens de bruit pour 5 à 10 lignes réellement utiles. Tu paies pour du vide — et tu noies le LLM dans du contexte qui l'empêche de se concentrer.",
    problemP3Strong: 'Distill résout ce problème',
    problemP3:
      " en compressant intelligemment ton contexte avant qu'il n'atteigne le modèle. Tu ne gardes que le signal.",

    whatBadge: 'produit · 03',
    whatHeading: 'Un serveur MCP.',
    whatHeadingMuted: 'Trois outils.',
    whatIntro: 'Distill est un ',
    whatIntroStrong: 'serveur MCP (Model Context Protocol) open-source',
    whatIntroEnd:
      ", qui expose trois outils toujours chargés dans Claude Code.",
    tools: [
      {
        name: 'auto_optimize',
        description:
          'Détecte le type de contenu (build, logs, diffs, code, stacktraces) et applique la compression adaptée.',
      },
      {
        name: 'smart_file_read',
        description:
          'Lit la structure AST au lieu du fichier brut. 7 langages, 5 modes (auto, full, skeleton, extract, search).',
      },
      {
        name: 'code_execute',
        description:
          "Exécute du TypeScript en sandbox QuickJS pour batcher 5 à 10 opérations en un seul appel MCP.",
      },
    ],
    whatOutro:
      "Pas de clés API. Pas de services cloud. Pas d'auth. Install + usage immédiat.",

    benefitsBadge: 'résultats · 04',
    benefitsHeading: 'Ce que tu y',
    benefitsHeadingMuted: 'gagnes.',
    benefits: [
      {
        icon: DollarSign,
        title: 'Coûts réduits',
        description:
          "Jusqu'à 98 % de tokens en moins envoyés au LLM, sans perte de signal sur le contenu important.",
        metric: '40-98%',
      },
      {
        icon: Clock,
        title: 'Réponses plus rapides',
        description:
          'Moins de contexte = moins de tokens à traiter = time-to-first-token plus court.',
        metric: 'latence ↓',
      },
      {
        icon: Zap,
        title: 'Meilleurs résultats',
        description:
          "Moins de bruit, plus de signal. Le LLM se concentre sur l'essentiel, la qualité des sorties grimpe.",
        metric: 'signal ↑',
      },
      {
        icon: Sparkles,
        title: 'Intégration native Claude Code',
        description:
          'Marqueur [DISTILL:COMPRESSED], hook PreCompact, sous-agent distill-compressor, slash commands. Zéro config côté API.',
        metric: 'MCP stdio',
      },
    ],

    ctaBadge: 'get started',
    ctaHeading: 'Prêt à',
    ctaHeadingMuted: 'optimiser ?',
    ctaSubtitle: "Une commande suffit pour setup Claude Code avec Distill.",
    ctaPrimary: 'Lire la doc',
    ctaSecondary: 'Star on GitHub',
    ctaSecondaryAriaLabel: 'Voir Distill sur GitHub (ouvre un nouvel onglet)',
  },
  en: {
    badge: 'about · 01',
    title: 'Why',
    titleMuted: 'Distill?',
    subtitle:
      "Every token counts. Distill compresses LLM context upstream — before it ever enters memory — to cut costs, speed up responses, and sharpen output quality.",

    problemBadge: 'problem · 02',
    problemHeading: 'Noise kills',
    problemHeadingMuted: 'signal.',
    problemP1:
      'When you work with an AI coding assistant, you constantly send large context blocks: build outputs, logs, code files, stacktraces. Most of it is ',
    problemP1Strong: 'redundant or useless',
    problemP2:
      "A typical build error output is thousands of tokens of noise for 5–10 actually useful lines. You're paying for dead weight — and drowning the LLM in context that prevents it from focusing.",
    problemP3Strong: 'Distill fixes this',
    problemP3:
      ' by compressing your context intelligently before it reaches the model. You keep only the signal.',

    whatBadge: 'product · 03',
    whatHeading: 'One MCP server.',
    whatHeadingMuted: 'Three tools.',
    whatIntro: 'Distill is an ',
    whatIntroStrong: 'open-source MCP (Model Context Protocol) server',
    whatIntroEnd:
      ' that exposes three always-loaded tools inside Claude Code.',
    tools: [
      {
        name: 'auto_optimize',
        description:
          'Detects content type (build, logs, diffs, code, stacktraces) and applies content-aware compression.',
      },
      {
        name: 'smart_file_read',
        description:
          'Reads AST structure instead of raw file content. 7 languages, 5 modes (auto, full, skeleton, extract, search).',
      },
      {
        name: 'code_execute',
        description:
          'Runs TypeScript in a QuickJS sandbox to batch 5–10 operations in a single MCP call.',
      },
    ],
    whatOutro:
      'No API keys. No cloud services. No auth. Install and start using it immediately.',

    benefitsBadge: 'results · 04',
    benefitsHeading: 'What you',
    benefitsHeadingMuted: 'get.',
    benefits: [
      {
        icon: DollarSign,
        title: 'Lower costs',
        description:
          'Up to 98% fewer tokens sent to the LLM, with no signal loss on the content that actually matters.',
        metric: '40-98%',
      },
      {
        icon: Clock,
        title: 'Faster responses',
        description:
          'Less context = less tokens to process = shorter time-to-first-token.',
        metric: 'lower latency',
      },
      {
        icon: Zap,
        title: 'Sharper results',
        description:
          'Less noise, more signal. The LLM focuses on what matters, output quality goes up.',
        metric: 'higher signal',
      },
      {
        icon: Sparkles,
        title: 'Native Claude Code integration',
        description:
          '[DISTILL:COMPRESSED] marker, PreCompact hook, distill-compressor subagent, slash commands. Zero config on the API side.',
        metric: 'MCP stdio',
      },
    ],

    ctaBadge: 'get started',
    ctaHeading: 'Ready to',
    ctaHeadingMuted: 'optimize?',
    ctaSubtitle: 'One command to set up Claude Code with Distill.',
    ctaPrimary: 'Read the docs',
    ctaSecondary: 'Star on GitHub',
    ctaSecondaryAriaLabel: 'View Distill on GitHub (opens in new tab)',
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

function SectionBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-mono text-[11px] text-white/50 tracking-[0.14em] uppercase">
      <span className="h-px w-5 bg-[#da7446]/70" />
      {children}
    </span>
  );
}

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
      <span className="flex-1 text-white/80 select-all truncate">
        {INSTALL_COMMAND}
      </span>
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

interface AboutContentProps {
  t: Translations;
  animated: boolean;
  docsHref: string;
}

function AboutContent({ t, animated, docsHref }: AboutContentProps) {
  const Motion = animated ? motion.div : 'div';
  const motionProps = animated
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.3 },
      }
    : {};

  return (
    <main className="pt-32 pb-24 px-4 sm:px-6">
      {/* Hero header */}
      <Motion
        {...(animated
          ? {
              variants: fadeUp,
              initial: 'hidden' as const,
              animate: 'visible' as const,
            }
          : {})}
        className="max-w-3xl mx-auto flex flex-col items-center text-center gap-6"
      >
        <SectionBadge>{t.badge}</SectionBadge>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-[-0.035em] leading-[1.05] text-white text-balance">
          {t.title} <span className="text-white/40">{t.titleMuted}</span>
        </h1>
        <p className="text-[15px] md:text-base leading-relaxed text-white/55 max-w-xl text-balance">
          {t.subtitle}
        </p>
      </Motion>

      {/* Problem */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto flex flex-col gap-6 mt-24 md:mt-32"
      >
        <SectionBadge>{t.problemBadge}</SectionBadge>
        <h2 className="text-3xl md:text-4xl lg:text-[2.6rem] font-semibold tracking-[-0.03em] leading-[1.1] text-white max-w-xl">
          {t.problemHeading} <span className="text-white/40">{t.problemHeadingMuted}</span>
        </h2>
        <div className="flex flex-col gap-4 text-[14.5px] leading-[1.65] text-white/60 text-pretty">
          <p>
            {t.problemP1}
            <strong className="text-white font-medium">
              {t.problemP1Strong}
            </strong>
            .
          </p>
          <p>{t.problemP2}</p>
          <p>
            <strong className="text-white font-medium">
              {t.problemP3Strong}
            </strong>
            {t.problemP3}
          </p>
        </div>
      </Motion>

      {/* What is Distill */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto flex flex-col gap-6 mt-24 md:mt-32"
      >
        <SectionBadge>{t.whatBadge}</SectionBadge>
        <h2 className="text-3xl md:text-4xl lg:text-[2.6rem] font-semibold tracking-[-0.03em] leading-[1.1] text-white max-w-xl">
          {t.whatHeading} <span className="text-white/40">{t.whatHeadingMuted}</span>
        </h2>
        <p className="text-[14.5px] leading-[1.65] text-white/60 text-pretty">
          {t.whatIntro}
          <strong className="text-white font-medium">{t.whatIntroStrong}</strong>
          {t.whatIntroEnd}
        </p>

        {/* Tool cards — same pattern as Stats tooling cards */}
        <ul className="flex flex-col gap-3 mt-2">
          {t.tools.map((tool, index) => {
            const indexLabel = `${String(index + 1).padStart(2, '0')} / ${String(t.tools.length).padStart(2, '0')}`;
            return (
              <li
                key={tool.name}
                className="relative flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.015] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[13px] text-white/80 tracking-tight">
                    {tool.name}
                  </span>
                  <span className="font-mono text-[10px] text-white/40 tracking-[0.18em]">
                    {indexLabel}
                  </span>
                </div>
                <div className="h-px bg-white/[0.06]" aria-hidden="true" />
                <p className="text-[13.5px] leading-relaxed text-white/55 text-pretty">
                  {tool.description}
                </p>
              </li>
            );
          })}
        </ul>

        <p className="text-[14.5px] leading-[1.65] text-white/60 text-pretty">
          <strong className="text-white font-medium">{t.whatOutro}</strong>
        </p>
      </Motion>

      {/* Benefits */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto flex flex-col gap-8 mt-24 md:mt-32"
      >
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-4 px-0">
          <SectionBadge>{t.benefitsBadge}</SectionBadge>
          <h2 className="text-3xl md:text-4xl lg:text-[2.6rem] font-semibold tracking-[-0.03em] leading-[1.1] text-white max-w-xl">
            {t.benefitsHeading}{' '}
            <span className="text-white/40">{t.benefitsHeadingMuted}</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2! gap-4">
          {t.benefits.map((benefit) => (
            <article
              key={benefit.title}
              className="relative flex flex-col gap-3 p-5 rounded-lg border border-white/10 bg-white/[0.015]"
            >
              <div className="flex items-center justify-between gap-3">
                <benefit.icon
                  size={16}
                  className="text-white/40"
                  aria-hidden="true"
                />
                <span className="font-mono text-[10px] text-white/50 tracking-[0.12em] uppercase border border-white/10 rounded-sm px-1.5 py-0.5">
                  {benefit.metric}
                </span>
              </div>
              <h3 className="text-[16px] font-semibold tracking-tight text-white">
                {benefit.title}
              </h3>
              <p className="text-[14px] leading-relaxed text-white/55 text-pretty">
                {benefit.description}
              </p>
            </article>
          ))}
        </div>
      </Motion>

      {/* CTA */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto mt-24 md:mt-32"
      >
        <div
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
            <SectionBadge>{t.ctaBadge}</SectionBadge>
            <h2 className="text-[1.7rem] md:text-[2.2rem] lg:text-[2.6rem] font-semibold tracking-[-0.03em] leading-[1.1] text-white text-balance max-w-xl">
              {t.ctaHeading}{' '}
              <span className="text-white/40">{t.ctaHeadingMuted}</span>
            </h2>
            <p className="max-w-md text-[14.5px] leading-[1.6] text-white/55 text-balance">
              {t.ctaSubtitle}
            </p>

            <div className="flex flex-col items-stretch gap-2.5 w-full max-w-sm mt-2">
              <div className="flex items-stretch gap-2">
                <Link
                  href={docsHref}
                  className="flex-1 inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-white text-black font-medium text-[14px] tracking-tight hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  {t.ctaPrimary}
                </Link>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t.ctaSecondaryAriaLabel}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-white/10 bg-white/[0.02] text-white/80 hover:text-white hover:bg-white/[0.04] hover:border-white/20 transition-colors font-medium text-[14px] tracking-tight focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  <Github size={14} aria-hidden="true" />
                  <span>{t.ctaSecondary}</span>
                </a>
              </div>
              <InstallCommand />
            </div>
          </div>
        </div>
      </Motion>
    </main>
  );
}

export default function AboutPage() {
  const params = useParams();
  const lang = (params.lang as string) || 'en';
  const t = (translations[lang] || translations.en)!;
  const docsHref = lang === 'fr' ? '/fr/docs' : '/docs';
  const mounted = useHydrated();

  return (
    <div className="min-h-screen bg-obsidian text-white selection:bg-[#da7446]/30 selection:text-white relative">
      <div className="relative z-10">
        <Navbar />
        <AboutContent t={t} animated={mounted} docsHref={docsHref} />
        <Footer />
      </div>
    </div>
  );
}
