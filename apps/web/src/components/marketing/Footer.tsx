'use client';

import React from 'react';
import { useParams } from 'next/navigation';

interface FooterTranslations {
  copyright: string;
  tagline: string;
  poweredBy: string;
}

const translations: { fr: FooterTranslations; en: FooterTranslations } = {
  fr: {
    copyright: '© {year} Distill.',
    tagline: "Conçu pour le futur de l'IA.",
    poweredBy: 'Propulsé par StriveX',
  },
  en: {
    copyright: '© {year} Distill.',
    tagline: 'Built for the future of AI.',
    poweredBy: 'Powered by StriveX',
  },
};

const Footer: React.FC = () => {
  const params = useParams();
  const lang = (params.lang as string) || 'fr';
  const t = lang === 'en' ? translations.en : translations.fr;

  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 py-12 bg-linear-to-b from-transparent to-[#311c35]">
      <div className="flex flex-col items-center gap-4">
        <p className="text-neutral-500 text-sm">
          {t.copyright.replace('{year}', year.toString())} {t.tagline}
        </p>
        <a
          href="https://strivex.fr"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f4cf8b] border border-[#f4cf8b]/20 text-black text-xs font-mono hover:border-[#f4cf8b]/40 hover:text-black/70 transition-all"
        >
          {t.poweredBy}
        </a>
      </div>
    </footer>
  );
};

export default Footer;
