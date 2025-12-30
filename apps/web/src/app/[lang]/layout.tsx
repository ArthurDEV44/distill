import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "Distill - Context Engineering for LLMs",
    template: "%s | Distill",
  },
  description:
    "Open source MCP server for LLM token optimization. Reduce costs by up to 60% with intelligent context compression.",
  keywords: [
    "LLM",
    "token optimization",
    "context engineering",
    "MCP",
    "Model Context Protocol",
    "Claude",
    "Anthropic",
    "open source",
  ],
  authors: [{ name: "Distill" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://distill-mcp.com",
    siteName: "Distill",
    title: "Distill - Context Engineering for LLMs",
    description: "Open source MCP server for LLM token optimization.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Distill - Context Engineering for LLMs",
    description: "Open source MCP server for LLM token optimization.",
  },
};

export default async function LangLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
