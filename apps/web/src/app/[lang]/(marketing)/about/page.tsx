'use client';

import React from 'react';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Canvas } from '@react-three/fiber';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import NebulaShader from '@/components/canvas/NebulaShader';
import StarDust from '@/components/canvas/StarDust';
import { Zap, DollarSign, Clock, Sparkles, LucideIcon, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface Translations {
  badge: string;
  title: string;
  titleHighlight: string;
  subtitle: string;
  problemTitle: string;
  problemP1: string;
  problemP1Strong: string;
  problemP2: string;
  problemP3: string;
  problemP3Strong: string;
  whatTitle: string;
  whatP1: string;
  whatP1Strong: string;
  whatP2: string;
  whatP3: string;
  benefitsTitle: string;
  benefits: Benefit[];
  ctaTitle: string;
  ctaSubtitle: string;
}

function CopyCommand() {
  const [copied, setCopied] = useState(false);
  const command = 'npm install -g distill-mcp';

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/cmd inline-flex items-center gap-3 px-4 py-3 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md hover:border-[#f4cf8b]/30 transition-all duration-300">
      <div className="flex items-center gap-2 font-mono text-sm text-neutral-400">
        <span className="text-[#f4cf8b] select-none">$</span>
        <span className="group-hover/cmd:text-neutral-200 transition-colors">{command}</span>
      </div>
      <div className="h-4 w-px bg-white/10" />
      <button
        onClick={handleCopy}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/5 text-neutral-400 hover:text-white transition-colors focus:outline-none"
        aria-label="Copy command"
      >
        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
      <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-transparent group-hover/cmd:ring-white/10 pointer-events-none" />
    </div>
  );
}

const translations: Record<string, Translations> = {
  fr: {
    badge: 'À propos de Distill',
    title: 'Pourquoi',
    titleHighlight: 'Distill ?',
    subtitle: 'Chaque token compte. Distill optimise le contexte de vos LLM pour réduire les coûts, améliorer la vitesse et obtenir de meilleurs résultats.',
    problemTitle: 'Le Problème',
    problemP1: "Lorsque vous travaillez avec des assistants de codage IA, vous envoyez constamment de grandes quantités de contexte : sorties de build, fichiers de logs, fichiers de code, messages d'erreur, et plus encore. La plupart de ce contenu est ",
    problemP1Strong: 'redondant ou inutile',
    problemP2: "Une sortie d'erreur de build typique peut contenir des milliers de tokens, mais l'information réelle de l'erreur ne fait que quelques lignes. Vous payez pour des tokens qui n'apportent aucune valeur.",
    problemP3: " en compressant intelligemment votre contexte avant de l'envoyer au LLM, ne conservant que l'essentiel.",
    problemP3Strong: 'Distill résout ce problème',
    whatTitle: "Qu'est-ce que Distill ?",
    whatP1: "Distill est un ",
    whatP1Strong: 'serveur MCP (Model Context Protocol)',
    whatP2: "Il inclut l'analyse de code avec AST, des algorithmes de compression intelligents, la synthèse de logs, la déduplication d'erreurs, et un puissant SDK TypeScript pour les opérations complexes.",
    whatP3: "Pas de clés API. Pas de services cloud. Pas d'authentification.",
    benefitsTitle: 'Avantages',
    benefits: [
      {
        icon: DollarSign,
        title: 'Réduire les coûts',
        description: "Réduisez vos coûts d'API jusqu'à 98% en envoyant uniquement les informations essentielles à votre LLM.",
      },
      {
        icon: Clock,
        title: 'Réponses plus rapides',
        description: 'Moins de contexte signifie un traitement plus rapide. Obtenez des réponses plus vite avec des prompts optimisés.',
      },
      {
        icon: Zap,
        title: 'Meilleurs résultats',
        description: "Moins de bruit, plus de signal. Aidez votre IA à se concentrer sur l'essentiel en supprimant le contenu redondant.",
      },
      {
        icon: Sparkles,
        title: 'Intégration transparente',
        description: "Fonctionne avec Claude Code, Cursor, Windsurf et tout client compatible MCP, prêt à l'emploi.",
      },
    ],
    ctaTitle: 'Prêt à optimiser ?',
    ctaSubtitle: 'Commencez en quelques secondes avec une seule commande.',
  },
  en: {
    badge: 'About Distill',
    title: 'Why',
    titleHighlight: 'Distill?',
    subtitle: 'Every token counts. Distill optimizes your LLM context to save costs, improve speed, and get better results.',
    problemTitle: 'The Problem',
    problemP1: "When working with AI coding assistants, you constantly send large amounts of context: build outputs, log files, code files, error messages, and more. Most of this content is ",
    problemP1Strong: 'redundant or unnecessary',
    problemP2: "A typical build error output might contain thousands of tokens, but the actual error information is just a few lines. You're paying for tokens that don't add value.",
    problemP3: " by intelligently compressing your context before sending it to the LLM, keeping only what matters.",
    problemP3Strong: 'Distill solves this',
    whatTitle: 'What is Distill?',
    whatP1: "Distill is an open-source ",
    whatP1Strong: 'MCP (Model Context Protocol) server',
    whatP2: "It includes AST-aware code parsing, smart compression algorithms, log summarization, error deduplication, and a powerful TypeScript SDK for complex operations.",
    whatP3: "No API keys. No cloud services. No authentication.",
    benefitsTitle: 'Benefits',
    benefits: [
      {
        icon: DollarSign,
        title: 'Reduce Costs',
        description: 'Cut your API costs by up to 98% by sending only the essential information to your LLM.',
      },
      {
        icon: Clock,
        title: 'Faster Responses',
        description: 'Smaller context means faster processing. Get responses quicker with optimized prompts.',
      },
      {
        icon: Zap,
        title: 'Better Results',
        description: 'Less noise, more signal. Help your AI focus on what matters by removing redundant content.',
      },
      {
        icon: Sparkles,
        title: 'Seamless Integration',
        description: 'Works with Claude Code, Cursor, Windsurf, and any MCP-compatible client out of the box.',
      },
    ],
    ctaTitle: 'Ready to optimize?',
    ctaSubtitle: 'Get started in seconds with a single command.',
  },
};

export default function AboutPage() {
  const params = useParams();
  const lang = (params.lang as string) || 'fr';
  const t = (translations[lang] || translations.fr)!;

  return (
    <div className="min-h-screen bg-obsidian text-white selection:bg-indigo-500/30 selection:text-white relative">
      {/* Background */}
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
        <main className="pt-32 pb-20 px-6">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-16">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#311c35]/40 border border-[#f4cf8b]/20 backdrop-blur-sm mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f4cf8b] animate-pulse"></span>
                <span className="text-[10px] font-mono tracking-[0.2em] text-[#f4cf8b] uppercase">
                  {t.badge}
                </span>
              </span>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                {t.title} <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-[#f4cf8b] to-[#311c35]">{t.titleHighlight}</span>
              </h1>
              <p className="text-xl text-neutral-300 max-w-2xl mx-auto leading-relaxed">
                {t.subtitle}
              </p>
            </div>

            {/* The Problem */}
            <section className="mb-20">
              <h2 className="text-2xl font-semibold text-white mb-6">{t.problemTitle}</h2>
              <div className="p-8 rounded-2xl bg-[#311c35]/50 border border-[#f4cf8b]/30 backdrop-blur-md">
                <p className="text-neutral-300 leading-relaxed mb-4">
                  {t.problemP1}<strong className="text-white">{t.problemP1Strong}</strong>.
                </p>
                <p className="text-neutral-300 leading-relaxed mb-4">
                  {t.problemP2}
                </p>
                <p className="text-neutral-300 leading-relaxed">
                  <strong className="text-[#f4cf8b]">{t.problemP3Strong}</strong>{t.problemP3}
                </p>
              </div>
            </section>

            {/* What is Distill */}
            <section className="mb-20">
              <h2 className="text-2xl font-semibold text-white mb-6">{t.whatTitle}</h2>
              <div className="p-8 rounded-2xl bg-[#311c35]/50 border border-[#f4cf8b]/30 backdrop-blur-md">
                <p className="text-neutral-300 leading-relaxed mb-4">
                  {t.whatP1}<strong className="text-white">{t.whatP1Strong}</strong> {lang === 'fr' ? "open-source qui fournit 21 outils spécialisés pour optimiser l'utilisation des tokens LLM." : "that provides 21 specialized tools for optimizing LLM token usage."}
                </p>
                <p className="text-neutral-300 leading-relaxed mb-4">
                  {t.whatP2}
                </p>
                <p className="text-neutral-300 leading-relaxed">
                  <strong className="text-white">{t.whatP3}</strong> {lang === 'fr' ? "Installez et commencez à économiser des tokens." : "Just install and start saving tokens."}
                </p>
              </div>
            </section>

            {/* Benefits Grid */}
            <section className="mb-20">
              <h2 className="text-2xl font-semibold text-white mb-8">{t.benefitsTitle}</h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {t.benefits.map((benefit, index) => (
                  <div
                    key={index}
                    className="p-6 rounded-2xl bg-[#311c35]/50 border border-[#f4cf8b]/30 backdrop-blur-md"
                  >
                    <div className="mb-4 text-[#f4cf8b]">
                      <benefit.icon size={28} />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{benefit.title}</h3>
                    <p className="text-sm text-neutral-300 leading-relaxed">{benefit.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* CTA */}
            <section className="text-center">
              <h2 className="text-2xl font-semibold text-white mb-4">{t.ctaTitle}</h2>
              <p className="text-neutral-300 mb-8">{t.ctaSubtitle}</p>
              <CopyCommand />
            </section>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
