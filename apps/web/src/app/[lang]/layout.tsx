import "../globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import {
  SoftwareApplicationSchema,
  OrganizationSchema,
} from "@/components/JsonLd";

// Locale whitelist — the single source of truth for supported i18n segments.
// Unknown values passed to the `[lang]` dynamic route 404 via `notFound()` so
// a malformed `lang` string cannot reach `<html lang={…}>` on dynamic routes.
const SUPPORTED_LOCALES = ["fr", "en"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const metadata: Metadata = {
  metadataBase: new URL("https://distill-mcp.com"),
  title: {
    default: "Distill - Save 98% LLM Tokens with Smart Context Compression",
    template: "%s | Distill",
  },
  description:
    "Open source MCP server for LLM token optimization. Reduce Claude, Cursor & Windsurf costs by up to 98% with smart file reading and AST extraction. Install in 30 seconds.",
  keywords: [
    "LLM token optimization",
    "context compression",
    "MCP server",
    "Model Context Protocol",
    "Claude Code",
    "Cursor AI",
    "Windsurf",
    "AST extraction",
    "token savings",
    "AI development tools",
    "open source",
  ],
  authors: [{ name: "Distill Team" }],
  creator: "Distill",
  publisher: "Distill",
  alternates: {
    canonical: "/",
    languages: {
      en: "/en",
      fr: "/fr",
      "x-default": "/",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: "fr_FR",
    url: "https://distill-mcp.com",
    siteName: "Distill",
    title: "Distill - Save 98% LLM Tokens",
    description:
      "Open source MCP server for intelligent context compression. Reduce AI coding costs instantly.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Distill - Save 98% LLM Tokens",
    description:
      "Open source MCP server for intelligent context compression. Reduce AI coding costs instantly.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

// Root layout for the application — per Next.js 16 i18n canonical pattern,
// the root layout lives under the `[lang]` dynamic segment so `<html lang>`
// is server-rendered from route params (no hydration flash, no client-side
// JS required to set the lang attribute). Non-[lang] routes at `app/`
// (api/*, robots.ts, sitemap.ts, *-image.tsx, favicon.ico) are file-convention
// handlers that do not render HTML pages and do not need a parent layout.
export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
    notFound();
  }
  return (
    <html lang={lang} className="dark">
      <head>
        <SoftwareApplicationSchema />
        <OrganizationSchema />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <Toaster position="bottom-right" />
        <Analytics />
      </body>
    </html>
  );
}
