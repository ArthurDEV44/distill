'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { APP_NAME } from '../constants';
import { Menu, X, Github } from 'lucide-react';
import { LanguageSwitcher } from '../LanguageSwitcher';

interface NavLink {
  label: string;
  href: string;
}

interface NavbarTranslations {
  links: NavLink[];
}

const translations: Record<string, NavbarTranslations> = {
  fr: {
    links: [
      { label: 'À propos', href: '/about' },
      { label: 'Documentation', href: '/docs' },
      { label: 'Release', href: '/release' },
    ],
  },
  en: {
    links: [
      { label: 'About', href: '/about' },
      { label: 'Documentation', href: '/docs' },
      { label: 'Release', href: '/release' },
    ],
  },
};

const Navbar: React.FC = () => {
  const params = useParams();
  const lang = (params.lang as string) || 'en';
  const t = (translations[lang] || translations.en)!;

  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const getLocalizedHref = (href: string) => {
    if (lang === 'fr' && !href.startsWith('/fr')) return `/fr${href}`;
    return href;
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-[background,backdrop-filter,padding] duration-[220ms] ease-out ${
        scrolled
          ? 'bg-obsidian/[0.72] backdrop-blur-[14px] backdrop-saturate-[1.2] py-3'
          : 'bg-transparent py-[18px]'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-7 flex items-center justify-between">
        {/* Logo */}
        <Link
          href={lang === 'fr' ? '/fr' : '/'}
          className="flex items-center gap-2.5 cursor-pointer group focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 rounded-sm"
        >
          <Image
            src="/distill-logo.png"
            alt="Distill — Token optimization for LLMs"
            width={22}
            height={22}
            className="w-[22px] h-[22px]"
          />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-white">
            {APP_NAME}
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="flex items-center gap-7 max-sm:hidden">
          {t.links.map((link: NavLink) => (
            <Link
              key={link.label}
              href={getLocalizedHref(link.href)}
              className="text-[13px] text-white/65 hover:text-white transition-colors focus:outline-none focus-visible:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 max-sm:hidden">
          <LanguageSwitcher />
          <a
            href="https://github.com/ArthurDEV44/distill"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-md text-white/65 hover:text-white hover:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
            aria-label="Distill on GitHub — opens in new tab"
          >
            <Github size={15} aria-hidden="true" />
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          className="sm:hidden flex items-center justify-center w-9 h-9 rounded-md text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          {mobileMenuOpen ? (
            <X size={18} aria-hidden="true" />
          ) : (
            <Menu size={18} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <nav
          id="mobile-menu"
          className="sm:hidden absolute top-full left-0 right-0 bg-[#050505] border-t border-white/[0.06] px-4 py-5 flex flex-col gap-3"
          aria-label="Mobile navigation"
        >
          {t.links.map((link: NavLink) => (
            <Link
              key={link.label}
              href={getLocalizedHref(link.href)}
              className="text-[15px] text-white/80 hover:text-white py-1"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 mt-1 border-t border-white/[0.06] flex items-center gap-3">
            <LanguageSwitcher />
            <a
              href="https://github.com/ArthurDEV44/distill"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 rounded-md text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
              aria-label="Distill on GitHub — opens in new tab"
            >
              <Github size={16} aria-hidden="true" />
            </a>
          </div>
        </nav>
      )}
    </nav>
  );
};

export default Navbar;
