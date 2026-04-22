'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, type Variants } from 'motion/react';
import { Github } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { useHydrated } from '@/hooks';

const VERSION = 'v0.10.1';
const GITHUB_URL = 'https://github.com/ArthurDEV44/distill';

interface ReleaseCopy {
  badge: string;
  title: string;
  titleMuted: string;
  subtitle: React.ReactNode;

  securityBadge: string;
  securityTitle: string;
  securityTitleMuted: string;
  securitySubtitle: string;
  securityHeaders: [string, string];
  securityRows: [React.ReactNode, React.ReactNode][];

  integrationBadge: string;
  integrationTitle: string;
  integrationTitleMuted: string;
  integrationIntro: React.ReactNode;
  integrationBullets: React.ReactNode[];

  codebaseBadge: string;
  codebaseTitle: string;
  codebaseTitleMuted: string;
  codebaseBullets: React.ReactNode[];

  bugsBadge: string;
  bugsTitle: string;
  bugsTitleMuted: string;
  bugsBullets: React.ReactNode[];

  unchangedBadge: string;
  unchangedTitle: string;
  unchangedTitleMuted: string;
  unchangedBullets: React.ReactNode[];

  conclusionBadge: string;
  conclusion: React.ReactNode;

  ctaBadge: string;
  ctaHeading: string;
  ctaHeadingMuted: string;
  ctaSubtitle: string;
  ctaDocs: string;
  ctaBack: string;
  ctaSecondary: string;
  ctaSecondaryAriaLabel: string;
  ctaBackHref: string;
  ctaDocsHref: string;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12.5px] bg-white/[0.04] border border-white/10 px-1.5 py-0.5 rounded text-white/85 whitespace-nowrap">
      {children}
    </code>
  );
}

function copy(lang: string): ReleaseCopy {
  const docsHref = lang === 'fr' ? '/fr/docs' : '/docs';
  const homeHref = lang === 'fr' ? '/fr' : '/';

  if (lang === 'en') {
    return {
      badge: `release · ${VERSION}`,
      title: `The v0.8.1 → ${VERSION}`,
      titleMuted: 'jump.',
      subtitle: (
        <>
          npm hadn&apos;t seen a release since v0.8.1 (January 2026). {VERSION}{' '}
          consolidates 4 generations of never-published work: v0.9.1 (audit),
          v0.9.2 (hardening), v0.10.0 (claude-code alignment), {VERSION}{' '}
          (patch). Here&apos;s what actually changes for you.
        </>
      ),

      securityBadge: 'security · 01',
      securityTitle: 'Sandbox hardened.',
      securityTitleMuted: '5 escape vectors closed.',
      securitySubtitle: 'The sandbox is significantly harder to escape now.',
      securityHeaders: ['Before (v0.8.1)', `Now (${VERSION})`],
      securityRows: [
        [
          <>
            <Code>this.constructor.constructor(&quot;…&quot;)()</Code> chain
            open
          </>,
          <>Blocked by the static analyzer (US-002)</>,
        ],
        [
          <>
            <Code>git config</Code> / <Code>update-ref</Code> /{' '}
            <Code>reflog</Code> allowed
          </>,
          <>
            Blocklisted — no more persistent compromise via{' '}
            <Code>core.sshCommand</Code> (US-003)
          </>,
        ],
        [
          <>No symlink guard</>,
          <>
            <Code>isSymbolicLink()</Code> + realpath check on every entry, plus
            depth cap (US-004)
          </>,
        ],
        [
          <>TOCTOU race between validate + open</>,
          <>
            Path validation re-resolves at <Code>open()</Code> time (US-005)
          </>,
        ],
        [
          <>
            <Code>DISTILL_LEGACY_EXECUTOR</Code> env-var bypass
          </>,
          <>
            Removed — QuickJS WASM is the only executor, no user-facing toggle
          </>,
        ],
      ],

      integrationBadge: 'integration · 02',
      integrationTitle: 'Native Claude Code.',
      integrationTitleMuted: 'Real parallelism.',
      integrationIntro: (
        <>
          This is the biggest functional gain — Distill now speaks the real
          language of Claude Code:
        </>
      ),
      integrationBullets: [
        <>
          <Code>annotations.readOnlyHint</Code> declared → Claude Code now
          dispatches <Code>auto_optimize</Code> + <Code>smart_file_read</Code>{' '}
          in parallel with other read-only tools on the same turn. Measurable
          wall-clock gain on multi-tool turns.
        </>,
        <>
          <Code>_meta[&apos;anthropic/alwaysLoad&apos;] = true</Code>{' '}
          correctly emitted on all 3 tools → no ToolSearch deferral, the tools
          are present from turn 1.
        </>,
        <>
          <Code>structuredContent</Code> removed from the wire → Claude Code
          was stashing it in <Code>mcpMeta</Code>, which is never sent to the
          Anthropic API. Pure wasted bandwidth, now gone.
        </>,
        <>
          <strong className="text-white font-medium">New:</strong> PreCompact
          hook + <Code>[DISTILL:COMPRESSED ratio=X.XX method=&lt;name&gt;]</Code>{' '}
          marker → your compressed regions are preserved verbatim during
          Claude Code&apos;s autocompact. Opt-in via{' '}
          <Code>DISTILL_COMPRESSED_MARKERS=1</Code>.
        </>,
      ],

      codebaseBadge: 'codebase · 03',
      codebaseTitle: 'Leaner.',
      codebaseTitleMuted: 'More honest.',
      codebaseBullets: [
        <>
          <strong className="text-white font-medium">
            ~3,600 LOC of dead code removed
          </strong>{' '}
          (import-graph + knip): <Code>analyze-context.ts</Code>,{' '}
          <Code>dynamic-loader.ts</Code>, <Code>session-tracker.ts</Code>,{' '}
          <Code>toon-serializer.ts</Code>, the entire{' '}
          <Code>@distill/ui</Code> package, the entire{' '}
          <Code>@distill/shared</Code> package, <Code>src/middleware/</Code>{' '}
          (313 LOC of useless dispatch chain), etc.
        </>,
        <>
          <strong className="text-white font-medium">
            CI with 5 parallel blocking jobs
          </strong>
          : lint, typecheck, test+coverage, build, knip. No more{' '}
          <Code>continue-on-error: true</Code>.
        </>,
        <>
          <strong className="text-white font-medium">
            Enforced coverage floors
          </strong>
          : lines 70%, branches 56%, functions 70%, statements 69% (raised by
          +1pt in v0.9.2). CI fails below.
        </>,
        <>
          <strong className="text-white font-medium">
            Documentation verified citation-by-citation
          </strong>
          : 11 claude-code mechanisms each anchored to{' '}
          <Code>claude-code/&lt;path&gt;:&lt;line&gt;</Code> in CLAUDE.md, with
          a re-verify command.
        </>,
      ],

      bugsBadge: 'patch · 04',
      bugsTitle: 'Bugs fixed.',
      bugsTitleMuted: `${VERSION}.`,
      bugsBullets: [
        <>
          <Code>code_execute({'{'} code: &apos;console.log(&quot;x&quot;)&apos; {'}'})</Code>{' '}
          no longer crashes with{' '}
          <em className="text-white/80 not-italic">
            &quot;Cannot read properties of undefined (reading
            &apos;match&apos;)&quot;
          </em>
          . A <Code>console.log</Code> without return now yields{' '}
          <Code>success: true, tokensUsed: 0, output: &quot;(no output)&quot;</Code>
          .
        </>,
        <>
          <Code>smart_file_read</Code> skeleton no longer emits{' '}
          <Code>export async async createServer(...)</Code> on async TS
          functions.
        </>,
      ],

      unchangedBadge: 'invariants · 05',
      unchangedTitle: 'What stayed.',
      unchangedTitleMuted: 'By design.',
      unchangedBullets: [
        <>
          The 3 tools (<Code>auto_optimize</Code>, <Code>smart_file_read</Code>
          , <Code>code_execute</Code>) keep{' '}
          <strong className="text-white font-medium">
            exactly the same signature
          </strong>
          .
        </>,
        <>
          Compression algorithm, AST parsers, sandbox engine are unchanged.
        </>,
        <>
          <strong className="text-white font-medium">
            No breaking change
          </strong>{' '}
          for v0.8.1 users on the API surface.
        </>,
      ],

      conclusionBadge: 'verdict',
      conclusion: (
        <>
          Distill does the same thing as v0.8.1, but faster (native
          parallelism), safer (5 escape vectors closed), less noisy (docs +
          codebase aligned with reality), and with an autocompact hook that
          doesn&apos;t exist anywhere else in the MCP ecosystem.
        </>
      ),

      ctaBadge: 'next',
      ctaHeading: 'Ready to',
      ctaHeadingMuted: 'upgrade?',
      ctaSubtitle: 'One command to update. Zero breaking change.',
      ctaDocs: 'Read the docs',
      ctaBack: 'Back to home',
      ctaSecondary: 'Star on GitHub',
      ctaSecondaryAriaLabel: 'View Distill on GitHub (opens in new tab)',
      ctaBackHref: homeHref,
      ctaDocsHref: docsHref,
    };
  }

  return {
    badge: `release · ${VERSION}`,
    title: `Le saut v0.8.1 → ${VERSION}`,
    titleMuted: 'enfin publié.',
    subtitle: (
      <>
        npm n&apos;avait plus de release depuis v0.8.1 (janvier 2026). La{' '}
        {VERSION} consolide 4 générations de travail jamais publiées : v0.9.1
        (audit), v0.9.2 (durcissement), v0.10.0 (alignement claude-code),{' '}
        {VERSION} (patch). Voici ce qui change concrètement pour toi.
      </>
    ),

    securityBadge: 'sécurité · 01',
    securityTitle: 'Sandbox durci.',
    securityTitleMuted: "5 vecteurs d'évasion fermés.",
    securitySubtitle: "Le sandbox est nettement plus dur à évader.",
    securityHeaders: ['Avant (v0.8.1)', `Maintenant (${VERSION})`],
    securityRows: [
      [
        <>
          Chaîne <Code>this.constructor.constructor(&quot;…&quot;)()</Code>{' '}
          ouverte
        </>,
        <>Bloquée par analyseur statique (US-002)</>,
      ],
      [
        <>
          <Code>git config</Code> / <Code>update-ref</Code> /{' '}
          <Code>reflog</Code> autorisés
        </>,
        <>
          Blocklistés — plus de compromission persistante via{' '}
          <Code>core.sshCommand</Code> (US-003)
        </>,
      ],
      [
        <>Pas de garde symlink</>,
        <>
          <Code>isSymbolicLink()</Code> + vérif realpath sur chaque entrée,
          plus de cap de profondeur (US-004)
        </>,
      ],
      [
        <>Race TOCTOU entre validate + open</>,
        <>
          Path validation re-résout au moment du <Code>open()</Code> (US-005)
        </>,
      ],
      [
        <>
          Bypass env var <Code>DISTILL_LEGACY_EXECUTOR</Code>
        </>,
        <>
          Supprimé — QuickJS WASM est le seul executor, pas de toggle
          utilisateur
        </>,
      ],
    ],

    integrationBadge: 'intégration · 02',
    integrationTitle: 'Claude Code natif.',
    integrationTitleMuted: 'Parallélisme réel.',
    integrationIntro: (
      <>
        C&apos;est le plus gros gain fonctionnel — Distill parle maintenant la
        vraie langue de Claude Code :
      </>
    ),
    integrationBullets: [
      <>
        <Code>annotations.readOnlyHint</Code> déclaré → Claude Code dispatche{' '}
        <Code>auto_optimize</Code> + <Code>smart_file_read</Code> en parallèle
        avec d&apos;autres tools read-only sur un même tour. Gain wall-clock
        mesurable sur les tâches multi-tools.
      </>,
      <>
        <Code>_meta[&apos;anthropic/alwaysLoad&apos;] = true</Code> correctement
        émis sur les 3 tools → pas de déférence ToolSearch, les tools sont
        présents dès le tour 1.
      </>,
      <>
        <Code>structuredContent</Code> retiré du wire → Claude Code le
        stashait dans <Code>mcpMeta</Code> qui n&apos;est jamais envoyé à
        l&apos;API Anthropic. Pure bande passante gâchée supprimée.
      </>,
      <>
        <strong className="text-white font-medium">Nouveau :</strong>{' '}
        PreCompact hook +{' '}
        <Code>[DISTILL:COMPRESSED ratio=X.XX method=&lt;name&gt;]</Code>{' '}
        marqueur → tes régions compressées sont préservées verbatim pendant
        l&apos;autocompact de Claude Code. Opt-in via{' '}
        <Code>DISTILL_COMPRESSED_MARKERS=1</Code>.
      </>,
    ],

    codebaseBadge: 'codebase · 03',
    codebaseTitle: 'Plus mince.',
    codebaseTitleMuted: 'Plus honnête.',
    codebaseBullets: [
      <>
        <strong className="text-white font-medium">
          ~3 600 LOC de dead code supprimées
        </strong>{' '}
        (import-graph + knip) : <Code>analyze-context.ts</Code>,{' '}
        <Code>dynamic-loader.ts</Code>, <Code>session-tracker.ts</Code>,{' '}
        <Code>toon-serializer.ts</Code>, le package{' '}
        <Code>@distill/ui</Code> entier, le package{' '}
        <Code>@distill/shared</Code> entier, <Code>src/middleware/</Code> (313
        LOC de dispatch chain inutile), etc.
      </>,
      <>
        <strong className="text-white font-medium">
          CI avec 5 jobs parallèles bloquants
        </strong>{' '}
        : lint, typecheck, test+coverage, build, knip. Plus de{' '}
        <Code>continue-on-error: true</Code>.
      </>,
      <>
        <strong className="text-white font-medium">
          Seuils de coverage enforcés
        </strong>{' '}
        : lines 70 %, branches 56 %, functions 70 %, statements 69 % (raisés
        de +1pt par v0.9.2). Build CI fail en dessous.
      </>,
      <>
        <strong className="text-white font-medium">
          Documentation vérifiée citation par citation
        </strong>{' '}
        : 11 mécanismes claude-code chacun ancré sur{' '}
        <Code>claude-code/&lt;path&gt;:&lt;line&gt;</Code> dans CLAUDE.md, avec
        commande de re-vérif.
      </>,
    ],

    bugsBadge: 'patch · 04',
    bugsTitle: 'Bugs corrigés.',
    bugsTitleMuted: `${VERSION}.`,
    bugsBullets: [
      <>
        <Code>code_execute({'{'} code: &apos;console.log(&quot;x&quot;)&apos; {'}'})</Code>{' '}
        ne crash plus avec{' '}
        <em className="text-white/80 not-italic">
          &quot;Cannot read properties of undefined (reading
          &apos;match&apos;)&quot;
        </em>
        . Un <Code>console.log</Code> sans return retourne maintenant{' '}
        <Code>success: true, tokensUsed: 0, output: &quot;(no output)&quot;</Code>
        .
      </>,
      <>
        <Code>smart_file_read</Code> skeleton n&apos;émet plus{' '}
        <Code>export async async createServer(...)</Code> sur les fonctions TS
        async.
      </>,
    ],

    unchangedBadge: 'invariants · 05',
    unchangedTitle: "Ce qui n'a pas bougé.",
    unchangedTitleMuted: 'Par design.',
    unchangedBullets: [
      <>
        Les 3 tools (<Code>auto_optimize</Code>, <Code>smart_file_read</Code>,{' '}
        <Code>code_execute</Code>) gardent{' '}
        <strong className="text-white font-medium">
          exactement la même signature
        </strong>
        .
      </>,
      <>
        L&apos;algo de compression, les parsers AST, le moteur sandbox sont
        inchangés.
      </>,
      <>
        <strong className="text-white font-medium">
          Aucune breaking change
        </strong>{' '}
        pour les utilisateurs de v0.8.1 côté API.
      </>,
    ],

    conclusionBadge: 'bilan',
    conclusion: (
      <>
        Distill fait la même chose qu&apos;en v0.8.1, mais plus vite
        (parallélisme natif), plus sûr (5 vecteurs d&apos;évasion fermés),
        moins bavard (docs + codebase alignés sur la réalité), et avec un hook
        d&apos;autocompact qui n&apos;existait nulle part ailleurs dans
        l&apos;écosystème MCP.
      </>
    ),

    ctaBadge: 'next',
    ctaHeading: 'Prêt à',
    ctaHeadingMuted: 'mettre à jour ?',
    ctaSubtitle: 'Une commande pour upgrade. Zéro breaking change.',
    ctaDocs: 'Lire la doc',
    ctaBack: "Retour à l'accueil",
    ctaSecondary: 'Star on GitHub',
    ctaSecondaryAriaLabel: 'Voir Distill sur GitHub (ouvre un nouvel onglet)',
    ctaBackHref: homeHref,
    ctaDocsHref: docsHref,
  };
}

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

function SectionTitle({
  title,
  titleMuted,
}: {
  title: string;
  titleMuted: string;
}) {
  return (
    <h2 className="text-3xl md:text-4xl lg:text-[2.6rem] font-semibold tracking-[-0.03em] leading-[1.1] text-white max-w-xl">
      {title} <span className="text-white/40">{titleMuted}</span>
    </h2>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[14.5px] leading-[1.65] text-white/65 text-pretty">
      <span
        aria-hidden="true"
        className="mt-[0.65em] h-1 w-1 rounded-full bg-[#da7446]/70 shrink-0"
      />
      <span className="flex-1">{children}</span>
    </li>
  );
}

interface ReleaseContentProps {
  t: ReleaseCopy;
  animated: boolean;
}

function ReleaseContent({ t, animated }: ReleaseContentProps) {
  const motionProps = animated
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.2 },
      }
    : {};

  const Motion = animated ? motion.section : 'section';
  const HeaderMotion = animated ? motion.header : 'header';
  const headerMotionProps = animated
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        animate: 'visible' as const,
      }
    : {};

  return (
    <main className="pt-32 pb-24 px-4 sm:px-6">
      {/* Hero header */}
      <HeaderMotion
        {...headerMotionProps}
        className="max-w-3xl mx-auto flex flex-col items-center text-center gap-6"
      >
        <SectionBadge>{t.badge}</SectionBadge>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-[-0.035em] leading-[1.05] text-white text-balance">
          {t.title} <span className="text-white/40">{t.titleMuted}</span>
        </h1>
        <p className="text-[15px] md:text-base leading-relaxed text-white/55 max-w-xl text-balance">
          {t.subtitle}
        </p>
      </HeaderMotion>

      {/* 01 — Security */}
      <Motion
        {...motionProps}
        className="max-w-5xl mx-auto flex flex-col gap-6 mt-24 md:mt-32"
      >
        <div className="max-w-3xl flex flex-col gap-4">
          <SectionBadge>{t.securityBadge}</SectionBadge>
          <SectionTitle
            title={t.securityTitle}
            titleMuted={t.securityTitleMuted}
          />
          <p className="text-[14.5px] leading-[1.65] text-white/60 text-pretty">
            {t.securitySubtitle}
          </p>
        </div>
        <div className="flex flex-col border border-white/10 rounded-lg overflow-hidden divide-y divide-white/[0.06] bg-white/[0.015]">
          <div className="grid grid-cols-1 md:grid-cols-2! bg-white/[0.02]">
            <div className="p-4 font-mono text-[10.5px] text-white/45 uppercase tracking-[0.15em]">
              {t.securityHeaders[0]}
            </div>
            <div className="p-4 font-mono text-[10.5px] text-white/45 uppercase tracking-[0.15em] border-t border-white/[0.06] md:border-t-0 md:border-l md:border-white/[0.06]">
              {t.securityHeaders[1]}
            </div>
          </div>
          {t.securityRows.map((row, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-2!">
              <div className="p-4 text-[13.5px] leading-relaxed text-white/55">
                {row[0]}
              </div>
              <div className="p-4 text-[13.5px] leading-relaxed text-white/80 border-t border-white/[0.06] md:border-t-0 md:border-l md:border-white/[0.06]">
                {row[1]}
              </div>
            </div>
          ))}
        </div>
      </Motion>

      {/* 02 — Integration */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto flex flex-col gap-6 mt-24 md:mt-32"
      >
        <SectionBadge>{t.integrationBadge}</SectionBadge>
        <SectionTitle
          title={t.integrationTitle}
          titleMuted={t.integrationTitleMuted}
        />
        <p className="text-[14.5px] leading-[1.65] text-white/60 text-pretty">
          {t.integrationIntro}
        </p>
        <ul className="flex flex-col gap-3.5 mt-1">
          {t.integrationBullets.map((b, i) => (
            <Bullet key={i}>{b}</Bullet>
          ))}
        </ul>
      </Motion>

      {/* 03 — Codebase */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto flex flex-col gap-6 mt-24 md:mt-32"
      >
        <SectionBadge>{t.codebaseBadge}</SectionBadge>
        <SectionTitle
          title={t.codebaseTitle}
          titleMuted={t.codebaseTitleMuted}
        />
        <ul className="flex flex-col gap-3.5 mt-1">
          {t.codebaseBullets.map((b, i) => (
            <Bullet key={i}>{b}</Bullet>
          ))}
        </ul>
      </Motion>

      {/* 04 — Bugs */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto flex flex-col gap-6 mt-24 md:mt-32"
      >
        <SectionBadge>{t.bugsBadge}</SectionBadge>
        <SectionTitle title={t.bugsTitle} titleMuted={t.bugsTitleMuted} />
        <ul className="flex flex-col gap-3.5 mt-1">
          {t.bugsBullets.map((b, i) => (
            <Bullet key={i}>{b}</Bullet>
          ))}
        </ul>
      </Motion>

      {/* 05 — Unchanged */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto flex flex-col gap-6 mt-24 md:mt-32"
      >
        <SectionBadge>{t.unchangedBadge}</SectionBadge>
        <SectionTitle
          title={t.unchangedTitle}
          titleMuted={t.unchangedTitleMuted}
        />
        <ul className="flex flex-col gap-3.5 mt-1">
          {t.unchangedBullets.map((b, i) => (
            <Bullet key={i}>{b}</Bullet>
          ))}
        </ul>
      </Motion>

      {/* Conclusion */}
      <Motion
        {...motionProps}
        className="max-w-3xl mx-auto mt-24 md:mt-32"
      >
        <div className="relative flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.015] p-6 md:p-7">
          <SectionBadge>{t.conclusionBadge}</SectionBadge>
          <p className="text-[15px] md:text-base leading-relaxed text-white/80 text-balance">
            {t.conclusion}
          </p>
        </div>
      </Motion>

      {/* CTA */}
      <Motion
        {...motionProps}
        className="max-w-5xl mx-auto mt-24 md:mt-32"
      >
        <div
          className="relative overflow-hidden rounded-2xl border border-white/10 px-6 py-12 md:px-10 md:py-14 text-center"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 90% 120% at 50% 0%, rgba(218,116,70,0.10) 0%, transparent 70%)',
            backgroundColor: 'rgba(255,255,255,0.015)',
          }}
        >
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
                  href={t.ctaDocsHref}
                  className="flex-1 inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-white text-black font-medium text-[14px] tracking-tight hover:bg-white/90 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                >
                  {t.ctaDocs}
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
              <Link
                href={t.ctaBackHref}
                className="inline-flex items-center justify-center gap-2 font-mono text-[11px] text-white/40 hover:text-white/70 transition-colors tracking-[0.08em] uppercase"
              >
                ← {t.ctaBack}
              </Link>
            </div>
          </div>
        </div>
      </Motion>
    </main>
  );
}

export default function ReleasePage() {
  const params = useParams();
  const lang = (params.lang as string) || 'en';
  const t = copy(lang);
  const mounted = useHydrated();

  return (
    <div className="min-h-screen bg-obsidian text-white selection:bg-[#da7446]/30 selection:text-white relative">
      <div className="relative z-10">
        <Navbar />
        <ReleaseContent t={t} animated={mounted} />
        <Footer />
      </div>
    </div>
  );
}
