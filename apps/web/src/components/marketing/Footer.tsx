'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface FooterTranslations {
  copyright: string;
  tagline: string;
  builtBy: string;
  links: { label: string; href: string; external?: boolean }[];
}

const VERSION = 'v0.10.1';

const translations: { fr: FooterTranslations; en: FooterTranslations } = {
  fr: {
    copyright: '© {year} Distill',
    tagline: 'Open source · MIT License',
    builtBy: 'built by',
    links: [
      { label: 'docs', href: '/docs' },
      { label: 'github', href: 'https://github.com/ArthurDEV44/distill', external: true },
      { label: 'npm', href: 'https://www.npmjs.com/package/distill-mcp', external: true },
    ],
  },
  en: {
    copyright: '© {year} Distill',
    tagline: 'Open source · MIT License',
    builtBy: 'built by',
    links: [
      { label: 'docs', href: '/docs' },
      { label: 'github', href: 'https://github.com/ArthurDEV44/distill', external: true },
      { label: 'npm', href: 'https://www.npmjs.com/package/distill-mcp', external: true },
    ],
  },
};

const Footer: React.FC = () => {
  const params = useParams();
  const lang = (params.lang as string) || 'en';
  const t = lang === 'fr' ? translations.fr : translations.en;
  const year = new Date().getFullYear();

  const getLocalizedHref = (href: string) => {
    if (href.startsWith('http')) return href;
    if (lang === 'fr' && !href.startsWith('/fr')) return `/fr${href}`;
    return href;
  };

  return (
    <footer className="relative z-10 mt-10 border-t border-white/[0.08] bg-obsidian">
      <div className="max-w-7xl mx-auto px-4 sm:px-7 pt-9 pb-10 flex flex-col gap-5">
        {/* Row 1 — version / links / built by */}
        <div className="flex items-center justify-between gap-6 flex-wrap">
          {/* Version */}
          <span className="font-mono text-[11px] text-white/50 tracking-[0.06em] inline-flex items-center">
            <span className="text-white/85">Distill</span>
            <span className="text-white/30 mx-2">/</span>
            <span>{VERSION}</span>
          </span>

          {/* Nav links */}
          <nav
            aria-label="Footer navigation"
            className="flex items-center gap-6 font-mono text-[12px]"
          >
            {t.links.map((link) =>
              link.external ? (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/50 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  href={getLocalizedHref(link.href)}
                  className="text-white/50 hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          {/* Built by */}
          <span className="font-mono text-[11px] text-white/40">
            {t.builtBy}{' '}
            <a
              href="https://arthurjean.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/65 hover:text-white border-b border-white/10 hover:border-[#da7446] transition-colors pb-px"
              aria-label="Arthur Jean — opens in new tab"
            >
              Arthur Jean
            </a>
          </span>
        </div>

        {/* Row 2 — copyright */}
        <div className="text-center font-mono text-[11px] text-white/35 tracking-[0.04em]">
          {t.copyright.replace('{year}', year.toString())} · {t.tagline}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
