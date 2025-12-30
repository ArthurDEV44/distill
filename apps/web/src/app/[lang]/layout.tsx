import type { Metadata } from "next";
import type { ReactNode } from "react";

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

export default async function LangLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
