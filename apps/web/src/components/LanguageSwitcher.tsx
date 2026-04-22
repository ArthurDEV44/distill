'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';

const locales = [
  { code: 'en', name: 'EN' },
  { code: 'fr', name: 'FR' },
];

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  const currentLang = (params.lang as string) || 'en';

  const switchLanguage = (newLang: string) => {
    if (newLang === currentLang) return;

    let newPath: string;
    if (currentLang === 'en') {
      newPath = `/${newLang}${pathname}`;
    } else {
      newPath = pathname.replace(/^\/fr/, '') || '/';
    }
    router.push(newPath);
  };

  return (
    <div
      role="group"
      aria-label="Change language"
      className="inline-flex rounded-md border border-white/10 overflow-hidden"
    >
      {locales.map((locale) => {
        const isActive = currentLang === locale.code;
        return (
          <button
            key={locale.code}
            type="button"
            onClick={() => switchLanguage(locale.code)}
            aria-pressed={isActive}
            className={`font-mono text-[11px] tracking-[0.04em] px-2.5 py-[5px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 ${
              isActive
                ? 'bg-white/[0.06] text-white'
                : 'bg-transparent text-white/55 hover:text-white'
            }`}
          >
            {locale.name}
          </button>
        );
      })}
    </div>
  );
}
