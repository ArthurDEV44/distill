'use client';

import { motion, type Variants } from 'motion/react';
import { useHydrated } from '@/hooks';

type VizKind = 'compress' | 'ast' | 'sandbox';

interface Feature {
  name: string;
  title: string;
  description: string;
  metric: string;
  viz: VizKind;
}

interface StatsTranslations {
  badge: string;
  title: string;
  titleMuted: string;
  features: Feature[];
}

const translations: { fr: StatsTranslations; en: StatsTranslations } = {
  fr: {
    badge: 'tooling · 03',
    title: 'Trois outils.',
    titleMuted: 'Un par problème.',
    features: [
      {
        name: 'auto_optimize',
        title: 'Compression universelle',
        description:
          "Détection automatique du type de contenu — build outputs, logs, diffs, code, stacktraces — puis compression adaptée. Le texte arrive compressé avant d'entrer dans le contexte.",
        metric: '40–98% tokens',
        viz: 'compress',
      },
      {
        name: 'smart_file_read',
        title: 'Lecture AST',
        description:
          '7 langages supportés (TS, JS, Python, Go, Rust, PHP, Swift). 5 modes : auto, full, skeleton, extract, search. Lit uniquement la structure nécessaire au lieu du fichier entier.',
        metric: '7 langages',
        viz: 'ast',
      },
      {
        name: 'code_execute',
        title: 'Sandbox TypeScript',
        description:
          "Chaîne 5 à 10 opérations (lecture, git, compression, search) dans un seul appel MCP. QuickJS WASM, 7 couches de sécurité, pas d'accès réseau ni fs brut.",
        metric: 'QuickJS WASM',
        viz: 'sandbox',
      },
    ],
  },
  en: {
    badge: 'tooling · 03',
    title: 'Three tools.',
    titleMuted: 'One per problem.',
    features: [
      {
        name: 'auto_optimize',
        title: 'Universal compression',
        description:
          'Auto-detects content type — build output, logs, diffs, code, stacktraces — and compresses accordingly. Text arrives pre-compressed before it enters context.',
        metric: '40–98% tokens',
        viz: 'compress',
      },
      {
        name: 'smart_file_read',
        title: 'AST reading',
        description:
          '7 languages (TS, JS, Python, Go, Rust, PHP, Swift). 5 modes: auto, full, skeleton, extract, search. Reads only the structure you need — never the whole file.',
        metric: '7 languages',
        viz: 'ast',
      },
      {
        name: 'code_execute',
        title: 'TypeScript sandbox',
        description:
          'Chain 5–10 operations (read, git, compress, search) in a single MCP call. QuickJS WASM, 7 security layers, no network or raw fs access.',
        metric: 'QuickJS WASM',
        viz: 'sandbox',
      },
    ],
  },
};

const container: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
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

function CompressViz() {
  return (
    <div className="flex h-full items-center gap-3 px-4">
      <span
        aria-hidden
        className="h-2.5 w-[62%] rounded-[2px]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 3px, transparent 3px 6px)',
        }}
      />
      <span className="font-mono text-[11px] text-white/30" aria-hidden>
        →
      </span>
      <span
        aria-hidden
        className="h-2.5 w-[12%] rounded-[2px]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, #da7446 0 3px, transparent 3px 6px)',
        }}
      />
      <span className="ml-auto font-mono text-[11px] text-[#da7446]">−92%</span>
    </div>
  );
}

function AstViz() {
  return (
    <div className="h-full px-4 py-2.5 font-mono text-[10.5px] leading-[1.55] text-white/55">
      <div>
        <span className="text-white/30">▸</span>{' '}
        <span className="text-[#da7446]">class</span>{' '}
        <span className="text-white/80">Context</span>{' '}
        <span className="text-white/30">{'{'}</span>
      </div>
      <div>
        &nbsp;&nbsp;<span className="text-white/30">▸</span>{' '}
        <span className="text-[#da7446]">fn</span>{' '}
        <span className="text-white/80">compress</span>
        <span className="text-white/30">()</span>
      </div>
      <div>
        &nbsp;&nbsp;<span className="text-white/30">▸</span>{' '}
        <span className="text-[#da7446]">fn</span>{' '}
        <span className="text-white/80">parse</span>
        <span className="text-white/30">()</span>
      </div>
      <div>
        <span className="text-white/30">{'}'}</span>{' '}
        <span className="text-white/30">{'// skeleton · 7 lang'}</span>
      </div>
    </div>
  );
}

function SandboxViz() {
  const steps: { label: string; hot: boolean }[] = [
    { label: 'R', hot: true },
    { label: 'G', hot: false },
    { label: 'C', hot: true },
    { label: 'S', hot: false },
    { label: '↵', hot: true },
  ];
  return (
    <div className="flex h-full items-center justify-between px-4">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-1 items-center gap-0 last:flex-none">
          <span
            className={`grid h-6.5 w-6.5 place-items-center rounded-[4px] border font-mono text-[10px] ${
              step.hot
                ? 'border-[#da7446] text-[#da7446] bg-[#da7446]/[0.08]'
                : 'border-white/10 text-white/50 bg-white/[0.03]'
            }`}
            style={{ width: '26px', height: '26px' }}
            aria-hidden
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <span className="mx-1 h-px flex-1 bg-white/10" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}

function FeatureViz({ kind }: { kind: VizKind }) {
  return (
    <div className="h-[88px] rounded-md border border-white/[0.04] bg-black/40 overflow-hidden">
      {kind === 'compress' && <CompressViz />}
      {kind === 'ast' && <AstViz />}
      {kind === 'sandbox' && <SandboxViz />}
    </div>
  );
}

function FeatureCard({
  feature,
  animated,
  index,
  total,
}: {
  feature: Feature;
  animated: boolean;
  index: number;
  total: number;
}) {
  const Card = animated ? motion.article : 'article';
  const cardProps = animated ? { variants: fadeUp } : {};
  const featureId = `feature-${index}`;
  const indexLabel = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

  return (
    <Card
      {...cardProps}
      className="relative flex h-full flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.015] p-6"
      aria-labelledby={featureId}
    >
      {/* Header: tool name (mono) + index */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[13px] text-white/80 tracking-tight">
          {feature.name}
        </span>
        <span className="font-mono text-[10px] text-white/40 tracking-[0.18em]">
          {indexLabel}
        </span>
      </div>

      {/* Hairline separator */}
      <div className="h-px bg-white/[0.06]" aria-hidden="true" />

      {/* Title + description — flex-1 pushes viz + pill to bottom */}
      <div className="flex flex-1 flex-col gap-3">
        <h3
          id={featureId}
          className="text-[17px] font-semibold tracking-tight text-white"
        >
          {feature.title}
        </h3>
        <p className="text-[13.5px] leading-relaxed text-white/55 text-pretty">
          {feature.description}
        </p>
      </div>

      {/* Viz */}
      <FeatureViz kind={feature.viz} />

      {/* Metric pill */}
      <span className="self-start font-mono text-[10px] text-white/50 tracking-[0.12em] uppercase border border-white/10 rounded-sm px-1.5 py-0.5">
        {feature.metric}
      </span>
    </Card>
  );
}

interface FeaturesSectionProps {
  t: StatsTranslations;
  animated: boolean;
}

function FeaturesSection({ t, animated }: FeaturesSectionProps) {
  const HeaderWrapper = animated ? motion.div : 'div';
  const HeaderItem = animated ? motion.div : 'div';
  const Grid = animated ? motion.div : 'div';

  const headerWrapperProps = animated
    ? {
        variants: container,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.5 },
      }
    : {};
  const headerItemProps = animated ? { variants: fadeUp } : {};
  const gridProps = animated
    ? {
        variants: container,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.15 },
      }
    : {};

  return (
    <section
      id="features"
      className="relative py-24 md:py-32 px-4 sm:px-6"
      aria-labelledby="features-title"
    >
      <div className="max-w-5xl mx-auto relative z-10 flex flex-col gap-12 md:gap-16">
        {/* Header */}
        <HeaderWrapper
          {...headerWrapperProps}
          className="flex flex-col items-center text-center gap-5"
        >
          <HeaderItem
            {...headerItemProps}
            className="inline-flex items-center gap-2.5 font-mono text-[11px] text-white/50 tracking-[0.14em] uppercase"
          >
            <span className="h-px w-5 bg-[#da7446]/70" />
            {t.badge}
          </HeaderItem>
          <HeaderItem {...headerItemProps}>
            <h2
              id="features-title"
              className="text-3xl md:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] leading-[1.1] text-white text-balance max-w-xl"
            >
              {t.title} <span className="text-white/40">{t.titleMuted}</span>
            </h2>
          </HeaderItem>
        </HeaderWrapper>

        {/* Features grid */}
        <Grid
          {...gridProps}
          className="grid grid-cols-1 md:grid-cols-3! gap-4"
        >
          {t.features.map((feature, index) => (
            <FeatureCard
              key={feature.name}
              feature={feature}
              animated={animated}
              index={index}
              total={t.features.length}
            />
          ))}
        </Grid>
      </div>
    </section>
  );
}

interface FeaturesProps {
  lang?: string;
}

const Features = ({ lang = 'en' }: FeaturesProps) => {
  const mounted = useHydrated();
  const t = lang === 'fr' ? translations.fr : translations.en;
  return <FeaturesSection t={t} animated={mounted} />;
};

export default Features;
