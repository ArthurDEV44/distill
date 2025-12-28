"use client";

import React, { useState, useEffect } from 'react';
import { APP_NAME, NAV_LINKS, NavLink } from '../constants';
import { Menu, X, Github } from 'lucide-react';

const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${scrolled
          ? 'bg-[#201c19]/80 backdrop-blur-md border-[#f4cf8b]/10 py-4'
          : 'bg-transparent border-transparent py-6'
        }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 cursor-pointer group">
          <span className="text-xl font-bold tracking-tight text-white">{APP_NAME}</span>
        </div>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link: NavLink) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-4">
          <a href="#" className="text-neutral-400 hover:text-white transition-colors">
            <Github size={20} />
          </a>
        </div>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-neutral-400 hover:text-white"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-[#201c19] border-b border-[#f4cf8b]/10 p-6 flex flex-col gap-4">
          {NAV_LINKS.map((link: NavLink) => (
            <a
              key={link.label}
              href={link.href}
              className="text-base font-medium text-neutral-300 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;