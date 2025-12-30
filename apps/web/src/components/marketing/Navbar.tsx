"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
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
      { label: "À propos", href: "/about" },
      { label: "Documentation", href: "/docs" },
    ],
  },
  en: {
    links: [
      { label: "About", href: "/about" },
      { label: "Documentation", href: "/docs" },
    ],
  },
};

const Navbar: React.FC = () => {
  const params = useParams();
  const lang = (params.lang as string) || 'fr';
  const t = (translations[lang] || translations.fr)!;

  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Prefix links with language for English
  const getLocalizedHref = (href: string) => {
    if (lang === 'en' && !href.startsWith('/en')) {
      return `/en${href}`;
    }
    return href;
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${scrolled
          ? 'bg-[#201c19]/80 backdrop-blur-md border-[#f4cf8b]/10 py-4'
          : 'bg-transparent border-transparent py-6'
        }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <a href={lang === 'en' ? '/en' : '/'} className="flex items-center gap-2 cursor-pointer group">
          <Image
            src="/distill-logo.png"
            alt="Distill Logo"
            width={32}
            height={32}
            className="w-8 h-8"
          />
          <span className="text-xl font-bold tracking-tight text-white">{APP_NAME}</span>
        </a>

        {/* Desktop Links */}
        <div className="flex items-center gap-8 max-sm:hidden">
          {t.links.map((link: NavLink) => (
            <a
              key={link.label}
              href={getLocalizedHref(link.href)}
              className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 max-sm:hidden">
          <LanguageSwitcher />
          <a href="https://github.com/ArthurDEV44/distill" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-white transition-colors">
            <Github size={20} />
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          className="sm:hidden text-neutral-400 hover:text-white"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden absolute top-full left-0 right-0 bg-[#201c19] border-b border-[#f4cf8b]/10 p-6 flex flex-col gap-4">
          {t.links.map((link: NavLink) => (
            <a
              key={link.label}
              href={getLocalizedHref(link.href)}
              className="text-base font-medium text-neutral-300 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="pt-2 border-t border-[#f4cf8b]/10">
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
