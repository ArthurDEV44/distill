"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const locales = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
];

export function DocsLanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = (params.lang as string) || "en";
  const currentLocale = locales.find((l) => l.code === currentLang) ?? locales[0]!;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchLanguage = (newLang: string) => {
    if (newLang === currentLang) {
      setIsOpen(false);
      return;
    }

    let newPath: string;

    // Handle docs paths
    if (pathname.includes("/docs")) {
      if (currentLang === "en") {
        // English (default, no prefix) -> French: add /fr prefix
        newPath = `/${newLang}${pathname}`;
      } else {
        // French -> English: remove /fr prefix
        newPath = pathname.replace(/^\/fr/, "") || "/docs";
      }
    } else {
      // Handle non-docs paths
      if (currentLang === "en") {
        newPath = `/${newLang}${pathname}`;
      } else {
        newPath = pathname.replace(/^\/fr/, "") || "/";
      }
    }

    setIsOpen(false);
    router.push(newPath);
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground transition-colors"
        aria-label="Change language"
      >
        <Languages className="size-4" />
        <span>{currentLocale.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-fd-border bg-fd-popover p-1 shadow-lg">
          {locales.map((locale) => (
            <button
              key={locale.code}
              onClick={() => switchLanguage(locale.code)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                currentLang === locale.code
                  ? "bg-fd-accent text-fd-accent-foreground"
                  : "text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground"
              }`}
            >
              {locale.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
