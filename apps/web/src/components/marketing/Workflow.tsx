'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, type Variants } from 'motion/react';
import { useHydrated } from '@/hooks';

interface WorkflowStep {
  num: string;
  name: string;
  desc: string;
}

interface WorkflowTranslations {
  badge: string;
  title: string;
  titleMuted: string;
  paragraph: string;
  steps: WorkflowStep[];
  terminalTitle: string;
}

const translations: { fr: WorkflowTranslations; en: WorkflowTranslations } = {
  fr: {
    badge: 'workflow · 04',
    title: 'Un seul call.',
    titleMuted: 'Cinq étapes.',
    paragraph:
      "Au lieu d'enchaîner dix tool calls — chaque aller-retour gonfle le contexte — Distill compose la chaîne côté sandbox. Le modèle reçoit uniquement le résultat final, déjà distillé.",
    steps: [
      { num: '01', name: 'read', desc: ' · ast skeleton' },
      { num: '02', name: 'git diff', desc: ' · head~3' },
      { num: '03', name: 'compress', desc: ' · auto mode' },
      { num: '04', name: 'search', desc: ' · ripgrep' },
      { num: '05', name: 'return', desc: ' · JSON' },
    ],
    terminalTitle: '~ distill · sandbox.ts',
  },
  en: {
    badge: 'workflow · 04',
    title: 'One call.',
    titleMuted: 'Five steps.',
    paragraph:
      'Instead of chaining ten tool calls — each round-trip bloats context — Distill composes the chain inside the sandbox. The model only receives the final, already distilled result.',
    steps: [
      { num: '01', name: 'read', desc: ' · ast skeleton' },
      { num: '02', name: 'git diff', desc: ' · head~3' },
      { num: '03', name: 'compress', desc: ' · auto mode' },
      { num: '04', name: 'search', desc: ' · ripgrep' },
      { num: '05', name: 'return', desc: ' · JSON' },
    ],
    terminalTitle: '~ distill · sandbox.ts',
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

interface TermLine {
  html: string;
  d: number;
}

const TERMINAL_LINES: TermLine[] = [
  {
    html: '<span class="text-[#da7446]">distill</span> <span class="text-white/30">·</span> <span class="text-white">code_execute</span>',
    d: 400,
  },
  { html: '<span class="text-white/30">// chain 5 ops · single MCP call</span>', d: 500 },
  { html: '&nbsp;', d: 100 },
  { html: '<span class="text-[#da7446]">const</span> ctx = <span class="text-[#da7446]">await</span> read({', d: 300 },
  { html: '&nbsp;&nbsp;file: <span class="text-white">\'src/app.ts\'</span>,', d: 200 },
  { html: '&nbsp;&nbsp;mode: <span class="text-white">\'skeleton\'</span>', d: 200 },
  { html: '});', d: 300 },
  { html: '<span class="text-[#da7446]">const</span> diff = <span class="text-[#da7446]">await</span> git.diff(<span class="text-white">\'HEAD~3\'</span>);', d: 400 },
  { html: '<span class="text-[#da7446]">const</span> out  = compress(ctx + diff);', d: 400 },
  { html: '<span class="text-[#da7446]">return</span> { out, tokens: <span class="text-[#da7446]">-92%</span> };', d: 500 },
  { html: '&nbsp;', d: 200 },
  { html: '<span class="text-white/30">→ 47,821 → 3,824 tokens · -92.0%</span>', d: 600 },
];

function Terminal({ title }: { title: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [showCursor, setShowCursor] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    const schedule = (cb: () => void, delay: number) => {
      timerRef.current = setTimeout(() => {
        if (!activeRef.current) return;
        cb();
      }, delay);
    };

    const run = (idx: number) => {
      if (!activeRef.current) return;
      if (idx >= TERMINAL_LINES.length) {
        setShowCursor(true);
        schedule(() => {
          setLines([]);
          setShowCursor(false);
          run(0);
        }, 4000);
        return;
      }
      const line = TERMINAL_LINES[idx];
      if (!line) return;
      setLines((prev) => [...prev, line.html]);
      schedule(() => run(idx + 1), line.d);
    };

    schedule(() => run(0), 600);

    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.9)]">
      {/* Head */}
      <div className="flex items-center gap-2.5 border-b border-white/10 bg-white/[0.02] px-3.5 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#da7446]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <span className="font-mono text-[11px] text-white/40 tracking-[0.04em]">
          {title}
        </span>
      </div>

      {/* Body */}
      <div
        className="min-h-[340px] px-4.5 py-4.5 font-mono text-[12.5px] leading-[1.7] text-white/80"
        aria-live="polite"
      >
        {lines.map((html, i) => (
          <div key={`${i}-${html}`} dangerouslySetInnerHTML={{ __html: html }} />
        ))}
        {showCursor && (
          <div>
            <span className="text-[#da7446]">$</span>{' '}
            <span
              className="inline-block h-3.5 w-[7px] align-[-2px] bg-[#da7446] animate-[distill-blink_1.1s_steps(2)_infinite]"
              aria-hidden
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface WorkflowSectionProps {
  t: WorkflowTranslations;
  animated: boolean;
}

function WorkflowSection({ t, animated }: WorkflowSectionProps) {
  const Header = animated ? motion.div : 'div';
  const Stepper = animated ? motion.ul : 'ul';
  const Panel = animated ? motion.div : 'div';

  const headerProps = animated
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.3 },
      }
    : {};
  const stepperProps = animated
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.2 },
      }
    : {};
  const panelProps = animated
    ? {
        variants: fadeUp,
        initial: 'hidden' as const,
        whileInView: 'visible' as const,
        viewport: { once: true, amount: 0.2 },
      }
    : {};

  return (
    <section
      id="workflow"
      className="relative px-4 sm:px-6 pt-8 pb-24 md:pb-32"
      aria-labelledby="workflow-title"
    >
      <div className="max-w-5xl mx-auto relative z-10 flex flex-col gap-12 md:gap-14">
        {/* Header — full width */}
        <Header {...headerProps} className="flex flex-col gap-4">
          <span className="inline-flex items-center gap-2.5 font-mono text-[11px] text-white/50 tracking-[0.14em] uppercase">
            <span className="h-px w-5 bg-[#da7446]/70" />
            {t.badge}
          </span>
          <h2
            id="workflow-title"
            className="text-3xl md:text-4xl lg:text-[2.6rem] font-semibold tracking-[-0.03em] leading-[1.1] text-white max-w-xl"
          >
            {t.title} <span className="text-white/40">{t.titleMuted}</span>
          </h2>
          <p className="text-[14.5px] leading-[1.65] text-white/55 max-w-2xl text-pretty">
            {t.paragraph}
          </p>
        </Header>

        {/* Bottom row — stepper (left) + terminal (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2! items-start gap-10 md:gap-14">
          <Stepper {...stepperProps} className="flex flex-col">
            {t.steps.map((step, i) => (
              <li
                key={step.num}
                className={`flex items-baseline gap-3.5 py-2.5 border-t border-white/[0.04] text-[13.5px] text-white/80 ${
                  i === t.steps.length - 1 ? 'border-b' : ''
                }`}
              >
                <span className="w-7 font-mono text-[11px] text-[#da7446]">
                  {step.num}
                </span>
                <span className="font-medium">{step.name}</span>
                <span className="text-white/40">{step.desc}</span>
              </li>
            ))}
          </Stepper>

          <Panel {...panelProps}>
            <Terminal title={t.terminalTitle} />
          </Panel>
        </div>
      </div>
    </section>
  );
}

interface WorkflowProps {
  lang?: string;
}

const Workflow = ({ lang = 'en' }: WorkflowProps) => {
  const mounted = useHydrated();
  const t = lang === 'fr' ? translations.fr : translations.en;
  return <WorkflowSection t={t} animated={mounted} />;
};

export default Workflow;
